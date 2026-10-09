"""Synthetic input only; reads/writes go through the real product and production UI.

Consumes rss-mdm's worktree environment/build lease and never edits its source.
"""
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
import uuid

WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.path.insert(0, str(BACKEND / 'hack'))
from t2_environment import Environment, private
from candidate_fixture import INSTANCE, TENANTS, ADMIN
from build_run import lease_fds

environment = Environment(BACKEND, group='device-browser')
processes = []
phase = 'environment'
result = 'failed'
cleanup = 'passed'

def stop(_signal=None, _frame=None):
    for child in reversed(processes):
        if child.poll() is None:
            child.terminate()
    if _signal:
        raise InterruptedError()

for signum in (signal.SIGINT, signal.SIGTERM):
    signal.signal(signum, stop)

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

def seed():
    tenant = TENANTS[0]
    user = dict(instanceId=INSTANCE, tenantId=tenant, principalId=ADMIN)
    rule = dict(subject=dict(kind='user', user=user), grants=[dict(operation=o, scope=dict(kind='all_devices')) for o in ['inventory_read','inventory_assign','device_association_write','credentials','enrollment']])
    rule_id = str(uuid.uuid4())
    sql = [f"SET rss.tenant_id = '{tenant}'", f"INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES('{tenant}','{INSTANCE}','{rule_id}',1,{q(json.dumps(rule))}::jsonb)"]
    for device, channel, source in [('fixture-mdm','mdm','mdm.windows'), ('fixture-agent','agent','agent.builtin')]:
        registration, grant, request, credential = [str(uuid.uuid4()) for _ in range(4)]
        sql.append(f"INSERT INTO mdm_access.devices(tenant_id,id) VALUES('{tenant}','{device}')")
        if channel == 'mdm':
            sql += [f"INSERT INTO mdm_access.grants(tenant_id,id,actor,instance,device,purpose,state,expires_at) VALUES('{tenant}','{grant}','fixture','{INSTANCE}','{device}','enrollment','consumed',clock_timestamp()+interval '2 minutes')",
                    f"INSERT INTO mdm_access.requests(tenant_id,id,grant_id,source,windows_profile) VALUES('{tenant}','{request}','{grant}','{source}','Device')"]
            column, origin = 'request_id', request
        else:
            sql.append(f"INSERT INTO mdm_access.agent_grants(tenant_id,id,operation_id,source,actor,instance,device,platform,secret_digest,request_digest,state,expires_at) VALUES('{tenant}','{grant}','{request}','download','fixture','{INSTANCE}','{device}','windows',repeat('0',64),repeat('0',64),'consumed',clock_timestamp()+interval '1 hour')")
            column, origin = 'agent_grant_id', grant
        sql += [f"INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,{column},state,purpose,epoch) VALUES('{tenant}','{registration}','{device}','{channel}',1,'{origin}','active','primary',gen_random_uuid())",
                f"INSERT INTO mdm_access.credentials VALUES('{tenant}','{credential}','{registration}','{channel}',md5('{credential}')||md5('{registration}'),'active')"]
        for field, scalar in [('custom.asset_tag',dict(kind='string',value=device)), ('custom.browser_list',dict(kind='array',value=[dict(kind='integer',value=n) for n in range(25 if channel=='mdm' else 3)]))]:
            fact=dict(state=dict(kind='known',value=scalar),lastKnown=None,evidence=dict(source='manual',dataset=None,registration=None,registrationGeneration=None,epoch=None,snapshotId=str(uuid.uuid4()),observedAt=1,receivedAt=2,actor=ADMIN))
            sql.append(f"INSERT INTO mdm.manual_assignments(tenant_id,device,field,revision,fact) VALUES('{tenant}','{device}','{field}',1,{q(json.dumps(fact))}::jsonb)")
    definition=dict(key='custom.browser_list',version=1,valueType=dict(kind='array',items=dict(kind='integer'),maxItems=1000),nullable=True,manual=True,sources=dict(manual=0),platforms=['windows','macos'],sensitivity='standard',unit=None,searchable=True,itemKey=None)
    # Private disposable fixture publication; no user operation or current-state assertion is forged.
    sql.append(f"INSERT INTO mdm.field_versions(tenant_id,field,version,revision,definition) VALUES('{tenant}','custom.browser_list',1,mdm.record_asset_change('{tenant}'::uuid,'catalog',jsonb_build_object('field','custom.browser_list'),ARRAY['custom.browser_list']),{q(json.dumps(definition))}::jsonb)")
    for index in range(24):
        sql.append(f"INSERT INTO mdm_access.devices(tenant_id,id) VALUES('{tenant}','extra-{index:02}')")
    try:
        environment.sql(';'.join(sql)+';', 'mdm_dev')
    except subprocess.CalledProcessError as error:
        # Keep row values and SQL bodies private; expose only schema error identifiers.
        message = error.stderr or ''
        matches = re.findall(r'(?:constraint|column|function|relation) "([a-zA-Z0-9_.]+)"', message)
        print(json.dumps(dict(phase='seed', classification='tenantBinding' if 'asset tenant mismatch' in message else 'schema', identifiers=matches)), flush=True)
        raise
    return rule_id, rule

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT'] = str(WEB/'apps/mdm/dist')
    initialized = environment.initialize()
    phase = 'seed'
    rule_id, rule = seed()
    binary = Path(os.environ['CARGO_TARGET_DIR'])/'debug/rss-mdm'
    private(environment.root/'product.log','')
    log = (environment.root/'product.log').open('w')
    processes.append(subprocess.Popen([str(binary),'serve','--config',initialized['configuration']],cwd=BACKEND,stdout=log,stderr=log))
    processes.append(subprocess.Popen(['nginx','-c',initialized['gateway'],'-g','daemon off;'],cwd=BACKEND,stdout=log,stderr=log))
    phase = 'readiness'
    context=ssl.create_default_context(cafile=str(environment.root/'ca.crt'))
    deadline=time.monotonic()+30
    while True:
        try:
            with urllib.request.urlopen(initialized['origin']+'/readyz',context=context,timeout=2) as response:
                if response.status==200: break
        except (OSError,urllib.error.URLError): pass
        if time.monotonic()>deadline or any(p.poll() is not None for p in processes): raise RuntimeError('readiness')
        time.sleep(.2)
    fixture=private(environment.root/'browser.json',dict(origin=initialized['origin'],tenant=TENANTS[0],instance=INSTANCE,principal=ADMIN,login='admin',passwordFile=str(environment.root/'account-password'),mdm='fixture-mdm',agent='fixture-agent',ruleId=rule_id,rule=rule))
    phase='browser'
    browser=subprocess.run(['node',str(WEB/'e2e/mdm/device-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_DEVICE_BROWSER_FIXTURE':str(fixture)},timeout=180,pass_fds=lease_fds())
    if browser.returncode: raise RuntimeError('browser')
    result='passed'
except BaseException as error:
    print(json.dumps(dict(phase=phase,result='failed',classification=type(error).__name__)),flush=True)
finally:
    stop()
    for child in reversed(processes):
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill();child.wait(timeout=5)
    try: environment.reset()
    except BaseException: cleanup='failed'
    print(json.dumps(dict(phase='device-fixture',result=result,cleanup=cleanup)),flush=True)
    if result!='passed' or cleanup!='passed': sys.exit(1)
