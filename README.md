# Kéfir casero

Publicada en <https://kefir-pi.vercel.app/>.

Guías prácticas de kéfir de agua (`src/pages/agua/` → `/agua/…`) y de leche (`src/pages/leche/` → `/leche/…`). Cada kéfir es una sección con una página por tema (lo esencial, calculadora, temperatura, proporciones, etc.); su submenú está en `partials/agua-nav.html` y `partials/leche-nav.html`, y se incluye al principio de cada página. La lógica de la calculadora es común (`public/js/calculadora.js`); cada página de calculadora le pasa su modelo en un `<script>` al final. La paleta ámbar de agua se activa con `<div class="t-agua">` dentro de `<main>`; sin esa clase rige la teal de leche.

Static site boilerplate: HTML partials composed by a dependency-free `build.js` (Node ≥ 20 builtins only). Output is plain HTML in `dist/`, deployable to Vercel, Netlify, Cloudflare Pages or any static host.

## Commands

- `npm run build` — build `src/` + `public/` into `dist/`
- `npm run dev` — build, serve on `http://localhost:3000` (`PORT` to change), rebuild and live-reload on changes

## Layout

```
src/
  layout.html        page skeleton
  post.html          wrapper for every post, inserted into layout.html
  partials/*.html    components, included with {{> name}}
  pages/**/*.html    pages → /<path>/   (index → /, dir/index → /dir/, 404 → /404.html)
  posts/*.html       posts → /blog/<name>/
public/              copied verbatim into dist/ (css, images, favicon, robots.txt…)
```

Adding a page or post is just adding a file; main nav links live in `partials/header.html`, section menus in `partials/*-nav.html`.

## Source files

Pages and posts start with an HTML-comment front matter:

```html
<!--
title: Hello, world
description: Used for <meta name="description"> and the post list.
date: 2026-09-27
-->
<p>Body HTML…</p>
```

`title` and `description` are required; posts also require `date` (`YYYY-MM-DD`, sorts the list newest first).

## Tokens

| Token | Where | Value |
|---|---|---|
| `{{> name}}` | layout, post.html, page and post bodies | contents of `partials/name.html` (one level, no nesting) |
| `{{content}}` | layout, post.html | page/post body |
| `{{title}}`, `{{description}}` | layout and its partials | front matter (HTML-escaped) |
| `{{title}}`, `{{date}}` | post.html | post title (escaped) and date |
| `{{year}}` | layout and its partials | current year |
| `{{current:name}}` | anywhere | `aria-current="page"` when the page slug is `name` (e.g. `agua/calculadora`; posts count as `blog`) |
| `{{section:name}}` | anywhere | like `current`, plus `aria-current="true"` on pages under `name/` |
| `{{posts}}` | page and post bodies | `<ul class="post-list">` of all posts |

An unknown token or partial fails the build. Apart from partials, `{{posts}}` and nav tokens, page and post bodies are inserted literally, so code samples containing `{{…}}` are safe. Build errors in dev mode leave the last good `dist/` in place.

Keep tokens out of `<script>` blocks: formatters like Prettier rewrite `{{x}}` there into valid JS and the token silently disappears. For per-page JS, put a `<script>` in the page body.

## Deploy

- **Vercel**: import the repo; `vercel.json` sets build command, output dir, trailing slashes and security headers.
- **Netlify / Cloudflare Pages**: build command `node build.js`, publish directory `dist`.

Asset URLs are root-absolute (`/css/styles.css`), so the site must be served from a domain root, not a subpath.
