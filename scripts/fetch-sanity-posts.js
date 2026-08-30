#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'
import {SANITY_PROJECT_ID, SANITY_DATASET} from './sanity-config.js'
import {processDocuments} from './lib/processDocuments.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, '..', '_posts', 'sanity')

async function main() {
  const client = createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: '2024-01-01',
    useCdn: true,
    perspective: 'published',
  })

  let docs
  try {
    docs = await client.fetch(
      '*[_type == "post"]{_id, title, "slug": slug.current, publishedAt, categories, body}'
    )
  } catch (err) {
    console.error(`Failed to fetch posts from Sanity: ${err.message}`)
    process.exit(1)
  }

  fs.rmSync(OUTPUT_DIR, {recursive: true, force: true})
  fs.mkdirSync(OUTPUT_DIR, {recursive: true})

  const written = processDocuments(docs, {
    config: {projectId: SANITY_PROJECT_ID, dataset: SANITY_DATASET},
    writeFile: (filename, content) =>
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), content, 'utf8'),
    warn: (message) => console.warn(message),
  })

  console.log(`Wrote ${written} post(s) from Sanity to ${OUTPUT_DIR}`)
}

main()
