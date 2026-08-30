import {postToMarkdown} from './postToMarkdown.js'

export function processDocuments(docs, {config, writeFile, warn, existingSlugs}) {
  let written = 0
  for (const doc of docs) {
    try {
      const {filename, slug, content} = postToMarkdown(doc, config)
      if (existingSlugs.has(slug)) {
        throw new Error(`slug "${slug}" already used by a historical post`)
      }
      writeFile(filename, content)
      written += 1
    } catch (err) {
      warn(`Skipping post (${doc._id || 'unknown id'}): ${err.message}`)
    }
  }
  return written
}
