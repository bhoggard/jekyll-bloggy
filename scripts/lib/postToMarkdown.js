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

// Widest rendition we request from the Sanity CDN. `fit('max')` caps the width
// here but never upscales, so a narrower original is served at its own width.
const MAX_IMAGE_WIDTH = 1200

function bodyToHtml(body, config) {
  const builder = imageUrlBuilder(config)
  const components = {
    types: {
      image: ({value}) => {
        const src = builder.image(value).width(MAX_IMAGE_WIDTH).fit('max').url()
        const size = imageSizeAttrs(value)
        return `<img src="${src}" alt="${escapeHtml(value.alt || '')}"${size} />`
      },
      videoEmbed: ({value}) => videoEmbedToHtml(value.url || ''),
    },
  }

  // toHTML() concatenates top-level blocks with no separator, so a body with
  // more than one block (e.g. an image followed by paragraphs) renders as a
  // single line of HTML. Kramdown only recognizes block-level HTML (<p>,
  // <iframe>, etc.) when it starts its own line surrounded by blank lines —
  // otherwise it treats the tags as literal text and HTML-escapes them. So
  // each top-level block/list-run must be rendered separately and joined
  // with blank lines, while consecutive list items of the same style stay
  // grouped together so toHTML still wraps them in one <ul>/<ol>.
  return groupTopLevelBlocks(body)
    .map((group) => toHTML(group, {components}))
    .join('\n\n')
}

function groupTopLevelBlocks(body) {
  const groups = []
  for (const item of body) {
    const previousGroup = groups[groups.length - 1]
    const isListItem = item._type === 'block' && item.listItem
    const previousIsSameListRun =
      isListItem &&
      previousGroup &&
      previousGroup.every((b) => b._type === 'block' && b.listItem === item.listItem)

    if (previousIsSameListRun) {
      previousGroup.push(item)
    } else {
      groups.push([item])
    }
  }
  return groups
}

// Emit intrinsic width/height so the browser reserves the right space before the
// image loads. Without them a tall image dropping in on load shoves everything
// below it down the page -- with lazy loading and scroll anchoring that reads as
// the page jumping up and down. Sanity encodes the original dimensions in the
// asset ref (image-<hash>-<width>x<height>-<ext>), so no extra request is needed.
// Returns '' when the ref is an unexpected shape. Defensive only: @sanity/image-url
// itself rejects a ref without dimensions before this is reached.
function imageSizeAttrs(value) {
  const ref = (value && value.asset && (value.asset._ref || value.asset._id)) || ''
  const match = /-(\d+)x(\d+)-[a-zA-Z0-9]+$/.exec(ref)
  if (!match) {
    return ''
  }

  const naturalWidth = Number(match[1])
  const naturalHeight = Number(match[2])
  if (!naturalWidth || !naturalHeight) {
    return ''
  }

  const width = Math.min(naturalWidth, MAX_IMAGE_WIDTH)
  const height = Math.round((naturalHeight * width) / naturalWidth)
  return ` width="${width}" height="${height}"`
}

function videoEmbedToHtml(url) {
  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    return `<iframe class="embed-video" src="https://www.youtube.com/embed/${youtubeId}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
  }

  const vimeoSrc = extractVimeoSrc(url)
  if (vimeoSrc) {
    return `<iframe class="embed-video" src="${vimeoSrc}" title="Vimeo video player" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
  }

  throw new Error(`Unrecognized video URL (expected YouTube or Vimeo): ${url}`)
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function extractVimeoSrc(url) {
  const idMatch = url.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/)?(\d+)/)
  if (!idMatch) return null
  const id = idMatch[1]

  // Unlisted/private Vimeo videos require a privacy hash to embed (without it,
  // player.vimeo.com returns a 403). The hash shows up either as a path segment
  // in "share" URLs (vimeo.com/ID/HASH) or as a ?h= query param on embed URLs.
  const pathHashMatch = url.match(new RegExp(`${id}\\/([a-zA-Z0-9]+)`))
  const queryHashMatch = url.match(/[?&]h=([a-zA-Z0-9]+)/)
  const hash = (pathHashMatch && pathHashMatch[1]) || (queryHashMatch && queryHashMatch[1])

  return hash ? `https://player.vimeo.com/video/${id}?h=${hash}` : `https://player.vimeo.com/video/${id}`
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
