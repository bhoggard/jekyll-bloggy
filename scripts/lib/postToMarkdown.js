import {toHTML} from '@portabletext/to-html'
import imageUrlBuilder from '@sanity/image-url'

export function postToMarkdown(post, config) {
  if (!post.slug) {
    throw new Error(`Post is missing a slug: ${post.title || post._id || '(untitled)'}`)
  }
  if (!post.publishedAt) {
    throw new Error(`Post is missing publishedAt: ${post.title || post.slug}`)
  }

  const date = new Date(post.publishedAt)
  const dayStr = date.toISOString().slice(0, 10)
  const filename = `${dayStr}-${post.slug}.md`

  const categories = post.categories && post.categories.length ? post.categories : []
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(post.title || '')}`,
    `date: ${formatDate(date)}`,
    `categories: [${categories.map((c) => JSON.stringify(c)).join(', ')}]`,
    '---',
    '',
  ].join('\n')

  const html = bodyToHtml(post.body || [], config)

  return {filename, slug: post.slug, content: `${frontmatter}${html}\n`}
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  )
}

function bodyToHtml(body, config) {
  const builder = imageUrlBuilder(config)
  return toHTML(body, {
    components: {
      types: {
        image: ({value}) =>
          `<img src="${builder.image(value).width(1200).fit('max').url()}" alt="${escapeHtml(value.alt || '')}" />`,
        videoEmbed: ({value}) => videoEmbedToHtml(value.url || ''),
      },
    },
  })
}

function videoEmbedToHtml(url) {
  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    return `<iframe class="embed-video" src="https://www.youtube.com/embed/${youtubeId}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
  }

  const vimeoId = extractVimeoId(url)
  if (vimeoId) {
    return `<iframe class="embed-video" src="https://player.vimeo.com/video/${vimeoId}" title="Vimeo video player" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
  }

  throw new Error(`Unrecognized video URL (expected YouTube or Vimeo): ${url}`)
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function extractVimeoId(url) {
  const match = url.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/)?(\d+)/)
  return match ? match[1] : null
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
