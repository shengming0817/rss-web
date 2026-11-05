"""Fresh leased cleanup; stop every enrollment CA before removing its secret inputs."""
import hashlib
import os
from pathlib import Path
import sys

backend = Path.cwd()
web = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(backend / 'hack'))
from t2_environment import Environment

failed = False
for purpose in ('windows', 'agent', 'next:agent'):
    case = hashlib.sha256((str(web) + ':enrollment-browser:' + purpose).encode()).hexdigest()[:20]
    try:
        Environment(backend, group='t2-pki-' + case).reset()
    except Exception:
        failed = True
if failed:
    raise RuntimeError('enrollment PKI cleanup unconfirmed; keep host inputs for recovery')
Environment(backend, group='enrollment-native').host_ports(release=True)
group = {'react-enrollment-browser.mjs': 'react-enrollment-browser', 'react-certificates-browser.mjs': 'react-certificates-browser'}.get(os.environ.get('MDM_ENROLLMENT_BROWSER_MODULE'), 'react-enrollment-browser')
Environment(backend, group=group).reset()
