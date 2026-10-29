"""New React authentication against the real MDM/Identity HTTPS host, without device fixtures."""
import json
import os
from pathlib import Path
import signal
import ssl
import subprocess
import sys
import time
import urllib.request
import urllib.error

WEB = Path(sys.argv[1]).resolve()
BACKEND = Path.cwd()
sys.dont_write_bytecode = True
sys.path.insert(0, str(BACKEND / 'hack'))
from t2_environment import Environment, private
from candidate_fixture import TENANTS
from build_run import lease_fds

environment = Environment(BACKEND, group='react-auth-browser')
children = []
result = 'failed'
phase = 'environment'

def stop(signum=None, _frame=None):
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    if signum:
        raise InterruptedError()

for signum in (signal.SIGINT, signal.SIGTERM):
    signal.signal(signum, stop)

try:
    environment.reset()
    os.environ['MDM_WEB_ROOT'] = str(WEB / 'apps/mdm/dist')
    initialized = environment.initialize()
    log_path = private(environment.root / 'product.log', '')
    phase = 'host'
    with log_path.open('w') as log:
        for args in ([str(Path(os.environ['CARGO_TARGET_DIR']) / 'debug/rss-mdm'), 'serve', '--config', initialized['configuration']],
                     ['nginx', '-c', initialized['gateway'], '-g', 'daemon off;']):
            children.append(subprocess.Popen(args, cwd=BACKEND, stdout=log, stderr=log, pass_fds=lease_fds()))
        deadline = time.monotonic() + 120
        context = ssl.create_default_context(cafile=str(environment.root / 'ca.crt'))
        while True:
            if any(child.poll() is not None for child in children):
                raise RuntimeError('host-exit')
            try:
                with urllib.request.urlopen(initialized['origin'] + f'/api/v1/identity/tenants/{TENANTS[0]}/session', context=context, timeout=3):
                    pass
            except urllib.error.HTTPError as error:
                if error.code == 401:
                    break
            except (OSError, ssl.SSLError):
                pass
            if time.monotonic() >= deadline:
                raise TimeoutError('host-start')
            time.sleep(.2)
        fixture = private(environment.root / 'browser.json', dict(origin=initialized['origin'], tenant=TENANTS[0], login='admin', passwordFile=str(environment.root / 'account-password')))
        phase = 'browser'
        execution = subprocess.run(['node', str(WEB / 'e2e/mdm/react-auth-browser.mjs')], cwd=WEB,
            env={**os.environ, 'MDM_REACT_BROWSER_FIXTURE': str(fixture)}, timeout=180, pass_fds=lease_fds())
        if execution.returncode:
            raise RuntimeError('browser')
        result = 'passed'
except BaseException as error:
    print(json.dumps(dict(phase=phase, result='failed', classification=type(error).__name__)), flush=True)
finally:
    stop()
    for child in reversed(children):
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
            result = 'failed'
    # A fresh leased reset in the runner owns database and port cleanup even after interruption.
    print(json.dumps(dict(phase='react-auth-fixture', result=result)), flush=True)
    if result != 'passed':
        sys.exit(1)
