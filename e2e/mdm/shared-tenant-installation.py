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
import traceback
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


def publish_private(path, value):
    staged = path.with_suffix(path.suffix + '.pending')
    try:
        private(staged, value)
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)


def open_installation(root, project):
    compose = root / 'production.compose.yaml'
    # The fixture owns Compose interpolation. Preserve the Docker client's connection environment.
    variables = re.findall(r'\$\{(MDM_[A-Z0-9_]+)', compose.read_text())
    for key in {*variables, 'COMPOSE_PROFILES', 'COMPOSE_ENV_FILES', 'COMPOSE_DISABLE_ENV_FILE'}:
        os.environ.pop(key, None)
    return Installation(root, compose, project)


def report_readiness(owner, browser):
    for service in ('server', 'gateway', 'maintenance'):
        try:
            capture = subprocess.run(
                [*owner.prefix, '-f', str(owner.ports_file), 'logs', '--no-color', '--tail', '16', service],
                check=True, capture_output=True, text=True, timeout=15,
            )
            categories = re.findall(r'\|\s+([a-z_]+(?:[.][a-z_]+)+: [a-z_ ]+)\s*$', capture.stdout, re.MULTILINE)
            print(json.dumps(dict(phase='readiness-diagnostic', service=service, categories=categories)), flush=True)
        except (OSError, subprocess.SubprocessError, UnicodeError) as error:
            print(json.dumps(dict(phase='readiness-diagnostic', service=service,
                classification=type(error).__name__)), flush=True)
    try:
        status, reply = browser.call('GET', '/readyz')
        print(json.dumps(dict(phase='readiness-response', status=status,
            observed=isinstance(reply, dict) and 'observation' in reply)), flush=True)
    except Exception as error:
        print(json.dumps(dict(phase='readiness-response', classification=type(error).__name__)), flush=True)


def cleanup():
    if not MARKER.exists():
        return
    value = json.loads(MARKER.read_text())
    root, project = Path(value['root']), value['project']
    if value['web'] != str(WEB) or not root.name.startswith('rss-web-shared-') or not re.fullmatch(r'mdm-web-shared-[0-9a-f]{12}', project):
        raise RuntimeError('foreign Compose owner')
    if (root / '.env').exists():
        owner = open_installation(root, project)
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
    identifier = uuid.uuid4().hex[:12]
    project = 'mdm-web-shared-' + identifier
    root = Path(tempfile.gettempdir()) / ('rss-web-shared-' + identifier)
    if root.exists():
        raise RuntimeError('temporary installation directory already exists')
    RECOVERY.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.mkdir(mode=0o700)
        publish_private(MARKER, dict(web=str(WEB), root=str(root), project=project))
    finally:
        if not MARKER.exists() and root.exists():
            root.rmdir()
    inputs = root / 'inputs'
    inputs.mkdir(mode=0o700)
    tls(inputs)
    # The browser helper uses localhost. Issue a leaf for that exact origin.
    (inputs / 'localhost.ext').write_text(
        'subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n'
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
    publish_private(root / '.env', ''.join(f'{key}={value}\n' for key, value in values.items()))
    owner = open_installation(root, project)
    services = json.loads(owner.compose('config', '--format', 'json'))['services']
    for service, key in (
        ('postgres', 'POSTGRES'), ('init', 'INSTALLER'), ('maintenance', 'INSTALLER'),
        ('server', 'SERVER'), ('gateway', 'GATEWAY'), ('web', 'WEB'),
    ):
        if services[service]['image'] != values[f'MDM_{key}_IMAGE']:
            raise RuntimeError('Compose image differs from fixed input: ' + service)
    owner.compose('up', '-d', 'postgres')
    owner.compose('run', '--rm', 'init')
    exported = owner.read('/var/lib/rss-mdm/runtime/gateway/gateway-ports.compose.yaml')
    owner.ports_file = root / 'gateway-ports.compose.yaml'
    publish_private(owner.ports_file, exported)
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
    try:
        until(browser.ready)
    except RuntimeError:
        report_readiness(owner, browser)
        raise
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
    failure = traceback.extract_tb(error.__traceback__)
    print(json.dumps(dict(
        phase='shared-installation', result='failed',
        classification=type(error).__name__, recoveryDirectory=str(RECOVERY),
        frames=[f'{Path(frame.filename).name}:{frame.lineno}' for frame in failure[-5:]],
    )), flush=True)
    sys.exit(1)
