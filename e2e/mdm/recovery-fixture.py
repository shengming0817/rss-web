"""Disposable pre-existing recovery materials, never a disclosure/API result substitute.

The HTTPS journey verifies ordinary decryption, current disclosure permission and FileVault.
DA-purpose material proof remains with the explicit HTTP mock until #3138 is resolved.
It does not claim to test native binding provisioning or Windows/macOS execution.
Coordinates include the current MDM storage profile and original device identity;
Node crypto creates only this private fixture input, never a disclosure result.
"""
import hashlib
import json
import os
import subprocess
import uuid
from pathlib import Path


def configure(environment, config, private):
    root = environment.root / 'recovery-materials'
    root.mkdir(mode=0o700)
    key = private(root / 'escrow-key', '')
    key.write_bytes(os.urandom(32))
    recipient_key = private(root / 'recipient.key', '')
    certificate = root / 'recipient.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                    '-subj', '/CN=Disposable recovery recipient', '-days', '2',
                    '-keyout', str(recipient_key), '-out', str(certificate)],
                   check=True, capture_output=True, timeout=30)
    der = subprocess.check_output(['openssl', 'x509', '-in', str(certificate), '-outform', 'DER'], timeout=30)
    recipient = hashlib.sha256(der).hexdigest()
    config['recovery_credentials'] = dict(active_key='recovery', key_files={'recovery': str(key)},
        active_recipient=recipient, recipients=[dict(certificate_file=str(certificate), private_key_file=str(recipient_key))])
    return dict(recipient=recipient, keyFile=str(key))


def prepare(operator, facts, environment, private):
    from candidate_fixture import TENANTS
    tenant = TENANTS[0]
    device = 'fixture-agent'
    def quote(value):
        return "'" + str(value).replace("'", "''") + "'"
    compact = lambda value: json.dumps(value, separators=(',', ':'))
    ordinary = str(uuid.uuid4())
    statements = [f"SET LOCAL rss.tenant_id='{tenant}'"]
    # Keep plaintext and key files private; no secret is passed in argv, stdout or SQL.
    # The SQL contains ciphertext only. Actual backend open authenticates all coordinates.
    for identity, kind in [(ordinary, dict(kind='local_administrator', sid='S-1-5-21-100-200-300-1001'))]:
        coordinates = dict(profile='mdm', tenant=tenant, material=identity, binding=dict(device=device, subject=kind), version=1)
        source = private(environment.root / 'recovery-materials' / 'seal-input.json', dict(keyFile=facts['keyFile'], coordinates=coordinates))
        sealed = subprocess.run(['node', str(Path(__file__).with_name('recovery-seal.mjs')), str(source)],
            check=True, capture_output=True, text=True, timeout=20).stdout.strip()
        if len(sealed) > 16384 or not sealed or any(c not in '0123456789abcdef' for c in sealed):
            raise RuntimeError('recovery-fixture-envelope')
        source.unlink()
        statements += [f"INSERT INTO mdm_recovery.entries(tenant_id,id,device,subject,revision) VALUES('{tenant}','{identity}','{device}',{quote(compact(kind))}::jsonb,1)",
            f"INSERT INTO mdm_recovery.versions(tenant_id,entry,version,operation,validity,key_id,sealed,created_at,pending) VALUES('{tenant}','{identity}',1,'{uuid.uuid4()}','unverified','recovery',decode('{sealed}','hex'),1,false)",
            f"UPDATE mdm_recovery.entries SET current_version=1 WHERE tenant_id='{tenant}' AND id='{identity}'"]
    environment.sql('BEGIN;' + ';'.join(statements) + ';COMMIT;', 'mdm_dev')
    facts.pop('keyFile')
    facts.update(device=device, ordinary=ordinary, mac='fixture-mac')
