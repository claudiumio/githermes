import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'
import plugin from '../desktop/plugin.js'

globalThis.window ??= { addEventListener() {}, removeEventListener() {} }
const store = new Map()
const opened = []
let onClose
host.openWorkspace = (key, opts) => {
  opened.push(key)
  onClose = opts.onClose
  return () => opts.onClose?.()
}
host.paneVisibility = () => ({ get: () => false })
host.undismissPane = () => {}
host.revealPane = () => {}

function load(storage = store) {
  const disposers = []
  const contributions = []
  plugin.register(new Proxy({
    register: item => contributions.push(item),
    onDispose: fn => disposers.push(fn),
    storage: { get: (key, fallback) => storage.has(key) ? storage.get(key) : fallback, set: (key, value) => storage.set(key, value) },
  }, { get: (t, k) => (k in t ? t[k] : () => () => {}) }))
  return {
    unload: () => disposers.forEach(fn => fn()),
    open: () => contributions.find(c => c.id === 'palette').data.run(),
  }
}

test('fresh install does not open; explicit open persists through unload and reload', () => {
  store.clear()
  opened.length = 0
  let app = load()
  assert.equal(opened.length, 0)
  app.open()
  assert.equal(store.get('paneOpen'), true)
  app.unload()
  assert.equal(store.get('paneOpen'), true, 'unload is not a user close')
  app = load()
  assert.equal(opened.length, 2, 'the second load restores the open pane')
  app.unload()
})

test('user close is persisted and prevents restoration', () => {
  store.set('paneOpen', true)
  const app = load()
  onClose()
  assert.equal(store.get('paneOpen'), false)
  app.unload()
  opened.length = 0
  const next = load()
  assert.equal(opened.length, 0)
  next.unload()
})

test('plugin storage namespaces do not share the open flag', () => {
  const otherProfile = new Map()
  store.set('paneOpen', true)
  opened.length = 0
  const app = load(otherProfile)
  assert.equal(opened.length, 0)
  app.unload()
  assert.equal(store.get('paneOpen'), true)
})
