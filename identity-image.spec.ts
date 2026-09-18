import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'

it('builds a clean archived Web revision and refuses dirty or caller-supplied revision inputs', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'identity-image-'))
  try {
    const script = readFileSync(resolve(import.meta.dirname, 'scripts/build-identity-image.sh'))
    writeFileSync(resolve(root, 'image.sh'), script)
    const git = (...args: string[]) =>
      execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
    git('init', '-q')
    git('add', 'image.sh')
    git(
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'fixture',
    )
    writeFileSync(resolve(root, '.git/info/exclude'), 'bin/\ncalled\n')
    mkdirSync(resolve(root, 'bin'))
    writeFileSync(
      resolve(root, 'bin/docker'),
      '#!/bin/sh\ncat >/dev/null\nprintf "%s\\n" "$@" > called\n',
      { mode: 0o755 },
    )
    const run = (...args: string[]) =>
      spawnSync('bash', ['image.sh', '--tag', 'web:fixture', ...args], {
        cwd: root,
        env: { ...process.env, PATH: resolve(root, 'bin') + ':' + process.env['PATH'] },
        encoding: 'utf8',
      })
    expect(run().status).toBe(0)
    const args = readFileSync(resolve(root, 'called'), 'utf8')
    expect(args).toContain('RSS_IDENTITY_WEB_REVISION=' + git('rev-parse', 'HEAD'))
    expect(args.endsWith('-\n')).toBe(true)
    rmSync(resolve(root, 'called'))
    expect(run('--build-arg', 'RSS_IDENTITY_WEB_REVISION=' + 'f'.repeat(40)).status).not.toBe(0)
    expect(existsSync(resolve(root, 'called'))).toBe(false)
    writeFileSync(resolve(root, 'image.sh'), Buffer.concat([script, Buffer.from('\n# dirty\n')]))
    expect(run().status).not.toBe(0)
    expect(existsSync(resolve(root, 'called'))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
