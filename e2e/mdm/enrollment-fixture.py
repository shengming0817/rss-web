"""Disposable real registration host; generated PKI proves HTTP seams, not OS enrollment."""
import http.client
import importlib.util
import base64
import secrets
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
sys.dont_write_bytecode = True
sys.path.insert(0, str(BACKEND / 'hack'))
from t2_environment import Environment, private
from candidate_fixture import INSTANCE, TENANTS, ADMIN
from build_run import lease_fds
from runtime_fixture import storage, readiness
from windows_fixtures import generate
from candidate_installation_driver import Browser
from pki_fixtures import running as pki

browser_module = os.environ.get('MDM_ENROLLMENT_BROWSER_MODULE', 'react-enrollment-browser.mjs')
if browser_module not in {'react-enrollment-browser.mjs', 'react-certificates-browser.mjs'}:
    raise RuntimeError('unsupported browser module')
group = Path(browser_module).stem
environment = Environment(BACKEND, group=group)
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

def start(binary, initialized, log, expected=200):
    children = []
    for args in ([str(binary), 'serve', '--config', initialized['configuration']],
                 ['nginx', '-c', initialized['gateway'], '-g', 'daemon off;']):
        child = subprocess.Popen(args, cwd=BACKEND, stdout=log, stderr=log, pass_fds=lease_fds(), env={**os.environ, 'RUST_MIN_STACK': str(8*1024*1024)})
        processes.append(child)
        children.append(child)
    until = time.monotonic() + 180
    while time.monotonic() < until:
        if any(child.poll() is not None for child in children):
            log.flush()
            text = Path(log.name).read_text()[-16384:]
            errors = re.findall(r'(?m)^([a-z][a-z0-9_.-]{0,63}): configuration ([A-Za-z][A-Za-z0-9]{0,63}) rejected$', text)
            print(json.dumps(dict(phase='host-start',result='failed',exitCodes=[child.poll() for child in children],configurationErrors=errors,stackOverflow='stack overflow' in text,diagnostics=re.findall(r'(?m)^([a-z][a-z0-9_.-]{0,63}): ([A-Za-z0-9_=:(), -]{1,128})$',text),jsonPositions=re.findall(r'configuration JSON rejected at line ([0-9]+), column ([0-9]+)',text),unsafeFiles=[Path(name).name for name in re.findall(r'configuration file unavailable or unsafe: \"([^\"]+)\"',text)],gatewayErrors=re.findall(r'nginx: \[emerg\] ([a-z]+)',text))),flush=True)
            raise RuntimeError('host-exit')
        try:
            if readiness(environment, initialized['origin']) == expected:
                print(json.dumps(dict(phase='readiness',status=expected)),flush=True)
                return children
        except (OSError, ssl.SSLError, http.client.HTTPException):
            pass
        time.sleep(.2)
    raise TimeoutError('host-readiness')

def shutdown(children):
    failed = False
    for child in reversed(children):
        try:
            if child.poll() is None:
                child.terminate()
        except OSError:
            failed = True
    for child in reversed(children):
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            failed = True
            try:
                child.kill()
                child.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                pass
        except OSError:
            failed = True
    if failed:
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
    return post('/api/v1/task-signing/trust', dict(action='prepare',expectedRevision=0),
                login['csrfToken'], str(uuid.uuid4()))['revision']

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT'] = str(WEB/'apps/mdm/dist')
    initialized = environment.initialize()
    binary = Path(os.environ['CARGO_TARGET_DIR'])/'debug/rss-mdm'
    config_path = Path(initialized['configuration'])
    config = json.loads(config_path.read_text())
    storage(environment, binary, config, TENANTS[0])
    private(config_path, config)
    phase = 'actors'
    reader_password = private(environment.root/'reader-password', 'Enrollment-fixture-reader-only-2026!')
    # The ordinary user needs no administrative grants for channels/quotas/self-enrollment.
    admin = dict(instanceId=INSTANCE, tenantId=TENANTS[0], principalId=ADMIN)
    grants = [dict(operation=p,scope=dict(kind='tenant')) for p in
              ['registration_configuration_read','registration_configuration_write','agent_enrollment_read',
               'agent_enrollment_write','authorization_read','authorization_write','identity_accounts_manage']]
    grants += [dict(operation=p,scope=dict(kind='all_devices')) for p in ['inventory_read','inventory_assign','enrollment','credentials']]
    if browser_module == 'react-enrollment-browser.mjs':
        grants += [dict(operation=p,scope=dict(kind='tenant')) for p in ['storage_configuration_read','storage_configuration_write','runtime_diagnostics_read','resource_read','resource_write','software_read','software_write','release_publish','software_withdraw']]

    if browser_module == 'react-certificates-browser.mjs':
        grants += [dict(operation=p,scope=dict(kind='tenant')) for p in ['certificate_archive_read','certificate_archive_write','certificate_archive_unlock','certificate_archive_export']]
    rule_id = str(uuid.uuid4())
    authority_rule = dict(subject=dict(kind='user',user=admin),grants=grants)
    rule = json.dumps(authority_rule).replace("'", "''")
    environment.sql(f"SET rss.tenant_id='{TENANTS[0]}';INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES('{TENANTS[0]}','{INSTANCE}','{rule_id}',1,'{rule}'::jsonb)", 'mdm_dev')
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
        initial = start(binary, initialized, log, expected=503)
        revision = prepare_signer(initialized['origin'], reader_password)
        shutdown(initial)
        config['task_signing'] = dict(revision=revision)
        phase = 'native-inputs'
        native_ports = Environment(BACKEND, group='enrollment-native').host_ports()
        root = environment.root/'native'
        root.mkdir(mode=0o700)
        for name in ('ca.crt', 'server.crt', 'server.key'):
            private(root/name, (environment.root/name).read_text())
        private(root/'case.json', dict(tenant=TENANTS[0]))
        windows = generate(root)
        windows['enrollment'].update(origin=f"https://localhost:{native_ports['backend']}")
        windows['management'].update(origin=initialized['origin'])
        private(root/'windows.json', windows)
        provider_env = dict(os.environ)
        providers.enter_context(pki(root, provider_env, case=str(WEB)+':enrollment-browser', windows=True))
        providers.enter_context(pki(root, provider_env, case=str(WEB)+':enrollment-browser', agent=True,
            agent_origin=initialized['origin']))
        next_root = root/'next'
        next_root.mkdir(mode=0o700)
        for name in ('ca.crt', 'server.crt', 'case.json'):
            private(next_root/name, (root/name).read_text())
        providers.enter_context(pki(next_root, provider_env, case=str(WEB)+':enrollment-browser:next', agent=True, agent_origin=initialized['origin']))
        agent = json.loads((root/'agent-pki.json').read_text())
        config.update(native_protocols=dict(windows=json.loads((root/'windows.json').read_text())),
                      agent_pki=agent, device_pki=json.loads((root/'device-pki.json').read_text())+json.loads((next_root/'device-pki.json').read_text()))
        private(config_path, config)
        phase = 'browser'
        start(binary, initialized, log)
        operator = Browser(initialized['origin'],environment.root/'ca.crt',urlsplit(initialized['origin']).port)
        operator.login(TENANTS[0],'admin',(environment.root/'account-password').read_text())
        if browser_module == 'react-certificates-browser.mjs':
            status, rules = operator.call('GET', '/api/v1/authorization/rules')
            if status != 200: raise RuntimeError('certificate-authority-read')
            archive_permissions = {'certificate_archive_read','certificate_archive_write','certificate_archive_unlock','certificate_archive_export'}
            for existing in rules['items']:
                if existing['id'] == rule_id or not existing.get('value') or existing['value']['subject'] != authority_rule['subject']:
                    continue
                value = dict(existing['value'])
                value['grants'] = [grant for grant in value['grants'] if grant['operation'] not in archive_permissions]
                status, _ = operator.call('PUT', '/api/v1/authorization/rules/'+existing['id'], dict(operationId=str(uuid.uuid4()),expectedRevision=existing['revision'],value=value))
                if status != 200: raise RuntimeError('certificate-authority-scope')
        if browser_module == 'react-enrollment-browser.mjs':
            # Publish the signed connection through its current public owner; no private integration seed.
            connection_origin = agent['endpoint']['origin']
            status, draft = operator.call('PUT', '/api/v1/agent-connections', dict(operationId=str(uuid.uuid4()), expectedRevision=0, preferredOrigin=connection_origin, origins=[connection_origin]))
            if status != 200: raise RuntimeError('fixture-agent-connection-save')
            status, _ = operator.call('POST', '/api/v1/agent-connections/publish', dict(operationId=str(uuid.uuid4()), expectedRevision=draft['configuration']['revision']))
            if status != 200: raise RuntimeError('fixture-agent-connection-publish')
        installer_release = None
        if browser_module == 'react-enrollment-browser.mjs':
            from agent_installer_fixture import publish
            installer_release = publish(operator)
        module = importlib.util.spec_from_file_location('enrollment_device_agent',WEB/'e2e/mdm/device-agent.py')
        collector = importlib.util.module_from_spec(module); module.loader.exec_module(collector)
        agent_fixture = collector.register(agent['endpoint']['origin'],environment.root/'ca.crt',root/'pki/agent',operator,private,TENANTS[0])
        recovery_candidate = collector.register(agent['endpoint']['origin'],environment.root/'ca.crt',root/'pki/agent',operator,private,TENANTS[0],activate=False)['originalCandidate']
        candidate_trust = json.loads(Path(json.loads((next_root/'agent-pki.json').read_text())['trust_file']).read_text())
        recovery_input = private(environment.root/'recovery-input.json',dict(wireVersion=1,operationId=str(uuid.uuid4()),secret=secrets.token_urlsafe(32),platform='macos',csr=base64.b64encode((root/'pki/agent/agent.der').read_bytes()).decode()))
        backend_revision = subprocess.run(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,check=True,capture_output=True,text=True).stdout.strip()
        print(json.dumps(dict(phase='backend-baseline',revision=backend_revision)),flush=True)
        fixture = private(environment.root/'browser.json',dict(backendRevision=backend_revision,collector=agent_fixture,pki=dict(candidateTrust=candidate_trust,recoveryCandidate=recovery_candidate,recoveryInputFile=str(recovery_input)),

            origin=initialized['origin'],tenant=TENANTS[0],instance=INSTANCE,ruleId=rule_id,rule=authority_rule,
            admin=dict(login='admin',passwordFile=str(environment.root/'account-password')),
            reader=dict(login='reader',passwordFile=str(reader_password)),
            installerRelease=installer_release, existingDevice='enrollment-existing'))
        browser = subprocess.Popen(['node',str(WEB/'e2e/mdm'/browser_module)],cwd=WEB,
            env={**os.environ,'MDM_ENROLLMENT_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds())
        processes.append(browser)
        if browser.wait(timeout=780 if browser_module in {'react-enrollment-browser.mjs', 'react-certificates-browser.mjs'} else 360):
            raise RuntimeError('browser')
    result = 'passed'
except BaseException as error:
    import traceback
    print(json.dumps(dict(phase=phase, frames=[dict(file=Path(frame.filename).name,line=frame.lineno,function=frame.name) for frame in traceback.extract_tb(error.__traceback__)])),flush=True)
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
