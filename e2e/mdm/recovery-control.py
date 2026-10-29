"""Expire only the current disposable principal's already-issued disclosure proof.

The browser still posts to the real endpoint. No result, permission or proof is forged.
"""
import json
from pathlib import Path
import sys
import uuid
sys.path.insert(0, str(Path.cwd() / 'hack'))
from t2_environment import Environment
from candidate_fixture import TENANTS, ADMIN
fixture = json.loads(Path(sys.argv[1]).read_text())
assert fixture['tenant'] == TENANTS[0] and fixture['principal'] == ADMIN
assert sys.argv[2] == 'expire-disclosure-proof'
tenant, principal = [str(uuid.UUID(fixture[key])) for key in ['tenant', 'principal']]
e = Environment(Path.cwd(), group='react-recovery-browser')
# Keep authenticated_at < expires_at and the original <=300s budget valid.
# Expire exactly the actual issued purpose; untouched passkeys cannot authorize disclosure.
e.sql(f"SET rss.tenant_id='{tenant}'; UPDATE identity_authority.step_up_grants SET authenticated_at=floor(extract(epoch FROM clock_timestamp()))::bigint-10,expires_at=floor(extract(epoch FROM clock_timestamp()))::bigint-1 WHERE tenant_id='{tenant}' AND principal_id='{principal}' AND context->>'purpose'='mdm.device_access.disclose';", 'mdm_dev')
