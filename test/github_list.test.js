import test from 'node:test'
import assert from 'node:assert/strict'
import { githubList } from '../desktop/plugin.js'

test('GitHub lists reject missing or malformed output instead of showing no results', () => {
  assert.deepEqual(githubList([]), [])
  assert.deepEqual(githubList([{ number: 115 }]), [{ number: 115 }])
  for (const value of [null, undefined, '', {}, { message: 'API rate limit exceeded' }]) {
    assert.throws(() => githubList(value), /invalid list/)
  }
})
