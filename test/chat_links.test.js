import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGithubLink, linkNavigationPlan, shouldInterceptClick } from '../desktop/plugin.js'

test('parseGithubLink maps PR / issue / repo links and rejects everything else', () => {
  const cases = [
    ['https://github.com/NousResearch/hermes-agent/pull/123074', { repo: 'NousResearch/hermes-agent', kind: 'pr', number: 123074 }],
    ['https://github.com/NousResearch/hermes-agent/pull/123074/files', { repo: 'NousResearch/hermes-agent', kind: 'pr', number: 123074 }],
    ['https://www.github.com/a/b/pull/7#discussion_r1', { repo: 'a/b', kind: 'pr', number: 7 }],
    ['https://github.com/a/b/issues/12#issuecomment-1', { repo: 'a/b', kind: 'issue', number: 12 }],
    ['https://github.com/a/b', { repo: 'a/b', kind: 'repo' }],
    ['https://github.com/a/b.git', { repo: 'a/b', kind: 'repo' }],
    ['https://github.com/a/b/pulls', { repo: 'a/b', kind: 'prs' }],
    ['https://github.com/a/b/issues', { repo: 'a/b', kind: 'issues' }],
    ['https://github.com/a/b/blob/main/x.js', null],
    ['https://github.com/a/b/commit/abc', null],
    ['https://github.com/a/b/pull/0', null],
    ['https://github.com/a/b/pull/abc', null],
    ['https://github.com/someone', null],
    ['https://github.com/orgs/NousResearch/people', null],
    ['https://gist.github.com/a/b', null],
    ['https://example.com/a/b/pull/1', null],
    ['https://github.com.evil.io/a/b/pull/1', null],
    ['not a url', null],
  ]
  for (const [href, expected] of cases) assert.deepEqual(parseGithubLink(href), expected, href)
})

test('linkNavigationPlan selects the right tab and item', () => {
  assert.deepEqual(linkNavigationPlan({ kind: 'pr', number: 5 }), { tab: 'prs', selPr: 5, selIssue: null })
  assert.deepEqual(linkNavigationPlan({ kind: 'issue', number: 9 }), { tab: 'issues', selPr: null, selIssue: 9 })
  assert.deepEqual(linkNavigationPlan({ kind: 'issues' }), { tab: 'issues', selPr: null, selIssue: null })
  assert.deepEqual(linkNavigationPlan({ kind: 'repo' }), { tab: 'prs', selPr: null, selIssue: null })
})

test('modifier and non-primary clicks are left to the browser', () => {
  const base = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  assert.equal(shouldInterceptClick(base), true)
  for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) assert.equal(shouldInterceptClick({ ...base, [k]: true }), false, k)
  assert.equal(shouldInterceptClick({ ...base, button: 1 }), false)
  assert.equal(shouldInterceptClick({ ...base, defaultPrevented: true }), false)
})
