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
  assert.match(content, /categories: \["Art", "NYC"\]/)
})

test('safely quotes categories containing special characters', () => {
  const post = {...basePost, categories: ['Film: Reviews', 'Art [NYC]']}
  const {content} = postToMarkdown(post, config)
  assert.match(content, /categories: \["Film: Reviews", "Art \[NYC\]"\]/)
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

test('renders a YouTube URL as a responsive embed iframe', () => {
  const post = {
    ...basePost,
    body: [{_type: 'videoEmbed', _key: 'v1', url: 'https://www.youtube.com/watch?v=qo3q-MKvEjA'}],
  }
  const {content} = postToMarkdown(post, config)
  assert.match(content, /<iframe class="embed-video" src="https:\/\/www\.youtube\.com\/embed\/qo3q-MKvEjA"/)
  assert.match(content, /allowfullscreen/)
})

test('renders a youtu.be short URL as a responsive embed iframe', () => {
  const post = {
    ...basePost,
    body: [{_type: 'videoEmbed', _key: 'v1', url: 'https://youtu.be/qo3q-MKvEjA'}],
  }
  const {content} = postToMarkdown(post, config)
  assert.match(content, /src="https:\/\/www\.youtube\.com\/embed\/qo3q-MKvEjA"/)
})

test('renders a Vimeo URL as a responsive embed iframe', () => {
  const post = {
    ...basePost,
    body: [{_type: 'videoEmbed', _key: 'v1', url: 'https://vimeo.com/76979871'}],
  }
  const {content} = postToMarkdown(post, config)
  assert.match(content, /<iframe class="embed-video" src="https:\/\/player\.vimeo\.com\/video\/76979871"/)
  assert.match(content, /allowfullscreen/)
})

test('preserves the privacy hash from a Vimeo share URL (required for unlisted videos)', () => {
  const post = {
    ...basePost,
    body: [
      {
        _type: 'videoEmbed',
        _key: 'v1',
        url: 'https://vimeo.com/1142994458/e5d9f831e9?share=copy&fl=cl&fe=ci',
      },
    ],
  }
  const {content} = postToMarkdown(post, config)
  assert.match(
    content,
    /<iframe class="embed-video" src="https:\/\/player\.vimeo\.com\/video\/1142994458\?h=e5d9f831e9"/
  )
})

test('throws on a video URL that is neither YouTube nor Vimeo', () => {
  const post = {
    ...basePost,
    body: [{_type: 'videoEmbed', _key: 'v1', url: 'https://example.com/watch?v=123'}],
  }
  assert.throws(() => postToMarkdown(post, config), /Unrecognized video URL/)
})

test('throws when slug is missing', () => {
  const post = {...basePost, slug: undefined}
  assert.throws(() => postToMarkdown(post, config), /missing a slug/)
})

test('throws when publishedAt is missing', () => {
  const post = {...basePost, publishedAt: undefined}
  assert.throws(() => postToMarkdown(post, config), /missing publishedAt/)
})
