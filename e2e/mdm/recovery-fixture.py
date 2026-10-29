"""Disposable pre-existing recovery materials, never a disclosure/API result substitute.

The HTTPS journey verifies real decryption and current policy, identity and purpose authority.
It does not claim to test native binding provisioning or Windows/macOS execution.
Native envelope format is pinned to rss-mdm 160e3b7 native-protection and RSS
3de9b9e data-protection; Node's crypto provider creates only this private fixture input.
"""
import hashlib
import json
import os
import subprocess
import time
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
    from candidate_fixture import INSTANCE, TENANTS, ADMIN
    tenant = TENANTS[0]
    device = 'fixture-agent'
    def quote(value):
        return "'" + str(value).replace("'", "''") + "'"
    compact = lambda value: json.dumps(value, separators=(',', ':'))
    def call(method, path, value):
        status, result = operator.call(method, path, value)
        if status not in {200, 202}:
            raise RuntimeError('recovery-prerequisite-' + str(status))
        return result
    scope, policy, binding, material, ordinary = [str(uuid.uuid4()) for _ in range(5)]
    # Scope and policy qualification remain actual product writes and projections.
    call('POST', '/api/v1/scopes/' + scope, dict(operationId=str(uuid.uuid4()), expectedRevision=0,
         input=dict(action='put', definition=dict(targets=[dict(kind='device', id=device)], limitations=None, exclusions=[]))))
    mac = dict(authentication='secure_enclave', passwordProvider=None, login='local', unlock='local', filevault='local', offlineGraceSeconds=None, registrationGraceSeconds=None, maintenanceAccounts=[])
    call('POST', '/api/v1/policies/' + policy, dict(operationId=str(uuid.uuid4()), expectedRevision=0,
         input=dict(action='put', enabled=True, definition=dict(scope=scope, action=dict(kind='device_access',
             mac=mac, windows=dict(kind='rss_factor', accounts=['local']), selfEnrollment=True, role=None)))))
    deadline = time.monotonic() + 90
    while True:
        raw = environment.sql(f"SET rss.tenant_id='{tenant}'; SELECT mdm_commands.access_policy('{policy}','{device}',floor(extract(epoch FROM clock_timestamp()))::bigint);", 'mdm_dev').splitlines()[-1]
        selected = json.loads(raw)
        if selected.get('state') == 'eligible':
            break
        if time.monotonic() >= deadline:
            raise RuntimeError('recovery-policy-qualification-deadline')
        time.sleep(.3)
    registration = environment.sql(f"SET rss.tenant_id='{tenant}'; SELECT id FROM mdm_access.registrations WHERE tenant_id='{tenant}' AND device='{device}' AND state='active' AND purpose='primary' AND channel='agent';", 'mdm_dev').strip()
    uuid.UUID(registration)
    sid = 'S-1-5-21-100-200-300-1001'
    subject = dict(kind='rss_login', binding=binding, bindingGeneration=1, sid=sid)
    account = dict(platform='windows', sid=sid, authority=dict(kind='local'))
    receipt = dict(subject=subject, material=material, version=1)
    windows = dict(kind='rss_factor', factorGeneration=1, recovery=receipt)
    document = dict(operationId=str(uuid.uuid4()), accountDisposition='keep', id=binding, tenant=tenant,
        device=device, registration=registration, registrationGeneration=1, person=dict(instance=INSTANCE, principal=ADMIN),
        origin=dict(kind='self_enrollment'), generation=1, factorGeneration=1, revision=1, state='active',
        intent=dict(kind='existing', account=account), account=account, policy=policy, policyVersion=selected['version'],
        configuration=selected['configuration'], receivedRevision=1, appliedRevision=1,
        effect=dict(state='applied', account=account, role='standard', mac=None, windows=windows),
        appliedWindows=windows, createdByRss=False)
    statements = [f"SET LOCAL rss.tenant_id='{tenant}'",
        f"INSERT INTO mdm_access.device_access_bindings(tenant_id,id,device,registration,registration_generation,instance,principal,generation,revision,state,account,document) VALUES('{tenant}','{binding}','{device}','{registration}',1,'{INSTANCE}','{ADMIN}',1,1,'active',{quote(compact(account))}::jsonb,{quote(compact(document))}::jsonb)"]
    # Keep plaintext and key files private; no secret is passed in argv, stdout or SQL.
    # The SQL contains ciphertext only. Actual backend open authenticates all coordinates.
    for identity, kind in [(material, subject), (ordinary, dict(kind='local_administrator', sid=sid))]:
        coordinates = dict(tenant=tenant, material=identity, binding=dict(device=device, registration=registration, generation=1, subject=kind), version=1)
        source = private(environment.root / 'recovery-materials' / 'seal-input.json', dict(keyFile=facts['keyFile'], coordinates=coordinates, rssLogin=kind['kind']=='rss_login'))
        sealed = subprocess.run(['node', str(Path(__file__).with_name('recovery-seal.mjs')), str(source)],
            check=True, capture_output=True, text=True, timeout=20).stdout.strip()
        if len(sealed) > 16384 or not sealed or any(c not in '0123456789abcdef' for c in sealed):
            raise RuntimeError('recovery-fixture-envelope')
        source.unlink()
        statements += [f"INSERT INTO mdm_recovery.entries(tenant_id,id,device,registration,generation,subject,revision) VALUES('{tenant}','{identity}','{device}','{registration}',1,{quote(compact(kind))}::jsonb,1)",
            f"INSERT INTO mdm_recovery.versions(tenant_id,entry,version,operation,validity,key_id,sealed,created_at,pending) VALUES('{tenant}','{identity}',1,'{uuid.uuid4()}','unverified','recovery',decode('{sealed}','hex'),1,false)",
            f"UPDATE mdm_recovery.entries SET current_version=1 WHERE tenant_id='{tenant}' AND id='{identity}'"]
    environment.sql('BEGIN;' + ';'.join(statements) + ';COMMIT;', 'mdm_dev')
    mac_registration = environment.sql(f"SET rss.tenant_id='{tenant}'; SELECT id FROM mdm_access.registrations WHERE tenant_id='{tenant}' AND device='fixture-mac' AND state='active' AND purpose='primary' AND channel='mdm';", 'mdm_dev').strip()
    uuid.UUID(mac_registration)
    facts['macRegistration'] = mac_registration
    facts.pop('keyFile')
    facts.update(device=device, material=material, ordinary=ordinary, binding=binding, policy=policy, mac='fixture-mac')
