"""One private disposable registration lifecycle input; no API result substitution."""
import json
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
channel=sys.argv[2]
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
