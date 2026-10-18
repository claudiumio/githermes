import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('exports hook functions', async (t) => {
  await t.test('plugin source contains useAssignedPrs', () => {
    const src = readFileSync('desktop/plugin.js', 'utf8')
    assert.ok(src.includes('function useAssignedPrs'), 'expected useAssignedPrs in plugin source')
  })
  await t.test('plugin source contains useAssignedIssues', () => {
    const src = readFileSync('desktop/plugin.js', 'utf8')
    assert.ok(src.includes('function useAssignedIssues'), 'expected useAssignedIssues in plugin source')
  })
})
