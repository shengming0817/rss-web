"""Run the Web shared-tenant journey against an ordinary, fixed MDM installation."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import uuid

WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.dont_write_bytecode = True
sys.path.insert(0, str(BACKEND / 'hack'))
from build_run import lease_fds
from candidate_installation import tls
from candidate_installation_driver import Browser, Installation, until
from candidate_runtime import image_identity, verify_candidate
from dev_environment import private
from gateway_fixture import Gateway
from ingress_network import Ingress

RECOVERY = BACKEND / 'artifacts/dev-environment' / (
    'web-shared-' + hashlib.sha256(str(WEB).encode()).hexdigest()[:16]
)
MARKER = RECOVERY / 'owner.json'


def cleanup():
    if not MARKER.exists():
        return
    value = json.loads(MARKER.read_text())
    root, project = Path(value['root']), value['project']
    if value['web'] != str(WEB) or not root.name.startswith('rss-web-shared-') or not re.fullmatch(r'mdm-web-shared-[0-9a-f]{12}', project):
        raise RuntimeError('foreign Compose owner')
    if (root / '.env').exists():
        owner = Installation(root, root / 'production.compose.yaml', project)
        ports = root / 'gateway-ports.compose.yaml'
        if ports.exists():
            owner.ports_file = ports
        owner.cleanup()
    network = Ingress(root, project, project)
    network.release()
    for command in (['ps', '-aq'], ['volume', 'ls', '-q'], ['network', 'ls', '-q']):
        result = subprocess.check_output(
            ['docker', *command, '--filter', 'label=com.docker.compose.project=' + project],
            text=True, timeout=30,
        )
        if result.strip():
            raise RuntimeError('Compose cleanup unconfirmed')
    if root.exists():
        shutil.rmtree(root)
    MARKER.unlink()


def install():
    candidate = Path(os.environ['MDM_REACT_ADMIN_CANDIDATE']).resolve()
    pin = json.loads((WEB / 'contracts/mdm/source.json').read_text())
    manifest = verify_candidate(candidate)
    if manifest['deployment']['http-contract.json'] != pin['sha256']:
        raise RuntimeError('MDM candidate contract differs from Web pin')
    ui = image_identity(os.environ['MDM_REACT_ADMIN_WEB_IMAGE'])
    if f"{ui['os']}/{ui['architecture']}" != manifest['platform']:
        raise RuntimeError('Web image platform differs from fixed MDM candidate')
    project = 'mdm-web-shared-' + uuid.uuid4().hex[:12]
    root = Path(tempfile.mkdtemp(prefix='rss-web-shared-'))
    RECOVERY.mkdir(parents=True, exist_ok=True, mode=0o700)
    private(MARKER, dict(web=str(WEB), root=str(root), project=project))
    inputs = root / 'inputs'
    inputs.mkdir(mode=0o700)
    tls(inputs)
    # The browser helper uses localhost. Issue a leaf for that exact origin.
    (inputs / 'localhost.ext').write_text(
        'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n'
        'extendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n'
    )
    for args in (
        ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost',
         '-keyout', 'gateway.key', '-out', 'gateway.csr'],
        ['x509', '-req', '-in', 'gateway.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
         '-CAcreateserial', '-days', '2', '-extfile', 'localhost.ext', '-out', 'gateway.crt'],
    ):
        subprocess.run(['openssl', *args], cwd=inputs, check=True, capture_output=True, timeout=30)
    (inputs / 'gateway.key').chmod(0o600)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    origin = f'https://localhost:{port}'
    network = Ingress(root, project, project)
    for name in ('production.compose.yaml', 'render_gateway.py'):
        shutil.copy(candidate / 'deployment' / name, root / name)
    values = dict(
        MDM_POSTGRES_IMAGE=manifest['providers']['postgres'],
        MDM_GATEWAY_IMAGE=manifest['providers']['nginx'],
        MDM_SERVER_IMAGE=image_identity(manifest['image'])['id'],
        MDM_INSTALLER_IMAGE=image_identity(manifest['installer']['image'])['id'],
        MDM_WEB_IMAGE=ui['id'], MDM_INPUT_DIRECTORY=str(inputs),
        MDM_PRODUCT_ORIGIN=origin, MDM_PG_MAX_CONNECTIONS=160,
        MDM_GATEWAY_BIND_IP='127.0.0.1', **network.allocate(),
    )
    private(root / '.env', ''.join(f'{key}={value}\n' for key, value in values.items()))
    owner = Installation(root, root / 'production.compose.yaml', project)
    owner.compose('up', '-d', 'postgres')
    owner.compose('run', '--rm', 'init')
    exported = owner.read('/var/lib/rss-mdm/runtime/gateway/gateway-ports.compose.yaml')
    owner.ports_file = root / 'gateway-ports.compose.yaml'
    owner.ports_file.write_text(exported)
    model = json.loads(owner.compose('config', '--format', 'json'))
    spec = importlib.util.spec_from_file_location('shared_gateway', root / 'render_gateway.py')
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    Gateway('', model['services']['gateway']['ports'], renderer).publish(
        owner.ports_file, isolated=True, published={port: port},
    )
    owner.compose('up', '-d')
    first = json.loads(owner.read('/var/lib/rss-mdm/installation/installation.json'))['receipt']
    browser = Browser(origin, inputs / 'gateway-ca.crt', port)
    until(browser.ready)
    status, host = browser.call('GET', '/api/v1/mdm-host/config.json')
    if status != 200:
        raise RuntimeError('public host unavailable')
    fixture = private(root / 'browser.json', dict(
        origin=origin, tenant=first['tenantId'], login='administrator',
        passwordFile=str(inputs / 'administrator-password'),
        managementTenant=host['managementTenant'], platformPasswordFile=str(inputs / 'platform-password'),
    ))
    before = sorted(owner.compose('ps', '--status', 'running', '--quiet').splitlines())
    subprocess.run(
        ['node', str(WEB / 'e2e/mdm/react-shared-tenant-browser.mjs')], cwd=WEB, check=True, timeout=360,
        env={**os.environ, 'MDM_SHARED_BROWSER_FIXTURE': str(fixture)}, pass_fds=lease_fds(),
    )
    after = sorted(owner.compose('ps', '--status', 'running', '--quiet').splitlines())
    if before != after:
        raise RuntimeError('Compose services changed while opening tenant')
    print(json.dumps(dict(
        phase='shared-installation', result='passed',
        candidate=manifest['archive']['manifest_digest'], webImage=ui['id'],
        contract=pin['sha256'],
    )), flush=True)


def interrupt(*_args):
    raise KeyboardInterrupt()


for item in (signal.SIGINT, signal.SIGTERM):
    signal.signal(item, interrupt)
try:
    if '--cleanup' in sys.argv[2:]:
        cleanup()
    else:
        if MARKER.exists():
            raise RuntimeError('run independent cleanup first')
        install()
except BaseException as error:
    print(json.dumps(dict(phase='shared-installation', result='failed', classification=type(error).__name__, recoveryDirectory=str(RECOVERY))), flush=True)
    sys.exit(1)
