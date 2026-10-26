import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')

test('unsupported platform uses the shared neutral state before retryable errors', () => {
  const renderer = source.slice(source.indexOf('function GhErrorState('), source.indexOf('function ListEmptyState('))
  assert.match(renderer, /if \(c.kind === 'session' \|\| c.kind === 'unsupported'\) return jsx\(EmptyState, \{ title: c.title, description: c.detail \}\)/)
  assert.ok(renderer.indexOf("c.kind === 'unsupported'") < renderer.indexOf('return jsx(ErrorState'))
})

test('all shell execution is routed through the guarded shared boundary', () => {
  const calls = source.split('\n').filter(line => /host\.request\(['"]shell\.exec['"],/.test(line))
  assert.deepEqual(calls.map(line => line.trim()), ["return await host.request('shell.exec', { command, session_id })"])
})

host.state.activeSessionId = { get: () => 'chat-1' }
const calls = []
host.request = async (method, params) => { calls.push({ method, ...params }); return { code: 0, stdout: 'ok' } }

test('Windows fails closed without executing a probe or encoded command', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: 'Win32' } })
  const { sh, classifyGhError } = await import('../desktop/plugin.js?windows')
  await assert.rejects(sh('gh api user'), error => {
    assert.deepEqual(classifyGhError(error), {
      kind: 'unsupported',
      title: 'GitHermes is unavailable on Windows',
      detail: 'Windows support is suspended until safe shell execution is available. Use GitHermes on Linux or macOS.',
    })
    return true
  })
  assert.equal(calls.length, 0)
})

test('POSIX passes the exact command and session to the dangerous-command boundary', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: 'Linux x86_64' } })
  const { sh } = await import('../desktop/plugin.js?posix')
  const command = "PATH=/usr/local/bin:$PATH gh pr merge 7 --squash --repo 'acme/app'"
  assert.equal(await sh(command), 'ok')
  assert.deepEqual(calls, [{ method: 'shell.exec', command, session_id: 'chat-1' }])
  host.request = async () => { throw new Error('dangerous_command') }
  await assert.rejects(sh(command), /dangerous_command/)
})
