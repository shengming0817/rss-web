"""Prerequisites for the production console journey; no business result substitution."""
import base64
import json
import socket
import ssl
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def configure_webhooks(environment, config, providers):
    from candidate_fixture import TENANTS
    signing = bytes([7] * 32)
    class Receiver(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_POST(self):
            self.rfile.read(int(self.headers.get('content-length', '0')))
            # Non-2xx acceptance is ambiguous; the product retains its pending delivery.
            self.send_response(410)
            self.send_header('Content-Length', '0')
            self.end_headers()
    pinned = socket.gethostbyname(socket.gethostname())
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(str(environment.root / 'server.crt'), str(environment.root / 'server.key'))
    class ReceiverServer(ThreadingHTTPServer):
        daemon_threads = False
        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(5)
            try:
                return context.wrap_socket(connection, server_side=True, do_handshake_on_connect=False), address
            except Exception:
                connection.close()
                raise
    server = ReceiverServer((pinned, 0), Receiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    providers.callback(server.server_close)
    providers.callback(server.shutdown)
    port = server.server_port
    config['webhooks']['networks'] = [dict(tenant=TENANTS[0], reference='console', hostname='localhost', port=port, addresses=[f'{pinned}:{port}'], cidrs=[f'{pinned}/32'], ca_files=[str(environment.root / 'ca.crt')])]
    return dict(webhookOrigin=f'https://localhost:{port}', signing=base64.b64encode(signing).decode())


def prepare(operator, facts, environment):
    def call(method, path, body=None, operation=None):
        status, value = operator.call(method, path, body, operation)
        if status != 200:
            print(json.dumps(dict(phase='console-prepare', method=method, path=path, status=status, code=(value or {}).get('code', 'invalid'))), flush=True)
            raise RuntimeError('console-prepare-' + str(status) + '-' + str((value or {}).get('code', 'invalid')))
        return value
    directory = call('GET', '/api/v1/webhooks/materials')
    call('POST', '/api/v1/webhooks/materials', dict(reference='console', expectedRevision=0, configurationSha256=directory['configurationSha256'], endpoint=facts['webhookOrigin'] + '/confirm', networkReference='console', source=dict(kind='import', secret='whsec_' + facts.pop('signing'))), str(uuid.uuid4()))
    # Match the existing backend delivery fixture: receiver qualification is a legal
    # prerequisite, owned by installation.webhook T2, not this console journey.
    from candidate_fixture import TENANTS
    environment.sql(f"SET rss.tenant_id='{TENANTS[0]}'; UPDATE mdm_webhook.key_materials SET confirmed=true,attempted_at=1,confirmed_at=1 WHERE tenant_id='{TENANTS[0]}' AND reference='console' AND revision=1;", 'mdm_dev')
    call('POST', '/api/v1/webhooks/materials/transitions', dict(reference='console', expectedRevision=1, action=dict(kind='activate', materialRevision=1)), str(uuid.uuid4()))
