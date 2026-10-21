import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'
import { classifyGhError, currentSessionId, NO_SESSION, rememberSessionId, sh } from '../desktop/plugin.js'

const atom = value => ({ get: () => value })

function setLive(id) {
  host.state.focusedSessionId = atom(id)
  host.state.activeSessionId = atom(id)
}

test('a fresh draft reuses the last live chat, and forgets it once Hermes rejects it', async () => {
  const seen = []
  host.request = async (method, params) => {
    seen.push(params.session_id)
    if (params.session_id === 'gone') throw new Error('invalid_params')
    return { code: 0, stdout: 'ok' }
  }

  setLive('chat-1')
  assert.equal(currentSessionId(), 'chat-1')

  setLive(null)
  assert.equal(currentSessionId(), 'chat-1', 'draft falls back to the last live chat')
  assert.equal(await sh('gh api user'), 'ok')
  assert.equal(seen.at(-1), 'chat-1')

  setLive('gone')
  setLive(null)
  rememberSessionId('gone')
  await assert.rejects(sh('gh api user'), err => err.message === NO_SESSION)
  assert.equal(currentSessionId(), null, 'a rejected fallback is dropped')
  await assert.rejects(sh('gh api user'), err => err.message === NO_SESSION)
  assert.equal(seen.filter(id => id === 'gone').length, 1, 'no repeated calls against a dead chat')
})

test('a live chat failure surfaces as the real error, not as a missing chat', async () => {
  host.request = async () => { throw new Error('dangerous_command') }
  setLive('chat-2')
  await assert.rejects(sh('gh api user'), /dangerous_command/)
})

test('rememberSessionId reports only the first chat after none', () => {
  setLive('chat-3')
  currentSessionId()
  assert.equal(rememberSessionId('chat-4'), false)
  assert.equal(rememberSessionId(null), false)
})

test('waiting for a chat is classified as its own neutral state', () => {
  const c = classifyGhError(new Error(NO_SESSION))
  assert.equal(c.kind, 'session')
  assert.equal(c.title, 'Start a chat to load GitHub')
  assert.ok(!/hermes|shell|session_id|failed|error/i.test(`${c.title} ${c.detail}`), 'copy must not blame Hermes or leak internals')
  assert.equal(c.command, undefined)
})
