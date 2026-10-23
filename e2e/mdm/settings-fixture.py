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
sys.dont_write_bytecode = True
sys.path.insert(0,str(BACKEND/'hack'))
from t2_environment import Environment,private
from candidate_fixture import INSTANCE,TENANTS,ADMIN,installation
from build_run import lease_fds
from runtime_fixture import storage, signer, readiness

def cleanup_compose():
    import hashlib
    import re
    import shutil
    import tempfile
    from candidate_installation_driver import Installation
    from pki_ca import Provider
    locator=WEB/'artifacts/settings-browser/compose.json'
    if not locator.exists():return
    if locator.is_symlink() or locator.stat().st_mode & 0o077 or locator.stat().st_uid!=os.getuid():raise RuntimeError('unsafe-compose-cleanup-locator')
    value=json.loads(locator.read_text())
    root=Path(value['root'])
    if value['backend']!=str(BACKEND) or root.is_symlink() or root.parent.resolve()!=Path(tempfile.gettempdir()).resolve() or not re.fullmatch(r'mdm-first-use-compose-[a-z0-9_]+',root.name) or not re.fullmatch(r'mdm-first-use-[0-9a-f]{12}',value['project']):raise RuntimeError('foreign-compose-cleanup-locator')
    owner=Installation(root,root/'production.compose.yaml',value['project'])
    failures=[]
    for name,action in [('compose',owner.cleanup),('provider',lambda:Provider(root/'inputs/browser-materials/pki/windows',hashlib.sha256((str(WEB)+':first-use-compose:windows').encode()).hexdigest()[:20],owner_root=BACKEND).reset())]:
        try:action()
        except BaseException as error:
            failures.append(name)
            print(json.dumps(dict(phase='settings-compose-cleanup',result='failed',owner=name,classification=type(error).__name__,recoveryDirectory=str(root))),flush=True)
    for kind,args in [('containers',['ps','--all','--quiet']),('networks',['network','ls','--quiet']),('volumes',['volume','ls','--quiet'])]:
        try:
            actual=subprocess.check_output(['docker',*args,'--filter','label=com.docker.compose.project='+value['project']],text=True,timeout=15)
            if actual.strip():failures.append(kind)
        except BaseException:failures.append(kind)
    if failures:
        print(json.dumps(dict(phase='settings-compose-cleanup',result='failed',project=value['project'],recoveryDirectory=str(root))),flush=True)
        raise RuntimeError('compose-cleanup-unconfirmed')
    # The fixture may still own an open provider context. Its generated inputs remain
    # until that context has closed; the independent runner then removes this locator.
    if '--cleanup-compose' in sys.argv:
        shutil.rmtree(root)
        locator.unlink()
    print(json.dumps(dict(phase='settings-compose-cleanup',result='passed')),flush=True)

def compose_browser(candidate):
    """Existing browser entry over formal Compose seed and an actual configured test CA."""
    import hashlib
    import shutil
    import socket
    import tempfile
    from contextlib import ExitStack
    from candidate_runtime import verify_candidate,load_ui,image_identity
    from candidate_installation import tls
    from candidate_installation_driver import Installation,until,Browser
    from windows_fixtures import generate
    from pki_fixtures import running
    candidate=Path(candidate).resolve()
    manifest=verify_candidate(candidate)
    image=load_ui(candidate,manifest['ui'])
    if (WEB/'artifacts/settings-browser/compose.json').exists():raise RuntimeError('previous-compose-cleanup-required')
    root=Path(tempfile.mkdtemp(prefix='mdm-first-use-compose-')).resolve()
    with ExitStack() as providers:
        inputs=root/'inputs';inputs.mkdir(mode=0o700)
        tls(inputs)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
        origin='https://localhost:'+str(port)
        values=dict(MDM_POSTGRES_IMAGE=manifest['providers']['postgres'],MDM_SERVER_IMAGE=image_identity(manifest['image'])['id'],MDM_INSTALLER_IMAGE=image_identity(manifest['installer']['image'])['id'],MDM_WEB_IMAGE=image['id'],MDM_INPUT_DIRECTORY=str(inputs),MDM_PRODUCT_ORIGIN=origin,MDM_HTTPS_PORT=port)
        private(root/'.env',''.join(k+'='+str(v)+'\n' for k,v in values.items()))
        compose=root/'production.compose.yaml';shutil.copyfile(candidate/'deployment/production.compose.yaml',compose)
        owner=Installation(root,compose,'mdm-first-use-'+uuid.uuid4().hex[:12])
        private(WEB/'artifacts/settings-browser/compose.json',dict(root=str(root),project=owner.project,backend=str(BACKEND)))
        child=None
        def interrupt(_signal,_frame):
            if child and child.poll() is None:child.terminate()
            raise InterruptedError()
        previous={sig:signal.signal(sig,interrupt) for sig in (signal.SIGINT,signal.SIGTERM)}
        try:
            owner.compose('up','-d')
            api=Browser(origin,inputs/'ca.crt')
            until(lambda:api.call('GET','/readyz')[0]==200)
            seeded=json.loads(owner.read('/var/lib/rss-mdm/installation/installation.json'))['receipt']
            owner.product('prepare-hosts')
            owner.compose('run','--rm','init')
            if seeded!=json.loads(owner.read('/var/lib/rss-mdm/installation/installation.json'))['receipt']:raise RuntimeError('seed-replay')
            # The CA is real and disposable. Native protocol/device effects are not exercised.
            material=inputs/'browser-materials';material.mkdir(mode=0o700)
            for source,target in [('ca.crt','ca.crt'),('gateway.crt','server.crt'),('gateway.key','server.key')]:
                private(material/target,(inputs/source).read_text())
            private(material/'case.json',dict(tenant=seeded['tenantId']))
            windows=generate(material,material/'server.crt',material/'server.key')
            private(material/'windows.json',windows)
            provider=providers.enter_context(running(material,dict(os.environ),case=str(WEB)+':first-use-compose',windows=True,owner_root=BACKEND))
            server=owner.compose('ps','-q','server')
            subprocess.run(['docker','network','connect',provider.owner.project+'_default',server],check=True,capture_output=True,timeout=20)
            authorities=json.loads((material/'device-pki.json').read_text())
            authorities[0]['origin']='https://'+provider.internal_host+':19443'
            copies={}
            def prepared(value):
                if isinstance(value,dict):return {k:copy_file(v) if k.endswith('_file') and v is not None else prepared(v) for k,v in value.items()}
                if isinstance(value,list):return [prepared(v) for v in value]
                return value
            def copy_file(value):
                source=Path(value).resolve()
                relative=source.relative_to(inputs)
                name=hashlib.sha256(source.read_bytes()).hexdigest()[:16]+'-'+source.name
                copies[str(relative)]='/var/lib/rss-mdm/browser-materials/'+name
                return copies[str(relative)]
            settings=dict(windows=prepared(json.loads((material/'windows.json').read_text())),apple=None,agent=dict(mode='disabled'),providers=prepared(authorities),apple_material_roots=[])
            configuration=json.loads(owner.read('/var/lib/rss-mdm/installation-input.json'))
            change=dict(installation=configuration,operation_id=str(uuid.uuid4()),host_id=seeded['hostId'],expected_revision=1,change=dict(kind='channels',settings=settings))
            private(inputs/'configure-browser.json',change)
            importer="import shutil,pathlib,os; pairs="+repr(copies)+"; "+\
                "[(pathlib.Path(dst).parent.mkdir(parents=True,exist_ok=True,mode=0o700),os.chown(pathlib.Path(dst).parent,10001,10001),shutil.copyfile('/inputs/'+src,dst),pathlib.Path(dst).chmod(0o600),os.chown(dst,10001,10001)) for src,dst in pairs.items()]; "+\
                "shutil.copyfile('/inputs/configure-browser.json','/var/lib/rss-mdm/configure-browser.json');pathlib.Path('/var/lib/rss-mdm/configure-browser.json').chmod(0o600);os.chown('/var/lib/rss-mdm/configure-browser.json',10001,10001)"
            owner.compose('run','--rm','--no-deps','--user','0:0','--entrypoint','python3','init','-c',importer)
            owner.product('configure-host','/var/lib/rss-mdm/configure-browser.json')
            # The gateway shares the server's network namespace. Stop it before
            # replacing that namespace, then attach it to the restarted server.
            owner.compose('stop','gateway')
            owner.compose('restart','server')
            owner.compose('start','gateway')
            # Network attachments survive restart; the operator observes the actual new process.
            until(lambda:api.call('GET','/readyz')[0]==200)
            owner.product('configure-host','/var/lib/rss-mdm/configure-browser.json')
            owner.product('prepare-hosts')
            api.login(seeded['tenantId'],'administrator',(inputs/'administrator-password').read_text().strip())
            reader_password=private(root/'reader-password','First-use-browser-reader-2026!')
            status,_=api.call('POST','/api/v1/identity/tenants/'+seeded['tenantId']+'/accounts',dict(login='reader',password=reader_password.read_text()))
            if status!=201:raise RuntimeError('reader-account')
            _,host=api.call('GET','/api/v1/mdm-host/config.json')
            fixture=private(root/'browser.json',dict(compose=True,backendRevision=subprocess.check_output(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,text=True).strip(),origin=origin,tenant=seeded['tenantId'],managementTenant=host['managementTenant'],login='administrator',passwordFile=str(inputs/'administrator-password'),platformLogin='platform',platformPasswordFile=str(inputs/'platform-password'),reader=dict(login='reader',passwordFile=str(reader_password))))
            child=subprocess.Popen(['node',str(WEB/'e2e/mdm/settings-browser.mjs')],cwd=WEB,env={**os.environ,'MDM_SETTINGS_BROWSER_FIXTURE':str(fixture)},pass_fds=lease_fds())
            try:
                if child.wait(timeout=480)!=0:raise RuntimeError('compose-browser')
            finally:
                if child.poll() is None:
                    child.terminate()
                    try:child.wait(timeout=10)
                    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)
        finally:
            try:
                try:owner.cleanup()
                finally:
                    try:providers.close()
                    finally:cleanup_compose()
            finally:
                for sig,handler in previous.items():signal.signal(sig,handler)
    print(json.dumps(dict(phase='settings-compose',result='passed',cleanup=True)),flush=True)

if '--cleanup-compose' in sys.argv:
    try:cleanup_compose()
    except BaseException as error:
        print(json.dumps(dict(phase='settings-compose-cleanup',result='failed',classification=type(error).__name__,recoveryLocator=str(WEB/'artifacts/settings-browser/compose.json'))),flush=True)
        sys.exit(1)
    sys.exit(0)

if os.environ.get('MDM_SETTINGS_CANDIDATE'):
    try:compose_browser(os.environ['MDM_SETTINGS_CANDIDATE'])
    except BaseException as error:
        import traceback
        frames=[dict(file=Path(frame.filename).name,line=frame.lineno,function=frame.name) for frame in traceback.extract_tb(error.__traceback__)]
        print(json.dumps(dict(phase='settings-compose',result='failed',classification=type(error).__name__,frames=frames)),flush=True)
        sys.exit(1)
    sys.exit(0)

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

    return processes[-2:]

def stop_host(children):
    for child in reversed(children):
        if child.poll() is None:child.terminate()
    for child in reversed(children):child.wait(timeout=10)

def ready(origin, children, expected=200):
    until=time.monotonic()+180
    while time.monotonic()<until:
        if any(child.poll() is not None for child in children):raise RuntimeError('fixture-process-exit')
        try:
            if readiness(environment, origin)==expected:
                print(json.dumps(dict(phase='readiness',status=expected)),flush=True)
                return
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
    storage(environment, binary, config, TENANTS[0])
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
        initial=start_host(binary,config_path,initialized['gateway'],log)
        ready(initialized['origin'],initial,expected=503)
        config['task_signing']=dict(revision=signer(environment,initialized['origin'],TENANTS[0],'admin',(environment.root/'account-password').read_text()))
        stop_host(initial)
        private(config_path,config)
        ready(initialized['origin'],start_host(binary,config_path,initialized['gateway'],log))
        # Disposable management accounts and legal grants prepare the existing HTTPS carrier.
        from candidate_installation_driver import Browser
        manager=Browser(initialized['origin'],environment.root/'ca.crt')
        manager.login(management,'admin',(environment.root/'account-password').read_text().strip())
        api='/api/v1/identity/tenants/'+management
        def expect_status(actual,expected):
            if actual!=expected:raise RuntimeError('management-fixture-status-'+str(actual))
        def managed_rule(principal,permissions):
            return dict(subject=dict(kind='user',user=dict(instanceId=INSTANCE,tenantId=management,principalId=principal)),grants=[dict(operation=p,scope=dict(kind='tenant')) for p in permissions])
        prepared={}
        for name,permissions in [('authorization-target',[]),('authorization-maintainer',['authorization_read','authorization_write']),('authorization-reader',['authorization_read'])]:
            secret='Disposable-'+uuid.uuid4().hex+'!'
            status,account=manager.call('POST',api+'/accounts',dict(login=name,password=secret))
            expect_status(status,201)
            prepared[name]=dict(login=name,principalId=account['principalId'],passwordFile=str(private(environment.root/(name+'-password'),secret)))
            if permissions:
                status,_=manager.call('PUT','/api/v1/tenant-administration/authorization/rules/'+str(uuid.uuid4()),dict(operationId=str(uuid.uuid4()),expectedRevision=0,value=managed_rule(account['principalId'],permissions)))
                expect_status(status,200)
        # Page size is the server's fixed 100; all subjects are actual existing accounts.
        pagination_rows=[]
        for index in range(101):
            identifier='09090909-0909-4909-8909-'+str(index).zfill(12)
            document=json.dumps(managed_rule(prepared['authorization-target']['principalId'],['tenant_read'])).replace("'","''")
            pagination_rows.append(f"('{management}','{INSTANCE}','{identifier}',1,'{document}'::jsonb)")
        environment.sql(f"SET rss.tenant_id='{management}';INSERT INTO mdm_access.authorization_rules(tenant_id,instance,id,revision,document) VALUES "+','.join(pagination_rows),'mdm_dev')
        status,initial_rules=manager.call('GET','/api/v1/tenant-administration/authorization/rules')
        expect_status(status,200)
        initial_rule=None
        cursor=None
        while True:
            for row in initial_rules['items']:
                if row['value'] and row['value']['subject']['user']['principalId']==ADMIN and any(g['operation']=='identity_accounts_manage' for g in row['value']['grants']):initial_rule=row
            cursor=initial_rules['nextCursor']
            if not cursor:break
            status,initial_rules=manager.call('GET','/api/v1/tenant-administration/authorization/rules?after='+cursor)
            expect_status(status,200)
        if not initial_rule:raise RuntimeError('initial-rule-not-found')
        authorization_fixture=dict(accounts=prepared,initialRule=initial_rule,instanceId=INSTANCE)
        revision=subprocess.run(['/usr/bin/git','rev-parse','HEAD'],cwd=BACKEND,capture_output=True,text=True,check=True).stdout.strip()
        request=environment.root/'target-request.json'
        response=environment.root/'target-ready.json'
        fixture=private(environment.root/'browser.json',dict(backendRevision=revision,origin=initialized['origin'],tenant=TENANTS[0],managementTenant=management,login='admin',passwordFile=str(environment.root/'account-password'),targetRequest=str(request),targetReady=str(response),authorization=authorization_fixture))
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
                target['task_signing']=None
                storage(environment,binary,target,tenant)
                path=private(environment.root/'target-runtime.json',target)
                public=command(binary,'public-host-config',target)
                gateway_dir=environment.root/'target-gateway';gateway_dir.mkdir(mode=0o700)
                for name in ('ui.json','mdm.json'):private(gateway_dir/name,public[name])
                original=Path(initialized['gateway']);gateway=original.read_text().replace(str(original.parent),str(gateway_dir)).replace('listen '+str(urlsplit(initialized['origin']).port)+' ssl;', 'listen '+str(ports['https'])+' ssl;').replace(config['listen'],target['listen'])
                for name in ('server.crt','server.key'):private(gateway_dir/name,(original.parent/name).read_text())
                gateway_path=private(gateway_dir/'nginx.conf',gateway)
                initial=start_host(binary,path,gateway_path,log);ready(origin,initial,expected=503)
                target['task_signing']=dict(revision=signer(environment,origin,tenant,value['login'],value['password']))
                stop_host(initial)
                private(path,target)
                ready(origin,start_host(binary,path,gateway_path,log))
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
