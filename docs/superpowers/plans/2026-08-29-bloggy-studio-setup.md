# Bloggy Studio Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new, deployed Sanity Studio project (in a new `bloggy-studio` repo) with a `post` schema, ready to be queried by the bloggy fetch pipeline (a separate follow-up plan).

**Architecture:** A standalone Sanity Studio (TypeScript, scaffolded via `npm create sanity@latest`) with one custom document type, `post`. The dataset is public-read so the bloggy repo's build script can query it without an API token. No custom backend — Sanity's hosted API and Studio hosting (`*.sanity.studio`) are the entire infrastructure.

**Tech Stack:** Sanity Studio (`sanity` npm package, current stable major), TypeScript, Node (pinned via mise, matching bloggy's version-pinning convention).

**Spec:** `docs/superpowers/specs/2026-08-29-sanity-cms-for-new-posts-design.md`

**This is Plan 1 of 2.** Plan 2 (`docs/superpowers/plans/2026-08-29-bloggy-sanity-fetch-pipeline.md`, in the `bloggy` repo) depends on this plan's `post` schema field names and the project ID recorded in Task 5.

## Global Constraints

- Studio deploys only to Sanity's own `*.sanity.studio` hosting — no self-hosting or embedding elsewhere (spec: Scope).
- No `tags` field or taxonomy. Categories only (spec: Scope).
- `categories` is an array of strings, 1-to-many, constrained to a predefined list of exactly these 21 values (spec: Sanity schema):
  `Art, Business, Culture, Cults, Food and Drink, General, Image, Linkage, Media, Middle East, Music, NYC, Politics, Postcard, Pretty, Queer, Technology, Theater, Travel, Video, War`
- `body` is Portable Text (block content), supporting inline images (spec: Sanity schema).
- The dataset must be configured for public read access — no API token should ever be required to query published posts (spec: Architecture).

---

### Task 1: Create the repo and scaffold the Studio project

**Files:**
- Create: new GitHub repo `bhoggard/bloggy-studio`
- Create: entire scaffolded Studio project tree (via `npm create sanity@latest`), including `sanity.config.ts`, `schemaTypes/`, `package.json`, `tsconfig.json`

**Interfaces:**
- Produces: a working local Studio project directory at `~/code/jekyll/bloggy-studio` (sibling to `bloggy`) with a real Sanity `projectId` already filled into `sanity.config.ts` by the scaffolder, and a `production` dataset created.

- [ ] **Step 1: Create the GitHub repo**

```bash
cd /Users/barry/code/jekyll
gh repo create bhoggard/bloggy-studio --private --clone
cd bloggy-studio
```

Expected: a new empty private repo, cloned locally to `/Users/barry/code/jekyll/bloggy-studio`. (Flip to public later with `gh repo edit --visibility public` if you'd rather it be open.)

- [ ] **Step 2: Log in to Sanity**

```bash
npx sanity login
```

This opens a browser to authenticate (or create a free Sanity account if you don't have one). Wait for "Login successful" in the terminal before continuing.

- [ ] **Step 3: Scaffold the Studio**

```bash
npm create sanity@latest -- --output-path .
```

Answer the prompts:
- "Select project to use" → create a new project, name it `bloggy-studio`
- "Use the default dataset configuration?" → yes (creates a dataset named `production`)
- "Project output path" → `.` (current directory, already set by the flag, just confirm)
- "Select project template" → **Clean project with no predefined schema types**
- "Do you want to use TypeScript?" → **Yes**
- "Package manager" → npm
- Do **not** let it run `sanity deploy` yet if asked — that's Task 4.

Expected: a full Studio project written into the current directory, with `sanity.config.ts` containing a real `projectId` (copy this value somewhere — you'll need it in Task 5).

- [ ] **Step 4: Verify it runs**

```bash
npm run dev
```

Expected: starts a local dev server (typically `http://localhost:3333`); open it in a browser and confirm the empty Studio loads with no errors in the console. Stop the server (Ctrl-C) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Sanity Studio project"
git push
```

---

### Task 2: Define the `post` schema

**Files:**
- Create: `schemaTypes/post.ts`
- Create: `schemaTypes/index.ts`
- Modify: `sanity.config.ts` (register the schema)

**Interfaces:**
- Consumes: none (first schema type in the project)
- Produces: a `post` document type with fields `title` (string), `slug` (slug), `publishedAt` (datetime), `categories` (array of string, predefined list, min 1), `body` (Portable Text array of `block` and `image`). These exact field names are what Plan 2's fetch script queries against.

- [ ] **Step 1: Write the schema**

Create `schemaTypes/post.ts`:

```typescript
import {defineType, defineField} from 'sanity'

const CATEGORY_OPTIONS = [
  'Art',
  'Business',
  'Culture',
  'Cults',
  'Food and Drink',
  'General',
  'Image',
  'Linkage',
  'Media',
  'Middle East',
  'Music',
  'NYC',
  'Politics',
  'Postcard',
  'Pretty',
  'Queer',
  'Technology',
  'Theater',
  'Travel',
  'Video',
  'War',
]

export const postType = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        list: CATEGORY_OPTIONS.map((value) => ({title: value, value})),
      },
      validation: (Rule) => Rule.min(1).required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [{type: 'block'}, {type: 'image', options: {hotspot: true}}],
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {title: 'title', publishedAt: 'publishedAt'},
    prepare({title, publishedAt}) {
      return {
        title,
        subtitle: publishedAt ? new Date(publishedAt).toLocaleDateString() : 'No date',
      }
    },
  },
})
```

Create `schemaTypes/index.ts`:

```typescript
import {postType} from './post'

export const schemaTypes = [postType]
```

- [ ] **Step 2: Register the schema in `sanity.config.ts`**

Open `sanity.config.ts` (scaffolded in Task 1) and confirm/edit the `schema` block to:

```typescript
import {schemaTypes} from './schemaTypes'

// ...inside defineConfig({...})
  schema: {
    types: schemaTypes,
  },
```

Leave the rest of the scaffolded file (`projectId`, `dataset`, `plugins`) untouched.

- [ ] **Step 3: Verify the schema builds**

```bash
npx tsc --noEmit
npx sanity build
```

Expected: both commands exit 0 with no type errors and no schema errors.

- [ ] **Step 4: Verify in the Studio UI**

```bash
npm run dev
```

Open the local Studio, click "Post" in the document type list, click "Create new". Confirm all five fields appear (Title, Slug, Published at, Categories with the 21-value dropdown, Body with the rich-text toolbar). Don't save anything yet. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add schemaTypes sanity.config.ts
git commit -m "Add post schema: title, slug, publishedAt, categories, body"
git push
```

---

### Task 3: Set the dataset to public read access

**Files:** none (Sanity project configuration, not a file in this repo)

**Interfaces:**
- Consumes: the `production` dataset created in Task 1
- Produces: a dataset queryable over Sanity's HTTP API with no auth token — required by Plan 2's fetch script

- [ ] **Step 1: Set visibility to public**

```bash
npx sanity dataset visibility set production public
```

- [ ] **Step 2: Verify**

```bash
npx sanity dataset visibility get production
```

Expected output: `public`

- [ ] **Step 3: Confirm anonymous query access works**

```bash
curl -s "https://<PROJECT_ID>.api.sanity.io/v2024-01-01/data/query/production?query=*%5B_type+%3D%3D+%22post%22%5D" | head -c 200
```

(Replace `<PROJECT_ID>` with the project ID from Task 1.) Expected: a JSON response like `{"query":"...","result":[]}` — an empty `result` array is correct, since no posts have been created yet. A `401`/`403` error means visibility isn't actually public; re-run Step 1.

No commit needed — this is a Sanity project setting, not a file change.

---

### Task 4: Deploy the Studio

**Files:** none

**Interfaces:**
- Produces: a live Studio URL (e.g. `https://bloggy-studio.sanity.studio`) — this is where you'll write posts going forward.

- [ ] **Step 1: Deploy**

```bash
npx sanity deploy
```

When prompted for a studio hostname, use `bloggy-studio` (giving `https://bloggy-studio.sanity.studio`) unless that's taken, in which case pick an available variant and note the actual URL you get.

- [ ] **Step 2: Verify**

Open the printed `*.sanity.studio` URL in a browser. Confirm it loads the same Studio you saw locally in Task 2, and that you can log in with the same Sanity account.

---

### Task 5: Record project details for Plan 2

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: a documented `projectId` and `dataset` name that Plan 2 (in the `bloggy` repo) will copy into `scripts/sanity-config.js`.

- [ ] **Step 1: Write the README**

Replace the scaffolded `README.md` content with:

```markdown
# bloggy-studio

Sanity Studio for authoring new posts on [bloggy](https://github.com/bhoggard/bloggy). Historical posts are not managed here — see that repo's `_posts/` for the archive.

- Studio: https://bloggy-studio.sanity.studio (or your actual deployed hostname)
- Sanity project ID: `<paste the real project ID here>`
- Dataset: `production` (public read access)

## Local development

```bash
npm install
npm run dev
```

## Schema

One document type, `post` (see `schemaTypes/post.ts`): title, slug, publishedAt, categories (predefined multi-select list), body (Portable Text).
```

Fill in the actual project ID and deployed Studio URL from Tasks 1 and 4.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document project ID and dataset for downstream consumers"
git push
```

---

## Done

At this point you have a deployed Studio at your `*.sanity.studio` URL, a public `production` dataset with the `post` schema, and the project ID recorded in `bloggy-studio/README.md`. Proceed to Plan 2 (`docs/superpowers/plans/2026-08-29-bloggy-sanity-fetch-pipeline.md`) in the `bloggy` repo.
