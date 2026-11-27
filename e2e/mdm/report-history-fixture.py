"""Change only the selected Observation evidence in the execution browser's isolated PostgreSQL."""
import json
from pathlib import Path
import re
import subprocess
import sys
from uuid import UUID

sys.dont_write_bytecode = True
fixture = Path(sys.argv[1]).resolve()
root = fixture.parents[3]
if fixture.parent != root / 'artifacts/dev-environment/react-execution-access-browser':
    raise RuntimeError('unexpected report history fixture owner')
if fixture.stat().st_mode & 0o077:
    raise RuntimeError('report history fixture must be private')
owner = json.loads(fixture.read_text())
container = owner['reportHistoryContainer']
if not re.fullmatch(r'[a-f0-9]{12,64}', container):
    raise RuntimeError('missing isolated report history container')
tenant = UUID(owner['tenant'])
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
result = subprocess.run(
    ['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
     '-U', 'postgres', '-d', 'mdm_dev'],
    input=f"WITH changed AS ({statements[sys.argv[3]]} RETURNING 1) SELECT count(*) FROM changed;",
    capture_output=True, text=True, timeout=60,
)
if result.returncode:
    raise RuntimeError('isolated report history SQL failed')
if result.stdout.strip() != '1':
    raise RuntimeError('expected one changed report evidence row')
