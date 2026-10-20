"""One private disposable registration lifecycle input; no API result substitution."""
import json
import hashlib
from pathlib import Path
import sys
import uuid
sys.path.insert(0,str(Path.cwd()/'hack'))
from t2_environment import Environment
from candidate_fixture import TENANTS
fixture=json.loads(Path(sys.argv[1]).read_text())
assert fixture['tenant']==TENANTS[0]
e=Environment(Path.cwd(),group='device-browser')
t=fixture['tenant']
# Coordinates are fixed fixture input, never arbitrary browser request SQL.
action=sys.argv[2]
if action == 'seed-associated-inventory':
    # Synthetic collected input, bound to the current original registration.
    # Never insert group membership, Scope results or assignments.
    assert [fixture[k] for k in ['mdm','agent','alone']] == ['fixture-mdm','fixture-agent','fixture-alone']
    rows=json.loads(e.sql(f"SET rss.tenant_id='{t}'; SELECT json_agg(json_build_object('id',id,'channel',channel)) FROM mdm_access.registrations WHERE tenant_id='{t}' AND device IN ('fixture-mdm','fixture-agent','fixture-alone') AND state='active' AND purpose='primary';", 'mdm_dev').splitlines()[-1])
    compact=lambda value: json.dumps(value,separators=(',',':'))
    quote=lambda value: "'"+value.replace("'","''")+"'"
    field=dict(key='device.model',version=1,valueType=dict(kind='string',maxLength=256,allowEmpty=False),nullable=False,manual=False,sources={'agent.script':0,'agent.native':1,'agent.osquery':0,'mdm.apple':0,'agent.builtin':0,'mdm.windows':0},platforms=['windows','macos'],sensitivity='standard',unit=None,searchable=True,itemKey=None)
    statements=[f"SET LOCAL rss.tenant_id='{t}'"]
    for row in rows:
        registration=row['id']; source='agent.builtin' if row['channel']=='agent' else 'mdm.windows'; epoch=str(uuid.uuid4())
        definition=dict(dataset='inventory',version='browser-associated',source=source,fields=[dict(definition=field,scope=dict(kind='device'))])
        fingerprint=hashlib.sha256(compact(definition).encode()).hexdigest()
        coverage=compact(dict(id='inventory',version='browser-associated',definition=fingerprint,format='typed-fields-v4'))
        scope=compact(dict(tenant=t,object=registration,registration=registration,source=source,dataset='inventory',epoch=epoch))
        value=compact(dict(kind='string',value='browser-associated-model'))
        statements += [f"INSERT INTO mdm_access.report_sources(tenant_id,registration,source,epoch,enabled) VALUES('{t}','{registration}','{source}','{epoch}',true)",
            f"INSERT INTO mdm.collection_definitions(tenant_id,dataset,version,source,fingerprint,coverage,definition) VALUES('{t}','inventory','browser-associated','{source}','{fingerprint}',{quote(coverage)},{quote(compact(definition))}::jsonb) ON CONFLICT DO NOTHING",
            f"INSERT INTO mdm.inventory(field_scope,tenant_id,journal,generation,scope,coverage,field,value,batch_id,observed_at,received_at,state,last_known,last_known_batch,last_known_observed,last_known_received,registration,source,epoch,collection_sequence) VALUES({quote(compact(dict(kind='device')))},'{t}','mdm.observation.v1','inventory-v7',{quote(scope)},{quote(coverage)},'device.model',{quote(value)},'browser-associated',1,2,'known',{quote(value)},'browser-associated',1,2,'{registration}','{source}','{epoch}',0)"]
    e.sql('BEGIN;'+ ';'.join(statements)+';COMMIT;', 'mdm_dev')
    sys.exit(0)
if action == 'add-agent-to-alone':
    assert fixture['alone']=='fixture-alone'
    device='fixture-alone'
    registration,credential,epoch,operation,grant=[str(uuid.uuid4()) for _ in range(5)]
    e.sql(f"""BEGIN;
SET LOCAL rss.tenant_id = '{t}';
INSERT INTO mdm_access.agent_grants(tenant_id,id,operation_id,source,actor,instance,device,platform,secret_digest,request_digest,state,expires_at) VALUES('{t}','{grant}','{operation}','download','fixture','{fixture['instance']}','{device}','windows',repeat('0',64),repeat('0',64),'consumed',clock_timestamp()+interval '1 hour');
INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,agent_grant_id,state,purpose,epoch) VALUES('{t}','{registration}','{device}','agent',1,'{grant}','active','primary','{epoch}');
INSERT INTO mdm_access.credentials(tenant_id,id,registration,channel,locator,state) VALUES('{t}','{credential}','{registration}','agent',md5('{credential}')||md5('{registration}'),'active');
COMMIT;""",'mdm_dev')
    sys.exit(0)
channel=action
assert channel in {'mdm','agent'}
device=fixture[channel]
assert device==f'fixture-{channel}'
origin_column='request_id' if channel=='mdm' else 'agent_grant_id'
r,credential,epoch,request,grant=[str(uuid.uuid4()) for _ in range(5)]
new_origin = f"'{request}'" if channel=='mdm' else 'agent_grant_id'
prepare_request = f"""INSERT INTO mdm_access.grants(tenant_id,id,actor,instance,device,purpose,state,expires_at) SELECT g.tenant_id,'{grant}',g.actor,g.instance,g.device,g.purpose,g.state,clock_timestamp()+interval '2 minutes' FROM mdm_access.grants g JOIN mdm_access.requests q ON g.tenant_id=q.tenant_id AND g.id=q.grant_id JOIN old_registration r ON r.tenant_id=q.tenant_id AND r.request_id=q.id;
INSERT INTO mdm_access.requests(tenant_id,id,grant_id,source,windows_profile) SELECT q.tenant_id,'{request}','{grant}',q.source,q.windows_profile FROM mdm_access.requests q JOIN old_registration r ON r.tenant_id=q.tenant_id AND r.request_id=q.id;""" if channel=='mdm' else ''
e.sql(f"""BEGIN;
SET LOCAL rss.tenant_id = '{t}';
CREATE TEMP TABLE old_registration AS SELECT * FROM mdm_access.registrations WHERE tenant_id='{t}' AND device='{device}' AND channel='{channel}' AND purpose='primary' AND state='active';
{prepare_request}
UPDATE mdm_access.registrations SET state='superseded' WHERE id IN(SELECT id FROM old_registration);
INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,{origin_column},state,purpose,epoch) SELECT tenant_id,'{r}',device,channel,generation+1,{new_origin},'active',purpose,'{epoch}' FROM old_registration;
INSERT INTO mdm_access.credentials(tenant_id,id,registration,channel,locator,state) VALUES('{t}','{credential}','{r}','{channel}',md5('{credential}')||md5('{r}'),'active');
COMMIT;""",'mdm_dev')
