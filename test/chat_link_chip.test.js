import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'

// Exercise the registered listener with chip children and anchor ancestors.
globalThis.Element ??= class Element {}
globalThis.localStorage = { getItem: () => null, setItem() {} }
const listeners = []
globalThis.window = { addEventListener: (type, fn) => listeners.push([type, fn]), removeEventListener() {}, dispatchEvent() {} }
const opened = []
host.openWorkspace = key => { opened.push(key); return () => {} }
host.revealPane = id => opened.push(id)

const { default: plugin } = await import('../desktop/plugin.js')
const disposers = []
plugin.register(new Proxy({
  storage: { get: (k, d) => d, set() {} },
  onDispose: fn => disposers.push(fn),
}, { get: (t, k) => (k in t ? t[k] : () => () => {}) }))
after(() => disposers.forEach(fn => fn()))
const click = listeners.find(([type, fn]) => type === 'click' && fn.name === 'onChatLinkClick')[1]

const url = 'https://github.com/acme/app/pull/7'
const chip = { __reactFiber$k: { memoizedProps: {}, return: { memoizedProps: { pr: { url } }, return: null } } }
const sidebarRowLink = { getAttribute: () => '/sessions/42', closest: () => null }
const messageLink = { getAttribute: () => 'https://github.com/acme/app/issues/3', closest: sel => (sel === '[data-slot^="aui_"]' ? {} : null) }
const chromeLink = { getAttribute: () => 'https://github.com/acme/app/pull/9', closest: () => null }
const target = closest => Object.assign(Object.create(Element.prototype), { closest })

function clickOn(el) {
  const before = opened.length
  const ev = {
    target: el, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault() { this.defaultPrevented = true },
    stopImmediatePropagation() { this.stopped = true },
  }
  click(ev)
  return { prevented: ev.defaultPrevented, stopped: !!ev.stopped, paneOpened: opened.length > before }
}

const intercepted = { prevented: true, stopped: true, paneOpened: true }
const untouched = { prevented: false, stopped: false, paneOpened: false }

test('a PR chip inside a link still opens in the pane', () => {
  assert.deepEqual(clickOn(target(sel => (sel === 'button[data-pr-link]' ? chip : sel === 'a[href]' ? sidebarRowLink : null))), intercepted)
})

test('a PR chip with no link around it opens in the pane', () => {
  assert.deepEqual(clickOn(target(sel => (sel === 'button[data-pr-link]' ? chip : null))), intercepted)
})

test('message links open in the pane; app-chrome links stay with the host', () => {
  assert.deepEqual(clickOn(target(sel => (sel === 'a[href]' ? messageLink : null))), intercepted)
  assert.deepEqual(clickOn(target(sel => (sel === 'a[href]' ? chromeLink : null))), untouched)
})
