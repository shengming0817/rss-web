"""Fresh leased cleanup, independent of the cancelled fixture process group."""
import hashlib
import os
from pathlib import Path
import sys

backend = Path.cwd()
web = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(backend / 'hack'))
from t2_environment import Environment

# Only this browser journey's CA owner; never reset other concurrent T2 cases.
case = hashlib.sha256((str(web) + ':device-browser:agent').encode()).hexdigest()[:20]
Environment(backend, group='t2-pki-' + case).reset()
Environment(backend, group='device-agent').host_ports(release=True)
# Remove certificate inputs only after the CA has stopped using them.
group = {'console-browser.mjs': 'console-browser', 'react-devices-browser.mjs': 'react-devices-browser', 'react-assets-browser.mjs': 'react-assets-browser'}.get(os.environ.get('MDM_DEVICE_BROWSER_MODULE'), 'device-browser')
Environment(backend, group=group).reset()
