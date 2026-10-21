"""Fixed synthetic macOS collector over real Agent mTLS; no runs or projections are seeded."""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import ssl
import sys
import time
from urllib.parse import urlsplit
import uuid


def check(value, reason):
    if not value:
        raise RuntimeError(reason)


def call(origin, ca, path, body=None, cert=None, key=None, method='POST', headers=None):
    url = urlsplit(origin)
    check(url.scheme == 'https' and url.hostname == 'localhost', 'collector-origin')
    context = ssl.create_default_context(cafile=str(ca))
    if cert:
        context.load_cert_chain(str(cert), str(key))
    connection = http.client.HTTPSConnection(url.hostname, url.port, context=context, timeout=20)
    try:
        connection.request(method, path, json.dumps(body) if body is not None else None,
                           {'Content-Type': 'application/json', **(headers or {})})
        response = connection.getresponse()
        data = json.loads(response.read())
        stage = body.get('event', {}).get('kind', 'claim') if path.endswith(('/claim', '/events')) else path.rsplit('/', 1)[-1]
        check(response.status == 200, 'collector-http-' + stage + '-' + str(response.status) + '-' + str(data.get('code', '')))
        return data
    finally:
        connection.close()


def register(origin, ca, native, operator, private, tenant):
    csr = base64.b64encode((native/'agent.der').read_bytes()).decode()
    secret = secrets.token_urlsafe(32)
    request = call(origin, ca, '/api/v1/agent/enroll/requests', dict(wireVersion=1, operationId=str(uuid.uuid4()), secret=secret, platform='macos', csr=csr))
    status, grant = operator.call('POST', '/api/v1/agent-requests/'+request['grantId']+'/authorize', dict(operationId=str(uuid.uuid4())))
    check(status == 200, 'collector-authorization')
    context = dict(revision=1, osVersion=[14,0,0,0], userHelper=True, systemBroker=True,
                   interactiveUser=dict(generatedUid='00000000-0000-0000-0000-000000000501', identity='501', sessionId=str(uuid.uuid4()), administrator=False),
                   sourceCredentials=[], msixSideload=False, msixUnsigned=False)
    candidate = call(origin, ca, '/api/v1/agent/enroll/certificates', dict(wireVersion=1, operationId=str(uuid.uuid4()), grantId=grant['grantId'], secret=secret, csr=csr,
                     runtime=dict(capabilities=['inventory.collect.v1','inventory.native.v1'], platform='macos', architecture='aarch64', executionContext=context)))
    chain = ''.join(ssl.DER_cert_to_PEM_cert(base64.b64decode(c)) for c in candidate['certificateChain'])
    cert = private(native/'collector.pem', chain)
    key = native/'agent-csr-agent.key'
    activation = call(origin, ca, '/api/v1/agent/enroll/activate', dict(wireVersion=1, issuanceId=candidate['issuanceId'], operationId=str(uuid.uuid4())), cert, key)
    binding = activation['runtime']
    check('inventory.native.v1' in binding['capabilities'], 'collector-binding')
    trust = call(origin, ca, '/api/v1/agent/runtime/task-trust', cert=cert, key=key, method='GET')
    check(trust['version'] == 1 and trust['origin'] == operator.origin and trust['tenant'] == tenant, 'collector-trust-authority')
    installed = private(native/'collector-trust.json', json.dumps(trust))
    with installed.open('rb') as material:
        os.fsync(material.fileno())
    readback = json.loads(installed.read_text())
    check(readback == trust, 'collector-trust-readback')
    # Trust::installation_digest uses this struct order, not JSON object key sorting.
    canonical = {key: readback[key] for key in ['version', 'origin', 'tenant', 'revision', 'keys']}
    canonical['keys'] = [{key: item[key] for key in ['id', 'public_key', 'state']} for item in readback['keys']]
    digest = hashlib.sha256(json.dumps(['rss-mdm/task-signing-trust/v1', canonical], separators=(',', ':')).encode()).hexdigest()
    acknowledgement = dict(operation=str(uuid.uuid4()), version=1, registration=binding['registrationId'], generation=binding['generation'], revision=trust['revision'], digest=digest)
    check(call(origin, ca, '/api/v1/agent/runtime/task-trust', acknowledgement, cert, key) == acknowledgement, 'collector-trust-acknowledgement')
    # The existing enterprise session and mTLS jointly bind a current user.
    session = dict(part.split('=', 1) for part in operator.cookie.split('; '))['__Host-identity-session']
    current = call(origin, ca, '/api/v1/agent/runtime/current-user', dict(operationId=str(uuid.uuid4()), expectedRevision=0), cert, key, method='PUT', headers={'x-rss-user-session': session})
    check(current['state'] == 'active', 'collector-enterprise-session')
    return dict(origin=origin, ca=str(ca), cert=str(cert), key=str(key), runtime=binding, executionContext=context, runs=[])


def query_digest(query):
    # NativeQuery::digest serializes Rust struct order, with BTreeMap entries sorted.
    d = query['definition']
    if d['kind'] == 'macos_hardware':
        definition = dict(kind=d['kind'], section=d['section'])
    elif d['kind'] == 'macos_applications':
        definition = dict(kind=d['kind'], root=d['root'], maxDepth=d['maxDepth'])
    else:
        raise RuntimeError('collector-unexpected-query')
    b = query['budget']
    frozen = dict(version=query['version'], definition=definition, cardinality=query['cardinality'], instanceKeys=query['instanceKeys'],
                  budget=dict(timeoutSeconds=b['timeoutSeconds'], outputBytes=b['outputBytes'], maxRows=b['maxRows']))
    return list(hashlib.sha256(json.dumps(frozen, separators=(',', ':'), ensure_ascii=False).encode()).digest())


def collect(fixture, action, resource, cycle):
    check(action in {'memory', 'memory_partial', 'applications', 'partial'}, 'collector-action')
    uuid.UUID(resource)
    agent = fixture['collector']
    def request(path, body=None, method='POST'):
        return call(agent['origin'], agent['ca'], path, body, agent['cert'], agent['key'], method=method)
    deadline = time.monotonic() + 130
    while True:
        response = request('/api/v1/agent/runtime/tasks/claim', dict(wireVersion=1, operationId=str(uuid.uuid4()), profiles=[],
                           environment=dict(edition=None, tools={}, nativeEngines={'macos.hardware':1,'macos.applications':1}), executionContext=agent['executionContext']))
        if response['task'] is not None:
            signed = response['task']
            check(signed['payload']['kind'] == 'collection', 'collector-task-family')
            task = signed['payload']['task']
            break
        check(time.monotonic() < deadline, 'collector-due-deadline')
        time.sleep(1)
    check(task['resource']['id'] == resource and task['deviceId'] == agent['runtime']['deviceId'], 'collector-task-binding')
    check(task['taskId'] not in [r['task'] for r in agent['runs']], 'collector-duplicate-run')
    path = '/api/v1/agent/runtime/tasks/'+task['taskId']+'/events'
    def event(value, operation=None):
        return request(path, dict(wireVersion=1, operationId=operation or str(uuid.uuid4()), attemptId=task['attemptId'], executionContext=agent['executionContext'], event=value))
    check(event(dict(kind='received'))['accepted'], 'collector-received')
    started = event(dict(kind='start'))
    check(started['permit']['payload']['task']['taskId'] == task['taskId'] and started['permit']['payload']['task']['permit'] == 'start', 'collector-start-permit')
    now = int(time.time())
    queries = {}
    for key, query in task['plan']['queries'].items():
        d = query['definition']
        if action in {'memory', 'memory_partial'}:
            check(d == dict(kind='macos_hardware', section='memory'), 'collector-memory-query')
            rows = [dict(total_bytes=str(8192+cycle))]
        else:
            check(d['kind'] == 'macos_applications', 'collector-application-query')
            user = d['root'] == 'user_applications'
            rows = [dict(id='app-'+str(i), native_id='com.fixture.app'+str(i), name='Periodic app '+str(i), version='1', publisher='Fixture', scope='user' if user else 'device', owner='501' if user else '', origin='application', location='/controlled/fixture/'+str(i), signature_status='signed') for i in range(45)]
        queries[key] = dict(scan=None, queryDigest=query_digest(query), collectedAt=now,
                            status='partial' if action in {'partial', 'memory_partial'} else 'complete', enumerationComplete=action not in {'partial', 'memory_partial'}, rowCount=len(rows), rows=rows, users=None)
    operation = str(uuid.uuid4())
    payload = dict(kind='collection_result', planDigest=task['planDigest'], collectedAt=now, queries=queries)
    accepted = event(payload, operation)
    check(accepted['accepted'] and event(payload, operation) == accepted, 'collector-report-replay')
    record = dict(task=task['taskId'], attempt=task['attemptId'], resource=resource, cycle=cycle)
    agent['runs'].append(record)
    return record


if __name__ == '__main__':
    try:
        path, action, resource, cycle = sys.argv[1:]
        file = Path(path)
        check(file.stat().st_mode & 0o077 == 0, 'collector-private-fixture')
        fixture = json.loads(file.read_text())
        result = collect(fixture, action, resource, int(cycle))
        file.write_text(json.dumps(fixture))
        print(json.dumps(result))
    except Exception as error:
        # Never print certificates, cookies, raw bodies, queries or private paths.
        print(json.dumps(dict(result='failed', classification=str(error) if isinstance(error, RuntimeError) else type(error).__name__)))
        sys.exit(1)
