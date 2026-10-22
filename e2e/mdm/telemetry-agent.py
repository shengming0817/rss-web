"""Synthetic observations through real Agent mTLS; no telemetry rows are seeded."""
import http.client
import json
from pathlib import Path
import ssl
import sys
import time
from urllib.parse import urlsplit
import uuid


def exercise(path, policy, version):
    file = Path(path)
    if file.stat().st_mode & 0o077:
        raise RuntimeError('fixture-permissions')
    fixture = json.loads(file.read_text())
    agent = fixture['collector']
    endpoint = urlsplit(agent['origin'])
    if endpoint.scheme != 'https' or endpoint.hostname != 'localhost':
        raise RuntimeError('fixture-origin')
    context = ssl.create_default_context(cafile=agent['ca'])
    context.load_cert_chain(agent['cert'], agent['key'])

    def call(path, body=None, expected=200):
        connection = http.client.HTTPSConnection(endpoint.hostname, endpoint.port, context=context, timeout=20)
        try:
            connection.request('GET' if body is None else 'POST', path,
                None if body is None else json.dumps(body), {'Content-Type': 'application/json'})
            response = connection.getresponse()
            result = json.loads(response.read())
            if response.status != expected:
                raise RuntimeError('agent-http-' + str(response.status) + '-' + str(result.get('code', '')))
            return result
        finally:
            connection.close()

    call('/api/v1/agent/runtime/tasks/claim', dict(wireVersion=1, operationId=str(uuid.uuid4()),
        profiles=['posix_sh'], environment=dict(edition=None, tools={}, nativeEngines={'macos.performance': 1}),
        executionContext=agent['executionContext']))
    config = call('/api/v1/agent/runtime/telemetry/configurations/' + policy + '/' + version)['configuration']
    now = int(time.time()) * 1_000_000
    interval = now - 900_000_000
    observations = []
    for i in range(12):
        observed = now - (12-i)*30_000_000
        values = {}
        for key, value in [('custom.browser.gauge', dict(kind='number', value=-12.5+i*4)),
                           ('custom.browser.counter', dict(kind='integer', value=1000+i*100)),
                           ('custom.browser.state', dict(kind='string', value='running' if i<6 else 'stopped'))]:
            reading = dict(quality='valid', value=value, intervalStart=interval if key.endswith('counter') else None)
            if i in {4, 5}:
                reading = dict(quality='missing' if i==4 else 'failed', intervalStart=interval if key.endswith('counter') else None)
            values[key] = reading
        observations.append(dict(id=str(uuid.uuid4()), sequence=i+1, observedAt=observed, values=values))
    body = dict(batchId=str(uuid.uuid4()), policy=policy, policyVersion=version, binding=config['binding'], observations=observations)
    accepted = call('/api/v1/agent/runtime/telemetry/batches', body, 202)
    replayed = call('/api/v1/agent/runtime/telemetry/batches', body, 202)
    if accepted['replayed'] or not replayed['replayed']:
        raise RuntimeError('batch-replay')
    call('/api/v1/agent/runtime/telemetry/gaps', dict(reportId=str(uuid.uuid4()),
        registrationId=agent['runtime']['registrationId'], generation=agent['runtime']['generation'],
        createdAt=now, gaps=[dict(reason='capacity',count=3,first=now-90_000_000,last=now-60_000_000)]), 202)
    return dict(result='passed', observations=len(observations))


if __name__ == '__main__':
    try:
        print(json.dumps(exercise(*sys.argv[1:])))
    except Exception as error:
        # No cookies, certificates, sample bodies or private paths in diagnostics.
        print(json.dumps(dict(result='failed', classification=str(error) if isinstance(error, RuntimeError) else type(error).__name__)))
        sys.exit(1)
