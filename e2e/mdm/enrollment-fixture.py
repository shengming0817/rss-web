"""Disposable real registration host; generated PKI proves HTTP seams, not OS enrollment."""
import http.client
from contextlib import ExitStack
import http.cookiejar
import json
import os
import re
from pathlib import Path
import signal
import ssl
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit
import uuid

WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.path.insert(0, str(BACKEND / 'hack'))
from t2_environment import Environment, private
from candidate_fixture import INSTANCE, TENANTS, ADMIN
from build_run import lease_fds
from windows_fixtures import generate
from pki_fixtures import running as pki

environment = Environment(BACKEND, group='enrollment-browser')
processes = []
providers = ExitStack()
phase = 'environment'
result = 'failed'

def stop(_signal=None, _frame=None):
    for child in reversed(processes):
        if child.poll() is None:
            child.terminate()
    if _signal:
        raise InterruptedError()

for signum in (signal.SIGINT, signal.SIGTERM):
    signal.signal(signum, stop)

def start(binary, initialized, log):
    children = []
    for args in ([str(binary), 'serve', '--config', initialized['configuration']],
                 ['nginx', '-c', initialized['gateway'], '-g', 'daemon off;']):
        child = subprocess.Popen(args, cwd=BACKEND, stdout=log, stderr=log, pass_fds=lease_fds())
        processes.append(child)
        children.append(child)
    context = ssl.create_default_context(cafile=str(environment.root / 'ca.crt'))
    until = time.monotonic() + 45
    while time.monotonic() < until:
        if any(child.poll() is not None for child in children):
            log.flush()
            text = Path(log.name).read_text()[-16384:]
            errors = re.findall(r'(?m)^([a-z][a-z0-9_.-]{0,63}): configuration ([A-Za-z][A-Za-z0-9]{0,63}) rejected$', text)
            print(json.dumps(dict(phase='host-start',result='failed',exitCodes=[child.poll() for child in children],configurationErrors=errors,diagnostics=re.findall(r'(?m)^([a-z][a-z0-9_.-]{0,63}): ([A-Za-z0-9_=:(), -]{1,128})$',text),jsonPositions=re.findall(r'configuration JSON rejected at line ([0-9]+), column ([0-9]+)',text),unsafeFiles=[Path(name).name for name in re.findall(r'configuration file unavailable or unsafe: \"([^\"]+)\"',text)],gatewayErrors=re.findall(r'nginx: \[emerg\] ([a-z]+)',text))),flush=True)
            raise RuntimeError('host-exit')
        try:
            if environment.probe_product(initialized['origin'], urlsplit(initialized['origin']).port, context):
                return children
        except (OSError, ssl.SSLError, http.client.HTTPException):
            pass
        time.sleep(.2)
    raise TimeoutError('host-readiness')

def shutdown(children):
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
            raise RuntimeError('forced-host-cleanup')

def prepare_signer(origin, reader_password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(environment.root/'ca.crt'))))
    def post(path, body, csrf=None, operation=None, expected=200):
        headers = {'Content-Type':'application/json', 'Origin':origin, 'X-Identity-Request':'1'}
        if csrf:
            headers['X-CSRF-Token'] = csrf
        if operation:
            headers['Idempotency-Key'] = operation
        request = urllib.request.Request(origin+path, data=json.dumps(body).encode(), headers=headers, method='POST')
        with opener.open(request, timeout=10) as response:
            if response.status != expected:
                raise RuntimeError('signer-http')
            data = response.read(131073)
            if len(data) > 131072:
                raise RuntimeError('signer-body-budget')
            return json.loads(data)
    login = post(f'/api/v1/identity/tenants/{TENANTS[0]}/login',
                 dict(login='admin',password=(environment.root/'account-password').read_text()))
    post(f'/api/v1/identity/tenants/{TENANTS[0]}/accounts', dict(login='reader', password=reader_password.read_text()), login['csrfToken'], expected=201)
    return post('/api/v1/task-signing/trust', dict(action='prepare',expectedRevision=0,origin=origin),
                login['csrfToken'], str(uuid.uuid4()))['revision']

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT'] = str(WEB/'apps/mdm/dist')
    initialized = environment.initialize()
    binary = Path(os.environ['CARGO_TARGET_DIR'])/'debug/rss-mdm'
    config_path = Path(initialized['configuration'])
    config = json.loads(config_path.read_text())
    phase = 'actors'
    reader_password = private(environment.root/'reader-password', 'Enrollment-fixture-reader-only-2026!')
    # The ordinary user needs no administrative grants for channels/quotas/self-enrollment.
    admin = dict(instanceId=INSTANCE, tenantId=TENANTS[0], principalId=ADMIN)
    grants = [dict(operation=p,scope=dict(kind='tenant')) for p in
              ['registration_configuration_read','registration_configuration_write','agent_enrollment_read',
               'agent_enrollment_write','authorization_read','authorization_write','identity_accounts_manage']]
    grants += [dict(operation=p,scope=dict(kind='all_devices')) for p in ['inventory_read','inventory_assign','enrollment','credentials']]
    rule = json.dumps(dict(subject=dict(kind='user',user=admin),grants=grants)).replace("'", "''")
    environment.sql(f"SET rss.tenant_id='{TENANTS[0]}';INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES('{TENANTS[0]}','{INSTANCE}','{uuid.uuid4()}',1,'{rule}'::jsonb)", 'mdm_dev')
    # Established device input for management-read continuity, not protocol/OS proof.
    tenant = TENANTS[0]
    registration, grant, request, credential = [str(uuid.uuid4()) for _ in range(4)]
    environment.sql(f"SET rss.tenant_id='{tenant}';"
        f"INSERT INTO mdm_access.devices(tenant_id,id) VALUES('{tenant}','enrollment-existing');"
        f"INSERT INTO mdm_access.grants(tenant_id,id,actor,instance,device,purpose,state,expires_at) VALUES('{tenant}','{grant}','fixture','{INSTANCE}','enrollment-existing','enrollment','consumed',clock_timestamp()+interval '2 minutes');"
        f"INSERT INTO mdm_access.requests(tenant_id,id,grant_id,source,windows_profile) VALUES('{tenant}','{request}','{grant}','mdm.windows','Device');"
        f"INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,request_id,state,purpose,epoch,first_authenticated_at) VALUES('{tenant}','{registration}','enrollment-existing','mdm',1,'{request}','active','primary',gen_random_uuid(),clock_timestamp());"
        f"INSERT INTO mdm_access.credentials VALUES('{tenant}','{credential}','{registration}','mdm',md5('{credential}')||md5('{registration}'),'active');", 'mdm_dev')
    log_path = private(environment.root/'product.log', '')
    with log_path.open('w') as log:
        phase = 'signer'
        initial = start(binary, initialized, log)
        revision = prepare_signer(initialized['origin'], reader_password)
        shutdown(initial)
        config['task_signing'] = dict(revision=revision)
        phase = 'native-inputs'
        native_ports = Environment(BACKEND, group='enrollment-native').host_ports()
        agent_ports = Environment(BACKEND, group='enrollment-agent').host_ports()
        root = environment.root/'native'
        root.mkdir(mode=0o700)
        for name in ('ca.crt', 'server.crt', 'server.key'):
            private(root/name, (environment.root/name).read_text())
        private(root/'case.json', dict(tenant=TENANTS[0]))
        windows = generate(root, root/'server.crt', root/'server.key')
        for key, port in [('enrollment',native_ports['backend']), ('management',native_ports['https'])]:
            windows[key].update(listen=f'127.0.0.1:{port}', origin=f'https://localhost:{port}')
        private(root/'windows.json', windows)
        provider_env = dict(os.environ)
        providers.enter_context(pki(root, provider_env, case=str(WEB)+':enrollment-browser', windows=True))
        providers.enter_context(pki(root, provider_env, case=str(WEB)+':enrollment-browser', agent=True,
            agent_origin=f"https://localhost:{agent_ports['backend']}"))
        agent = json.loads((root/'agent-pki.json').read_text())
        agent['endpoint']['listen'] = f"127.0.0.1:{agent_ports['backend']}"
        config.update(native_protocols=dict(windows=json.loads((root/'windows.json').read_text())),
                      agent_pki=agent, device_pki=json.loads((root/'device-pki.json').read_text()))
        private(config_path, config)
        gateway = Path(initialized['gateway'])
        text = gateway.read_text()
        # Reuse the exact production public-download location and its header whitelist.
        example = (WEB/'deploy/mdm/gateway.conf.example').read_text()
        location = example[example.index('    location ~ "^/api/v1/agent/enroll/packages'):]
        location = location[:location.index('\n    }')+6]
        location = location.replace('agent.example.test:8447', f"localhost:{agent_ports['backend']}").replace('https://agent:8447', f"https://127.0.0.1:{agent_ports['backend']}").replace('/run/config/agent-ca.pem', str(environment.root/'ca.crt')).replace('proxy_ssl_name agent.example.test;', 'proxy_ssl_name localhost;')
        text = text.replace('location ^~ /api/v1/agent/', 'location /api/v1/agent/')
        text = text.replace('        location /api/v1/agent/', location+'\n        location /api/v1/agent/')
        private(gateway, text)
        phase = 'browser'
        start(binary, initialized, log)
        fixture = private(environment.root/'browser.json',dict(
            origin=initialized['origin'],tenant=TENANTS[0],instance=INSTANCE,
            admin=dict(login='admin',passwordFile=str(environment.root/'account-password')),
            reader=dict(login='reader',passwordFile=str(reader_password)),
            configurationReady=True, organizationReadRoutes=[], admission=True, existingDevice='enrollment-existing'))
        browser = subprocess.Popen(['node',str(WEB/'e2e/mdm/enrollment-browser.mjs')],cwd=WEB,
            env={**os.environ,'MDM_ENROLLMENT_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds())
        processes.append(browser)
        if browser.wait(timeout=240):
            raise RuntimeError('browser')
    result = 'passed'
except BaseException as error:
    print(json.dumps(dict(phase=phase,result='failed',classification=type(error).__name__, reason=str(error) if isinstance(error, RuntimeError) and str(error) in ('host-exit','browser','forced-host-cleanup') else None,
                         recoveryDirectory=str(environment.root))),flush=True)
finally:
    try:
        shutdown(processes)
    except BaseException:
        result = 'failed'
    try:
        providers.close()
    except BaseException:
        result = 'failed'
        print(json.dumps(dict(phase='pki-cleanup',result='failed',recoveryDirectory=str(BACKEND/'artifacts/dev-environment'))),flush=True)
    print(json.dumps(dict(phase='fixture',result=result)),flush=True)
    if result != 'passed':
        sys.exit(1)
