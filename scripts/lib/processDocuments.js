import {postToMarkdown} from './postToMarkdown.js'

export function processDocuments(docs, {config, writeFile, warn}) {
  let written = 0
  const seenSlugs = new Set()
  for (const doc of docs) {
    try {
      const {filename, slug, content} = postToMarkdown(doc, config)
      if (seenSlugs.has(slug)) {
        throw new Error(`duplicate slug "${slug}" already used earlier in this batch`)
      }
      writeFile(filename, content)
      seenSlugs.add(slug)
      written += 1
    } catch (err) {
      warn(`Skipping post (${doc._id || 'unknown id'}): ${err.message}`)
    }
  }
  return written
}
