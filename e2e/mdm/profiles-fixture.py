"""Owned disposable PG + fixed Keycloak + production MDM HTTPS profile journey."""
import copy
import json
import os
from pathlib import Path
import signal
import ssl
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import uuid

WEB=Path(sys.argv[1]).resolve()
BACKEND=Path.cwd()
IDENTITY=Path(os.environ['IDENTITY_BACKEND_FIXTURE']).resolve()
sys.dont_write_bytecode=True
sys.path.insert(0,str(BACKEND/'hack'))
from t2_environment import Environment,private
from candidate_fixture import TENANTS,ADMIN
from build_run import lease_fds
sys.path.insert(0,str(IDENTITY/'hack'))
import providers

GROUP = 'react-administration-browser'
environment=Environment(BACKEND,group=GROUP)
children=[]
phase='prepare'
result='failed'
cleanup=True

def stop(_signal=None,_frame=None):
    for child in reversed(children):
        if child.poll() is None:child.terminate()
    if _signal:raise InterruptedError()
for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,stop)

def wait_http(url,ca,expected=200):
    context=ssl.create_default_context(cafile=str(ca));end=time.monotonic()+120
    while time.monotonic()<end:
        if any(c.poll() is not None for c in children):raise RuntimeError('host-exited')
        try:
            with urllib.request.urlopen(url,context=context,timeout=2) as response:
                if response.status==expected:return
        except urllib.error.HTTPError as error:
            if error.code==expected:return
        except OSError:pass
        time.sleep(.2)
    raise TimeoutError('host-startup')

def idp_admin(issuer,ca):
    origin=issuer.rsplit('/realms/',1)[0]
    context=ssl.create_default_context(cafile=str(ca))
    def call(method,path,value=None):
        data=urllib.parse.urlencode(dict(client_id='admin-cli',grant_type='password',username='fixture-operator',password='fixture-operator-password')).encode()
        with urllib.request.urlopen(urllib.request.Request(origin+'/realms/master/protocol/openid-connect/token',data=data),context=context,timeout=10) as response:token=json.load(response)['access_token']
        request=urllib.request.Request(origin+'/admin/realms/identity'+path,method=method,data=None if value is None else json.dumps(value).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(request,context=context,timeout=10) as response:return json.loads(response.read() or b'null')
    return call

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT']=str(WEB/'apps/mdm/dist')
    initialized=environment.initialize()
    origin=initialized['origin'];config_path=Path(initialized['configuration'])
    binary=Path(os.environ['CARGO_TARGET_DIR'])/'debug/rss-mdm'
    host=providers.private_host()
    with providers.keycloak(redirect_uri=origin+'/api/v1/identity/oidc/callback',host=host) as idp:
        issuer=idp['IDENTITY_TEST_FEDERATED_ISSUER'];ca=Path(idp['IDENTITY_TEST_FEDERATED_CA'])
        config=json.loads(config_path.read_text())
        keys={name:str(private(environment.root/(name+'-key'),uuid.uuid4().hex+uuid.uuid4().hex)) for name in ['state','credential']}
        config['identity']['oidc']=dict(group_facts_max_age_seconds=300,state_key_file=keys['state'],active_credential_key='current',credential_keys={'current':keys['credential']},return_targets={'resume':origin+'/auth/resume'},assurance_profiles=[],private_providers=[dict(tenant_id=TENANTS[0],issuer=issuer,client_id='identity-test',cidrs=[host+'/32'])])
        management = None
        unused = None
        from runtime_fixture import storage
        storage(environment,binary,config,TENANTS[0])
        management=environment.sql('SELECT management_tenant_id FROM public.mdm_installation','mdm_dev').strip()
        operator=environment.root/'host/operator'
        def command(verb,value):
            path=private(environment.root/(verb+'-'+uuid.uuid4().hex+'.json'),value)
            result=subprocess.run([str(binary),verb,'--config',str(path)],cwd=BACKEND,capture_output=True,text=True,timeout=75,pass_fds=lease_fds())
            if result.returncode:raise RuntimeError('fixture-cli-'+verb)
        value=json.loads((operator/'initialize.json').read_text());value['tenant_id']=management
        command('initialize',value)
        value=json.loads((operator/'authorization.json').read_text());value['user']['tenantId']=management;value['operationId']=str(uuid.uuid4())
        command('initialize-authorization',value)
        def database(role,password):
            value=copy.deepcopy(config['access_database']);value['user']=role
            value['password_file']=str(private(environment.root/(role+'-password'),password))
            return value
        config['tenant_administration']=dict(registry_database=database('mdm_tenant_registry','tenant-registry-fixture'),provisioning_database=database('mdm_identity_provisioning','identity-provisioning-fixture'),fingerprint_key_file=str(private(environment.root/'tenant-operation-key','x'*32)))
        # Registry, source and provisioning add 8 + 10 + 2 physical connections.
        config['background']['database_connection_budget'] += 20
        unused=str(uuid.uuid4())
        environment.sql(f"SELECT public.create_new_tenant('{unused}',1,'Disposable unused tenant',NULL)",'mdm_dev')
        private(config_path,config)
        public=subprocess.run([str(binary),'public-host-config','--config',str(config_path)],cwd=BACKEND,capture_output=True,text=True,check=True,timeout=30)
        for name,value in json.loads(public.stdout).items():private(Path(initialized['gateway']).parent/name,value)
        admin=idp_admin(issuer,ca)
        user=admin('GET','/users?username=alice&exact=true')[0]
        user.setdefault('attributes',{})['profile_attributes']=[json.dumps(dict(employeeNumber='OIDC-1',remote=False,allocation=0))]
        admin('PUT','/users/'+user['id'],user)
        log_path=private(environment.root/'product.log','')
        request=environment.root/'idp-request.json';reply=environment.root/'idp-response.json'
        fixture=private(environment.root/'browser.json',dict(origin=origin,tenant=TENANTS[0],principal=ADMIN,passwordFile=str(environment.root/'account-password'),issuer=issuer,caFile=str(ca),idpRequest=str(request),idpResponse=str(reply),backendRevision=subprocess.check_output(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,text=True).strip(),identityRevision=subprocess.check_output(['/usr/bin/git','rev-parse','HEAD'],cwd=IDENTITY,text=True).strip(),managementTenant=management,unusedTenant=unused))
        phase='host-startup'
        with log_path.open('w') as log:
            # Match the existing settings HTTPS fixture's debug-build stack budget.
            children.append(subprocess.Popen([str(binary),'serve','--config',str(config_path)],cwd=BACKEND,stdout=log,stderr=log,env={**os.environ,'RUST_MIN_STACK':str(8*1024*1024)}))
            children.append(subprocess.Popen(['nginx','-c',initialized['gateway'],'-g','daemon off;'],cwd=BACKEND,stdout=log,stderr=log))
            # Static host JSON can be served before the application has initialized.
            # The anonymous session response proves the actual backend listener is usable.
            wait_http(origin+'/api/v1/identity/tenants/'+TENANTS[0]+'/session',environment.root/'ca.crt',401)
            phase='browser'
            browser=subprocess.Popen(['node',str(WEB/'e2e/mdm/react-administration-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_PROFILE_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds())
            children.append(browser)
            end=time.monotonic()+850;handled=None
            while browser.poll() is None:
                if any(child.poll() is not None for child in children[:-1]):raise RuntimeError('host-exited')
                if time.monotonic()>end:raise TimeoutError('browser-deadline')
                if request.exists():
                    value=json.loads(request.read_text())
                    if value['id']!=handled:
                        user=admin('GET','/users?username=alice&exact=true')[0]
                        if value['action']=='update':user.setdefault('attributes',{})['profile_attributes']=[json.dumps(dict(employeeNumber='OIDC-2',remote=True,allocation=0))]
                        elif value['action']=='delete':user.setdefault('attributes',{}).pop('profile_attributes',None)
                        else:raise RuntimeError('unsupported-fixture-action')
                        admin('PUT','/users/'+user['id'],user)
                        handled=value['id'];private(reply,dict(id=handled,status='done'))
                time.sleep(.1)
            if browser.returncode:raise RuntimeError('browser-failed')
            result='passed'
except BaseException as error:
    result='failed'
    print(json.dumps(dict(phase=phase,result='failed',classification=type(error).__name__)),flush=True)
finally:
    stop()
    for child in reversed(children):
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:cleanup=False
    if result!='passed' and (environment.root/'product.log').exists():private(WEB/('artifacts/'+GROUP+'/product.log'),(environment.root/'product.log').read_text())
    print(json.dumps(dict(phase=GROUP+'-fixture',result=result,processCleanup=cleanup)),flush=True)
    if result!='passed' or not cleanup:sys.exit(1)
