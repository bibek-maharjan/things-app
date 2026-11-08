# Things app — project notes

Read this first when starting a new session. Sister app of `/mnt/jarvis/clothes-app`
and `/mnt/jarvis/purchases-app` (read the Purchases `AGENTS.md` for the background
and the user's preferences). Same approach: no build step, offline PWA, phone
only, data in IndexedDB, manual Export/Import .zip backup.

- v2: select-mode actions moved from a bottom bar to the top right.
- v3: the select button icon is ▣ (was ☑).
- v4: quantity on things (`qty`, default 1). Editor has a "How many" row (− / number / +);
  the list shows a `×N` badge when N > 1. Places have no qty. (Since v8, 0 is allowed.)
  Bulk add always starts at 1 (a trailing `x5` in a line is NOT parsed).
- v5: **minimum needed** (`min`, 0 = none). A thing is low when `min > 0 && qty < min`
  (`isLow()`). Low rows get a light red background (`.row-item.low`) and a red badge
  `×2 · min 5` everywhere (place view, search, ⚠ page). A red **⚠ N** button in the top
  bar (shown only when N > 0, hidden in select mode and on the page itself) opens the
  ⚠ page (`low` flag, `renderLow()`, own history entry so Back leaves it): only low
  things, most short first, each with its 📍 path. Tap a row to edit; select / move /
  delete work there too. Places do not show a warning for low things inside them.
- v6: the minimum field has − / + buttons like "How many". − from 1 (or + from empty) clears /
  starts it; empty = no minimum.
- v7 (user asked for all of a 12-point review, Nov 2026):
  - **Row − / +** on *counted* things (qty > 1 or a min) saves at once (`changeQty()`); tapping
    the stepper never opens the editor. Things with no count show no stepper. Qty still never
    goes below 1. Things without a photo get a small dot (`.ico.none`) so names line up.
  - **Delete has no popup any more**: it deletes, then a toast "Deleted … · Undo" (8 s)
    puts nodes and photos back (`deleteWithUndo()`, `toast()`). Deleting the place you are
    in goes up to its parent.
  - **📍 path in search / ⚠ results is tappable** (`.where`): opens that place and flashes the item.
  - **Search "Only in “place”"** chip (`.scope`, `searchHere`) when searching inside a place;
    resets when you open another place.
  - **Picker "＋ New place here"** (`pickNewPlace()`, uses `prompt()`), then picks it.
  - **Discard check**: editor Cancel / back asks "Discard your changes?" only if something
    changed (`editSnap`, `editorDirty()`); same for typed lines in "Add things".
  - "Turn this into a place" warns when it would drop How many / minimum.
  - **Backup reminder**: last export time in localStorage `things-lastExport`; ⋮ menu shows
    "Last backup: …"; red dot on ⋮ when there is data and no export for 7+ days (`BACKUP_DAYS`).
  - **Import check**: rejects non-zip files and other apps' backups (every node needs `id`,
    `kind` place/thing, `name`) with a plain message.
  - **Failed saves are no longer silent**: `db.js` rejects on `tx.onabort` (full storage), and a
    global `unhandledrejection` handler shows an alert.
  - **Update notice**: when a new service worker takes over, a toast offers Reload (checks for
    updates when the app comes back to the screen).
  - Select button reads "▣ Select".
- v8: **"How many" can be 0** (all used up). Editor − and row − stop at 0; an empty box
  saves as 1 (`qtyValue()`). Any count other than 1 shows the badge and row − / +. Rows at ×0
  get `.zero`: grey name, hollow dot, dashed grey badge (beats the red low badge; the red row
  background stays). Rows changed with − / + keep their buttons (`stepped`) until you open
  another place, so going 0 → 1 doesn't make them vanish. Test: `tests/zero.js`.
- v9: list photos (`.row-item .ico`) are bigger: default 72px (was 44px).
- v10: **Photo size slider** in the ⋮ menu (40–160px, live). Sets CSS var `--ico` on `<html>`;
  saved in localStorage `things-iconSize`; "Reset photo size" goes back to 72. List view only (no gallery).
- v11: keyboard fix. With the keyboard open, Android used to pan the view down to the fixed
  search bar, hiding the results above (had to scroll up). The viewport meta now has
  `interactive-widget=resizes-content`, so the page shrinks above the keyboard. Same fix in
  Clothes (v10) and Purchases (v20). Not deployed yet; only the user can test it (needs a real keyboard).
- Status: **deployed (Nov 2026, v10).**
- Live: https://bibek-maharjan.github.io/things-app/
- Repo: https://github.com/bibek-maharjan/things-app (public, Pages from `main`, root).
  GitHub account **bibek-maharjan** only. **Deploy only when the user asks.**
  Bump `VERSION` in `sw.js` on every change (now `things-v11`).
- Deploy: `git commit -am "..." && git push`; Pages rebuilds in about a minute. Check with
  `gh api repos/bibek-maharjan/things-app/pages/builds/latest`.
  (Set up with `gh repo create bibek-maharjan/things-app --public --source=. --push`, then
  `gh api -X POST repos/bibek-maharjan/things-app/pages -f 'source[branch]=main' -f 'source[path]=/'`.)

## Why this exists

The user keeps track of where physical things are (drawers, boxes, bags, cupboards)
in Obsidian: one note per place or box, one line per thing, `[[links]]` for a box
inside another place, photos embedded. To find something they search all files and
read which note it is in. Old notes: `/home/bibek/Downloads/Things` (~50 notes, 8
images, a few photo-only notes like `Hammer.md`). Nepali words are mixed in
(daraz = drawer, gharra = compartment, mathi = upper, pachadi = behind, godam =
storeroom, jhola = bag, killa = nail).

## Decisions (from the user, Nov 2026)

- **Places inside places.** A place can sit inside another place
  (Bedroom › Luga daraz › Right side › Small gharra). Moving a box moves everything
  in it. Search shows the full path.
- **Add many things at once**: + → "Add things here" → a text box, one thing per
  line (leading `- `, `* `, `•` are stripped, blank lines skipped).
- **Build the app first, migrate the Obsidian notes after** (not done yet).

## How it works

One kind of record, two `kind`s, in one IndexedDB store `nodes`:

`{ id, kind: 'place' | 'thing', name, parent, created, thumb, photoCount, edited, qty, min }`

- `parent` = the place it is in (`null` = top level). Things should always have a
  place; if a parent is missing the node shows at the top level (`load()`).
- Places sort by name (natural, so "Box 2" < "Box 10"); things keep the order they
  were typed (`created` ascending, +index when added in bulk).
- Photos (any node): full = 1280px q0.75, thumb = 240px q0.7 of the cover (first).
  Stored in store `photos` as an array of Blobs by node id. No rotate/crop yet
  (the Clothes app has them: `turnedCanvas()`, `editPhoto()`, `#cropper`).
- **Screens:** top bar = breadcrumb (tap any step); list shows Places then Things of
  the current place; place photos in a strip under the bar; ✎ edits the place;
  ▣ select mode (checkboxes; the top bar shows `N selected` and, top right,
  All / Move / 🗑 / ✕; the search bar stays, so you can search, then select results). The bottom search bar is the same as the other apps.
- **Search** (`matchesAll()`): split on spaces; every word must appear in the name
  **or in the place names above it** (so `kitchen soda` works). `pen drive` and
  `pendrive` find each other (`compact()`). Name matches sort first, then places,
  then by name. Results show `📍 full › path`; tapping a thing opens its editor, a
  place opens it. 100 results at a time (`#more` + IntersectionObserver).
- **Editor** (`#editor`, one dialog for places and things): name, "Inside" (opens
  the place picker), photos, "Turn this into a place" (things only), Delete
  (deleting a place deletes everything inside, with a count in the confirm).
- **Place picker** (`#picker`): browse down with rows (tap a row to go in, **Pick**
  button to choose it), crumbs, or type to search all places. Excludes the moved
  place and everything inside it. Things can't go to the top level.
- Android back button goes up a place (`history.pushState` per place, `popstate`).
- The + button opens a menu inside a place; at the top level it goes straight to
  "New place".

## Backup format

Export = `data.json` (array of nodes without `thumb`) + `photos/<id>.jpg`,
`<id>-2.jpg`, ... (store-only zip, `zip.js`). Import replaces by `id`, never
duplicates, and rebuilds thumbs. **A migration script should write this same
format** (use uuid5 of the note file name for ids so re-importing replaces).

## Shared website — important

All the apps live on `bibek-maharjan.github.io`, so they share localStorage,
IndexedDB and Cache Storage. Hence DB name `things`, cache names `things-v<N>`,
and `sw.js` deletes only its own old caches. Keep it that way.

## Files

`index.html`, `app.js`, `db.js` (stores `nodes`, `photos`), `zip.js` (copied from
Clothes), `sw.js`, `style.css`, `manifest.json`, icons (made with PIL: teal box +
magnifier).

## Testing

- Local server: `python3 -m http.server 8933` in this folder. Open it as
  `http://127.0.0.1:8933` (`localhost` resolved to IPv6 and was refused).
- Headless Brave test script that covers add / search / move / edit / photo /
  export / delete / import: `node tests/e2e.js` (also `tests/qty.js` for quantities, `tests/low.js` for minimums and the ⚠ page, `tests/v7.js` for the v7 features) (start the server first; it writes
  screenshots to `/tmp/opencode/`). It uses
  `require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright')`
  and `chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true })`.
- Camera on a real phone can only be tested by the user.
- Saving with a photo takes ~1.3 s in headless Brave: wait for `#editor:not([open])`, not a fixed time.

## Ideas not built yet (only if the user asks)

Rotate/crop photos, edit a place's things as one text box, "recent" things, the
Obsidian migration script.

## User preferences

- Explain simply, one solution, small digestible chunks.
- Ask before big decisions; build one thing at a time. Never commit, push or deploy
  unless asked.
