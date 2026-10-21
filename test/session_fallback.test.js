import test from 'node:test'
import assert from 'node:assert/strict'
import { host, queryClient } from '@hermes/plugin-sdk'
import plugin, { classifyGhError, currentSessionId, NO_SESSION, rememberSessionId, sh } from '../desktop/plugin.js'

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

test('a fallback chat failing for another reason surfaces the error and keeps the chat', async t => {
  setLive('chat-5')
  currentSessionId()
  setLive(null)
  const error = new Error('host timeout')
  t.mock.method(host, 'request', async () => { throw error })
  await assert.rejects(sh('gh api user'), err => err === error)
  assert.equal(currentSessionId(), 'chat-5', 'a transient failure does not drop the chat')
})

for (const reason of ['not_found', 'session_superseded']) {
  test(`a fallback chat answering ${reason} is dropped for the neutral state`, async t => {
    setLive('chat-gone')
    currentSessionId()
    setLive(null)
    t.mock.method(host, 'request', async () => { throw new Error(reason) })
    await assert.rejects(sh('gh api user'), err => err.message === NO_SESSION)
    assert.equal(currentSessionId(), null, `${reason} drops the remembered chat`)
  })
}

test('a chat going live refetches the views that errored while waiting', async t => {
  globalThis.window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }
  setLive('chat-6')
  currentSessionId()
  setLive(null)
  t.mock.method(host, 'request', async () => { throw new Error('invalid_params') })
  await assert.rejects(sh('gh api user'), err => err.message === NO_SESSION)

  let goLive
  let unsubscribed = false
  host.state.focusedSessionId = {
    get: () => null,
    subscribe: fn => { goLive = fn; return () => { unsubscribed = true } },
  }
  const calls = []
  t.mock.method(queryClient, 'invalidateQueries', arg => { calls.push(arg); return Promise.resolve() })
  const disposers = []
  const ctx = new Proxy({
    storage: { get: (k, d) => d, set() {} },
    onDispose: fn => disposers.push(fn),
  }, { get: (t, k) => (k in t ? t[k] : () => () => {}) })
  t.after(() => {
    disposers.forEach(fn => fn())
    setLive(null)
    assert.equal(unsubscribed, true, 'plugin disposal removes the subscription')
  })
  plugin.register(ctx)
  goLive(null)
  assert.equal(calls.length, 0, 'a draft does not trigger invalidation')
  goLive('chat-7')
  assert.equal(calls.length, 1, 'first live chat triggers one invalidation')
  assert.deepEqual(calls[0].queryKey, ['githermes'])
  assert.equal(calls[0].predicate({ state: { status: 'error' } }), true)
  assert.equal(calls[0].predicate({ state: { status: 'success' } }), false)
  goLive('chat-8')
  assert.equal(calls.length, 1, 'another live chat does not invalidate again')
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
