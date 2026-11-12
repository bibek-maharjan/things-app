const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compact = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const PAGE = 100;
// crypto.randomUUID only exists on https / localhost; the fallback lets a phone test over plain http on Wi-Fi.
const newId = () => crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

// A node is a place (can hold things and other places) or a thing (a line in a place).
let nodes = [];
let byId = new Map();
let kids = new Map();     // parent id (null = top level) -> children
let cur = null;           // the place we are looking at
let low = false;          // showing the ⚠ page (things below their minimum)
let shown = PAGE;         // search results rendered so far
let visibleIds = [];      // ids on screen, for "All" in select mode
let hl = new Set();       // ids to flash after adding / moving
let searchHere = false;   // search only inside the current place
let stepped = new Set();  // rows just changed with − / +: keep their buttons until you leave
let selecting = false;
const selected = new Set();
const thumbUrls = new Map();

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Images ----------
async function resize(file, maxSide, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
}

// Like Promise.all, but only `limit` items are in flight at once (keeps memory sane).
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

function thumbUrl(n) {
  if (!n.thumb) return '';
  if (!thumbUrls.has(n.id)) thumbUrls.set(n.id, URL.createObjectURL(n.thumb));
  return thumbUrls.get(n.id);
}

function showPhotos(box, blobs) {
  for (const img of box.querySelectorAll('img')) URL.revokeObjectURL(img.src);
  box.replaceChildren(...blobs.map(b => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(b);
    return img;
  }));
}

// Full-screen view of photos, one below the other.
function openViewer(blobs) {
  if (!blobs.length) return;
  showPhotos($('#viewerPhotos'), blobs);
  $('#viewer').showModal();
}
$('#viewer').onclick = () => {
  $('#viewer').close();
  showPhotos($('#viewerPhotos'), []);
};

// ---------- Data ----------
// What gets stored (the in-memory nodes also carry search helpers).
const clean = n => ({
  id: n.id, kind: n.kind, name: n.name, parent: n.parent ?? null, created: n.created,
  thumb: n.thumb ?? null, photoCount: n.photoCount ?? 0, edited: n.edited ?? 0, qty: n.qty ?? 1, min: n.min ?? 0,
});

// A thing is low when it has a minimum and "How many" is below it.
const isLow = n => n.kind === 'thing' && n.min > 0 && (n.qty ?? 1) < n.min;

function ancestors(n) {
  const out = [], seen = new Set([n.id]);
  let p = n.parent ? byId.get(n.parent) : null;
  while (p && !seen.has(p.id)) {
    out.unshift(p);
    seen.add(p.id);
    p = p.parent ? byId.get(p.parent) : null;
  }
  return out;
}

// "Bedroom › Luga daraz › Right side" (the place itself included).
function pathText(id) {
  if (!id) return 'Top level';
  const n = byId.get(id);
  return n ? [...ancestors(n), n].map(p => p.name).join(' › ') : 'Top level';
}

function descendants(id) {
  const out = [];
  const walk = pid => {
    for (const k of kids.get(pid) ?? []) {
      out.push(k.id);
      walk(k.id);
    }
  };
  walk(id);
  return out;
}

async function load() {
  nodes = await DB.all();
  byId = new Map(nodes.map(n => [n.id, n]));
  for (const n of nodes) if (n.parent && !byId.has(n.parent)) n.parent = null;
  kids = new Map();
  for (const n of nodes) {
    const k = n.parent ?? null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(n);
  }
  for (const list of kids.values()) {
    list.sort((a, b) => a.kind !== b.kind ? (a.kind === 'place' ? -1 : 1)
      : a.kind === 'place' ? natural.compare(a.name, b.name) : a.created - b.created);
  }
  for (const n of nodes) {
    const path = ancestors(n).map(p => p.name).join(' ');
    n.nameL = n.name.toLowerCase();
    n.pathL = path.toLowerCase();
    n.nameC = compact(n.name);
    n.pathC = compact(path);
  }
  if (cur && !byId.has(cur)) cur = null;
  render();
}

// ---------- Search ----------
// Every word must appear in the name or in the place names above it.
// "pen drive" and "pendrive" find each other.
const parseWords = q => q.toLowerCase().split(/\s+/).filter(Boolean).map(w => ({ w, c: compact(w) }));
const inName = (n, { w, c }) => n.nameL.includes(w) || (c && n.nameC.includes(c));
const inPath = (n, { w, c }) => n.pathL.includes(w) || (c && n.pathC.includes(c));
const matchesAll = (n, words) => words.every(x => inName(n, x) || inPath(n, x));

function mark(text, words) {
  if (!words.length) return esc(text);
  const re = new RegExp('(' + words.map(x => reEsc(x.w)).join('|') + ')', 'gi');
  return text.split(re).map((part, i) => i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
}

// ---------- Rendering ----------
function counts(n) {
  const k = kids.get(n.id) ?? [];
  const places = k.filter(x => x.kind === 'place').length;
  const things = k.length - places;
  const parts = [];
  if (things) parts.push(`${things} ${things === 1 ? 'thing' : 'things'}`);
  if (places) parts.push(`${places} ${places === 1 ? 'place' : 'places'}`);
  return parts.join(' · ') || 'empty';
}

function rowHtml(n, { name, meta, swipe }) {
  const check = selecting ? `<input type="checkbox" class="check" ${selected.has(n.id) ? 'checked' : ''} tabindex="-1">` : '';
  const ico = n.thumb ? `<div class="ico"><img src="${thumbUrl(n)}" alt=""></div>`
    : n.kind === 'place' ? '<div class="ico">📦</div>' : '<div class="ico none"></div>';
  const go = n.kind === 'place' && !selecting ? '<span class="go">›</span>' : '';
  const low = isLow(n);
  const count = n.qty ?? 1;
  const badge = `<span class="qty">×${count}${low ? ` · min ${n.min}` : ''}</span>`;
  // Counted things (more than one, or a minimum) get − / + right on the row.
  const counted = n.kind === 'thing' && (count !== 1 || n.min > 0 || stepped.has(n.id));
  const qty = counted && !selecting
    ? `<div class="step"><button type="button" class="dec${count <= 0 ? ' off' : ''}" aria-label="One less">−</button>${badge}<button type="button" class="inc" aria-label="One more">+</button></div>`
    : counted ? badge : '';
  const zero = n.kind === 'thing' && count === 0;
  // Swipe a row left to show these (main list only, not in select mode).
  const acts = swipe && !selecting
    ? '<div class="acts"><button type="button" class="act-edit">✎ Edit</button><button type="button" class="act-move">Move</button><button type="button" class="act-del danger">🗑 Delete</button></div>'
    : '';
  return `<div class="row-item ${n.kind}${low ? ' low' : ''}${zero ? ' zero' : ''}" data-id="${n.id}">${check}${ico}` +
    `<div class="info"><div class="name">${name}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>${qty}${go}${acts}</div>`;
}

// "📍 Bedroom › Luga daraz", tappable: opens that place.
const whereHtml = n => `<span class="where" data-go="${n.parent ?? ''}">📍 ${esc(pathText(n.parent))}</span>`;

function renderCrumbs(extra) {
  const chain = cur && !extra ? [...ancestors(byId.get(cur)), byId.get(cur)] : [];
  const parts = [];
  if (!chain.length && !extra) parts.push('<button data-go="" class="current">🏠 Things</button>');
  else {
    parts.push('<button data-go="" aria-label="Top level">🏠</button>');
    chain.forEach((p, i) => parts.push(`<span class="sep">›</span><button data-go="${p.id}"${!extra && i === chain.length - 1 ? ' class="current"' : ''}>${esc(p.name)}</button>`));
    if (extra) parts.push(`<span class="sep">›</span><button class="current">${extra}</button>`);
  }
  $('#crumbs').innerHTML = parts.join('');
  $('#crumbs').scrollLeft = 1e6;
  $('#editPlaceBtn').hidden = !cur || !!extra || selecting;
}

$('#crumbs').onclick = e => {
  const b = e.target.closest('button[data-go]');
  if (b) open(b.dataset.go || null);
};

let photoKey = '';
let photoToken = 0;
async function renderPhotoRow(searching) {
  const place = !searching && cur ? byId.get(cur) : null;
  const key = place && place.photoCount ? `${place.id}:${place.edited}` : '';
  if (key === photoKey) return;
  photoKey = key;
  const token = ++photoToken;
  if (!key) {
    showPhotos($('#photoRow'), []);
    return;
  }
  const blobs = await DB.getPhotos(place.id);
  if (token === photoToken) showPhotos($('#photoRow'), blobs);
}
$('#photoRow').onclick = async () => {
  if (cur) openViewer(await DB.getPhotos(cur));
};

function renderBrowse() {
  const list = kids.get(cur) ?? [];
  const places = list.filter(n => n.kind === 'place');
  const things = list.filter(n => n.kind === 'thing');
  visibleIds = list.map(n => n.id);
  let html = '';
  if (places.length) {
    html += '<div class="label-row">Places</div>' + places.map(n => rowHtml(n, { name: esc(n.name), meta: counts(n), swipe: true })).join('');
  }
  if (things.length) {
    html += `<div class="label-row">Things · ${things.length}</div>` + things.map(n => rowHtml(n, { name: esc(n.name), swipe: true })).join('');
  }
  if (!list.length) {
    html = cur
      ? '<div class="empty">Nothing here yet.<br>Tap <b>+</b> to add things or a place inside it.</div>'
      : '<div class="empty">No places yet.<br>Tap <b>+</b> to add your first place, like “Bedroom” or “Store room”.</div>';
  }
  $('#list').innerHTML = html;
  $('#more').textContent = '';
}

function renderSearch(q) {
  const words = parseWords(q);
  let pool = nodes;
  if (cur && searchHere) {
    const inside = new Set(descendants(cur));
    pool = nodes.filter(n => inside.has(n.id));
  }
  const found = pool.filter(n => matchesAll(n, words))
    .map(n => [words.every(x => inName(n, x)) ? 0 : 1, n])
    .sort((a, b) => a[0] - b[0] || (a[1].kind !== b[1].kind ? (a[1].kind === 'place' ? -1 : 1) : 0)
      || natural.compare(a[1].name, b[1].name))
    .map(x => x[1]);
  visibleIds = found.slice(0, shown).map(n => n.id);
  renderCrumbs(`🔍 ${found.length} ${found.length === 1 ? 'result' : 'results'}`);
  const scope = cur && byId.has(cur)
    ? `<button type="button" class="scope${searchHere ? ' on' : ''}">${searchHere ? '✓ ' : ''}Only in “${esc(byId.get(cur).name)}”</button>`
    : '';
  $('#list').innerHTML = scope + (found.length
    ? found.slice(0, shown).map(n => rowHtml(n, { name: mark(n.name, words), meta: whereHtml(n), swipe: true })).join('')
    : '<div class="empty">Nothing found.</div>');
  $('#more').textContent = found.length > shown ? `Showing ${shown} of ${found.length}…` : '';
}

// The ⚠ page: only things below their minimum, the most short first.
function renderLow() {
  const found = nodes.filter(isLow)
    .sort((a, b) => (b.min - (b.qty ?? 1)) - (a.min - (a.qty ?? 1)) || natural.compare(a.name, b.name));
  visibleIds = found.map(n => n.id);
  renderCrumbs(`⚠ ${found.length} low`);
  $('#list').innerHTML = found.length
    ? found.map(n => rowHtml(n, { name: esc(n.name), meta: whereHtml(n), swipe: true })).join('')
    : '<div class="empty">Nothing is below its minimum.</div>';
  $('#more').textContent = '';
}

function render() {
  const q = $('#search').value.trim();
  document.body.classList.toggle('selecting', selecting);
  const lowCount = nodes.filter(isLow).length;
  $('#lowBtn').textContent = `⚠ ${lowCount}`;
  $('#lowBtn').hidden = !lowCount || low;
  if (q) renderSearch(q);
  else if (low) renderLow();
  else {
    renderCrumbs();
    renderBrowse();
  }
  renderPhotoRow(!!q || low);
  updateSelBar();
  updateBackupInfo();
  if (hl.size) {
    let last;
    for (const id of hl) {
      const el = $('#list').querySelector(`[data-id="${id}"]`);
      if (el) { el.classList.add('flash'); last = el; }
    }
    last?.scrollIntoView({ block: 'center' });
    hl = new Set();
  }
}

new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && $('#more').textContent) {
    shown += PAGE;
    render();
  }
}).observe($('#more'));

// ---------- Navigation ----------
function open(id) {
  $('#search').value = '';
  selecting = false;
  selected.clear();
  shown = PAGE;
  searchHere = false;
  stepped = new Set();
  if (id !== cur || low) history.pushState({ cur: id }, '');
  cur = id;
  low = false;
  window.scrollTo(0, 0);
  render();
}

function openLow() {
  $('#search').value = '';
  selecting = false;
  selected.clear();
  low = true;
  history.pushState({ cur, low: true }, '');
  render();
  window.scrollTo(0, 0);
}
$('#lowBtn').onclick = openLow;

history.replaceState({ cur: null }, '');
window.onpopstate = e => {
  cur = e.state?.cur ?? null;
  low = !!e.state?.low;
  searchHere = false;
  stepped = new Set();
  $('#search').value = '';
  selecting = false;
  selected.clear();
  render();
};

// − / + on a row: save the new count right away.
async function changeQty(n, by) {
  const qty = Math.max(0, (n.qty ?? 1) + by);
  if (qty === (n.qty ?? 1)) return;
  n.qty = qty;
  stepped.add(n.id);
  render();
  try {
    await DB.putMany([clean(n)]);
  } catch (err) {
    alert('Could not save the new count.\n\n' + err.message);
    await load();
  }
}

// ---------- Swipe a row left: Edit / Move / Delete ----------
let swipeRow = null;   // the row that is open now
let drag = null;       // the finger on a row: { row, x, y, base, width, moving }
let justSwiped = false;
const slide = (row, x) => { row.style.transform = x ? `translateX(${x}px)` : ''; };
function closeSwipe() {
  if (swipeRow?.isConnected) slide(swipeRow, 0);
  swipeRow = null;
}

$('#list').addEventListener('pointerdown', e => {
  justSwiped = false;
  const row = e.target.closest('.row-item');
  const acts = row?.querySelector('.acts');
  if (!acts || !e.isPrimary) { drag = null; return; }
  const open = row === swipeRow;
  drag = { row, x: e.clientX, y: e.clientY, base: open ? -acts.offsetWidth : 0, width: acts.offsetWidth, moving: false };
});
$('#list').addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moving) {
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
    drag.moving = true;
    if (swipeRow && swipeRow !== drag.row) closeSwipe();
    drag.row.classList.add('dragging');
    drag.row.setPointerCapture(e.pointerId);
  }
  drag.at = Math.min(0, Math.max(-drag.width, drag.base + dx));
  slide(drag.row, drag.at);
});
function endDrag(e) {
  if (!drag) return;
  const { row, moving, base, width, at } = drag;
  drag = null;
  if (!moving) return;
  row.classList.remove('dragging');
  justSwiped = true;
  const moved = e.type === 'pointercancel' ? 0 : at - base;
  // Open after a short pull left; close after a short push right.
  const open = base ? moved < 40 : moved < -40;
  if (open) { swipeRow = row; slide(row, -width); }
  else { if (swipeRow === row) swipeRow = null; slide(row, 0); }
}
$('#list').addEventListener('pointerup', endDrag);
$('#list').addEventListener('pointercancel', endDrag);

$('#list').onclick = e => {
  // The tap that ends a swipe is not a tap on the row.
  if (justSwiped) { justSwiped = false; return; }
  // With a row open, a tap anywhere else just closes it.
  if (swipeRow?.isConnected && !e.target.closest('.acts')) { closeSwipe(); return; }
  if (e.target.closest('.scope')) {
    searchHere = !searchHere;
    shown = PAGE;
    render();
    return;
  }
  const row = e.target.closest('.row-item');
  if (!row) return;
  const n = byId.get(row.dataset.id);
  if (!n) return;
  const act = e.target.closest('.acts button');
  if (act) {
    closeSwipe();
    if (act.classList.contains('act-edit')) openEditor(n);
    else if (act.classList.contains('act-move')) moveNodes([n.id]);
    else deleteNode(n);
    return;
  }
  if (!selecting && e.target.closest('.step')) {
    const b = e.target.closest('.dec, .inc');
    if (b) changeQty(n, b.classList.contains('inc') ? 1 : -1);
    return;
  }
  if (!selecting && e.target.closest('.where')) {
    hl = new Set([n.id]);
    open(e.target.closest('.where').dataset.go || null);
    return;
  }
  if (selecting) {
    selected.has(n.id) ? selected.delete(n.id) : selected.add(n.id);
    const box = row.querySelector('.check');
    if (box) box.checked = selected.has(n.id);
    updateSelBar();
  } else if (e.target.closest('.ico img') && n.photoCount) {
    DB.getPhotos(n.id).then(openViewer);
  } else if (n.kind === 'place') {
    open(n.id);
  } else {
    openEditor(n);
  }
};

// Search: show / hide the + button while typing.
$('#search').oninput = () => { shown = PAGE; render(); };
$('#search').onfocus = () => document.body.classList.add('searching');
$('#search').onblur = () => document.body.classList.remove('searching');
$('#search').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

// Closing the keyboard with Android's back button keeps the box focused (and
// the + button hidden). The screen grows back when the keyboard closes: blur then.
let fullHeight = visualViewport.height, keyboardOpen = false;
visualViewport.addEventListener('resize', () => {
  const h = visualViewport.height;
  if (document.activeElement !== $('#search')) { fullHeight = h; keyboardOpen = false; return; }
  if (h < fullHeight - 150) keyboardOpen = true;
  else if (keyboardOpen) { keyboardOpen = false; $('#search').blur(); }
});

// ---------- Add things (one per line) ----------
const parseLines = text => text.split(/\r?\n/).map(l => l.replace(/^[\s\-*•·]+/, '').trim()).filter(Boolean);

$('#addBtn').onclick = () => cur ? $('#addMenu').showModal() : openEditor(null, 'place');
$('#closeAdd').onclick = () => $('#addMenu').close();
$('#addPlaceBtn').onclick = () => { $('#addMenu').close(); openEditor(null, 'place'); };
$('#addThingsBtn').onclick = () => {
  $('#addMenu').close();
  $('#addTitle').textContent = 'Add to ' + pathText(cur);
  $('#addText').value = '';
  updateAddCount();
  $('#addThings').showModal();
};

function updateAddCount() {
  const n = parseLines($('#addText').value).length;
  $('#addSubmit').textContent = n ? `Add ${n}` : 'Add';
  $('#addSubmit').disabled = !n;
}
$('#addText').oninput = updateAddCount;
const keepTyped = () => parseLines($('#addText').value).length > 0 && !confirm('Discard what you typed?');
$('#addCancel').onclick = () => { if (!keepTyped()) $('#addThings').close(); };
$('#addThings').oncancel = e => { if (keepTyped()) e.preventDefault(); };

$('#addForm').onsubmit = async e => {
  e.preventDefault();
  const lines = parseLines($('#addText').value);
  if (!lines.length) return;
  const now = Date.now();
  const list = lines.map((name, i) => ({
    node: { id: newId(), kind: 'thing', name, parent: cur, created: now + i, thumb: null, photoCount: 0, edited: 0, qty: 1, min: 0 },
  }));
  await DB.saveMany(list);
  hl = new Set(list.map(x => x.node.id));
  $('#addThings').close();
  await load();
};

// ---------- Editor (a place or a thing) ----------
let editing = null, editKind = 'thing', editParent = null;
let editPhotos = [], photosChanged = false;
let editSnap = '';   // the form as it was when opened, to spot unsaved changes
const editState = () => JSON.stringify([$('#nameInput').value.trim(), qtyValue(), minValue(), editParent]);
const editorDirty = () => photosChanged || editState() !== editSnap;

function renderStrip() {
  $('#photoStrip').replaceChildren(...editPhotos.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'thumb';
    el.innerHTML = `<img src="${p.url}" alt=""><button type="button" class="del" aria-label="Remove photo">×</button>`;
    el.querySelector('img').onclick = () => openViewer(editPhotos.map(x => x.full));
    el.querySelector('.del').onclick = () => {
      URL.revokeObjectURL(p.url);
      editPhotos.splice(i, 1);
      photosChanged = true;
      renderStrip();
    };
    return el;
  }));
  $('#photoHint').hidden = editPhotos.length > 0;
}

function clearStrip() {
  for (const p of editPhotos) URL.revokeObjectURL(p.url);
  editPhotos = [];
  photosChanged = false;
  $('#photoHint').textContent = 'No photo';
  renderStrip();
}

function updateInside() {
  $('#insideBtn').textContent = '📍 ' + pathText(editParent);
}

async function openEditor(node, kind = node?.kind) {
  editing = node;
  editKind = kind;
  editParent = node ? node.parent ?? null : cur;
  clearStrip();
  $('#nameInput').value = node?.name ?? '';
  $('#editTitle').textContent = node ? (kind === 'place' ? 'Edit place' : 'Edit thing') : 'New place';
  $('#deleteBtn').hidden = !node;
  $('#toPlaceBtn').hidden = !(node && kind === 'thing');
  $('#qtyBox').hidden = kind !== 'thing';
  $('#qtyInput').value = node?.qty ?? 1;
  $('#minInput').value = node?.min > 0 ? node.min : '';
  updateInside();
  editSnap = editState();
  $('#editor').showModal();
  $('#editor').scrollTop = 0;
  if (node?.photoCount) {
    const saved = (await DB.getPhotos(node.id)).map(full => ({ full, url: URL.createObjectURL(full) }));
    editPhotos = [...saved, ...editPhotos];
    renderStrip();
  }
}
$('#editPlaceBtn').onclick = () => openEditor(byId.get(cur));

$('#insideBtn').onclick = () => {
  const isPlace = editKind === 'place';
  const exclude = new Set(isPlace && editing ? [editing.id, ...descendants(editing.id)] : []);
  openPicker({
    title: isPlace ? 'Put this place inside…' : 'Move to…',
    exclude, allowRoot: isPlace, start: editParent,
    onPick: id => { editParent = id; updateInside(); },
  });
};

// Adds a photo to the editor (Camera, Upload, or Paste).
async function usePhoto(file) {
  $('#photoHint').hidden = false;
  $('#photoHint').textContent = 'Compressing…';
  try {
    const full = await resize(file, 1280, 0.75);
    editPhotos.push({ full, url: URL.createObjectURL(full) });
    photosChanged = true;
  } catch {
    alert('Could not read that image');
  }
  $('#photoHint').textContent = 'No photo';
  renderStrip();
}

for (const id of ['#cameraInput', '#uploadInput']) {
  $(id).onchange = e => {
    if (e.target.files[0]) usePhoto(e.target.files[0]);
    e.target.value = '';
  };
}

if (navigator.clipboard?.read) {
  $('#pasteBtn').onclick = async () => {
    try {
      for (const entry of await navigator.clipboard.read()) {
        const type = entry.types.find(t => t.startsWith('image/'));
        if (type) return usePhoto(await entry.getType(type));
      }
      alert('No image in clipboard');
    } catch {
      alert('Could not paste. Allow clipboard access and try again.');
    }
  };
} else {
  $('#pasteBtn').hidden = true;
}

document.addEventListener('paste', e => {
  if (!$('#editor').open) return;
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); usePhoto(file); }
});

// 0 is allowed (all used up); an empty box means the default, 1.
const qtyValue = () => {
  const v = $('#qtyInput').value.trim();
  return v === '' ? 1 : Math.max(0, Math.floor(Number(v)) || 0);
};
$('#qtyMinus').onclick = () => { $('#qtyInput').value = Math.max(0, qtyValue() - 1); };
$('#qtyPlus').onclick = () => { $('#qtyInput').value = qtyValue() + 1; };

// Minimum: empty (or 0) means no minimum, so − from 1 clears the box.
const minValue = () => Math.max(0, Math.floor(Number($('#minInput').value)) || 0);
const setMin = v => { $('#minInput').value = v > 0 ? v : ''; };
$('#minMinus').onclick = () => setMin(minValue() - 1);
$('#minPlus').onclick = () => setMin(minValue() + 1);

$('#toPlaceBtn').onclick = () => {
  const q = qtyValue(), m = minValue();
  if ((q !== 1 || m > 0) && !confirm(`Places don't have a count, so ${[q !== 1 && `“How many” (${q})`, m > 0 && `the minimum (${m})`].filter(Boolean).join(' and ')} will be removed. Continue?`)) return;
  editKind = 'place';
  $('#form').requestSubmit();
};

$('#form').onsubmit = async e => {
  e.preventDefault();
  const name = $('#nameInput').value.trim();
  if (!name) return;
  const node = {
    id: editing?.id ?? newId(),
    kind: editKind,
    name,
    parent: editParent,
    created: editing?.created ?? Date.now(),
    thumb: editing?.thumb ?? null,
    photoCount: editing?.photoCount ?? 0,
    edited: editing?.edited ?? 0,
    qty: editKind === 'thing' ? qtyValue() : 1,
    min: editKind === 'thing' ? minValue() : 0,
  };
  if (photosChanged) {
    node.thumb = editPhotos[0] ? await resize(editPhotos[0].full, 240, 0.7) : null;
    node.photoCount = editPhotos.length;
    node.edited = Date.now();
  }
  await DB.save(node, photosChanged ? editPhotos.map(p => p.full) : undefined);
  thumbUrls.delete(node.id);
  if (!editing || editing.parent !== editParent) hl = new Set([node.id]);
  $('#editor').close();
  await load();
};

$('#editor').onclose = clearStrip;
const keepEdits = () => editorDirty() && !confirm('Discard your changes?');
$('#cancelBtn').onclick = () => { if (!keepEdits()) $('#editor').close(); };
$('#editor').oncancel = e => { if (keepEdits()) e.preventDefault(); };

function deleteMessage(ids) {
  const list = ids.map(id => byId.get(id)).filter(Boolean);
  const places = list.filter(n => n.kind === 'place').length;
  const things = list.length - places;
  if (list.length === 1) return `Delete "${list[0].name}"?`;
  const parts = [];
  if (places) parts.push(`${places} ${places === 1 ? 'place' : 'places'}`);
  if (things) parts.push(`${things} ${things === 1 ? 'thing' : 'things'}`);
  return `Delete ${parts.join(' and ')}?`;
}

// ---------- Toast (a bar at the bottom with one action) ----------
let toastTimer;
function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
}
// ms = 0 keeps it until the button is tapped.
function toast(text, label, action, ms = 8000) {
  clearTimeout(toastTimer);
  $('#toastText').textContent = text;
  $('#toastBtn').textContent = label;
  $('#toastBtn').onclick = () => { hideToast(); action(); };
  $('#toast').hidden = false;
  if (ms) toastTimer = setTimeout(hideToast, ms);
}

// Deletes right away (no popup); the toast's Undo puts everything back, photos too.
async function deleteWithUndo(ids) {
  const list = ids.map(id => byId.get(id)).filter(Boolean);
  const backup = await Promise.all(list.map(async n =>
    ({ node: clean(n), photos: n.photoCount ? await DB.getPhotos(n.id) : undefined })));
  const msg = deleteMessage(ids).replace(/^Delete/, 'Deleted').replace(/\?$/, '');
  await DB.removeMany(ids);
  for (const id of ids) thumbUrls.delete(id);
  await load();
  toast(msg, 'Undo', async () => {
    await DB.saveMany(backup);
    const gone = new Set(ids);
    hl = new Set(list.filter(n => !gone.has(n.parent)).map(n => n.id));
    await load();
  });
}

async function deleteNode(n) {
  const ids = [n.id, ...descendants(n.id)];
  // Deleting the place you are in: go up to its parent.
  if (ids.includes(cur)) {
    cur = n.parent ?? null;
    history.replaceState({ cur }, '');
  }
  await deleteWithUndo(ids);
}

$('#deleteBtn').onclick = async () => {
  $('#editor').close();
  await deleteNode(editing);
};

// ---------- Place picker (for moving) ----------
let pk = null;

function openPicker(opts) {
  pk = { exclude: new Set(), allowRoot: false, start: null, ...opts, at: opts.start ?? null };
  if (pk.at && (!byId.has(pk.at) || pk.exclude.has(pk.at))) pk.at = null;
  $('#pickTitle').textContent = pk.title;
  $('#pickSearch').value = '';
  renderPicker();
  $('#picker').showModal();
}

function choose(id) {
  $('#picker').close();
  pk.onPick(id);
}

function renderPicker() {
  const q = $('#pickSearch').value.trim();
  const list = $('#pickList');
  if (q) {
    const words = parseWords(q);
    const hits = nodes.filter(n => n.kind === 'place' && !pk.exclude.has(n.id) && matchesAll(n, words))
      .sort((a, b) => natural.compare(pathText(a.id), pathText(b.id))).slice(0, 50);
    $('#pickCrumbs').replaceChildren();
    $('#pickHere').hidden = true;
    list.innerHTML = hits.length ? hits.map(n => rowHtml(n, { name: esc(n.name), meta: '📍 ' + esc(pathText(n.parent)) })
      .replace('<span class="go">›</span>', '')).join('') : '<div class="empty">No place found.</div>';
    list.onclick = e => {
      const row = e.target.closest('.row-item');
      if (row) choose(row.dataset.id);
    };
    return;
  }
  const chain = pk.at ? [...ancestors(byId.get(pk.at)), byId.get(pk.at)] : [];
  $('#pickCrumbs').innerHTML = '<button data-go="">🏠</button>' +
    chain.map(p => `<span class="sep">›</span><button data-go="${p.id}">${esc(p.name)}</button>`).join('');
  const places = (kids.get(pk.at) ?? []).filter(n => n.kind === 'place' && !pk.exclude.has(n.id));
  list.innerHTML = '<button type="button" class="new-place">＋ New place here</button>' + (places.length
    ? places.map(n => rowHtml(n, { name: esc(n.name), meta: counts(n) })
      .replace('<span class="go">›</span>', '<button type="button" class="pick">Pick</button>')).join('')
    : '<div class="empty">No places inside.</div>');
  list.onclick = e => {
    if (e.target.closest('.new-place')) return pickNewPlace();
    const row = e.target.closest('.row-item');
    if (!row) return;
    if (e.target.closest('.pick')) choose(row.dataset.id);
    else { pk.at = row.dataset.id; renderPicker(); }
  };
  const here = pk.at ? `Pick “${byId.get(pk.at).name}”` : 'Pick top level';
  $('#pickHere').textContent = here;
  $('#pickHere').hidden = !pk.at && !pk.allowRoot;
}

// Makes a place where the picker is, then picks it.
async function pickNewPlace() {
  const where = pk.at ? `inside “${byId.get(pk.at).name}”` : 'at the top level';
  const name = prompt(`Name of the new place ${where}:`)?.trim();
  if (!name) return;
  const node = { id: newId(), kind: 'place', name, parent: pk.at, created: Date.now(), thumb: null, photoCount: 0, edited: 0, qty: 1, min: 0 };
  await DB.save(node);
  await load();
  choose(node.id);
}

$('#pickCrumbs').onclick = e => {
  const b = e.target.closest('button[data-go]');
  if (b) { pk.at = b.dataset.go || null; renderPicker(); }
};
$('#pickSearch').oninput = renderPicker;
$('#pickSearch').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
$('#pickHere').onclick = () => choose(pk.at);
$('#pickCancel').onclick = () => $('#picker').close();

// ---------- Select, move, delete ----------
function updateSelBar() {
  $('#selTools').hidden = !selecting;
  const n = selected.size;
  $('#selCount').textContent = n ? `${n} selected` : 'Tap to select';
  $('#selMove').disabled = $('#selDelete').disabled = !n;
  $('#selAll').textContent = visibleIds.length && visibleIds.every(id => selected.has(id)) ? 'None' : 'All';
}

$('#selectBtn').onclick = () => {
  selecting = !selecting;
  selected.clear();
  render();
};
$('#selDone').onclick = () => {
  selecting = false;
  selected.clear();
  render();
};
$('#selAll').onclick = () => {
  const all = visibleIds.every(id => selected.has(id));
  for (const id of visibleIds) all ? selected.delete(id) : selected.add(id);
  render();
};

function moveNodes(idList) {
  const ids = idList.map(id => byId.get(id)).filter(Boolean);
  const exclude = new Set();
  for (const n of ids) if (n.kind === 'place') { exclude.add(n.id); descendants(n.id).forEach(d => exclude.add(d)); }
  openPicker({
    title: ids.length === 1 ? `Move “${ids[0].name}” to…` : `Move ${ids.length} to…`,
    exclude, allowRoot: ids.every(n => n.kind === 'place'), start: cur,
    onPick: async dest => {
      await DB.putMany(ids.map(n => ({ ...clean(n), parent: dest })));
      selecting = false;
      selected.clear();
      hl = new Set(ids.map(n => n.id));
      cur = dest;
      low = false;
      history.pushState({ cur }, '');
      $('#search').value = '';
      await load();
    },
  });
}
$('#selMove').onclick = () => moveNodes([...selected]);

$('#selDelete').onclick = async () => {
  const ids = new Set();
  for (const id of selected) {
    ids.add(id);
    descendants(id).forEach(d => ids.add(d));
  }
  selecting = false;
  selected.clear();
  await deleteWithUndo([...ids]);
};

// ---------- Backup ----------
// Last export date, in localStorage (shared website, hence the "things-" prefix).
const BACKUP_KEY = 'things-lastExport';
const BACKUP_DAYS = 7;
const daysSinceBackup = () => {
  const t = Number(localStorage.getItem(BACKUP_KEY));
  return t ? Math.floor((Date.now() - t) / 864e5) : null;
};
const backupDue = () => nodes.length > 0 && (daysSinceBackup() ?? Infinity) >= BACKUP_DAYS;

function updateBackupInfo() {
  const d = daysSinceBackup();
  const when = d === null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  $('#backupInfo').textContent = (backupDue() ? '⚠ ' : '') + `Last backup: ${when}`;
  $('#backupInfo').classList.toggle('due', backupDue());
  $('#menuBtn').classList.toggle('due', backupDue());
}

// ---------- Photo size (list thumbnails) ----------
const ICON_KEY = 'things-iconSize';
const ICON_DEFAULT = 72;
function setIconSize(px) {
  document.documentElement.style.setProperty('--ico', px + 'px');
  $('#iconSize').value = px;
  $('#iconSizeVal').textContent = px + ' px';
}
setIconSize(Number(localStorage.getItem(ICON_KEY)) || ICON_DEFAULT);
$('#iconSize').oninput = e => {
  setIconSize(Number(e.target.value));
  localStorage.setItem(ICON_KEY, e.target.value);
};
$('#iconSizeReset').onclick = () => {
  localStorage.removeItem(ICON_KEY);
  setIconSize(ICON_DEFAULT);
};

// ---------- Install button ----------
let installEvent = null;
const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const showInstall = () => { $('#installBtn').hidden = !installEvent || isInstalled(); };
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  showInstall();
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  showInstall();
});
$('#installBtn').onclick = async () => {
  if (!installEvent) return;
  const ev = installEvent;
  installEvent = null;
  showInstall();
  ev.prompt();
  await ev.userChoice;
  $('#menu').close();
};

$('#menuBtn').onclick = () => {
  const places = nodes.filter(n => n.kind === 'place').length;
  $('#stats').textContent = `${places} places · ${nodes.length - places} things`;
  updateBackupInfo();
  $('#menu').showModal();
};
$('#closeMenu').onclick = () => $('#menu').close();

$('#exportBtn').onclick = async () => {
  $('#exportBtn').textContent = 'Exporting…';
  const files = [];
  const data = [];
  for (const n of nodes) {
    const { thumb, ...rest } = clean(n);
    data.push(rest);
    if (n.photoCount) {
      (await DB.getPhotos(n.id)).forEach((blob, i) =>
        files.push({ name: `photos/${n.id}${i ? `-${i + 1}` : ''}.jpg`, data: blob }));
    }
  }
  files.unshift({ name: 'data.json', data: new Blob([JSON.stringify(data, null, 1)]) });
  const zip = await Zip.create(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zip);
  a.download = `things-backup-${today()}.zip`;
  a.click();
  localStorage.setItem(BACKUP_KEY, Date.now());
  updateBackupInfo();
  $('#exportBtn').textContent = 'Export backup (.zip)';
};

$('#importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const label = $('#importLabel');
  label.textContent = 'Reading backup…';
  try {
    const notBackup = 'This file is not a Things backup. Pick a file named things-backup-….zip.';
    const entries = await Zip.read(file).catch(() => { throw new Error(notBackup); });
    let data = null;
    try { data = JSON.parse(await entries.get('data.json').text()); } catch {}
    // The other apps on this website also export a data.json, so check the shape.
    const valid = Array.isArray(data) && data.every(n =>
      n && typeof n.id === 'string' && (n.kind === 'place' || n.kind === 'thing') && typeof n.name === 'string');
    if (!valid) throw new Error(notBackup);
    if (!confirm(`Import ${data.length} places and things? Ones with the same ID will be replaced.`)) {
      label.textContent = 'Import backup';
      e.target.value = '';
      return;
    }
    for (let start = 0; start < data.length; start += 50) {
      const chunk = data.slice(start, start + 50);
      const batch = await mapLimit(chunk, 8, async node => {
        // Photos: <id>.jpg (cover), then <id>-2.jpg, <id>-3.jpg, ...
        const photos = [];
        for (let n = 1; ; n++) {
          const blob = entries.get(`photos/${node.id}${n > 1 ? `-${n}` : ''}.jpg`);
          if (!blob) break;
          photos.push(new Blob([blob], { type: 'image/jpeg' }));
        }
        node.thumb = photos[0] ? await resize(photos[0], 240, 0.7) : null;
        node.photoCount = photos.length;
        node.edited = Date.now();
        node.parent ??= null;
        return { node, photos: photos.length ? photos : undefined };
      });
      await DB.saveMany(batch);
      label.textContent = `Importing ${Math.min(start + 50, data.length)} / ${data.length}…`;
      await new Promise(r => setTimeout(r, 0));
    }
    for (const id of thumbUrls.keys()) URL.revokeObjectURL(thumbUrls.get(id));
    thumbUrls.clear();
    photoKey = '';
    alert('Import done');
  } catch (err) {
    alert('Import failed.\n\n' + err.message);
  }
  label.textContent = 'Import backup';
  e.target.value = '';
  $('#menu').close();
  await load();
};

// ---------- Start ----------
// Any failed save (e.g. phone storage full) ends up here instead of failing silently.
window.addEventListener('unhandledrejection', e => {
  alert('Something went wrong, so your last change may not be saved.\n\n' + (e.reason?.message ?? e.reason));
});

load();
if ('serviceWorker' in navigator) {
  // A new version takes over in the background; offer a reload to start using it.
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) toast('A new version is ready', 'Reload', () => location.reload(), 0);
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  });
}
navigator.storage?.persist?.();
