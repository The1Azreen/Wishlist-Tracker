// Wishlist Tracker: the page. Renders the list, filters, stats and the add/edit dialog, and hands
// every change to the Store (js/store.js), which saves it to this browser or your Google Sheet.

import { CONFIG } from './config.js';
import {
  AVAILABILITY, CATEGORIES, CATEGORY_NAMES, COLUMNS, CONDITIONS, OPEN_STATUSES, PRIORITIES, PRIORITY_RANK, STATUSES,
  categoryOf, huntLinks, newItem, normalize, platformColor, safeUrl,
} from './schema.js';
import { Store } from './store.js';
import * as google from './google.js';
import { createBackup } from './backup.js';
import { SEED, markSeeded, pendingSeed } from './seed.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const today = () => new Date().toISOString().slice(0, 10);
const icon = (cat) => `assets/icons/${(CATEGORIES[cat] || CATEGORIES.Other).icon}.svg`;
const statusClass = (s) => `st-${String(s || 'Wanted').toLowerCase()}`;

// ---- Preferences (filters, view) remembered in this browser ----
const PREFS_KEY = 'wishlist.prefs';
const prefs = {
  category: 'All', status: 'open', priority: '', availability: '', group: 'year', sort: 'priority', view: 'cards', q: '',
  currency: CONFIG.defaultCurrency,
  ...safeParse(localStorage.getItem(PREFS_KEY)),
};
function savePrefs() {
  const { q, ...rest } = prefs; // the search box isn't remembered
  localStorage.setItem(PREFS_KEY, JSON.stringify(rest));
}
function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

const store = new Store();
// Automatic copy in the repo's backups/ folder, when started with run.bat (see js/backup.js).
const backup = createBackup({ getItems: () => store.items, toCsv: (items) => '﻿' + toCsv(items), onChange: () => renderSync() });

// ---------------------------------------------------------------------------------------------
// Filtering, sorting, grouping

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [item.name, item.series, item.maker, item.format, item.edition, item.region, item.notes,
    item.where, item.category, item.status, item.availability, availShort(item), item.release_year].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function passesStatus(item) {
  return prefs.status === 'all' || OPEN_STATUSES.has(item.status);
}

function visibleItems() {
  return store.items.filter((it) =>
    (prefs.category === 'All' || it.category === prefs.category)
    && passesStatus(it)
    && (!prefs.priority || it.priority === prefs.priority)
    && (!prefs.availability || it.availability === prefs.availability)
    && matchesSearch(it, prefs.q));
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const emptyLast = (a, b, f) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || f();
const SORTS = {
  priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || byName(a, b),
  year: (a, b) => emptyLast(a.release_year, b.release_year, () => (b.release_year || 0) - (a.release_year || 0)) || byName(a, b),
  name: byName,
  added: (a, b) => (b.added || '').localeCompare(a.added || '') || (b.updated || '').localeCompare(a.updated || ''),
  price: (a, b) => emptyLast(a.target_price, b.target_price, () => (b.target_price || 0) - (a.target_price || 0)) || byName(a, b),
};

const NONE = '\u0000'; // sorts "no value" groups last
const GROUPS = {
  year: { key: (i) => (i.release_year ? String(i.release_year) : NONE), label: (k) => (k === NONE ? 'Year unknown' : k),
    order: (a, b) => (a === NONE) - (b === NONE) || Number(b) - Number(a) },
  category: { key: (i) => i.category || 'Other', label: (k) => k, ico: (k) => k,
    order: (a, b) => CATEGORY_NAMES.indexOf(a) - CATEGORY_NAMES.indexOf(b) },
  series: { key: (i) => i.series || NONE, label: (k) => (k === NONE ? 'No series' : k),
    order: (a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b) },
  status: { key: (i) => i.status || 'Wanted', label: (k) => k,
    order: (a, b) => STATUSES.findIndex((s) => s.id === a) - STATUSES.findIndex((s) => s.id === b) },
  format: { key: (i) => i.format || NONE, label: (k) => (k === NONE ? 'No platform / format' : k),
    order: (a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b) },
  availability: { key: (i) => i.availability || NONE, label: (k) => (k === NONE ? 'Not sure if in print' : k),
    order: (a, b) => (a === NONE) - (b === NONE) || AVAILABILITY.findIndex((x) => x.id === a) - AVAILABILITY.findIndex((x) => x.id === b) },
  none: { key: () => 'all', label: () => 'All items', order: () => 0 },
};

// ---------------------------------------------------------------------------------------------
// Rendering

function render() {
  renderTabs();
  renderGroups();
  renderStats();
  renderSeries();
  renderSync();
}

function renderTabs() {
  const pool = store.items.filter((it) => passesStatus(it) && matchesSearch(it, prefs.q));
  const count = (cat) => pool.filter((i) => cat === 'All' || i.category === cat).length;
  $('#cat-tabs').innerHTML = ['All', ...CATEGORY_NAMES].map((cat) => `
    <button class="button" role="tab" data-cat="${esc(cat)}" aria-selected="${prefs.category === cat}">
      ${cat === 'All' ? '' : `<img src="${icon(cat)}" alt="">`}${esc(cat)} <span class="n">${count(cat)}</span>
    </button>`).join('');
}

function renderGroups() {
  const host = $('#groups');
  if (!store.items.length) {
    host.innerHTML = windowHtml('Nothing here yet', 'folder', `
      <div class="empty">
        <img src="assets/shared/icons/construction.svg" alt="">
        <p>Your wishlist is empty. Add the first thing you're hunting for.</p>
        <button class="button primary" data-act="add">+ Add item</button>
      </div>`);
    return;
  }
  const items = visibleItems().sort(SORTS[prefs.sort] || SORTS.priority);
  if (!items.length) {
    host.innerHTML = windowHtml('No matches', 'folder', `
      <div class="empty">
        <p>Nothing matches these filters.</p>
        <button class="button" data-act="clear-filters">Clear filters</button>
      </div>`);
    return;
  }
  const g = GROUPS[prefs.group] || GROUPS.year;
  const groups = new Map();
  for (const it of items) {
    const k = g.key(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  host.classList.toggle('flow', prefs.view !== 'list');
  host.innerHTML = [...groups.keys()].sort(g.order).map((k) => {
    const list = groups.get(k);
    const body = prefs.view === 'list' ? listHtml(list) : `<div class="cards">${list.map(cardHtml).join('')}</div>`;
    return windowHtml(g.label(k), g.ico ? g.ico(k) : 'folder', body, list.length);
  }).join('');
}

function windowHtml(title, ico, body, count) {
  return `<section${count ? ` style="--n:${Math.min(count, 4)}"` : ''}><div class="window">
    <div class="title" data-ico="${esc(ico)}"><span>${esc(title)}${count != null
      ? `<span class="count">· ${count} item${count === 1 ? '' : 's'}</span>` : ''}</span></div>
    <div class="content group-content">${body}</div>
  </div></section>`;
}

function money(n, cur) {
  if (n === '' || n == null) return '';
  const code = (cur || prefs.currency || CONFIG.defaultCurrency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch { return `${code} ${n}`; }
}

function stars(p) {
  const n = { High: 3, Medium: 2, Low: 1 }[p] || 0;
  return `<span class="prio" title="${esc(p || 'No')} priority">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>`;
}

function fmtChip(item) {
  if (!item.format) return '';
  const c = item.category === 'Game' ? platformColor(item.format) : null;
  return `<span class="chip fmt"${c ? ` style="--fmt:${c}"` : ''}>${esc(item.format)}</span>`;
}

function availShort(item) { return AVAILABILITY.find((a) => a.id === item.availability)?.short || ''; }
function availChip(item) {
  const a = AVAILABILITY.find((x) => x.id === item.availability);
  if (!a) return '';
  return `<span class="chip avail${a.short === 'OOP' ? ' oop' : ''}" title="${esc(a.hint)}">${esc(a.short)}</span>`;
}

function priceHtml(item) {
  if (item.status === 'Owned' && item.paid_price !== '') return `<span class="paid" title="Paid">${esc(money(item.paid_price, item.currency))}</span>`;
  if (item.target_price !== '') return `<span title="Target price">${esc(money(item.target_price, item.currency))}</span>`;
  return '';
}

function huntHtml(item) {
  const links = huntLinks(item).map(([label, url]) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`);
  const own = safeUrl(item.link);
  if (own) links.unshift(`<a href="${esc(own)}" target="_blank" rel="noopener noreferrer">Saved link ↗</a>`);
  return `<details class="hunt"><summary class="button small">Hunt ▾</summary><div class="hunt-menu">${links.join('')}</div></details>`;
}

function cardHtml(item) {
  const img = safeUrl(item.image);
  const sub = [item.maker, item.edition, item.region].filter(Boolean).map(esc).join(' · ');
  const sub2 = [item.series, item.release_year, item.condition].filter(Boolean).map(esc).join(' · ');
  return `
  <article class="card ${statusClass(item.status)}" data-id="${esc(item.id)}">
    <div class="card-art" data-act="edit" title="Edit">
      ${img ? `<img class="cover" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
            : `<img class="placeholder" src="${icon(item.category)}" alt="">`}
    </div>
    <div class="card-body">
      <h3>${esc(item.name || '(untitled)')}</h3>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      ${sub2 ? `<div class="sub2">${sub2}</div>` : ''}
      ${item.where ? `<div class="sub2" title="Where to find it">📍 ${esc(item.where)}</div>` : ''}
      <div class="row">
        <span class="chip status" title="${esc(STATUSES.find((s) => s.id === item.status)?.hint || '')}">${esc(item.status)}</span>
        ${fmtChip(item)}
        ${availChip(item)}
        ${stars(item.priority)}
        <span class="price">${priceHtml(item)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button class="button small" data-act="edit">Edit</button>
      ${item.status !== 'Owned' ? '<button class="button small" data-act="owned" title="Mark as owned">✓ Got it</button>' : ''}
      ${huntHtml(item)}
    </div>
  </article>`;
}

function listHtml(list) {
  return `<div class="list-wrap"><table class="list">
    <thead><tr><th>Name</th><th>Platform / format</th><th>Year</th><th>Status</th><th>Priority</th><th>Price</th><th></th></tr></thead>
    <tbody>${list.map((item) => `
      <tr class="${statusClass(item.status)}" data-id="${esc(item.id)}">
        <td class="name"><img class="ico" src="${icon(item.category)}" alt="${esc(item.category)}"> ${esc(item.name)}
          ${item.maker || item.edition ? `<small>${[item.maker, item.edition].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</td>
        <td>${fmtChip(item)} ${availChip(item)}</td>
        <td>${esc(item.release_year)}</td>
        <td><span class="chip status">${esc(item.status)}</span></td>
        <td>${stars(item.priority)}</td>
        <td>${priceHtml(item)}</td>
        <td class="actions">
          <button class="button small" data-act="edit">Edit</button>
          ${item.status !== 'Owned' ? '<button class="button small" data-act="owned" title="Mark as owned">✓</button>' : ''}
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

function sumByCurrency(list, field) {
  const sums = new Map();
  for (const it of list) {
    if (it[field] === '') continue;
    const cur = (it.currency || prefs.currency || CONFIG.defaultCurrency).toUpperCase();
    sums.set(cur, (sums.get(cur) || 0) + Number(it[field]));
  }
  return [...sums].map(([cur, n]) => money(n, cur)).join(' + ') || '-';
}

function renderStats() {
  const all = store.items;
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  for (const it of all) counts[it.status] = (counts[it.status] || 0) + 1;
  const open = all.filter((i) => OPEN_STATUSES.has(i.status));
  const owned = all.filter((i) => i.status === 'Owned');
  const year = String(new Date().getFullYear());
  $('#stats').innerHTML = `<dl class="stat-grid">
    <dt>Total tracked</dt><dd>${all.length}</dd>
    ${STATUSES.map((s) => `<dt><i style="--c:var(--st-${s.id.toLowerCase()})"></i>${s.id}</dt><dd>${counts[s.id] || 0}</dd>`).join('')}
    <div class="sep"></div>
    <dt>Still to buy</dt><dd>${esc(sumByCurrency(open.filter((i) => i.status !== 'Ordered'), 'target_price'))}</dd>
    <dt>Spent</dt><dd>${esc(sumByCurrency(owned.concat(all.filter((i) => i.status === 'Ordered')), 'paid_price'))}</dd>
    <dt>Got this year</dt><dd>${owned.filter((i) => (i.acquired || '').startsWith(year)).length}</dd>
  </dl>`;
}

function renderSeries() {
  const map = new Map();
  for (const it of store.items) {
    if (!it.series || it.status === 'Dropped') continue;
    const s = map.get(it.series) || { total: 0, owned: 0 };
    s.total++;
    if (it.status === 'Owned') s.owned++;
    map.set(it.series, s);
  }
  const rows = [...map].filter(([, s]) => s.total > 1)
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])).slice(0, 12);
  $('#series').innerHTML = rows.length ? rows.map(([name, s]) => `
    <div class="series-row">
      <button data-series="${esc(name)}" title="Show ${esc(name)}"><span>${esc(name)}</span><span>${s.owned}/${s.total}</span></button>
      <div class="bar"><i style="width:${Math.round((s.owned / s.total) * 100)}%"></i></div>
    </div>`).join('')
    : '<p class="hint">Give items a series (e.g. "Persona") to see how close each set is to complete.</p>';
}

function renderSync() {
  const st = store.status;
  const dot = `<span class="dot ${esc(st)}"></span>`;
  let html;
  if (store.isSheet) {
    html = `<div class="sync-state">${dot}<span>${esc(store.message || 'Google Sheets')}</span></div>
      <div class="btn-row">
        <a class="button" href="${esc(store.sheetUrl)}" target="_blank" rel="noopener">Open Sheet ↗</a>
        ${google.hasToken()
          ? '<button class="button" data-act="refresh" title="Pull changes made in the Sheet">Refresh</button>'
          : '<button class="button primary" data-act="reconnect">Reconnect</button>'}
        <button class="button" data-act="disconnect">Disconnect</button>
      </div>`;
  } else if (google.isConfigured()) {
    html = `<div class="sync-state">${dot}<span>${esc(store.message || 'Saved in this browser only')}</span></div>
      <button class="button primary" data-act="connect">Connect Google Drive</button>
      <p class="hint">Saves your list to a Google Sheet in your Drive, so you can edit it there or on any device.</p>`;
  } else {
    html = `<div class="sync-state">${dot}<span>Saved in this browser only</span></div>
      <p class="hint">To sync with Google Drive, put your Google Client ID in <code>js/config.js</code>. The README explains how.</p>`;
  }
  html += localCopyHtml();
  html += `<div class="btn-row">
    <button class="button small" data-act="export-json">Export JSON</button>
    <button class="button small" data-act="export-csv">Export CSV</button>
    <button class="button small" data-act="import">Import…</button>
  </div>`;
  $('#sync-panel').innerHTML = html;
  $('#sync-status').textContent = store.message;
}

function shortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function localCopyHtml() {
  const b = backup.state;
  if (!b.available) {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    return local ? '<p class="hint">Start the app with <code>run.bat</code> to also keep an automatic copy in the <code>backups</code> folder.</p>' : '';
  }
  const text = b.status === 'error' ? esc(b.error)
    : b.status === 'saving' ? 'Saving local copy…'
    : b.saved ? `Local copy saved ${esc(shortTime(b.saved))} · ${b.count} item${b.count === 1 ? '' : 's'}`
    : 'Local copy starts with your first item';
  const dotClass = { error: 'error', saving: 'saving', saved: 'saved' }[b.status] || '';
  const restore = !store.items.length && b.count
    ? `<button class="button small" data-act="restore-backup">Restore ${b.count} item${b.count === 1 ? '' : 's'} from local copy</button>` : '';
  return `<div class="local-copy" title="backups/wishlist.json in the app's folder (not committed to git)">
    <div class="sync-state"><span class="dot ${dotClass}"></span><span>${text}</span></div>
    <div class="hint"><code>backups/wishlist.json</code> · <code>.csv</code> · daily history</div>
    ${restore}
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// Toasts

function toast(message, { error = false, actions = [], ms = 6000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.className = 'button small';
    b.textContent = label;
    b.addEventListener('click', () => { el.remove(); fn(); });
    el.append(b);
  }
  $('#toasts').append(el);
  // Keep at most three on screen; the oldest goes first.
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  setTimeout(() => el.remove(), error ? ms * 2 : ms);
}

// Runs a change; failures were already undone by the Store, so just say what happened.
async function attempt(fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    if (e instanceof google.NeedsAuth) {
      toast('Google sign-in expired, so that change was undone. Reconnect and try again.', {
        error: true, actions: [['Reconnect', reconnect]],
      });
    } else {
      toast(e.message || String(e), { error: true });
    }
    return false;
  }
}

const reconnect = () => attempt(() => store.reconnect());

// ---------------------------------------------------------------------------------------------
// Editor dialog

const dialog = $('#editor');
const form = $('#editor-form');
let editing = null; // the item being edited, or null when adding

$('#status-select').innerHTML = STATUSES.map((s) => `<option value="${s.id}" title="${esc(s.hint)}">${s.id}</option>`).join('');
$('#availability-select').innerHTML += AVAILABILITY.map((a) => `<option value="${esc(a.id)}" title="${esc(a.hint)}">${esc(a.id)}</option>`).join('');
$('#f-availability').innerHTML += AVAILABILITY.map((a) => `<option value="${esc(a.id)}">${esc(a.id)}</option>`).join('');
$('#condition-select').innerHTML += CONDITIONS.map((c) => `<option>${esc(c)}</option>`).join('');
$('#cat-pick').innerHTML += CATEGORY_NAMES.map((c) => `
  <label><input type="radio" name="category" value="${esc(c)}"><img src="${icon(c)}" alt="">${esc(c)}</label>`).join('');

function fillDatalist(id, values) {
  const uniq = [...new Set(values.filter(Boolean).map(String))];
  $(`#${id}`).innerHTML = uniq.map((v) => `<option value="${esc(v)}"></option>`).join('');
}

function applyCategory(cat) {
  const c = CATEGORIES[cat] || CATEGORIES.Other;
  $('[data-label="maker"]', form).textContent = c.maker;
  $('[data-label="format"]', form).textContent = c.format;
  $('[data-label="region"]', form).textContent = c.region || 'Region';
  $('[data-field="region"]', form).hidden = !c.region;
  const same = store.items.filter((i) => i.category === cat);
  fillDatalist('dl-maker', same.map((i) => i.maker).sort());
  fillDatalist('dl-format', [...(c.formats || []), ...same.map((i) => i.format)]);
  fillDatalist('dl-edition', [...(c.editions || []), ...same.map((i) => i.edition)]);
  fillDatalist('dl-region', [...(c.regions || []), ...same.map((i) => i.region)]);
}

function updatePreview() {
  const url = safeUrl(form.elements.image.value);
  const box = $('#image-preview');
  box.hidden = !url;
  if (url) $('img', box).src = url;
}

function openEditor(item = null, defaults = {}) {
  editing = item;
  const data = item ? { ...item } : newItem({
    category: prefs.category !== 'All' ? prefs.category : 'Game',
    currency: prefs.currency,
    ...defaults,
  });
  $('#editor-title').textContent = item ? `Edit: ${item.name}` : 'Add item';
  $('#delete-btn').hidden = !item;
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') el.checked = el.value === (CATEGORIES[data.category] ? data.category : 'Other');
    else el.value = data[el.name] ?? '';
  }
  fillDatalist('dl-series', store.items.map((i) => i.series).sort());
  applyCategory(form.elements.category.value);
  updatePreview();
  dialog.showModal();
  form.elements.name.focus();
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'category') applyCategory(e.target.value);
  if (e.target.name === 'status' && e.target.value === 'Owned' && !form.elements.acquired.value) {
    form.elements.acquired.value = today();
  }
});
form.elements.image.addEventListener('input', updatePreview);
$('#image-preview img').addEventListener('error', () => { $('#image-preview').hidden = true; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  data.currency = (data.currency || '').toUpperCase();
  // The region field is hidden for some categories but keeps its value; that's fine (it's harmless).
  const item = normalize({ ...(editing || {}), ...data, id: editing?.id || newItem().id });
  if (!item.added) item.added = today();
  if (item.currency) { prefs.currency = item.currency; savePrefs(); }
  dialog.close();
  const wasNew = !editing;
  if (await attempt(() => store.save(item)) && wasNew) {
    const hidden = !visibleItems().some((i) => i.id === item.id);
    toast(`Added "${item.name}"${hidden ? ' (hidden by the current filters)' : ''}`, { ms: 3000 });
  }
});

$('#cancel-btn').addEventListener('click', () => dialog.close());
$('#delete-btn').addEventListener('click', () => {
  const item = editing;
  dialog.close();
  if (item) removeWithUndo(item);
});
// Click on the dimmed backdrop closes the dialog.
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

async function removeWithUndo(item) {
  if (await attempt(() => store.remove(item.id))) {
    toast(`Deleted "${item.name}"`, { actions: [['Undo', () => attempt(() => store.save(item))]], ms: 10000 });
  }
}

async function markOwned(item) {
  const updated = { ...item, status: 'Owned', acquired: item.acquired || today() };
  if (await attempt(() => store.save(updated))) {
    toast(`Got "${item.name}"! ★`, {
      actions: [
        ['Add price paid', () => openEditor(store.get(item.id))],
        ['Undo', () => attempt(() => store.save(item))],
      ],
      ms: 10000,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Import / export

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function toCsv(items) {
  return [COLUMNS, ...items.map((it) => COLUMNS.map((c) => it[c] ?? ''))].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const keys = header.map((h) => h.trim().replace(/^﻿/, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

async function importFile(file) {
  const text = await file.text();
  let list;
  try {
    if (/\.json$/i.test(file.name) || text.trim().startsWith('[') || text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      list = Array.isArray(data) ? data : data.items;
    } else {
      list = parseCsv(text);
    }
  } catch (e) {
    toast(`Couldn't read ${file.name}: ${e.message}`, { error: true });
    return;
  }
  list = (Array.isArray(list) ? list : []).filter((r) => r && String(r.name || '').trim());
  if (!list.length) { toast(`No items with a "name" found in ${file.name}.`, { error: true }); return; }
  if (!confirm(`Add ${list.length} item${list.length === 1 ? '' : 's'} from ${file.name} to your wishlist?`)) return;
  let n = 0;
  if (await attempt(async () => { n = await store.addMany(list); })) toast(`Imported ${n} item${n === 1 ? '' : 's'}.`);
}

// ---------------------------------------------------------------------------------------------
// Events

const actions = {
  add: () => openEditor(),
  edit: (item) => item && openEditor(item),
  owned: (item) => item && markOwned(item),
  'clear-filters': () => {
    Object.assign(prefs, { category: 'All', status: 'all', priority: '', availability: '', q: '' });
    syncControls(); savePrefs(); render();
  },
  connect: () => attempt(() => store.connect(async (localN, remoteN) => confirm(
    `You have ${localN} item${localN === 1 ? '' : 's'} saved in this browser`
    + (remoteN ? ` and ${remoteN} already in your Google Sheet` : '')
    + '.\n\nCopy the browser items into the Sheet?',
  ))).then((ok) => ok && toast('Connected. Your wishlist now lives in Google Sheets.')),
  reconnect,
  refresh: () => attempt(() => store.reload()),
  disconnect: async () => {
    if (!confirm('Stop syncing with Google Sheets? The Sheet stays in your Drive, and a copy of your list stays in this browser.')) return;
    await store.disconnect();
  },
  'export-json': () => download(`wishlist-${today()}.json`, JSON.stringify(store.items, null, 2), 'application/json'),
  'export-csv': () => download(`wishlist-${today()}.csv`, '﻿' + toCsv(store.items), 'text/csv'),
  import: () => $('#import-file').click(),
  'restore-backup': () => attempt(async () => {
    const items = (await backup.readItems()).filter((r) => r && String(r.name || '').trim());
    if (!items.length || !confirm(`Restore ${items.length} item${items.length === 1 ? '' : 's'} from backups/wishlist.json?`)) return;
    const n = await store.addMany(items);
    toast(`Restored ${n} item${n === 1 ? '' : 's'} from your local copy.`);
  }),
};

document.addEventListener('click', (e) => {
  // Close any open "Hunt" menu when clicking elsewhere.
  for (const d of $$('details.hunt[open]')) if (!d.contains(e.target)) d.open = false;

  const btn = e.target.closest('[data-act]');
  if (btn && actions[btn.dataset.act]) {
    const id = btn.closest('[data-id]')?.dataset.id;
    actions[btn.dataset.act](id ? store.get(id) : undefined);
    return;
  }
  const tab = e.target.closest('[data-cat]');
  if (tab) { prefs.category = tab.dataset.cat; savePrefs(); render(); return; }
  const view = e.target.closest('[data-view]');
  if (view) { prefs.view = view.dataset.view; syncControls(); savePrefs(); renderGroups(); return; }
  const series = e.target.closest('[data-series]');
  if (series) {
    Object.assign(prefs, { q: series.dataset.series, status: 'all', category: 'All' });
    syncControls(); render();
    $('#groups').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// Broken cover image → show the category icon instead. ("error" doesn't bubble, so capture it.)
$('#groups').addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('cover')) return;
  const item = store.get(img.closest('[data-id]')?.dataset.id);
  img.className = 'placeholder';
  img.src = icon(item?.category);
}, true);

$('#add-btn').addEventListener('click', () => openEditor());
$('#search').addEventListener('input', (e) => { prefs.q = e.target.value.trim(); renderTabs(); renderGroups(); });
for (const [id, key] of [['f-status', 'status'], ['f-priority', 'priority'], ['f-availability', 'availability'], ['group', 'group'], ['sort', 'sort']]) {
  $(`#${id}`).addEventListener('change', (e) => { prefs[key] = e.target.value; savePrefs(); render(); });
}
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
});

document.addEventListener('keydown', (e) => {
  if (dialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select')) {
    if (e.key === 'Escape' && e.target.id === 'search') { e.target.value = ''; prefs.q = ''; render(); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(); }
});

// Pull changes made in the Sheet when you come back to the tab (at most once a minute).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || dialog.open) return;
  if (store.isSheet && google.hasToken() && Date.now() - store.lastLoad > 60_000 && store.status !== 'saving') {
    store.reload().catch(() => {});
  }
});

// Adds the queued items in js/seed.js once the list has loaded properly (not from a stale cache,
// where the save would fail; they're added next time the Sheet loads).
async function addSeedItems() {
  if (!['idle', 'saved'].includes(store.status)) return;
  const pending = pendingSeed(new Set(store.items.map((i) => i.id)));
  markSeeded(SEED.filter((s) => store.get(s.id))); // already on the list
  if (!pending.length) return;
  const ok = await attempt(() => store.addMany(pending.map((s) => newItem(s))));
  if (ok) {
    markSeeded(pending);
    toast(`Added to your wishlist: ${pending.map((s) => s.name).join(', ')}`);
  }
}

function syncControls() {
  $('#search').value = prefs.q;
  $('#f-status').value = prefs.status;
  $('#f-priority').value = prefs.priority;
  $('#f-availability').value = prefs.availability;
  $('#group').value = prefs.group;
  $('#sort').value = prefs.sort;
  for (const b of $$('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view));
}

function tickClock() {
  $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------------------------
// Start

for (const id of ['logo-link', 'app-site']) $(`#${id}`).href = CONFIG.siteUrl;
$('#app-repo').href = CONFIG.repoUrl;
syncControls();
tickClock();
setInterval(tickClock, 30_000);

store.addEventListener('change', () => {
  render();
  // Copy the list to backups/ once it's settled (not mid-save, not a failed or stale state).
  if (store.status === 'idle' || store.status === 'saved') backup.schedule();
});
render();
store.init().catch(() => {}).finally(async () => {
  await addSeedItems();
  await backup.detect();
  backup.schedule();
});
// Load Google's sign-in script early, so the popup opens straight from your click.
if (google.isConfigured()) google.prepare().catch((e) => toast(e.message, { error: true }));
