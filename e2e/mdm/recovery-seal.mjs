// Private fixture input only, matching the pinned backend native-protection envelope.
import { readFileSync, statSync } from 'node:fs'
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
const source = process.argv[2]
assert.equal(statSync(source).mode & 0o077, 0)
const { keyFile, coordinates } = JSON.parse(readFileSync(source, 'utf8'))
assert.equal(statSync(keyFile).mode & 0o077, 0)
const key = readFileSync(keyFile),
  salt = Buffer.from('rss-mdm/native-protection/v1'),
  derive = (label) => Buffer.from(hkdfSync('sha256', key, salt, label, 32)),
  encryption = derive('aes256-gcm'),
  identity = derive('key-identity'),
  nonce = randomBytes(12),
  plain = Buffer.from('Fixture-local-admin-secret-7!'),
  version = Buffer.alloc(4)
version.writeUInt32BE(1)
const dimensions = [
  Buffer.from(coordinates.tenant),
  Buffer.from(JSON.stringify(coordinates)),
  Buffer.from('recovery-credential/material'),
  version,
]
const aad = Buffer.concat([
  Buffer.from('rss-field-protection-aad-v2'),
  ...dimensions.flatMap((dimension) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(dimension.length)
    return [length, dimension]
  }),
])
try {
  const cipher = createCipheriv('aes-256-gcm', encryption, nonce)
  cipher.setAAD(aad)
  const sealed = Buffer.concat([
    Buffer.from([77, 68, 77, 78, 80, 2, 1, 1]),
    identity,
    nonce,
    cipher.update(plain),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  process.stdout.write(sealed.toString('hex'))
  sealed.fill(0)
} finally {
  key.fill(0)
  encryption.fill(0)
  plain.fill(0)
}
