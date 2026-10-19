"""Disposable real PG, Identity, two tenant-bound product processes and HTTPS gateways.

Only fixture preparation uses SQL/CLI. Browser mutations use the formal product APIs.
No source changes, provider qualification forgery or installation-success assertions.
"""
import copy
import json
import os
from pathlib import Path
import signal
import ssl
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit

WEB=Path(sys.argv[1]).resolve()
BACKEND=Path.cwd()
sys.path.insert(0,str(BACKEND/'hack'))
from t2_environment import Environment,private
from candidate_fixture import INSTANCE,TENANTS,ADMIN,installation
from build_run import lease_fds

environment=Environment(BACKEND,group='settings-browser')
target_ports=Environment(BACKEND,group='settings-browser-target')
processes=[]
phase='environment'
result='failed'
cleanup=True

def stop(signum=None,_frame=None):
    for child in reversed(processes):
        if child.poll() is None:child.terminate()
    if signum:raise InterruptedError()

for signum in (signal.SIGINT,signal.SIGTERM):signal.signal(signum,stop)

def command(binary,verb,value):
    path=private(environment.root/(verb+'-'+str(uuid.uuid4())+'.json'),value)
    output=subprocess.run([str(binary),verb,'--config',str(path)],cwd=BACKEND,capture_output=True,text=True,timeout=75,pass_fds=lease_fds())
    if output.returncode:raise RuntimeError('fixture-cli-'+verb)
    return json.loads(output.stdout) if output.stdout.strip() else None

def start_host(binary,config_path,gateway_path,log):
    processes.append(subprocess.Popen([str(binary),'serve','--config',str(config_path)],cwd=BACKEND,stdout=log,stderr=log,env={**os.environ,'RUST_MIN_STACK':str(8*1024*1024)}))
    processes.append(subprocess.Popen(['nginx','-c',str(gateway_path),'-g','daemon off;'],cwd=BACKEND,stdout=log,stderr=log))

def ready(origin):
    context=ssl.create_default_context(cafile=str(environment.root/'ca.crt'))
    until=time.monotonic()+40
    while time.monotonic()<until:
        if any(child.poll() is not None for child in processes):raise RuntimeError('fixture-process-exit')
        try:
            if environment.probe_product(origin,urlsplit(origin).port,context):return
        except (OSError,ssl.SSLError):pass
        time.sleep(.2)
    raise TimeoutError('fixture-readiness')

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT']=str(WEB/'apps/mdm/dist')
    initialized=environment.initialize()
    binary=Path(os.environ['CARGO_TARGET_DIR'])/'debug/rss-mdm'
    config_path=Path(initialized['configuration'])
    config=json.loads(config_path.read_text())
    management=environment.sql('SELECT management_tenant_id FROM public.mdm_installation','mdm_dev').strip()
    operator=environment.root/'host/operator'
    initialize=json.loads((operator/'initialize.json').read_text())
    initialize['tenant_id']=management
    command(binary,'initialize',initialize)
    authorization=json.loads((operator/'authorization.json').read_text())
    authorization['user']['tenantId']=management
    authorization['operationId']=str(uuid.uuid4())
    command(binary,'initialize-authorization',authorization)
    def database(role,password):
        value=copy.deepcopy(config['access_database']);value['user']=role
        value['password_file']=str(private(environment.root/(role+'-password'),password))
        return value
    config['tenant_administration']=dict(registry_database=database('mdm_tenant_registry','tenant-registry-fixture'),provisioning_database=database('mdm_identity_provisioning','identity-provisioning-fixture'),fingerprint_key_file=str(private(environment.root/'tenant-operation-key','x'*32)))
    private(config_path,config)
    # Legitimate fixture grants, not provider qualification or host-application facts.
    grants=[dict(operation=p,scope=dict(kind='tenant')) for p in ['registration_configuration_read','registration_configuration_write','storage_configuration_read','storage_configuration_write','webhook_read','webhook_write','runtime_diagnostics_read','agent_enrollment_read','release_publish','software_withdraw']]
    grants += [dict(operation='credentials',scope=dict(kind='all_devices'))]
    rule=dict(subject=dict(kind='user',user=dict(instanceId=INSTANCE,tenantId=TENANTS[0],principalId=ADMIN)),grants=grants)
    text=json.dumps(rule).replace("'","''")
    environment.sql(f"SET rss.tenant_id='{TENANTS[0]}';INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES('{TENANTS[0]}','{INSTANCE}','{uuid.uuid4()}',1,'{text}'::jsonb)",'mdm_dev')
    log_path=private(environment.root/'product.log','')
    with log_path.open('w') as log:
        start_host(binary,config_path,initialized['gateway'],log)
        ready(initialized['origin'])
        revision=subprocess.run(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,capture_output=True,text=True,check=True).stdout.strip()
        request=environment.root/'target-request.json'
        response=environment.root/'target-ready.json'
        fixture=private(environment.root/'browser.json',dict(backendRevision=revision,origin=initialized['origin'],tenant=TENANTS[0],managementTenant=management,login='admin',passwordFile=str(environment.root/'account-password'),targetRequest=str(request),targetReady=str(response)))
        phase='browser'
        browser=subprocess.Popen(['node',str(WEB/'e2e/mdm/settings-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_SETTINGS_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds())
        processes.append(browser)
        until=time.monotonic()+420
        target_started=False
        while browser.poll() is None:
            if time.monotonic()>until:raise TimeoutError('browser-deadline')
            if request.exists() and not target_started:
                phase='target-host'
                target_started=True
                value=json.loads(request.read_text());tenant=str(uuid.UUID(value['tenant']))
                operation=str(uuid.UUID(value['operation']))
                # Verify the browser-created account/tenant exists through the original registry fact.
                if environment.sql(f"SELECT count(*) FROM public.mdm_tenant_operations WHERE tenant_id='{tenant}' AND operation_id='{operation}' AND action='provision'",'mdm_dev').strip()!='1':raise RuntimeError('target-binding')
                ports=target_ports.host_ports()
                origin='https://localhost:'+str(ports['https'])
                target=copy.deepcopy(config);target['identity']['tenant_id']=tenant;target['identity']['oidc']=None
                target['product_origin']=origin;target['listen']='127.0.0.1:'+str(ports['backend'])
                path=private(environment.root/'target-runtime.json',target)
                public=command(binary,'public-host-config',target)
                gateway_dir=environment.root/'target-gateway';gateway_dir.mkdir(mode=0o700)
                for name in ('ui.json','mdm.json'):private(gateway_dir/name,public[name])
                original=Path(initialized['gateway']);gateway=original.read_text().replace(str(original.parent),str(gateway_dir)).replace('listen '+str(urlsplit(initialized['origin']).port)+' ssl;', 'listen '+str(ports['https'])+' ssl;').replace(config['listen'],target['listen'])
                for name in ('server.crt','server.key'):private(gateway_dir/name,(original.parent/name).read_text())
                gateway_path=private(gateway_dir/'nginx.conf',gateway)
                start_host(binary,path,gateway_path,log);ready(origin)
                private(response,dict(origin=origin,tenant=tenant))
                phase='browser'
            time.sleep(.1)
        if browser.returncode:raise RuntimeError('browser-failed')
        result='passed'
except BaseException as error:
    print(json.dumps(dict(phase=phase,result='failed',classification=type(error).__name__)),flush=True)
finally:
    stop()
    for child in reversed(processes):
        try:child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:cleanup=False
    try:target_ports.host_ports(release=True)
    except BaseException:cleanup=False
    if result!='passed' and (environment.root/'product.log').exists():private(WEB/'artifacts/settings-browser/product.log',(environment.root/'product.log').read_text())
    print(json.dumps(dict(phase='settings-fixture',result=result,processCleanup=cleanup)),flush=True)
    if result!='passed' or not cleanup:sys.exit(1)
