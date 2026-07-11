# Setlist — Worship Planner

A PWA for managing a church's worship songs and setlists, shared across a
whole group. Sign in with Google, and everyone in your group sees the same
song library and setlists — an **admin** curates the songs, and every
member can build and manage their own setlists. No build step: plain
HTML/CSS/JS, backed by Firebase (Authentication + Firestore).

## Run it locally

Any static file server works. From this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your phone's browser (or your computer's,
for testing). On a phone, use **Add to Home Screen** (Safari) or the install
prompt (Chrome/Android) to install it as an app.

You'll need your own Firebase project's config in `js/firebase-config.js`
(see below) for sign-in and data to work — the app renders a sign-in screen
but nothing else without it.

## Firebase setup

This app needs a Firebase project with **Authentication** (Google Sign-In
provider enabled) and **Firestore** turned on.

1. Create a Firebase project, enable Google Sign-In under Authentication,
   and add your deployed origin (and `localhost` for local testing) to
   Authentication's authorized domains.
2. Copy your project's web app config into `js/firebase-config.js` as
   `window.FIREBASE_CONFIG` (this is a public client key, safe to commit —
   Firestore's security rules are the real access boundary, not this key).
3. Publish `firestore.rules` (in this repo, for reference) to your project
   in the Firebase console — Firestore → Rules → paste → Publish. This repo
   copy does **not** auto-deploy; you must paste it in yourself whenever it
   changes.
4. Create the first group and its admin by hand (there's no self-serve
   "create a group" flow — see **Groups & roles** below): add a `/groups/{id}`
   document, then a `/users/{yourUid}` document with `role: "admin"` and
   `groupId` pointing at it.

## Deploy it for real use

Upload this whole folder as-is to any static host — **GitHub Pages**,
**Netlify**, or **Vercel** all work, no build step required. Once deployed
over HTTPS, visit the URL on your phone and add it to your home screen. The
app shell (not the data) then works offline, via the service worker.

## Groups & roles

- **Sign-in** is Google-only. A brand-new sign-in with no profile lands on
  a "join your group" screen where they redeem an **invite code**.
- **Groups**: every song and setlist belongs to exactly one group; everyone
  in a group sees all of that group's songs and setlists. There's no
  self-serve way to create a new group or switch between groups — the app
  owner creates each group by hand, enforced by `firestore.rules` denying
  `/groups` writes outright.
- **Admin**: curates the shared song library (only admins can add/edit/
  delete songs), can edit or delete *any* setlist in the group, and can
  generate invite codes and promote/demote other members ("Manage members"
  in the account menu, under the tab's kebab menu).
- **Regular user**: can't add/edit/delete songs, and can only create/edit/
  delete their *own* setlists — someone else's (or an admin's) setlist opens
  read-only. A setlist's "band name" is locked to their Google account name;
  an admin's is editable but prepopulated the same way.
- All of this is enforced server-side in `firestore.rules`, not just hidden
  in the UI — the UI hiding is for a clean experience, not the security
  boundary.

## Features

**Songs tab** (library shared by the whole group)
- Add, edit, delete songs with title, key, tempo, a link (chord chart,
  video, audio), a pace (Slow/Medium/Fast, shown as a colored accent), and
  an age group (Youth / Congregation / All ages)
- Search by title; filter by pace and by age group independently — an
  All-ages-tagged (or untagged) song matches both the Youth and
  Congregation filters, not just its own
- A–Z index scrubber for fast scrolling through a long list
- Swipe a song right to add it to a setlist; admins can also swipe left to
  edit it
- Import songs from JSON; export all songs to JSON; delete all songs
  (admin-only, requires typing `DELETE` to confirm)

**Setlists tab**
- Create, edit, delete setlists — your own only, unless you're an admin
- Date-based naming, with a Sunday-only AM/PM service toggle that also
  drives a "Duminică" day filter (matching either service)
- Filter by day or by band name
- Add songs by reference (editing a song's details updates it everywhere
  it's used) or free-text entries (announcements, scripture readings,
  section headers, etc.)
- Drag to reorder items; swipe an item to edit or delete it
- Override a song's key per setlist entry without changing the song's own
  default key
- Share a setlist as text two ways: the full setlist, or just the songs
  with their saved links underneath each one
- Import setlists from JSON; export all setlists to JSON; delete all
  setlists (admin-only, requires typing `DELETE` to confirm)

**Both tabs**
- A "Refresh" option in the kebab menu re-fetches from Firestore, since
  there are no live listeners — useful if someone else in the group just
  changed something
- Account menu: invite people, manage members (admins), sign out

## Data

All songs and setlists live in Firestore, scoped to your group — nothing is
stored per-device anymore. That means everyone in the group always sees the
same data, but it also means an internet connection is required (the
service worker only caches the app shell for fast loading/offline install,
not your Firestore data). Use each tab's **Export all as JSON** periodically
as a backup.

## Project structure

```
index.html                Entry point
styles.css                 All styling (design tokens at the top)
manifest.webmanifest        PWA install metadata
service-worker.js          App-shell offline caching (bypasses Firebase/
                             Google API traffic — never caches your data)
firestore.rules             Security rules (reference copy — publish to
                             the Firebase console manually, see above)
js/firebase-config.js        Your Firebase project's public web config
js/auth.js                    Firebase Auth + user profile (role, group)
js/db.js                       Firestore data layer (songs, setlists)
js/utils.js                     DOM helpers, JSON parsing, toast, clipboard
js/songs.js                      Songs tab (list, form, import)
js/setlists.js                     Setlists tab (list, builder, export)
js/app.js                           Sign-in/join gating, tab switching,
                                     shared modal/sheet manager
icons/                                App icons (192, 512, maskable 512)
```

No npm install, no bundler — open `index.html` in a browser (via a local
server, not `file://`, since service workers require http/https) and it
runs.
