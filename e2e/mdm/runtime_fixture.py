"""Prepare real baseline prerequisites; no initialization facts or readiness are forged."""
import http.client
import json
import secrets
import ssl
import subprocess
import time
import uuid
from urllib.parse import urlsplit
from build_run import lease_fds
from t2_environment import private
from candidate_installation_driver import Browser


def readiness(environment, origin):
    endpoint = urlsplit(origin)
    connection = http.client.HTTPSConnection(endpoint.hostname, endpoint.port,
        context=ssl.create_default_context(cafile=str(environment.root/'ca.crt')), timeout=3)
    try:
        connection.request('GET', '/readyz')
        response = connection.getresponse()
        response.read()
        return response.status
    finally:
        connection.close()


def storage(environment, binary, config, tenant):
    """Use the existing PG owner and the production telemetry installer, then runtime admission."""
    directory = environment.root/'baseline'/tenant
    directory.mkdir(parents=True, mode=0o700)
    if not config.get('content'):
        content = directory/'content'
        content.mkdir(mode=0o700)
        config['content'] = dict(storage=dict(kind='volume', directory=str(content)), imports={},
            max_artifact_bytes=32*1024*1024, max_temporary_bytes=64*1024*1024, max_uploads=4,
            transfer_seconds=60, retention_seconds=3600,
            max_bundle_entries=100, max_expansion_ratio=100)
    name = 'telemetry_' + uuid.UUID(tenant).hex
    environment.sql(f'CREATE DATABASE "{name}"')
    database = dict(host='localhost', port=environment.port(), name=name, user='postgres',
        password_file=str(environment.root/'pg'/'pg-password'), ca_file=str(environment.root/'ca.crt'))
    runtime = dict(database, user='r_'+uuid.uuid4().hex,
        password_file=str(private(directory/'runtime-password', secrets.token_hex(24))))
    cursor = private(directory/'cursor-key', '')
    cursor.write_bytes(secrets.token_bytes(32))
    config['telemetry'] = dict(backend=dict(kind='postgres', database=runtime), connections=2,
        cursor_key_file=str(cursor), ingress=dict(requestBytes=1048576, pendingBatches=64,
        batchesPerMinute=120, bytesPerMinute=8388608), limits=dict(max_points=4096,
        max_series=4096, max_bytes=1048576, replay_micros=86400000000, cursor_micros=60000000))
    day = int(time.time())//86400
    request = private(directory/'prepare.json', dict(operationId=str(uuid.uuid4()),
        directory=str(directory/'installation'), tenant=tenant, configuration=config['telemetry'],
        administrator=database, owner='o_'+uuid.uuid4().hex,
        partitions=[dict(startMicros=(day-1)*86400000000, endMicros=(day+2)*86400000000)], clickhouse=None))
    result = subprocess.run([str(binary), 'prepare-telemetry', '--config', str(request)],
        cwd=environment.worktree, capture_output=True, timeout=180, pass_fds=lease_fds())
    if result.returncode:
        raise RuntimeError('baseline-telemetry-installation')


def signer(environment, origin, tenant, login, password):
    operator = Browser(origin, environment.root/'ca.crt', urlsplit(origin).port)
    operator.login(tenant, login, password)
    status, trust = operator.call('POST', '/api/v1/task-signing/trust',
        dict(action='prepare', expectedRevision=0), str(uuid.uuid4()))
    if status != 200 or trust['revision'] != 1:
        raise RuntimeError('baseline-task-signing')
    return trust['revision']


def configuration_prerequisite(environment, web, runtime, origin, tenant):
    """Reuse the backend's signed connection fixture; publication is a separate product journey."""
    import tomllib
    from shutil import copyfile
    root = environment.root/'configuration-prerequisite'
    (root/'src').mkdir(parents=True, mode=0o700)
    copyfile(web/'e2e/mdm/configuration-prerequisite.rs', root/'src/main.rs')
    workspace = tomllib.loads((environment.worktree/'Cargo.toml').read_text())['workspace']['dependencies']
    manifest = ['[package]', 'name = "rss-web-configuration-prerequisite"', 'version = "0.0.0"', 'edition = "2024"', '[workspace]', '[dependencies]']
    for name, features in [('serde_json', []), ('tokio', ['macros','rt-multi-thread']), ('sqlx', ['postgres','runtime-tokio','tls-rustls','uuid']), ('zeroize', [])]:
        source = workspace[name]
        version = source if isinstance(source, str) else source['version']
        manifest.append(f'{name} = {{ version = {json.dumps(version)}, default-features = false, features = {json.dumps(features)} }}')
    for name, directory, features in [('rss-mdm-registration-service','registration-service',['integration']),('rss-mdm-native-protection','native-protection',[])]:
        manifest.append(f'{name} = {{ path = {json.dumps(str(environment.worktree/"crates"/directory))}, features = {json.dumps(features)} }}')
    private(root/'Cargo.toml', '\n'.join(manifest)+'\n')
    copyfile(environment.worktree/'Cargo.lock', root/'Cargo.lock')
    request = private(root/'input.json', dict(runtime=str(runtime),origin=origin,tenant=tenant,port=environment.port(),
        ca=str(environment.root/'ca.crt'),passwordFile=str(environment.root/'pg/pg-password')))
    with (root/'build.log').open('w') as log:
        result = subprocess.run(['cargo','run','--offline','--manifest-path',str(root/'Cargo.toml'),'--',str(request)],
            cwd=environment.worktree, stdout=log, stderr=log, timeout=300, pass_fds=lease_fds())
    if result.returncode:
        raise RuntimeError('configuration-prerequisite')
