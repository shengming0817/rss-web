"""Disposable registered endpoints for the browser's post-enrollment navigation.

The host computes readiness from stored registration, protocol and PKI facts. These
fixtures do not exercise the Windows or macOS user interface or native protocol.
"""
import base64
import hashlib
import json
import re
import ssl
import subprocess
import uuid
import urllib.request

from candidate_fixture import ADMIN, INSTANCE, TENANTS
from fixture_tools import binary
from native_protocol_materials import leaf
from pki_fixtures import certificate_der
from runtime_fixture import installation_sql
from task_trust_materials import prepare, run


def windows_certificate(root, device, authority):
    directory = root / 'pki/windows'
    ca = authority['tls_root_file']
    token = subprocess.run([binary('step'), 'ca', 'token', device, '--ca-url', authority['origin'],
        '--root', ca, '--issuer', authority['provisioner'], '--kid', authority['kid'],
        '--key', directory/'windows-provisioner.pem'], check=True, capture_output=True, timeout=30).stdout.decode().strip()
    key, csr = root/'ready-windows.key', root/'ready-windows.csr'
    run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN='+device,
        '-keyout', key, '-out', csr)
    key.chmod(0o600)
    request = urllib.request.Request(authority['origin'] + '/1.0/sign',
        data=json.dumps(dict(ott=token, csr=csr.read_text())).encode(), headers={'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=ca)))
    with opener.open(request, timeout=20) as response:
        signed = json.load(response)
    return (ssl.PEM_cert_to_DER_cert(signed['crt']), ssl.PEM_cert_to_DER_cert(signed['ca']),
            run('req', '-in', csr, '-outform', 'DER'))


def apple_material(root, device, enrollment, attempt, origin):
    directory = root / 'ready-apple'
    directory.mkdir(mode=0o700)
    ca = prepare(directory)
    leaf(directory, 'apple', device, enrollment, attempt)
    identity = directory / ('native-' + device)
    issuer = certificate_der(ca/'ca.pem')
    encoded = base64.b64encode(issuer).decode()
    crl = base64.b64encode(run('crl', '-in', ca/'ca.crl', '-outform', 'DER')).decode()
    trust = dict(version=1, revision=1, service_id=INSTANCE, tenant=TENANTS[0], origin=origin, purpose='apple',
        issuers=[dict(digest=hashlib.sha256(issuer).hexdigest(), mode='active', certificate=encoded, root=encoded,
            crl=crl, root_crl=crl, provisioner='rss-apple', kid='native-fixture')])
    expiry = run('x509', '-in', ca/'ca.pem', '-noout', '-enddate').decode().strip().split('=', 1)[1]
    return certificate_der(identity/'client.pem'), trust, run('req','-in',identity/'client.csr','-outform','DER'), int(ssl.cert_time_to_seconds(expiry))


def ready_enrollments(environment, root, reader, windows_authority, origin):
    tenant = str(uuid.UUID(TENANTS[0]))
    reader = str(uuid.UUID(reader))
    result = {}
    for name, purpose, owner in (('windows', 'windows', ADMIN), ('apple', 'apple', ADMIN), ('restricted', 'windows', reader)):
        device, enrollment, attempt, grant, credential, epoch = [str(uuid.uuid4()) for _ in range(6)]
        statements = [installation_sql(), f"BEGIN; SET LOCAL rss.tenant_id='{tenant}'"]
        if purpose == 'windows':
            cert, issuing_ca, csr = windows_certificate(root, device, windows_authority)
            issuer = windows_authority['issuer']
        else:
            cert, trust, csr, issuer_expiry = apple_material(root, device, enrollment, attempt, origin)
            issuer = trust['issuers'][0]['digest']
            body = json.dumps(trust, separators=(',', ':')).encode().hex()
            chain = json.dumps(trust['issuers'][0], separators=(',', ':')).encode().hex()
            statements += [
                f"INSERT INTO mdm_pki.trust(tenant_id,purpose,revision,body) VALUES('{tenant}','apple',1,decode('{body}','hex'))",
                f"INSERT INTO mdm_pki.issuers(tenant_id,purpose,digest,revision,state,chain,provider,not_after) VALUES('{tenant}','apple','{issuer}',1,'active',decode('{chain}','hex'),'step_ca',{issuer_expiry})",
            ]
        pem = ssl.DER_cert_to_PEM_cert(cert).encode()
        metadata = subprocess.run(['openssl','x509','-noout','-enddate','-serial'],input=pem,
            check=True,capture_output=True,timeout=10).stdout.decode().splitlines()
        fields = dict(line.split('=', 1) for line in metadata)
        expires = int(ssl.cert_time_to_seconds(fields['notAfter']))
        serial = fields['serial'].lower()
        serial_number = int(serial, 16)
        der = f"decode('{cert.hex()}','hex')"
        profile = "'Device'" if purpose == 'windows' else 'NULL'
        statements += [
            f"INSERT INTO mdm_access.grants(tenant_id,id,actor,instance,device,purpose,state,expires_at) VALUES('{tenant}','{grant}','{owner}','{INSTANCE}','{device}','enrollment','consumed',clock_timestamp()+interval '2 minutes')",
            f"INSERT INTO mdm_access.requests(tenant_id,id,device,grant_id,source,windows_profile,state,expires_at,issuance_operation,password_digest,password_version,credential_ref,self_service) VALUES('{tenant}','{enrollment}','{device}','{grant}','mdm.{purpose}',{profile},'bound',now()+interval '1 hour','{attempt}',repeat('a',64),1,'{credential}',true)",
            f"INSERT INTO mdm_access.devices(tenant_id,id,channel,request_id,state,purpose,epoch,first_authenticated_at) VALUES('{tenant}','{device}','mdm','{enrollment}','active','primary','{epoch}',now())",
            f"INSERT INTO mdm_access.credentials(tenant_id,id,device,channel,locator,state,purpose) VALUES('{tenant}','{credential}','{device}','mdm',encode(sha256({der}),'hex'),'active','primary')",
            f"INSERT INTO mdm_access.report_sources(tenant_id,device,source,epoch,enabled) VALUES('{tenant}','{device}','mdm.{purpose}','{epoch}',true)",
            f"INSERT INTO mdm_pki.certificates(tenant_id,purpose,fingerprint,issuer,serial,device,not_after,certificate,verification_version,verification_trust) SELECT tenant_id,purpose,sha256({der}),'{issuer}','{serial_number}','{device}',{expires},{der},1,sha256(body) FROM mdm_pki.trust WHERE tenant_id='{tenant}' AND purpose='{purpose}'",
        ]
        if purpose == 'windows':
            # A persisted signing intent owns the issued certificate. The browser never replays its private materials.
            statements.append(f"INSERT INTO mdm_access.enrollment_intents(expected_epoch,tenant_id,request_id,signing_attempt,protocol_device,csr,profile,issuer,configuration,device,credential,epoch,secrets) VALUES(1,'{tenant}','{enrollment}','{attempt}','{device}',decode('{csr.hex()}','hex'),sha256({der}),decode('{issuing_ca.hex()}','hex'),encode(sha256('{enrollment}'::bytea),'hex'),'{device}','{credential}','{epoch}',sha256(gen_random_uuid()::text::bytea))")
            statements.append(f"INSERT INTO mdm_access.enrollment_certificates(tenant_id,request_id,certificate,server_nonce) VALUES('{tenant}','{enrollment}',{der},sha256(gen_random_uuid()::text::bytea))")
        else:
            public = run('x509', '-in', root/'ready-apple'/('native-'+device)/'client.pem','-noout','-pubkey')
            spki = subprocess.run(['openssl','pkey','-pubin','-outform','DER'],input=public,check=True,capture_output=True,timeout=10).stdout
            statements += [
                f"INSERT INTO mdm_apple.devices(tenant_id,device,udid,state,access_rights) VALUES('{tenant}','{device}','{device}','active',8191)",
                f"INSERT INTO mdm_apple.scep_attempts(expected_epoch,access_rights,tenant_id,id,enrollment,authorization_version,configuration,state,transaction_id,csr_digest,spki,issuer,serial,fingerprint,certificate,device,expires_at) VALUES(1,8191,'{tenant}','{attempt}','{enrollment}',1,sha256('{enrollment}'::bytea),'bound','{attempt}',sha256(decode('{csr.hex()}','hex')),sha256(decode('{spki.hex()}','hex')),decode('{issuer}','hex'),decode('{serial}','hex'),sha256({der}),{der},'{device}',now()+interval '1 hour')",
            ]
        try:
            environment.sql("\\set VERBOSITY verbose\n" + ';'.join([*statements,'COMMIT;']), 'mdm_dev')
        except subprocess.CalledProcessError as error:
            # PostgreSQL DETAIL may include certificate or row bytes. Only emit identifiers.
            detail = error.stderr or ''
            print(json.dumps(dict(phase='registered-endpoint', purpose=purpose,
                code=re.findall(r'ERROR:\s+([A-Z0-9]{5}):',detail),
                fields=re.findall(r'(?m)^(?:TABLE|COLUMN|CONSTRAINT) NAME:\s*([a-z_][a-z0-9_]*)',detail),
                category=next((key for key in ('storage lineage','storage target','execution epoch','foreign key','check constraint','null value','invalid input','permission denied','syntax error','ambiguous') if key in detail),None))),flush=True)
            raise
        result[name] = dict(enrollment=enrollment, device=device)
    return result
