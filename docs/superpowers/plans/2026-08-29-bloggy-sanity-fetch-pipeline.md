# Bloggy Sanity Fetch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node pre-build script to the `bloggy` repo that fetches published posts from the `bloggy-studio` Sanity dataset and writes them into `_posts/sanity/` as Jekyll-ready markdown, wired into local dev, local test, and the Cloudflare Pages production build.

**Architecture:** A pure transform module (`postToMarkdown.js`, Portable Text → markdown+frontmatter) and a dependency-injected orchestration module (`processDocuments.js`) are unit tested with Node's built-in test runner. A thin I/O wrapper (`fetch-sanity-posts.js`) does the real network fetch and file writes and is verified manually against the live dataset. `tools/run.sh` and `tools/test.sh` run the fetch script before Jekyll; Cloudflare Pages' build command is updated the same way.

**Tech Stack:** Node (pinned via mise), `@sanity/client`, `@sanity/image-url`, `@portabletext/to-html`, Node's built-in `node:test` / `node:assert` (no new test framework dependency).

**Spec:** `docs/superpowers/specs/2026-08-29-sanity-cms-for-new-posts-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-29-bloggy-studio-setup.md` (Plan 1) must be complete — this plan needs the real Sanity project ID recorded in `bloggy-studio/README.md`, and the `post` schema's field names (`title`, `slug`, `publishedAt`, `categories`, `body`).

## Global Constraints

- Historical `_posts/*.md` files are never modified or touched by any part of this pipeline (spec: Scope).
- Only published (non-draft) Sanity documents are fetched — rely on Sanity's default query behavior, which already excludes `drafts.*` documents; no extra filtering logic (spec: Sanity schema).
- Images render as `<img>` tags pointing directly at Sanity's CDN — never downloaded into this repo (spec: Pre-build script).
- Generated posts live only in `_posts/sanity/`, which is gitignored — never committed, whether generated locally or during a Cloudflare Pages build (spec: Pre-build script).
- If the Sanity fetch itself fails (network/query error), the whole build must fail loudly (nonzero exit) rather than silently produce a site missing new posts (spec: Error handling).
- A malformed individual document (e.g. missing `slug`) is skipped with a logged warning — it must not fail the whole build (spec: Error handling).
- The Sanity project ID and dataset name are non-secret and safe to commit directly — no API token or Cloudflare Pages secret is needed for reads (spec: Architecture).
- Cloudflare Pages' build command becomes `node scripts/fetch-sanity-posts.js && bundle exec jekyll build` (spec: Architecture).

---

### Task 1: Project scaffolding — package.json, config, gitignore

**Files:**
- Create: `package.json`
- Create: `scripts/sanity-config.js`
- Modify: `.gitignore`
- Modify: `mise.toml`

**Interfaces:**
- Produces: `SANITY_PROJECT_ID` and `SANITY_DATASET` constants, exported from `scripts/sanity-config.js`, consumed by every later task in this plan.

- [ ] **Step 1: Add `_posts/sanity/` to `.gitignore`**

Add this line under the existing `# Jekyll cache` block (or its own small block) in `.gitignore`:

```
# Sanity-sourced posts (regenerated on every build, never committed)
_posts/sanity/
```

- [ ] **Step 2: Pin Node in `mise.toml`**

Edit `mise.toml` to add a `node` pin alongside the existing `ruby` pin:

```toml
[tools]
ruby = "3.4.4"
node = "24.13.0"
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "bloggy-sanity-fetch",
  "private": true,
  "type": "module",
  "scripts": {
    "fetch-posts": "node scripts/fetch-sanity-posts.js",
    "test": "node --test scripts/lib/*.test.js"
  }
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install @sanity/client @sanity/image-url @portabletext/to-html
```

Expected: `package.json` now has a `dependencies` block with these three packages; `node_modules/` and `package-lock.json` are created but stay gitignored (already covered by the existing `.gitignore` entries).

- [ ] **Step 5: Create `scripts/sanity-config.js`**

```javascript
// Sanity project details for the fetch pipeline.
// Non-secret — safe to commit. Source of truth: bloggy-studio/README.md.
export const SANITY_PROJECT_ID = 'REPLACE_WITH_PROJECT_ID'
export const SANITY_DATASET = 'production'
```

Open `../bloggy-studio/README.md` (from Plan 1, Task 5) and replace `REPLACE_WITH_PROJECT_ID` above with the real project ID recorded there.

- [ ] **Step 6: Verify the packages import cleanly**

```bash
node -e "import('@sanity/client').then(() => console.log('client ok'))"
node -e "import('@sanity/image-url').then(() => console.log('image-url ok'))"
node -e "import('@portabletext/to-html').then(() => console.log('to-html ok'))"
```

Expected: all three print their "ok" message with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore mise.toml scripts/sanity-config.js
git status
```

Check the `git status`/`git add` output — if `package-lock.json` is listed as ignored (it is, per the existing `.gitignore`), that's expected; don't force-add it.

```bash
git commit -m "Add Node tooling scaffolding for Sanity fetch pipeline"
```

---

### Task 2: `postToMarkdown` — pure Portable Text → markdown transform

**Files:**
- Create: `scripts/lib/postToMarkdown.js`
- Test: `scripts/lib/postToMarkdown.test.js`

**Interfaces:**
- Consumes: `{projectId, dataset}` config shape (matches `SANITY_PROJECT_ID`/`SANITY_DATASET` from Task 1, but the function itself takes a plain object so it stays network-free and unit-testable)
- Produces: `postToMarkdown(post, config) => {filename: string, content: string}`, consumed by Task 3's `processDocuments`. Throws `Error` on a post missing `slug` or `publishedAt`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/postToMarkdown.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/postToMarkdown.test.js`
Expected: FAIL — `scripts/lib/postToMarkdown.js` doesn't exist yet (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/postToMarkdown.js`:

```javascript
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
    `categories: [${categories.join(', ')}]`,
    '---',
    '',
  ].join('\n')

  const html = bodyToHtml(post.body || [], config)

  return {filename, content: `${frontmatter}${html}\n`}
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
      },
    },
  })
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/postToMarkdown.test.js`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/postToMarkdown.js scripts/lib/postToMarkdown.test.js
git commit -m "Add postToMarkdown: Portable Text post to Jekyll markdown"
```

---

### Task 3: `processDocuments` — per-document error isolation

**Files:**
- Create: `scripts/lib/processDocuments.js`
- Test: `scripts/lib/processDocuments.test.js`

**Interfaces:**
- Consumes: `postToMarkdown(post, config)` from Task 2
- Produces: `processDocuments(docs, {config, writeFile, warn}) => number` (count of posts written), consumed by Task 4's `fetch-sanity-posts.js`. `writeFile(filename, content)` and `warn(message)` are injected so this stays testable without real file I/O.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/processDocuments.test.js`:

```javascript
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
  })

  assert.equal(count, 1)
  assert.equal(written.length, 1)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Skipping post/)
  assert.match(warnings[0], /missing a slug/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/processDocuments.test.js`
Expected: FAIL — `scripts/lib/processDocuments.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/processDocuments.js`:

```javascript
import {postToMarkdown} from './postToMarkdown.js'

export function processDocuments(docs, {config, writeFile, warn}) {
  let written = 0
  for (const doc of docs) {
    try {
      const {filename, content} = postToMarkdown(doc, config)
      writeFile(filename, content)
      written += 1
    } catch (err) {
      warn(`Skipping post (${doc._id || 'unknown id'}): ${err.message}`)
    }
  }
  return written
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/processDocuments.test.js`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/processDocuments.js scripts/lib/processDocuments.test.js
git commit -m "Add processDocuments: per-document error isolation"
```

---

### Task 4: `fetch-sanity-posts.js` — the real I/O wrapper

**Files:**
- Create: `scripts/fetch-sanity-posts.js`

**Interfaces:**
- Consumes: `SANITY_PROJECT_ID`/`SANITY_DATASET` (Task 1), `processDocuments` (Task 3)
- Produces: a runnable script, `node scripts/fetch-sanity-posts.js`, that populates `_posts/sanity/`. This exact invocation is what Tasks 5 and 6 wire into `tools/run.sh`, `tools/test.sh`, and the Cloudflare Pages build command.

This task is thin network/filesystem glue with no independent logic to unit test — Tasks 2 and 3 already cover the real logic. Verification here is a real run against the live dataset from Plan 1.

- [ ] **Step 1: Write the script**

Create `scripts/fetch-sanity-posts.js`:

```javascript
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
```

Note: the output directory is cleared and rewritten on every run, so posts renamed or unpublished in Sanity don't leave stale files behind.

- [ ] **Step 2: Run it against the live (Plan 1) dataset**

```bash
node scripts/fetch-sanity-posts.js
```

Expected: `Wrote 0 post(s) from Sanity to .../_posts/sanity` (no posts created in Studio yet — that's correct). If it errors instead, check that `scripts/sanity-config.js`'s `SANITY_PROJECT_ID` was actually replaced with the real value (Task 1, Step 5) and that Plan 1's dataset visibility is `public`.

- [ ] **Step 3: Create a real test post and re-run**

In the deployed Studio (`bloggy-studio`, from Plan 1 Task 4), create one `post` document with a title, slug, published date, at least one category, and a short body paragraph. Publish it. Then:

```bash
node scripts/fetch-sanity-posts.js
cat _posts/sanity/*.md
```

Expected: `Wrote 1 post(s)...`, and the printed file has correct frontmatter and an HTML `<p>` body matching what you wrote in Studio.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-sanity-posts.js
git commit -m "Add fetch-sanity-posts: pull published posts into _posts/sanity/"
```

---

### Task 5: Wire into local dev and local test

**Files:**
- Modify: `tools/run.sh`
- Modify: `tools/test.sh`

**Interfaces:**
- Consumes: `node scripts/fetch-sanity-posts.js` (Task 4)

- [ ] **Step 1: Update `tools/run.sh`**

Add a call to the fetch script before the final `eval`, so local dev serves Sanity-sourced posts too. Change the end of the file from:

```bash
echo -e "\n> $command\n"
eval "$command"
```

to:

```bash
node scripts/fetch-sanity-posts.js || exit 1

echo -e "\n> $command\n"
eval "$command"
```

- [ ] **Step 2: Update `tools/test.sh`**

In the `main()` function, add the fetch call after `read_baseurl` and before the Jekyll build step. Change:

```bash
  read_baseurl

  # build
  JEKYLL_ENV=production bundle exec jekyll b \
    -d "$SITE_DIR$_baseurl" -c "$_config"
```

to:

```bash
  read_baseurl

  # fetch Sanity-sourced posts (regenerates _posts/sanity/ so html-proofer
  # validates combined historical + Sanity-sourced output)
  node scripts/fetch-sanity-posts.js

  # build
  JEKYLL_ENV=production bundle exec jekyll b \
    -d "$SITE_DIR$_baseurl" -c "$_config"
```

`tools/test.sh` already has `set -eu` at the top, so a nonzero exit from the fetch script aborts the whole test run — no extra error handling needed here.

- [ ] **Step 3: Verify `tools/run.sh`**

```bash
bash tools/run.sh
```

Expected: prints `Wrote N post(s) from Sanity...` before starting the Jekyll server. Visit `http://127.0.0.1:4000` and confirm the site loads normally (with the test post from Task 4 present, if you kept it published). Stop the server (Ctrl-C).

- [ ] **Step 4: Verify `tools/test.sh`**

```bash
bash tools/test.sh
```

Expected: completes successfully (exit 0), same as before this change — the fetch step should be invisible to html-proofer's pass/fail as long as the generated post's HTML is well-formed.

- [ ] **Step 5: Commit**

```bash
git add tools/run.sh tools/test.sh
git commit -m "Run Sanity fetch before local Jekyll serve and test"
```

---

### Task 6: Wire into the Cloudflare Pages production build

**Files:** none (Cloudflare Pages project configuration, not a file in this repo)

**Interfaces:**
- Consumes: `node scripts/fetch-sanity-posts.js` (Task 4)

This task changes the live production build configuration for `bloggy-ell.pages.dev`. **Confirm with the user before running Step 1** — this is a production infrastructure change, not just a code change.

- [ ] **Step 1: Update the Pages project's build command**

Using the `mcp__cloudflare-api` tool (already authenticated to this account), update the `bloggy` Pages project's build configuration. First look up the exact current shape:

```
mcp__cloudflare-api__docs query: "Pages project update build configuration"
```

Then send the update — the Cloudflare Pages API shape is:

```
PATCH /accounts/{account_id}/pages/projects/bloggy
{
  "build_config": {
    "build_command": "node scripts/fetch-sanity-posts.js && bundle exec jekyll build"
  }
}
```

Use `mcp__cloudflare-api__execute` to issue this request (look up the account ID first if needed via a projects-list call).

- [ ] **Step 2: Verify**

Use `mcp__cloudflare-api__execute` to GET the project (`GET /accounts/{account_id}/pages/projects/bloggy`) and confirm `build_config.build_command` now reads `node scripts/fetch-sanity-posts.js && bundle exec jekyll build`.

- [ ] **Step 3: Trigger and watch a deploy**

Push any pending commits from this plan to `main` (or trigger a manual deploy from the Cloudflare dashboard/API), then watch the build log to confirm the fetch step runs and `bundle exec jekyll build` succeeds afterward.

---

## Done

At this point, new posts written and published in the `bloggy-studio` Sanity Studio automatically appear on the live site on the next Cloudflare Pages build, alongside all untouched historical posts.
