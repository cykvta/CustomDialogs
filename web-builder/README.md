# CustomDialogs Builder

A small, dependency-free web app to build CustomDialogs dialog files visually and
download the ready-to-use `.yml`. No server, no build step — three static files:

```
web-builder/
├── index.html
├── styles.css
└── app.js
```

## Use it locally

Just open `index.html` in a browser. Everything runs client-side; your work is
auto-saved in the browser (localStorage).

## Host it on GitHub Pages

Pick whichever fits your repo:

**Option A — serve the whole repo, app lives in a subfolder**
1. Push this repo to GitHub.
2. Repo → **Settings → Pages**.
3. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Open `https://<user>.github.io/<repo>/web-builder/`.

**Option B — dedicated `docs/` folder (cleanest URL)**
1. Copy the three files into a `docs/` folder at the repo root.
2. Settings → Pages → branch `main`, folder `/docs`.
3. Open `https://<user>.github.io/<repo>/`.

**Option C — `gh-pages` branch**
1. Put the three files at the root of a `gh-pages` branch.
2. Settings → Pages → branch `gh-pages`, folder `/ (root)`.

## What it produces

The **Download .yml** button gives you a file named after the last segment of the
dialog **id/path**. For an id of `menus/main` you get `main.yml`, which goes in:

```
plugins/CustomDialogs/dialogs/menus/main.yml
```

Then in-game: `/customdialogs reload` and `/customdialogs open menus/main`.

## Fields it covers

- **Dialog**: id/path, title, external title, type (`multi_action` / `notice` /
  `confirmation`), columns, after-action (`close` / `none` / `wait`), close-with-ESC.
- **Body**: any number of text lines.
- **Buttons**: label, tooltip, width, permission, and an ordered list of actions —
  `run as player`, `run as console`, `run as op`, `open dialog`, `send message`,
  `broadcast`, `close screen`.

Color codes (`&a`, `&l`, `&#rrggbb`, `#rrggbb`) and PlaceholderAPI `%placeholders%`
are written straight through; the preview renders the colors live.
