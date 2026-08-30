import {test} from 'node:test'
import assert from 'node:assert/strict'
import {postToMarkdown} from './postToMarkdown.js'

const config = {projectId: 'test123', dataset: 'production'}

const basePost = {
  _id: 'post1',
  title: 'My New Post',
  slug: 'my-new-post',
  publishedAt: '2026-08-29T12:34:56.000Z',
  categories: ['Art', 'NYC'],
  body: [
    {
      _type: 'block',
      style: 'normal',
      children: [{_type: 'span', text: 'Hello world'}],
    },
  ],
}

test('generates a filename from date and slug', () => {
  const {filename} = postToMarkdown(basePost, config)
  assert.equal(filename, '2026-08-29-my-new-post.md')
})

test('returns the raw slug alongside the filename', () => {
  const {slug} = postToMarkdown(basePost, config)
  assert.equal(slug, 'my-new-post')
})

test('writes frontmatter with title, date, and categories', () => {
  const {content} = postToMarkdown(basePost, config)
  assert.match(content, /^---\n/)
  assert.match(content, /title: "My New Post"/)
  assert.match(content, /date: 2026-08-29 12:34:56 \+0000/)
  assert.match(content, /categories: \[Art, NYC\]/)
})

test('converts a paragraph block to HTML', () => {
  const {content} = postToMarkdown(basePost, config)
  assert.match(content, /<p>Hello world<\/p>/)
})

test('renders an inline image as an <img> tag pointing at the Sanity CDN', () => {
  const post = {
    ...basePost,
    body: [
      {
        _type: 'image',
        _key: 'img1',
        asset: {_type: 'reference', _ref: 'image-abc123-800x600-jpg'},
        alt: 'A photo',
      },
    ],
  }
  const {content} = postToMarkdown(post, config)
  assert.match(content, /<img src="https:\/\/cdn\.sanity\.io\/images\/test123\/production\//)
  assert.match(content, /alt="A photo"/)
})

test('throws when slug is missing', () => {
  const post = {...basePost, slug: undefined}
  assert.throws(() => postToMarkdown(post, config), /missing a slug/)
})

test('throws when publishedAt is missing', () => {
  const post = {...basePost, publishedAt: undefined}
  assert.throws(() => postToMarkdown(post, config), /missing publishedAt/)
})
