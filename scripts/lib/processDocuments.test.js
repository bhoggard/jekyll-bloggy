import {test} from 'node:test'
import assert from 'node:assert/strict'
import {processDocuments} from './processDocuments.js'

const config = {projectId: 'test123', dataset: 'production'}

function textPost(id, slug) {
  return {
    _id: id,
    title: `Post ${id}`,
    slug,
    publishedAt: '2026-08-29T12:00:00.000Z',
    categories: ['Culture'],
    body: [{_type: 'block', style: 'normal', children: [{_type: 'span', text: 'hi'}]}],
  }
}

test('writes a file for each valid document', () => {
  const written = []
  const warnings = []
  const count = processDocuments([textPost('a', 'post-a'), textPost('b', 'post-b')], {
    config,
    writeFile: (filename, content) => written.push({filename, content}),
    warn: (message) => warnings.push(message),
    existingSlugs: new Set(),
  })

  assert.equal(count, 2)
  assert.equal(written.length, 2)
  assert.equal(warnings.length, 0)
  assert.equal(written[0].filename, '2026-08-29-post-a.md')
})

test('skips a malformed document with a warning instead of throwing', () => {
  const written = []
  const warnings = []
  const badPost = textPost('c', undefined)
  const count = processDocuments([textPost('a', 'post-a'), badPost], {
    config,
    writeFile: (filename, content) => written.push({filename, content}),
    warn: (message) => warnings.push(message),
    existingSlugs: new Set(),
  })

  assert.equal(count, 1)
  assert.equal(written.length, 1)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Skipping post/)
  assert.match(warnings[0], /missing a slug/)
})

test('skips a post whose slug collides with a historical post, with a warning', () => {
  const written = []
  const warnings = []
  const count = processDocuments([textPost('a', 'post-a'), textPost('b', 'the-end-of-artcat-calendar')], {
    config,
    writeFile: (filename, content) => written.push({filename, content}),
    warn: (message) => warnings.push(message),
    existingSlugs: new Set(['the-end-of-artcat-calendar']),
  })

  assert.equal(count, 1)
  assert.equal(written.length, 1)
  assert.equal(written[0].filename, '2026-08-29-post-a.md')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Skipping post/)
  assert.match(warnings[0], /slug .* already used by a historical post/)
})
