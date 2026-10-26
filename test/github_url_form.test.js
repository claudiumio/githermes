import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from '@hermes/plugin-sdk'
import plugin, { getGitHubShellStore } from '../desktop/plugin.js'
const githubShellStore = getGitHubShellStore()

const messages = []
host.notify = message => messages.push(message)
host.openWorkspace = () => () => {}
const contributions = []
const disposers = []
plugin.register(new Proxy({
  register: item => contributions.push(item),
  storage: { get: (k, d) => d, set() {} },
  onDispose: fn => disposers.push(fn),
}, { get: (t, k) => (k in t ? t[k] : () => () => {}) }))

function findForm(node) {
  if (!node || typeof node !== 'object') return null
  if (typeof node.type === 'function' && node.type.name === 'GithubLinkForm') return node.type(node.props)
  for (const child of [node.props?.children].flat()) { const found = findForm(child); if (found) return found }
  return null
}

test('plugin-owned URL form validates before navigating PR, issue and repository', () => {
  const form = findForm(contributions.find(c => c.id === 'route-github').render())
  assert.ok(form, 'URL form must be reachable on the plugin page')
  let reset = 0
  const submit = value => form.props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ value }) }, reset: () => reset++ } })
  const snapshot = () => [githubShellStore.repo.get(), githubShellStore.tab.get(), githubShellStore.selPr.get(), githubShellStore.selIssue.get()]
  const before = snapshot()
  for (const value of ['invalid', 'javascript://github.com/a/b', 'https://evil.com/a/b']) {
    submit(value)
    assert.deepEqual(snapshot(), before)
    assert.equal(messages.at(-1).kind, 'error')
  }
  for (const [url, expected] of [
    [' https://github.com/acme/app/pull/7 ', ['acme/app', 'prs', 7, null]],
    ['https://github.com/other/repo/issues/9', ['other/repo', 'issues', null, 9]],
    ['https://github.com/acme/app', ['acme/app', 'prs', null, null]],
  ]) {
    submit(url)
    assert.deepEqual(snapshot(), expected)
    assert.equal(messages.at(-1).kind, 'success')
  }
  assert.equal(reset, 3)
  disposers.forEach(fn => fn())
})
