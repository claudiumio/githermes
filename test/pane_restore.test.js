import test from 'node:test'
import assert from 'node:assert/strict'

// Behavioural check for load-time pane restore: register() must reopen the
// GitHub pane only when the user left it open, and plugin unload must not be
// mistaken for the user closing it.

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }

const { host } = await import('@hermes/plugin-sdk')
const opened = []
let closedByHost = 0
host.openWorkspace = (key, opts) => {
  opened.push(key)
  return () => { closedByHost += 1; opts.onClose?.() }
}
host.paneVisibility = () => ({ get: () => false, listen: () => () => {}, subscribe: () => () => {} })
host.undismissPane = () => {}
host.revealPane = () => {}

const { default: plugin } = await import('../desktop/plugin.js')

function load() {
  const disposers = []
  const ctx = new Proxy({
    register: () => () => {},
    onDispose: fn => disposers.push(fn),
    rest: async () => ({}),
    os: { openExternal() {} },
    storage: { get: () => undefined, set() {} },
  }, { get: (t, k) => (k in t ? t[k] : () => () => {}) })
  plugin.register(ctx)
  return () => disposers.forEach(fn => fn())
}

function withLoad(fn) {
  opened.length = 0
  const unload = load()
  try { fn(unload) } finally { unload() }
}

test('fresh install: loading the plugin does not force the pane open', () => {
  store.clear()
  withLoad(() => assert.equal(opened.length, 0))
})

test('pane left open survives a reload; unload is not a user close', () => {
  store.set('githermes.paneOpen.v1', '1')
  withLoad(() => assert.equal(opened.length, 1, 'restores the pane the user left open'))
  // the plugin refresh / app quit above tore the tile down…
  assert.equal(store.get('githermes.paneOpen.v1'), '1', '…without forgetting it was open')
  withLoad(() => assert.equal(opened.length, 1))
})

test('pane the user closed stays closed across a reload', () => {
  store.set('githermes.paneOpen.v1', '0')
  withLoad(() => assert.equal(opened.length, 0))
})
