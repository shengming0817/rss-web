"""Prepare real baseline prerequisites; no initialization facts or readiness are forged."""
import base64
import hashlib
import http.client
import json
from pathlib import Path
import secrets
import ssl
import subprocess
import time
import uuid
from urllib.parse import urlsplit
from build_run import lease_fds
from t2_environment import private
from candidate_installation_driver import Browser


def installation_sql():
    """Use the candidate's real storage coordinates for synthetic prerequisite writes."""
    from candidate_fixture import installation
    identity = installation()
    target, lineage = (bytes(identity[key]).hex() for key in ('target', 'lineage'))
    return f"SET rss.storage_target='{target}'; SET rss.storage_lineage='{lineage}'; SET rss.execution_epoch='1'; "


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


def storage(environment, binary, config):
    """Use the existing PG owner and the production telemetry installer, then runtime admission."""
    management = environment.sql(
        'SELECT management_tenant_id FROM public.mdm_installation', 'mdm_dev',
    ).strip()
    config['identity']['management_tenant'] = str(uuid.UUID(management))
    directory = environment.root/'baseline'
    directory.mkdir(parents=True, mode=0o700)
    if not config.get('content'):
        content = directory/'content'
        content.mkdir(mode=0o700)
        config['content'] = dict(storage=dict(kind='volume', directory=str(content)), imports={},
            max_artifact_bytes=32*1024*1024, max_temporary_bytes=64*1024*1024, max_uploads=4,
            transfer_seconds=60, retention_seconds=3600,
            max_bundle_entries=100, max_expansion_ratio=100)
    name = 'mdm_telemetry_fixture'
    environment.sql(f'CREATE DATABASE "{name}"')
    database = dict(host='localhost', port=environment.port(), name=name, user='postgres',
        password_file=str(environment.root/'pg'/'pg-password'), ca_file=str(environment.root/'ca.crt'))
    runtime = dict(database, user='r_'+uuid.uuid4().hex,
        password_file=str(private(directory/'runtime-password', secrets.token_hex(24))))
    cursor = private(directory/'cursor-key', '')
    cursor.write_bytes(secrets.token_bytes(32))
    telemetry = dict(resource_id=str(uuid.uuid4()), backend=dict(kind='postgres', database=runtime),
        connections=2, maintenance=dict(authorization_bytes=65536, rows=4096, buckets=64, step_seconds=6),
        cursor_key_file=str(cursor), ingress=dict(requestBytes=1048576, pendingBatches=64,
        batchesPerMinute=120, bytesPerMinute=8388608), limits=dict(max_points=4096,
        max_series=4096, max_bytes=1048576, replay_micros=86400000000, cursor_micros=60000000))
    day = int(time.time())//86400
    request = private(directory/'prepare.json', dict(operationId=str(uuid.uuid4()),
        directory=str(directory/'installation'), configuration=telemetry,
        administrator=database, owner='o_'+uuid.uuid4().hex,
        partitions=[dict(startMicros=(day-1)*86400000000, endMicros=(day+2)*86400000000)], clickhouse=None))
    result = subprocess.run([str(binary), 'prepare-telemetry', '--config', str(request)],
        cwd=environment.worktree, capture_output=True, timeout=180, pass_fds=lease_fds())
    if result.returncode:
        print(json.dumps(dict(phase='baseline-telemetry-installation', result='failed',
            exitCode=result.returncode)), flush=True)
        raise RuntimeError('baseline-telemetry-installation')
    config['telemetry'] = [telemetry]


def tenant_administration(environment, binary, config):
    management = config['identity']['management_tenant']
    operator = environment.root/'host'/'operator'
    initializer = json.loads((operator/'initialize.json').read_text())
    initializer['tenant_id'] = management
    authority = json.loads((operator/'authorization.json').read_text())
    authority['user']['tenantId'] = management
    authority['operationId'] = str(uuid.uuid4())
    for verb, value in [('initialize', initializer), ('initialize-authorization', authority)]:
        request = private(environment.root/(verb+'-management.json'), value)
        result = subprocess.run([str(binary), verb, '--config', str(request)],
            cwd=environment.worktree, capture_output=True, timeout=75, pass_fds=lease_fds())
        if result.returncode:
            raise RuntimeError('fixture-cli-'+verb)

    def database(role, password):
        return dict(config['access_database'], user=role,
            password_file=str(private(environment.root/(role+'-password'), password)))

    config['tenant_administration'] = dict(
        registry_database=database('mdm_tenant_registry', 'tenant-registry-fixture'),
        provisioning_database=database('mdm_identity_provisioning', 'identity-provisioning-fixture'),
        fingerprint_key_file=str(private(environment.root/'tenant-operation-key', secrets.token_hex(16))),
    )
    # Registry, source and provisioning add 8 + 10 + 2 physical connections.
    config['background']['database_connection_budget'] += 20
    return management


def seed_protocol_pki(environment, configuration, providers, tenant, instance, purpose):
    """Install the disposable protocol CA's public registry prerequisites."""
    trust = json.loads(Path(configuration['trust_file']).read_text())
    tenant = str(uuid.UUID(tenant))
    endpoint = {'agent': 'endpoint', 'windows': 'management'}[purpose]
    if (trust['version'], trust['revision'], trust['tenant'], trust['service_id'],
            trust['origin'], trust['purpose']) != (1, 1, tenant, instance, configuration[endpoint]['origin'], purpose):
        raise RuntimeError('fixture-pki-trust-binding')
    issuer, = trust['issuers']
    certificate = base64.b64decode(issuer['certificate'], validate=True)
    digest = hashlib.sha256(certificate).hexdigest()
    if issuer['mode'] != 'active' or issuer['digest'] != digest or not any(
        entry['purpose'] == purpose and entry['issuer'] == digest
        and entry['kid'] == issuer['kid'] and entry['provisioner'] == issuer['provisioner']
        for entry in providers
    ):
        raise RuntimeError('fixture-pki-issuer-binding')
    expiry = subprocess.run(['openssl', 'x509', '-inform', 'DER', '-noout', '-enddate'],
        input=certificate, capture_output=True, check=True, timeout=10).stdout.decode().strip()
    not_after = int(ssl.cert_time_to_seconds(expiry.split('=', 1)[1]))
    # The candidate runtime persists the same public JSON encoding in tenant-scoped rows.
    def encoded(value):
        return "decode('" + json.dumps(value, separators=(',', ':')).encode().hex() + "','hex')"

    statements = [
        f"BEGIN; SET LOCAL ROLE mdm_owner; SET LOCAL rss.tenant_id='{tenant}';",
        "INSERT INTO mdm_pki.trust(tenant_id,purpose,revision,body) "
        f"VALUES('{tenant}','{purpose}',1,{encoded(trust)});",
        "INSERT INTO mdm_pki.issuers(tenant_id,purpose,digest,revision,state,chain,provider,not_after) "
        f"VALUES('{tenant}','{purpose}','{digest}',1,'active',{encoded(issuer)},'step_ca',{not_after});",
    ]
    if purpose == 'windows':
        provider = configuration['provider_id'].encode().hex()
        poll = encoded(configuration['poll'])
        lifetime = encoded(configuration.get('lifetime', {'mode': 'production'}))
        statements.append(
            "INSERT INTO mdm_windows.enrollment_configuration(tenant_id,provider_id,poll,lifetime,entra_callbacks) "
            f"VALUES('{tenant}',convert_from(decode('{provider}','hex'),'UTF8'),"
            f"convert_from({poll},'UTF8')::jsonb,convert_from({lifetime},'UTF8')::jsonb,'{{}}');"
        )
    environment.sql(' '.join([*statements, 'COMMIT;']), 'mdm_dev')
    return trust


def windows_protocol(configuration):
    return {key: configuration[key] for key in ('enrollment', 'management', 'additional_management', 'protocol_protection')}


def signer(environment, origin, tenant, login, password):
    operator = Browser(origin, environment.root/'ca.crt', urlsplit(origin).port)
    operator.login(tenant, login, password)
    status, trust = operator.call('POST', operator.business_path('/task-signing/trust'),
        dict(action='prepare', expectedRevision=0), str(uuid.uuid4()))
    if status != 200 or trust['revision'] != 1:
        raise RuntimeError('baseline-task-signing')
    return trust['revision']
