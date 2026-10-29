"""Publish one synthetic PE through real upload/inspection/save/publication owners.

The file is a format/HTTP fixture, never an installable RSS release.
ref: rss-mdm crates/content-service/tests/fixtures/installers.rs exe_machine.
"""
import hashlib
import http.client
import json
import struct
import time
import uuid
from urllib.parse import urlsplit


def publish(operator):
    body = bytearray(128 * 1024 + 3)
    body[:2] = b'MZ'
    struct.pack_into('<I', body, 0x3c, 0x80)
    body[0x80:0x84] = b'PE\0\0'
    for at, value in [(0x84, 0x8664), (0x86, 1), (0x94, 240), (0x96, 0x22), (0x98, 0x20b), (0x98 + 68, 3)]:
        struct.pack_into('<H', body, at, value)
    for at, value in [(16, 0x1000), (32, 4096), (36, 512), (56, 8192), (60, 512), (108, 16)]:
        struct.pack_into('<I', body, 0x98 + at, value)
    section = 0x98 + 240
    body[section:section + 5] = b'.text'
    for at, value in [(8, 1), (12, 4096), (16, 512), (20, 512), (36, 0x60000020)]:
        struct.pack_into('<I', body, section + at, value)
    body[512] = 0xc3
    body.extend(b'fixture-http-only')

    def call(method, path, data=None, expected=200):
        time.sleep(.2)
        status, value = operator.call(method, path, data)
        if status != expected:
            raise RuntimeError('synthetic installer ' + method + ' rejected')
        return value

    started = call('POST', '/api/v1/agent-packages/uploads', dict(operationId=str(uuid.uuid4()),
        filename='fixture-agent.exe', length=len(body), sha256=list(hashlib.sha256(body).digest())))
    href = started['href']
    if not href.startswith('/') or href.startswith('//') or urlsplit(href).netloc:
        raise RuntimeError('unexpected installer upload locator')
    endpoint = urlsplit(operator.origin)
    connection = http.client.HTTPSConnection(endpoint.hostname, endpoint.port, context=operator.context, timeout=20)
    try:
        time.sleep(.2)
        connection.request('PATCH', href + '?offset=0', bytes(body), headers={
            'Origin': operator.origin, 'X-Identity-Request': '1', 'X-CSRF-Token': operator.csrf,
            'Cookie': operator.cookie, 'Content-Type': 'application/octet-stream'})
        response = connection.getresponse()
        response.read()
        if response.status != 200:
            raise RuntimeError('synthetic installer content rejected')
    finally:
        connection.close()
    call('POST', href + '/complete', expected=201)
    inspected = call('GET', '/api/v1/agent-packages/uploads/' + started['packageId'])
    if inspected['inspection']['status'] != 'parsed':
        raise RuntimeError('synthetic installer inspection failed')
    call('POST', '/api/v1/agent-packages/save', dict(operationId=str(uuid.uuid4()), packageId=started['packageId'],
        version='3065-fixture', target=dict(platform='windows', architecture='x86_64')))
    return call('POST', '/api/v1/agent-packages', dict(operationId=str(uuid.uuid4()), packageId=started['packageId']))['releaseId']
