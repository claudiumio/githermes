import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'
import plugin, { getGitHubShellStore } from '../desktop/plugin.js'
const store = getGitHubShellStore()
const selection = [store.repo, store.tab, store.selPr, store.selIssue]
const snapshot = () => selection.map(atom => atom.get())

const messages = []
host.notify = message => messages.push(message)
delete host.openWorkspace
host.state.activeSessionId = { get: () => 'test-session' }
const contributions = []
const disposers = []
plugin.register(new Proxy({
  register: item => contributions.push(item),
  storage: { get: (k, d) => d, set() {} },
  onDispose: fn => disposers.push(fn),
}, { get: (t, k) => (k in t ? t[k] : () => () => {}) }))
after(() => disposers.forEach(fn => fn()))

function findForm(node) {
  if (!node || typeof node !== 'object') return null
  if (typeof node.type === 'function' && node.type.name === 'GithubLinkForm') return node.type(node.props)
  for (const child of [node.props?.children].flat()) { const found = findForm(child); if (found) return found }
  return null
}

function mount(surface) {
  const form = findForm(contributions.find(c => c.id === surface).render())
  assert.ok(form, `URL form must be reachable on ${surface}`)
  const input = { value: '' }
  let resets = 0
  const element = { elements: { namedItem: () => input }, reset: () => { resets++; input.value = '' } }
  return {
    input,
    get resets() { return resets },
    submit(value) {
      input.value = value
      return form.props.onSubmit({ preventDefault() {}, currentTarget: element })
    },
  }
}

for (const surface of ['route-github', 'pane']) {
  test(`${surface}: rejects unreachable repositories without changing selection or clearing input`, async () => {
    const form = mount(surface)
    const before = snapshot()
    host.request = async (method, { command }) => {
      assert.equal(method, 'shell.exec')
      assert.match(command, /gh repo view 'missing\/repo' --json nameWithOwner/)
      return { code: 1, stderr: 'Repository not found or inaccessible' }
    }
    const url = 'https://github.com/missing/repo/pull/7'
    await form.submit(url)
    assert.deepEqual(snapshot(), before)
    assert.equal(form.resets, 0)
    assert.equal(form.input.value, url)
    assert.equal(messages.at(-1).kind, 'error')
    assert.match(messages.at(-1).message, /not found or inaccessible/)
  })

  test(`${surface}: validates before navigating PR, issue and repository`, async () => {
    const form = mount(surface)
    let requests = 0
    host.request = async () => { requests++; return { code: 0, stdout: '{"nameWithOwner":"acme/canonical"}' } }
    const before = snapshot()
    for (const value of ['invalid', 'javascript://github.com/a/b', 'https://evil.com/a/b']) {
      await form.submit(value)
      assert.deepEqual(snapshot(), before)
      assert.equal(messages.at(-1).kind, 'error')
    }
    assert.equal(requests, 0)
    for (const [url, expected] of [
      [' https://github.com/acme/app/pull/7 ', ['acme/canonical', 'prs', 7, null]],
      ['https://github.com/other/repo/issues/9', ['acme/canonical', 'issues', null, 9]],
      ['https://github.com/acme/app', ['acme/canonical', 'prs', null, null]],
    ]) {
      await form.submit(url)
      assert.deepEqual(snapshot(), expected)
      assert.equal(messages.at(-1).kind, 'success')
    }
    assert.equal(requests, 3)
    assert.equal(form.resets, 3)
  })

  test(`${surface}: rejects empty, malformed and invalid repository responses`, async () => {
    const form = mount(surface)
    const before = snapshot()
    for (const stdout of ['', '{', '{}', '{"nameWithOwner":"invalid"}']) {
      host.request = async () => ({ code: 0, stdout })
      await form.submit('https://github.com/acme/app')
      assert.deepEqual(snapshot(), before)
      assert.equal(form.resets, 0)
      assert.equal(messages.at(-1).kind, 'error')
    }
  })

  test(`${surface}: ignores duplicate submits and stale completions after selection changes`, async () => {
    for (const [atom, next] of [[store.repo, 'new/repo'], [store.tab, 'issues'], [store.selPr, 99], [store.selIssue, 100]]) {
      selection.forEach((atom, i) => atom.set(['old/repo', 'prs', 1, null][i]))
      const form = mount(surface)
      let resolve
      let requests = 0
      host.request = () => { requests++; return new Promise(done => { resolve = done }) }
      const url = 'https://github.com/acme/app/pull/7'
      const pending = form.submit(url)
      const duplicate = form.submit(url)
      await new Promise(done => setImmediate(done))
      assert.equal(requests, 1, 'same-tick submits must not start another check')
      atom.set(next)
      const newer = snapshot()
      const messageCount = messages.length
      resolve({ code: 0, stdout: '{"nameWithOwner":"acme/app"}' })
      await Promise.all([pending, duplicate])
      assert.deepEqual(snapshot(), newer)
      assert.equal(form.resets, 0)
      assert.equal(form.input.value, url)
      assert.equal(messages.length, messageCount, 'stale checks must not report success')
      host.request = async () => ({ code: 0, stdout: '{"nameWithOwner":"acme/app"}' })
      await form.submit(url)
      assert.deepEqual(snapshot(), ['acme/app', 'prs', 7, null])
      assert.equal(form.resets, 1, 'submission becomes available after completion')
    }
  })

  test(`${surface}: notify is optional on invalid, inaccessible and successful submissions`, async () => {
    const form = mount(surface)
    const notify = host.notify
    delete host.notify
    try {
      await form.submit('invalid')
      host.request = async () => ({ code: 1, stderr: 'inaccessible' })
      await form.submit('https://github.com/private/repo')
      assert.equal(form.resets, 0)
      host.request = async () => ({ code: 0, stdout: '{"nameWithOwner":"acme/app"}' })
      await form.submit('https://github.com/acme/app')
      assert.deepEqual(snapshot(), ['acme/app', 'prs', null, null])
      assert.equal(form.resets, 1)
    } finally { host.notify = notify }
  })
}
