import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'

const listeners = []
globalThis.window = { addEventListener: (type, fn) => listeners.push([type, fn]), removeEventListener() {}, dispatchEvent() {} }
const opened = []
host.openWorkspace = key => { opened.push(key); return () => {} }
const { default: plugin } = await import('../desktop/plugin.js')

test('registration leaves host chat links and PR chips untouched', () => {
  const contributions = []
  const disposers = []
  plugin.register(new Proxy({
    register: item => contributions.push(item),
    storage: { get: (k, d) => d, set() {} },
    onDispose: fn => disposers.push(fn),
  }, { get: (t, k) => (k in t ? t[k] : () => () => {}) }))
  try {
    const event = { preventDefault() { assert.fail('host click prevented') }, stopImmediatePropagation() { assert.fail('host click stopped') } }
    for (const [type, fn] of listeners) if (type === 'click') fn(event)
    assert.equal(listeners.filter(([type]) => type === 'click').length, 0)
    assert.equal(opened.length, 0)
    assert.equal(contributions.some(c => c.id === 'palette-chat-links'), false)
  } finally { disposers.forEach(fn => fn()) }
})
