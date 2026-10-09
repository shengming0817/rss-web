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
assert fixture['agent']=='fixture-agent'
r,credential,epoch=[str(uuid.uuid4()) for _ in range(3)]
e.sql(f"""BEGIN;
CREATE TEMP TABLE old_registration AS SELECT * FROM mdm_access.registrations WHERE tenant_id='{t}' AND device='fixture-agent' AND channel='agent' AND purpose='primary' AND state='active';
UPDATE mdm_access.registrations SET state='superseded' WHERE id IN(SELECT id FROM old_registration);
INSERT INTO mdm_access.registrations(tenant_id,id,device,channel,generation,agent_grant_id,state,purpose,epoch) SELECT tenant_id,'{r}',device,channel,generation+1,agent_grant_id,'active',purpose,'{epoch}' FROM old_registration;
INSERT INTO mdm_access.credentials(tenant_id,id,registration,channel,locator,state) VALUES('{t}','{credential}','{r}','agent',md5('{credential}')||md5('{r}'),'active');
COMMIT;""",'mdm_dev')
