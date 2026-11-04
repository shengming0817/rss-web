"""Legal existing registrar/configuration facts, matching credential_owners/registration.rs.

Business writes, operation receipts and effects are never seeded. Registration protocol
and actual platform deployment are outside this browser journey's evidence.
"""
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import subprocess
import time
import uuid
from contextlib import redirect_stdout


def configure(environment, config, private):
    root = environment.root / 'execution-access'
    root.mkdir(mode=0o700)
    pem = subprocess.run(['openssl', 'genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256'], capture_output=True, check=True, timeout=15).stdout
    key = private(root / 'psso-key.pem', pem.decode())
    config['device_access']['platform_sso'] = dict(configuration=dict(teamId='ABCDEFGHIJ', extensionId='com.example.da.extension', applicationId='com.example.da', applicationVersion='1.0', clientId=str(uuid.uuid4())), active_key='browser', signing_keys={'browser': str(key)})
    return dict(root=str(root), device='fixture-da', policy=str(uuid.uuid4()), version=str(uuid.uuid4()))


def seed(environment, state, tenant, instance, actor):
    from task_trust_materials import prepare, leaf
    root = Path(state['root'])
    prepare(root)
    # The existing purpose-bound certificate generator performs real X.509 signing.
    with redirect_stdout(io.StringIO()) as output:
        leaf(root, tenant, state['device'], 'da_device', instance)
    paths = json.loads(output.getvalue())
    def openssl(*args):
        return subprocess.run(['openssl', *map(str, args)], capture_output=True, check=True, timeout=15).stdout
    certificate = openssl('x509', '-in', paths['leaf'], '-outform', 'DER')
    issuer = openssl('x509', '-in', paths['root'], '-outform', 'DER')
    public = openssl('x509', '-in', paths['leaf'], '-pubkey', '-noout')
    public_file = root / 'leaf-public.pem'
    public_file.write_bytes(public)
    spki = openssl('pkey', '-pubin', '-in', public_file, '-outform', 'DER')
    csr = openssl('req', '-in', Path(paths['leaf']).with_name('leaf.csr'), '-outform', 'DER')
    facts = dict(line.split('=', 1) for line in openssl('x509', '-in', paths['leaf'], '-noout', '-dates', '-serial').decode().splitlines())
    dates = [int(datetime.strptime(facts[key], '%b %d %H:%M:%S %Y %Z').replace(tzinfo=timezone.utc).timestamp()) for key in ('notBefore', 'notAfter')]
    fingerprint = hashlib.sha256(certificate).hexdigest()
    public_digest = hashlib.sha256(spki).hexdigest()
    registration, grant, credential, issuance, operation = [str(uuid.uuid4()) for _ in range(5)]
    metadata = dict(purpose='da_device', service_id=instance, tenant=tenant, profile='rss.da.device.v1', identity=paths['identity'], issuer=list(hashlib.sha256(issuer).digest()), fingerprint=list(bytes.fromhex(fingerprint)), spki=list(bytes.fromhex(public_digest)), serial=list(bytes.fromhex(facts['serial'])), not_before=dates[0], not_after=dates[1], provisioner='rss-da-device')
    receipt = dict(serviceId=instance, tenant=tenant, device=state['device'], registration=registration, generation=7, credential=credential, issuanceId=issuance, operationId=operation)
    configuration = dict(enabled=True, selfEnrollment=True, role=None, windows=dict(kind='rss_factor', accounts=['local']), mac=dict(authentication='secure_enclave', passwordProvider=None, login='local', unlock='local', filevault='local', offlineGraceSeconds=None, registrationGraceSeconds=None, maintenanceAccounts=[]))
    publication = dict(id=state['policy'], revision=1, version=state['version'], target=dict(kind='tenant_default'), enabled=True, managedFields=[], configuration=configuration)
    frozen = dict(kind='device_access', configuration=configuration, publication=publication)
    frozen_bytes = json.dumps(frozen, separators=(',', ':'), sort_keys=True).encode()
    def q(value):
        return "'" + str(value).replace("'", "''") + "'"
    def doc(value):
        return q(json.dumps(value, separators=(',', ':'))) + '::jsonb'
    t = q(tenant)
    sql = ["BEGIN", f"SELECT set_config('rss.tenant_id',{t},true)",
           f"INSERT INTO rss_da.devices(tenant_id,id) VALUES({t},{q(state['device'])})",
           f"INSERT INTO rss_da.certificate_grants(certificate_purpose,tenant_id,id,operation_id,source,actor,instance,device,secret_digest,request_digest,state,expires_at) VALUES('da_device',{t},{q(grant)},{q(grant)},'administrator',{q(actor)},{q(instance)},{q(state['device'])},repeat('0',64),repeat('1',64),'consumed',clock_timestamp()+interval '1 hour')",
           f"INSERT INTO rss_da.registrations(tenant_id,id,device,channel,generation,certificate_grant_id,state,purpose,epoch) VALUES({t},{q(registration)},{q(state['device'])},NULL,7,{q(grant)},'active','da_device',{q(uuid.uuid4())})",
           f"INSERT INTO rss_da.credentials(tenant_id,id,registration,channel,locator,state) VALUES({t},{q(credential)},{q(registration)},NULL,{q(fingerprint)},'active')",
           f"INSERT INTO rss_da.certificate_issuances(tenant_id,id,grant_id,operation_id,request_digest,authority_digest,csr,spki,identity,profile,not_before,not_after,state,certificate_chain,metadata,fingerprint,activation_operation,activation_digest,activation_result,credential) VALUES({t},{q(issuance)},{q(grant)},{q(operation)},repeat('1',64),{q(hashlib.sha256(issuer).hexdigest())},decode({q(csr.hex())},'hex'),{q(public_digest)},{q(paths['identity'])},'{{}}',{dates[0]},{dates[1]},'issued',{doc([base64.b64encode(certificate).decode()])},{doc(metadata)},{q(fingerprint)},{q(operation)},repeat('3',64),{doc(dict(kind='da_device',receipt=receipt))},{q(credential)})",
           f"INSERT INTO rss_da.policies(tenant_id,id,revision,current_version,version_number,state,definition,author,updated_at) VALUES({t},{q(state['policy'])},1,{q(state['version'])},1,'enabled',{doc(publication)},{doc(dict(principal=actor,instance=instance))},{int(time.time())})",
           f"INSERT INTO rss_da.policy_versions(tenant_id,id,policy,number,action_kind,frozen,fingerprint) VALUES({t},{q(state['version'])},{q(state['policy'])},1,'device_access',{doc(frozen)},decode({q(hashlib.sha256(frozen_bytes).hexdigest())},'hex'))", 'COMMIT']
    # This is the existing operator fixture role. No tested write/receipt/effect is substituted.
    environment.sql(';'.join(sql)+';', 'mdm_dev')
    state['registration'] = registration
