"""Disposable ordinary installed candidate for signed JSON delivery; no observation seeds."""
from contextlib import ExitStack
import importlib.util
import json
import hashlib
import re
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import signal
import tempfile
import uuid
WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.dont_write_bytecode = True
sys.path.insert(0, str(BACKEND/'hack'))
from build_run import lease_fds
from candidate_installation import tls
from candidate_installation_driver import Installation, Browser, until, observe_runtime
from candidate_runtime import verify_candidate, image_identity, load_ui
from dev_environment import private
from ingress_network import Ingress
from gateway_fixture import Gateway
from pki_fixtures import running
RECOVERY = BACKEND/'artifacts/dev-environment'/('web-signed-'+hashlib.sha256(str(WEB).encode()).hexdigest()[:16])
MARKER = RECOVERY/'owner.json'
def cleanup():
    if not MARKER.exists(): return
    saved=json.loads(MARKER.read_text()); root=Path(saved['root'])
    if saved['web'] != str(WEB) or not root.name.startswith('rss-web-enrollment-installation-') or not re.fullmatch(r'mdm-web-install-[0-9a-f]{12}',saved['project']):
        raise RuntimeError('foreign signed installation owner')
    failures=[]
    def attempt(work):
        try: work()
        except Exception: failures.append(True)
    if (root/'.env').is_file() and (root/'production.compose.yaml').is_file():
        owner=Installation(root,root/'production.compose.yaml',saved['project'])
        if (root/'gateway-ports.compose.yaml').is_file(): owner.ports_file=root/'gateway-ports.compose.yaml'
        attempt(owner.cleanup)
    from pki_ca import Provider
    provider=Provider(root/'pki/pki/agent',saved['pkiCase'])
    if provider.owner.root.exists(): attempt(provider.reset)
    network=Ingress(root,saved['project'],saved['project'])
    if network.record.exists(): attempt(network.release)
    for kind,command in [('container',['ps','-a','-q']),('volume',['volume','ls','-q'])]:
        try:
            remaining=subprocess.check_output(['docker',*command,'--filter','label=com.docker.compose.project='+saved['project']],text=True,timeout=30).strip()
            if remaining: failures.append(True)
        except Exception: failures.append(True)
    if failures:
        print(json.dumps(dict(phase='signed-configuration-cleanup',result='failed',recoveryDirectory=str(RECOVERY))),flush=True)
        raise RuntimeError('cleanup-unconfirmed')
    if root.exists(): shutil.rmtree(root)
    MARKER.unlink()
    print(json.dumps(dict(phase='signed-configuration-cleanup',result='passed')),flush=True)
if '--cleanup' in sys.argv[2:]:
    cleanup(); sys.exit(0)
if MARKER.exists(): raise RuntimeError('signed installation requires its independent cleanup first')
candidate = Path(os.environ['MDM_ENROLLMENT_CANDIDATE']).resolve()
manifest = verify_candidate(candidate)
ui = load_ui(candidate, manifest['ui'])
def interrupted(*_args): raise KeyboardInterrupt()
for item in (signal.SIGINT, signal.SIGTERM): signal.signal(item, interrupted)
temporary = tempfile.mkdtemp(prefix='rss-web-enrollment-installation-')
project='mdm-web-install-'+uuid.uuid4().hex[:12]
RECOVERY.mkdir(parents=True,exist_ok=True,mode=0o700)
private(MARKER,dict(web=str(WEB),root=temporary,project=project,pkiCase=hashlib.sha256((project+':agent').encode()).hexdigest()[:20]))
with ExitStack() as providers:
    root = Path(temporary); inputs = root/'inputs'; inputs.mkdir(mode=0o700); tls(inputs)
    # Formal runtime probes verify the localhost identity used by the browser.
    (inputs/'gateway.ext').write_text('subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n')
    subprocess.run(['openssl','req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',str(inputs/'gateway.key'),'-out',str(inputs/'gateway.csr')],check=True,capture_output=True,timeout=30)
    subprocess.run(['openssl','x509','-req','-in',str(inputs/'gateway.csr'),'-CA',str(inputs/'ca.crt'),'-CAkey',str(inputs/'ca.key'),'-CAcreateserial','-days','2','-extfile',str(inputs/'gateway.ext'),'-out',str(inputs/'gateway.crt')],check=True,capture_output=True,timeout=30)
    for file in inputs.iterdir(): file.chmod(0o600)
    with socket.socket() as listener: listener.bind(('127.0.0.1',0)); port=listener.getsockname()[1]
    origin=f'https://localhost:{port}'
    network=Ingress(root,project,project); allocation=network.allocate(); providers.callback(network.release)
    values=dict(MDM_POSTGRES_IMAGE=manifest['providers']['postgres'],MDM_GATEWAY_IMAGE=manifest['providers']['nginx'],MDM_SERVER_IMAGE=image_identity(manifest['image'])['id'],MDM_INSTALLER_IMAGE=image_identity(manifest['installer']['image'])['id'],MDM_WEB_IMAGE=ui['id'],MDM_INPUT_DIRECTORY=str(inputs),MDM_PRODUCT_ORIGIN=origin,MDM_PG_MAX_CONNECTIONS=160,MDM_GATEWAY_BIND_IP='127.0.0.1',**allocation)
    private(root/'.env',''.join(f'{key}={value}\n' for key,value in values.items()))
    for name in ('production.compose.yaml','render_gateway.py'): shutil.copy(candidate/'deployment'/name,root/name)
    owner=Installation(root,root/'production.compose.yaml',project)
    def owned_file(name, data):
        target='/var/lib/rss-mdm/browser-inputs/'+name
        owner.script('from pathlib import Path;p=Path('+repr(target)+');p.parent.mkdir(mode=0o700,parents=True,exist_ok=True);p.write_bytes(bytes.fromhex('+repr(data.hex())+'));p.chmod(0o600)')
        return target
    def product(command,path='/var/lib/rss-mdm/installation-input.json'):
        args=['/usr/local/bin/rss-mdm-installer',command,'--config',path]
        program='import subprocess,json,re;result=subprocess.run('+repr(args)+',capture_output=True,text=True);print(json.dumps(dict(status=result.returncode,diagnostics=re.findall(r"[a-z_]+(?:[.][a-z_]+)*: [a-z_]+",result.stderr))))'
        result=json.loads(owner.script(program))
        if result['status']:
            print(json.dumps(dict(phase='installed-command',command=command,**result)),flush=True)
            raise RuntimeError('installed-'+command)
    try:
        owner.compose('up','-d','postgres'); owner.compose('run','--rm','init')
        exported=owner.read('/var/lib/rss-mdm/runtime/gateway/gateway-ports.compose.yaml')
        owner.ports_file=root/'gateway-ports.compose.yaml'; owner.ports_file.write_text(exported)
        model=json.loads(owner.compose('config','--format','json'))
        spec=importlib.util.spec_from_file_location('enrollment_gateway_renderer',root/'render_gateway.py'); renderer=importlib.util.module_from_spec(spec); spec.loader.exec_module(renderer)
        Gateway('',model['services']['gateway']['ports'],renderer).publish(owner.ports_file,isolated=True,published={port:port})
        owner.compose('up','-d')
        runtime=json.loads(owner.read('/var/lib/rss-mdm/installation/runtime.json'))
        receipt=json.loads(owner.read('/var/lib/rss-mdm/installation/installation.json'))['receipt']
        tenant=receipt['tenantId']; service=runtime['identity']['instance_id']
        operator=Browser(origin,inputs/'gateway-ca.crt',port)
        until(lambda: operator.call('GET','/readyz')[0]==200)
        operator.login(tenant,'administrator',(inputs/'administrator-password').read_text().strip())
        observe_runtime(operator,runtime)
        status,signer=operator.call('POST',operator.business_path('/task-signing/trust'),dict(action='prepare',expectedRevision=0),str(uuid.uuid4()))
        if status!=200 or signer['revision']!=1: raise RuntimeError('installation-task-signing')
        runtime=json.loads(owner.read('/var/lib/rss-mdm/installation/runtime.json'))
        native=root/'pki'; native.mkdir(mode=0o700)
        for source,target in [('ca.crt','ca.crt'),('ca.key','ca.key'),('gateway.crt','server.crt'),('gateway.key','server.key')]: shutil.copy(inputs/source,native/target); (native/target).chmod(0o600)
        private(native/'case.json',dict(tenant=tenant))
        provider=providers.enter_context(running(native,dict(os.environ),case=project,agent=True,agent_origin=origin,instance_id=service))
        def mounted(value):
            if isinstance(value,dict): return {key: mount_file(item) if key.endswith('_file') else mounted(item) for key,item in value.items()}
            if isinstance(value,list): return [mounted(item) for item in value]
            return value
        def mount_file(value):
            source=Path(value); return owned_file(uuid.uuid4().hex+'-'+source.name,source.read_bytes())
        agent_input=json.loads((native/'agent-pki.json').read_text())
        agent=mounted({key: agent_input[key] for key in ('mode', 'endpoint', 'lifetime')})
        configured=mounted(json.loads((native/'device-pki.json').read_text()))
        for entry in configured: entry['origin']='https://'+provider.internal_host+':19443'
        installation=json.loads(owner.read('/var/lib/rss-mdm/installation-input.json'))
        change=dict(installation=installation,operation_id=str(uuid.uuid4()),tenant=tenant,expected_revision=runtime['runtime_binding']['revision'],change=dict(kind='channels',settings=dict(windows=None,apple=None,agent=agent,providers=configured,apple_material_roots=[])))
        channels_file=owned_file('channels.json',json.dumps(change).encode())
        product('configure-host',channels_file)
        owner.compose('create','--force-recreate','server')
        server=owner.compose('ps','-a','-q','server')
        subprocess.run(['docker','network','connect',provider.owner.project+'_default',server],check=True,capture_output=True,timeout=30)
        owner.compose('start','server')
        owner.compose('exec','-T','gateway','nginx','-t','-c','/run/gateway/nginx.conf'); owner.compose('exec','-T','gateway','nginx','-s','reload','-c','/run/gateway/nginx.conf')
        until(lambda: operator.call('GET','/readyz')[0]==200)
        product('configure-host',channels_file)
        observe_runtime(operator,json.loads(owner.read('/var/lib/rss-mdm/installation/runtime.json')))
        fixture=private(root/'browser.json',dict(origin=origin,tenant=tenant,serviceId=service,admin=dict(login='administrator',passwordFile=str(inputs/'administrator-password'))))
        child=subprocess.run(['node',str(WEB/'e2e/mdm/react-signed-configuration-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_ENROLLMENT_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds(),timeout=780)
        if child.returncode: raise RuntimeError('signed-configuration-browser')
    finally:
        owner.cleanup()

# The runner owns independent cleanup and removes the recorded private root after confirmation.
