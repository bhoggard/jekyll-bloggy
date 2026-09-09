# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A personal Jekyll blog ("bloggy", art/culture/politics) built on the [Chirpy starter](https://github.com/cotes2020/chirpy-starter). The theme comes from the `jekyll-theme-chirpy` gem (~> 7.6.0) — layouts, includes, and Sass live inside the gem, not this repo. To inspect them: `bundle info --path jekyll-theme-chirpy`.

`Gemfile.lock` is committed, and it must stay that way. Cloudflare Pages builds
the site itself, so the lockfile is the only thing pinning which theme version
gets deployed.

Ruby 3.4.4 is pinned via `mise.toml` — this matches Cloudflare Pages' default build-image Ruby version so deploys don't pay for a from-source Ruby compile.

## Commands

```bash
bundle install                    # install dependencies
bash tools/run.sh                 # dev server with live reload (bundle exec jekyll s -l)
bash tools/run.sh -p              # serve in production mode
bash tools/test.sh                # test: production build + html-proofer link checking
bash tools/check-theme-sync.sh    # verify the vendored theme overrides match the gem
```

There are no unit tests; `tools/test.sh` is the whole test suite (it rebuilds `_site` from scratch and validates internal links/HTML).

## Structure

- `_config.yml` — all site configuration (title, author, social links, analytics, comments, PWA). Most customization happens here rather than in code.
- `_posts/` — blog posts, named `YYYY-MM-DD-title.md`. Chirpy frontmatter conventions apply (`categories`, `tags`, etc.).
- `_tabs/` — sidebar pages (About, Archives, Categories, Tags), ordered by `order` frontmatter.
- `_plugins/posts-lastmod-hook.rb` — sets `last_modified_at` on posts from git log; a post's modification date only updates once it has more than one commit touching it.
- `_data/contact.yml`, `_data/share.yml` — which contact icons and share buttons appear.
- `_includes/metadata-hook.html` — the theme's empty extension-point placeholder, overridden to clear the image loading placeholder on `error`. See "Stuck image shimmer" below.
- `_includes/{sidebar,topbar,refactor-content}.html`, `_layouts/{home,post}.html` — **forks of theme files**, copied out of the gem and edited. `tools/theme-overrides.sha256` records the checksum of each one's upstream counterpart; `tools/check-theme-sync.sh` (run by `tools/test.sh`) fails when the gem's copy changes, meaning the fork needs re-reviewing. See "Theme version drift" below.
- `assets/lib` — git submodule (chirpy-static-assets); run `git submodule update --init` after a fresh clone or the site will be missing JS/CSS assets.

## Deployment

The site is hosted on Cloudflare Pages (project `bloggy`, at `bloggy-ell.pages.dev`) via native Git integration — Cloudflare clones the repo and builds it directly, no GitHub Actions involved. Pushing to `main` triggers an automatic production build and deploy.

`.ruby-version` and `mise.toml` are both pinned to `3.4.4` deliberately — that's Cloudflare's build-image default. Pinning to any other version makes Cloudflare compile Ruby from source via `asdf`/`ruby-build` on every build (multiple minutes of `./configure && make`), instead of using the pre-baked interpreter.

## Theme version drift

The theme ships its layouts, includes **and** its compiled JavaScript as one
unit, and this repo forks several of those files. If the gem version moves while
a fork stays behind, the markup and the script that drives it can disagree — the
failure mode is not a build error but a broken page at runtime, since the two are
wired together by id and selector. Concretely: between 7.5.0 and 7.6.0 the PWA
update button moved out of `.toast-body`, and `app.min.js` switched from
`.toast-body>button` to `[aria-label="Update"]` to match. Commit c154dd5 ("fix
bug from chirpy theme mismatch") repaired that class of skew by hand.

Do NOT assume drift explains a runtime symptom without confirming it. A later
report of the site "reloading in a loop" was investigated at length and was **not**
drift — the deployed HTML and JS were both 7.6.0 and agreed with each other. The
actual causes were the two image-placeholder issues documented below, and the
page was never reloading at all. Check the deployed `app.min.js`/`sw.min.js`
version banners against the served markup before going down this path.

Two guards exist, and both matter:

1. `Gemfile.lock` is committed, so Cloudflare deploys a known theme version.
2. `tools/check-theme-sync.sh` fails the build when the gem's copy of a forked
   file changes.

When bumping the theme: bump the `Gemfile`, `bundle update jekyll-theme-chirpy`,
then run `bash tools/check-theme-sync.sh`. For each file it flags, diff our fork
against the new upstream, port the changes, and re-record with
`bash tools/check-theme-sync.sh --update`. Commit the updated `Gemfile.lock`.

## Stuck image shimmer

Chirpy wraps post images in a `.shimmer` placeholder and strips that class on the
image's `load` event. A **broken** image never fires `load` (it fires `error`), so
its wrapper keeps running `animation: shimmer 1.3s infinite` indefinitely. On a
page with several images this reads as the site perpetually loading or reloading
itself — it was reported, and initially misdiagnosed, as a reload loop. The page
is not reloading; scroll position stays put, which is how to tell the two apart.

`_includes/metadata-hook.html` clears the placeholder on `error` as well, so a
dead image degrades to a plain broken image.

A separate symptom is easily confused with it: the page **jumping up and down**.
That is layout shift, not the shimmer (which sweeps horizontally, never
vertically). It happens when an image carries no `width`/`height`, so nothing
reserves its space and everything below it lurches when it loads. The MT-imported
posts all carry dimensions; Sanity-sourced ones did not until
`scripts/lib/postToMarkdown.js` began deriving them from the asset ref
(`image-<hash>-<width>x<height>-<ext>`). Keep emitting them for any new image
type added to that renderer.

This archive is unusually exposed to it: ~2,700 imported posts carry 2002-2011
images, many externally hosted and steadily rotting, and `tools/test.sh` runs
html-proofer with `--disable-external`, so a dead external image URL is never
caught at build time. Enabling external checking would catch the underlying
rot, at the cost of a much slower and network-flaky test run.

## Notes

- The GitHub Actions deploy workflow was intentionally removed in favor of Cloudflare Pages' own Git integration; there is no CI in this repo.
- `_site/` and `.jekyll-cache/` are build output — never edit them.
