"""Change only the selected Observation evidence in the execution browser's isolated PostgreSQL."""
import json
from pathlib import Path
import sys
from uuid import UUID

sys.dont_write_bytecode = True
fixture = Path(sys.argv[1]).resolve()
root = fixture.parents[3]
if fixture.parent != root / 'artifacts/dev-environment/react-execution-access-browser':
    raise RuntimeError('unexpected report history fixture owner')
sys.path.insert(0, str(root / 'hack'))
from dev_environment import Environment

tenant = UUID(json.loads(fixture.read_text())['tenant'])
report = UUID(sys.argv[2])
where = f"tenant_id='{tenant}' AND batch_id='{report}'"
statements = {
    'unavailable': f"UPDATE rss_observation.batches SET decision='invalid' WHERE {where} AND raw IS NOT NULL",
    'expired': f"UPDATE rss_observation.batches SET raw=NULL,policy=NULL,decision=NULL WHERE {where} AND raw IS NOT NULL",
    'unconfirmed': f"""DELETE FROM rss_projection.receipts
        WHERE tenant_id='{tenant}' AND event_id IN
        (SELECT encode(fingerprint,'hex') FROM rss_observation.batches WHERE {where})""",
    'not_found': f"DELETE FROM rss_observation.batches WHERE {where} AND raw IS NULL",
}
environment = Environment(root, group='react-execution-access-browser')
result = environment.sql(
    f"WITH changed AS ({statements[sys.argv[3]]} RETURNING 1) SELECT count(*) FROM changed;",
    'mdm_dev',
)
if result != '1':
    raise RuntimeError('expected one changed report evidence row')
