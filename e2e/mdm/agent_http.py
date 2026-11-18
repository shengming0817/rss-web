"""Read Agent fixture responses with redacted HTTP failure details."""
import json
import re


def read_json(response, expected_status, failure_stage):
    payload = response.read()
    if response.status == expected_status:
        return json.loads(payload)

    try:
        envelope = json.loads(payload)
    except ValueError:
        envelope = None
    code = envelope.get('code') if isinstance(envelope, dict) else None
    suffix = f'-{code}' if isinstance(code, str) and re.fullmatch(r'[a-z][a-z0-9_]{0,63}', code) else ''
    raise RuntimeError(f'{failure_stage}-{response.status}{suffix}')
