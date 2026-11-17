import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'

host.state.activeSessionId = { get: () => 'chat-1' }
const calls = []
host.request = async (method, params) => { calls.push({ method, ...params }); return { code: 0, stdout: 'ok' } }

test('Windows fails closed without executing a probe or encoded command', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: 'Win32' } })
  const { sh } = await import('../desktop/plugin.js?windows')
  await assert.rejects(sh('gh api user'), /Windows.*unavailable.*argv/i)
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
