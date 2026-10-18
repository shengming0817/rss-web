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
from urllib.parse import urlsplit
import http.client
import uuid

WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.path.insert(0, str(BACKEND / 'hack'))
from t2_environment import Environment, private
from candidate_fixture import INSTANCE, TENANTS, ADMIN
from build_run import lease_fds

environment = Environment(BACKEND, group='software-browser')
processes = []
phase = 'environment'
result = 'failed'
readiness = None

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
    tenant=TENANTS[0]
    user=dict(instanceId=INSTANCE,tenantId=tenant,principalId=ADMIN)
    grants=[dict(operation=p,scope=dict(kind='all_devices')) for p in ['inventory_read','software_deploy','operation_read']]
    grants += [dict(operation=p,scope=dict(kind='tenant')) for p in ['resource_read','resource_write','software_read','software_write','software_withdraw','policy_read','policy_write','scope_read','scope_write','release_read','release_publish','release_recover','release_withdraw']]
    rule=dict(subject=dict(kind='user',user=user),grants=grants)
    rule_id=str(uuid.uuid4())
    sql=[f"SET rss.tenant_id='{tenant}'",f"INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES('{tenant}','{INSTANCE}','{rule_id}',1,{q(json.dumps(rule))}::jsonb)"]
    for device in ['software-a','software-b']:
        registration,grant,operation,credential=[str(uuid.uuid4()) for _ in range(4)]
        sql += [f"INSERT INTO mdm_access.devices(tenant_id,id) VALUES('{tenant}','{device}')",
          f"INSERT INTO mdm_access.agent_grants(tenant_id,id,operation_id,source,actor,instance,device,platform,secret_digest,request_digest,state,expires_at) VALUES('{tenant}','{grant}','{operation}','download','fixture','{INSTANCE}','{device}','windows',repeat('0',64),repeat('0',64),'consumed',clock_timestamp()+interval '1 hour')",
          f"INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,agent_grant_id,state,purpose,epoch) VALUES('{tenant}','{registration}','{device}','agent',1,'{grant}','active','primary',gen_random_uuid())",
          f"INSERT INTO mdm_access.credentials VALUES('{tenant}','{credential}','{registration}','agent',md5('{credential}')||md5('{registration}'),'active')"]
    environment.sql(';'.join(sql)+';', 'mdm_dev')
    return rule_id,rule

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT'] = str(WEB/'apps/mdm/dist')
    initialized = environment.initialize()
    config_path=Path(initialized['configuration'])
    config=json.loads(config_path.read_text())
    base=initialized['origin']+'/api/v1/software/native/sources/internal/'
    config['flow']['publication']['sources']=[dict(name='internal',credentials={},target=dict(Winget=dict(base=base,artifacts_base=base+'artifacts/')))]
    private(config_path,config)
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
        for role, child in zip(('product', 'gateway'), processes):
            if child.poll() is not None:
                readiness = dict(classification=role+'-exit', exitCode=child.returncode)
                raise RuntimeError('readiness')
        try:
            if environment.probe_product(initialized['origin'], urlsplit(initialized['origin']).port, context):
                break
            readiness = dict(classification='http-status')
        except ssl.SSLCertVerificationError:
            readiness = dict(classification='tls-verification')
        except ssl.SSLError:
            readiness = dict(classification='tls-handshake')
        except http.client.HTTPException:
            readiness = dict(classification='http-response')
        except OSError:
            readiness = dict(classification='transport')
        if time.monotonic() >= deadline:
            print(json.dumps(dict(phase='readiness', result='failed', classification='deadline', lastFailure=readiness)), flush=True)
            raise RuntimeError('readiness')
        time.sleep(.2)
    revision=subprocess.run(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,capture_output=True,text=True).stdout.strip() or None
    fixture=private(environment.root/'browser.json',dict(backendRevision=revision,origin=initialized['origin'],tenant=TENANTS[0],instance=INSTANCE,principal=ADMIN,login='admin',passwordFile=str(environment.root/'account-password'),devices=['software-a','software-b'],target='internal',ruleId=rule_id,rule=rule))
    phase='browser'
    browser=subprocess.run(['node',str(WEB/'e2e/mdm/software-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_SOFTWARE_BROWSER_FIXTURE':str(fixture)},timeout=360,pass_fds=lease_fds())
    if browser.returncode: raise RuntimeError('browser')
    result='passed'
except BaseException as error:
    if phase == 'readiness' and readiness:
        print(json.dumps(dict(phase=phase, result='failed', **readiness)), flush=True)
    print(json.dumps(dict(phase=phase,result='failed',classification=type(error).__name__)),flush=True)
finally:
    stop()
    for child in reversed(processes):
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill();child.wait(timeout=5)
    # The parent starts a fresh leased reset after this execution runner closes.
    # Keep resource cleanup outside build_run's five-second cancellation window.
    print(json.dumps(dict(phase='software-fixture',result=result)),flush=True)
    if result!='passed': sys.exit(1)
