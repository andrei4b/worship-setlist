# Setlist — Worship Planner

A pure client-side PWA for managing worship songs and building setlists. No
backend, no account, no build step — everything is stored locally on your
device using IndexedDB.

## Run it locally

Any static file server works. From this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your phone's browser (or your computer's,
for testing). On a phone, use **Add to Home Screen** (Safari) or the install
prompt (Chrome/Android) to install it as an app.

## Deploy it for real use

Upload this whole folder as-is to any static host:

- **GitHub Pages** — push to a repo, enable Pages on the `main` branch
- **Netlify** — drag the folder onto netlify.com/drop
- **Vercel** — `vercel deploy` from this folder, or drag-and-drop in the
  dashboard

No build step is required — it's plain HTML/CSS/JS. Once deployed over
HTTPS, visit the URL on your phone and add it to your home screen. It will
then work fully offline (the service worker caches the app shell).

## Data

All songs and setlists are stored in your browser's IndexedDB, scoped to
this app's origin. That means:

- Data stays on the device — nothing is sent anywhere
- Clearing your browser's site data, or uninstalling the PWA, will erase it
- Use **Import → Export all as JSON** in the Songs tab periodically as a
  backup, since this is your only way to move data between devices or
  recover from accidental data loss

## Features

**Songs tab**
- Add, edit, delete songs with title, key, tempo, link, and a pace (Slow,
  Medium, or Fast — shown as a colored badge: green/yellow/red)
- Search by title, key, pace, or tag
- Sort by title (A–Z / Z–A), key, tempo, or recently added
- Import songs from JSON
- Export all songs to JSON (for backup)

**Setlists tab**
- Create, edit, delete setlists
- Add songs by reference (editing a song's details updates it everywhere
  it's used) or add free-text entries (announcements, scripture readings,
  section headers, etc.)
- Reorder items with up/down controls
- Override a song's key and add setlist-specific notes per entry, without
  changing the song's own default key
- Search setlists by name; sort by most recent, name, or song count
- Copy a setlist to the clipboard as plain text, formatted as
  `Title - Key - Tempo` per line (using the overridden key if set), ready to
  paste into a message or chord chart app

## Project structure

```
index.html              Entry point
styles.css               All styling (design tokens at the top)
manifest.webmanifest      PWA install metadata
service-worker.js        Offline caching
js/db.js                  IndexedDB data layer
js/utils.js                DOM helpers, JSON parsing, toast, clipboard
js/songs.js                 Songs tab (list, form, import)
js/setlists.js               Setlists tab (list, builder, export)
js/app.js                     Tab switching, shared modal/sheet manager
icons/                          App icons (192, 512, maskable 512)
```

No npm install, no bundler — open `index.html` in a browser (via a local
server, not `file://`, since service workers require http/https) and it
runs.
