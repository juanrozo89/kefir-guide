const fs = require("fs");
const http = require("http");
const path = require("path");

const SRC = path.join(__dirname, "src");
const PUBLIC = path.join(__dirname, "public");
const DIST = path.join(__dirname, "dist");
const BLOG = "blog"; // posts are published at /blog/<slug>/
const PORT = Number(process.env.PORT) || 3000;

// ---------- sources ----------

function read(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

function htmlFiles(dir, recursive = false) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive })
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(dir, f));
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Front matter: an HTML comment at the very top, one "key: value" per line.
function parse(file, required) {
  const raw = read(file);
  const m = raw.match(/^<!--\n([\s\S]*?)\n-->\n?/);
  if (!m) throw new Error(`${file}: must start with a <!-- front matter --> block`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const sep = line.indexOf(":");
    if (sep === -1) throw new Error(`${file}: malformed front matter line "${line}"`);
    meta[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  for (const key of required) {
    if (!meta[key]) throw new Error(`${file}: missing front matter key "${key}"`);
  }
  return { file, slug: path.basename(file, ".html"), meta, body: raw.slice(m[0].length).trimEnd() };
}

function loadSources() {
  const partials = {};
  for (const f of htmlFiles(path.join(SRC, "partials"))) {
    partials[path.basename(f, ".html")] = read(f).trimEnd();
  }
  const include = (text, where) =>
    text.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`${where}: unknown partial {{> ${name}}}`);
      return partials[name];
    });

  // Pages may live in subfolders: pages/agua/calculadora.html → slug "agua/calculadora",
  // pages/agua/index.html → slug "agua".
  const pagesDir = path.join(SRC, "pages");
  const pages = htmlFiles(pagesDir, true).map((f) => {
    const page = parse(f, ["title", "description"]);
    page.slug = path
      .relative(pagesDir, f)
      .slice(0, -".html".length)
      .split(path.sep)
      .join("/")
      .replace(/\/index$/, "");
    return page;
  });
  const posts = htmlFiles(path.join(SRC, "posts")).map((f) => parse(f, ["title", "description", "date"]));
  for (const p of posts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.meta.date)) throw new Error(`${p.file}: date must be YYYY-MM-DD`);
  }
  posts.sort((a, b) => b.meta.date.localeCompare(a.meta.date));

  return {
    layout: include(read(path.join(SRC, "layout.html")), "layout.html"),
    postTemplate: include(read(path.join(SRC, "post.html")), "post.html"),
    pages,
    posts,
    include,
  };
}

// ---------- rendering ----------

// {{current:name}} marks only the page `name`; {{section:name}} also marks every page under name/.
const NAV_TOKEN = /\{\{\s*((?:current|section):[\w/-]+)\s*\}\}/g;

function navMark(key, nav) {
  const [kind, name] = key.split(":");
  if (nav === name) return 'aria-current="page"';
  if (kind === "section" && nav.startsWith(name + "/")) return 'aria-current="true"';
  return "";
}

// Single pass, so inserted values (e.g. {{content}}) are never re-scanned for tokens.
function fill(template, vars, nav, where) {
  return template.replace(/\{\{\s*([\w:/-]+)\s*\}\}/g, (_, key) => {
    if (/^(current|section):/.test(key)) return navMark(key, nav);
    if (!(key in vars)) throw new Error(`${where}: unknown token {{${key}}}`);
    return vars[key];
  });
}

function postList(posts) {
  if (!posts.length) return "<p>No posts yet.</p>";
  const items = posts.map(
    (p) =>
      `  <li>\n    <time datetime="${p.meta.date}">${p.meta.date}</time>\n` +
      `    <a href="/${BLOG}/${p.slug}/">${esc(p.meta.title)}</a>\n` +
      `    <p>${esc(p.meta.description)}</p>\n  </li>`,
  );
  return `<ul class="post-list">\n${items.join("\n")}\n</ul>`;
}

function pageOut(slug) {
  // index.html and 404.html stay at the root (Vercel serves /404.html for missing routes)
  if (slug === "index" || slug === "404") return path.join(DIST, slug + ".html");
  return path.join(DIST, slug, "index.html");
}

function build() {
  const { layout, postTemplate, pages, posts, include } = loadSources();
  const list = postList(posts);
  const year = String(new Date().getFullYear());

  // Page and post bodies accept {{> partial}}, {{posts}} and nav tokens; everything else is literal.
  const expand = (item, nav) =>
    include(item.body, item.file)
      .split("{{posts}}")
      .join(list)
      .replace(NAV_TOKEN, (_, key) => navMark(key, nav));
  const render = (item, nav, content) =>
    fill(
      layout,
      { title: esc(item.meta.title), description: esc(item.meta.description), year, content },
      nav,
      item.file,
    );

  // Render everything before touching dist/, so a broken source never wipes the last good build.
  const out = [];
  for (const page of pages) {
    out.push([pageOut(page.slug), render(page, page.slug, expand(page, page.slug))]);
  }
  for (const post of posts) {
    const vars = { title: esc(post.meta.title), date: post.meta.date, content: expand(post, BLOG) };
    const article = fill(postTemplate, vars, BLOG, post.file);
    out.push([path.join(DIST, BLOG, post.slug, "index.html"), render(post, BLOG, article)]);
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  if (fs.existsSync(PUBLIC)) fs.cpSync(PUBLIC, DIST, { recursive: true });
  for (const [file, html] of out) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html + "\n", "utf8");
  }

  console.log(`Built ${pages.length} pages and ${posts.length} posts into dist/`);
}

// ---------- dev server ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const clients = new Set();
const LIVE_RELOAD = `<script>new EventSource("/__livereload").onmessage = () => location.reload();</script>`;

const isFile = (f) => fs.statSync(f, { throwIfNoEntry: false })?.isFile() ?? false;

function respond(res, status, file) {
  const ext = path.extname(file).toLowerCase();
  let data = fs.readFileSync(file);
  if (ext === ".html") data = data.toString().replace("</body>", LIVE_RELOAD + "</body>");
  res.writeHead(status, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(data);
}

function serve() {
  const server = http.createServer((req, res) => {
    if (req.url === "/__livereload") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      return res.end("Bad request");
    }
    const file = path.join(DIST, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath);
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    if (isFile(file)) return respond(res, 200, file);
    // Mirror vercel.json "trailingSlash": true
    if (!path.extname(urlPath) && isFile(path.join(file, "index.html"))) {
      res.writeHead(308, { Location: urlPath + "/" });
      return res.end();
    }
    const notFound = path.join(DIST, "404.html");
    if (isFile(notFound)) return respond(res, 404, notFound);
    res.writeHead(404);
    res.end("Not found");
  });

  server.on("error", (err) => {
    console.error(err.code === "EADDRINUSE" ? `Port ${PORT} already in use` : err.message);
    process.exit(1);
  });
  server.listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}`));
}

function rebuild(retry = true) {
  try {
    build();
    for (const res of clients) res.write("data: reload\n\n");
  } catch (err) {
    // Windows editors briefly lock files while saving
    if (retry && (err.code === "EBUSY" || err.code === "EPERM")) setTimeout(() => rebuild(false), 200);
    else console.error(err.message);
  }
}

function watch() {
  serve();
  rebuild();
  let timer;
  for (const dir of [SRC, PUBLIC]) {
    if (!fs.existsSync(dir)) continue;
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 100);
    });
  }
  console.log("Watching src/ and public/. Press Ctrl+C to stop.");
}

if (process.argv.includes("--watch")) {
  watch();
} else {
  try {
    build();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
