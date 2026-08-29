# Sanity CMS for New Posts — Design

Date: 2026-08-29

## Problem

New blog posts are currently authored as raw markdown files with HTML
bodies, committed directly to `_posts/` in this repo. There is no
editing UI — writing a post means hand-writing frontmatter and HTML in
a text editor. The goal is to introduce Sanity Studio as a proper
authoring UI for new posts, while leaving the existing static-file
workflow and all ~2,700 historical posts untouched.

## Scope

**In scope:**
- A new Sanity project + Studio for authoring posts going forward.
- A build-time pipeline that pulls published posts from Sanity into
  `_posts/` so Jekyll builds them exactly like any other post.
- Schema design for the `post` document type.

**Out of scope (explicitly deferred):**
- Migrating historical posts into Sanity. All existing `_posts/*.md`
  files stay exactly as they are, forever, and continue to be built by
  Jekyll directly.
- Any editing/preview workflow beyond what Sanity Studio provides
  out of the box.
- Self-hosting or embedding the Studio anywhere other than Sanity's
  own `*.sanity.studio` hosting.
- A `tags` taxonomy. This blog's existing `tags` field was an
  abandoned experiment (285 of ~2,700 posts) that largely duplicated
  `categories` vocabulary rather than serving as a distinct
  finer-grained axis. New posts use `categories` only.

## Architecture

Two repositories:

- **`bloggy`** (this repo) — unchanged Jekyll/Chirpy static site.
- **`bloggy-studio`** (new repo) — the Sanity Studio project (schema +
  Studio app), deployed via `npx sanity deploy` to Sanity's free
  `*.sanity.studio` hosting. This is where all new posts are written
  from now on.

At build time, a Node script in `bloggy` queries Sanity's dataset via
GROQ for published posts, converts each one to a markdown file with
Jekyll frontmatter, and writes it into `_posts/sanity/` — a
subdirectory of `_posts/`. Jekyll reads posts recursively from
subdirectories of `_posts/`, so `jekyll build` then runs exactly as it
does today and picks up the generated files like any other post —
Jekyll and the Chirpy theme have no awareness that Sanity exists.
Keeping generated posts in their own subdirectory means `.gitignore`
can exclude exactly that directory (`_posts/sanity/`) without any risk
of a pattern ever matching a real historical post file living directly
in `_posts/`.

Cloudflare Pages' build command changes from:
```
bundle exec jekyll build
```
to:
```
node scripts/fetch-sanity-posts.js && bundle exec jekyll build
```
Cloudflare Pages' build image already includes Node, so no build-image
configuration changes are needed.

The Sanity dataset is configured for public read access, so the fetch
script needs only the Sanity project ID and dataset name (both
non-secret, safe to commit) — no API token/secret has to be provisioned
in Cloudflare Pages' environment variables.

Because the fetch script runs on every build, generated posts are
always in sync with what's currently published in Sanity — there's no
manual export/import step, and nothing generated ever needs to be
committed to the `bloggy` repo.

## Sanity schema: `post`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | |
| `slug` | `slug` (source: `title`) | Becomes both the generated filename slug and the Jekyll permalink slug. `_config.yml` already defaults new posts to permalink pattern `/posts/:title/`, so no per-post permalink override is needed. |
| `publishedAt` | `datetime` | Maps to frontmatter `date`. |
| `categories` | array of `string` | Maps to frontmatter `categories`. Free-text strings (not references), matching the existing flat vocabulary (`Culture`, `Politics`, `Art`, `NYC`, etc.) already used across the site. |
| `body` | Portable Text (block content) | Supports inline images. Converted to HTML by the fetch script. |

Only documents that are published (i.e. not Sanity drafts) are fetched
— Sanity's default query behavior already excludes `drafts.*`
documents, so this requires no extra filtering logic.

## Pre-build script: `scripts/fetch-sanity-posts.js`

- Uses `@sanity/client` to run a GROQ query for all `post` documents.
- Converts each post's `body` (Portable Text) to HTML using a Portable
  Text HTML serializer (e.g. `@portabletext/to-html`). Inline images
  render as `<img>` tags pointing directly at Sanity's CDN image URLs
  — no image files are downloaded into this repo.
- Writes one file per post to `_posts/sanity/YYYY-MM-DD-slug.md`,
  where the date comes from `publishedAt` and the slug from the
  `slug` field, matching the existing filename convention. Frontmatter
  is written in the same shape existing posts already use (`title`,
  `date`, `categories`).
- Runs unconditionally on every build, including local dev
  (`tools/run.sh`). The files it generates are build output, not
  source, so `_posts/sanity/` is added to `.gitignore` — generated
  posts never get committed, whether produced locally or during a
  Cloudflare Pages build.

## Error handling

- If the Sanity fetch fails (network error, bad query) the build
  should fail loudly rather than silently produce a site missing new
  posts — Cloudflare Pages will surface a failed build the same way a
  broken `jekyll build` would today.
- Malformed individual documents (e.g. missing `slug`) should cause
  that document to be skipped with a logged warning, not fail the
  whole build — an editing mistake in Studio shouldn't be able to take
  the whole site down.

## Testing

- `tools/test.sh` already rebuilds `_site` from scratch and runs
  html-proofer; once the fetch script is wired into the build command,
  this continues to validate the combined (historical + Sanity-sourced)
  output with no changes to the test script itself.
- The fetch script should be exercisable locally against the real
  (public) dataset, so a local `bash tools/run.sh` shows Sanity-sourced
  posts during development too.

## Open questions for the implementation plan

- Whether `categories` in Studio should be a free-text array (matching
  history exactly) or a predefined list/enum to prevent typos
  diverging from the existing vocabulary — leaning free-text for
  simplicity, to be confirmed during planning.
