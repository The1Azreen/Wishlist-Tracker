// Where items live. Two backends with the same shape:
//   LocalBackend  – this browser's localStorage (before you connect Google, or if you never do)
//   SheetBackend  – a Google Sheet in your Drive, one row per item, header row = column names
// The Store in front of them keeps the list in memory, saves changes straight away and keeps a
// copy of the Sheet in localStorage so the page opens instantly (and offline) next time.

import { COLUMNS, NUMERIC, normalize } from './schema.js';
import * as g from './google.js';
import { CONFIG } from './config.js';

const LOCAL_KEY = 'wishlist.items';
const SHEET_ID_KEY = 'wishlist.sheetId';
const CACHE_KEY = 'wishlist.sheetCache';

class LocalBackend {
  kind = 'local';
  async load() {
    try { return (JSON.parse(localStorage.getItem(LOCAL_KEY)) || []).map(normalize); } catch { return []; }
  }
  // The local backend just rewrites the whole list; the Store passes it in.
  async saveAll(items) { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); }
}

class SheetBackend {
  kind = 'sheet';
  constructor(id) { this.id = id; this.header = []; this.tab = CONFIG.sheetTab; this.sheetId = 0; }

  get url() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  range(a1) { return `${g.quote(this.tab)}!${a1}`; }

  async load() {
    const meta = await g.getMeta(this.id);
    const tab = meta.sheets.find((s) => s.properties.title === CONFIG.sheetTab) || meta.sheets[0];
    this.tab = tab.properties.title;
    this.sheetId = tab.properties.sheetId;

    const rows = await g.getValues(this.id, g.quote(this.tab));
    let header = (rows[0] || []).map((h) => String(h).trim());
    // Add any of our columns the Sheet doesn't have yet (new Sheet, or a column added in an update).
    const missing = COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) {
      header = [...header, ...missing];
      await g.updateValues(this.id, this.range('A1'), [header]);
    }
    this.header = header;

    const items = [];
    const idFixes = [];
    const idCol = g.colLetter(header.indexOf('id'));
    rows.slice(1).forEach((row, i) => {
      if (!row.some((v) => String(v ?? '').trim() !== '')) return; // blank row
      const raw = {};
      header.forEach((h, c) => { if (h) raw[h] = row[c] ?? ''; });
      const hadId = String(raw.id || '').trim() !== '';
      const item = normalize(raw);
      // Rows typed into the Sheet by hand get an id written back, so the app can find them again.
      if (!hadId) idFixes.push({ range: this.range(`${idCol}${i + 2}`), values: [[item.id]] });
      items.push(item);
    });
    if (idFixes.length) await g.batchUpdateValues(this.id, idFixes);
    return items;
  }

  row(item) {
    return this.header.map((h) => {
      const v = item[h];
      if (v === undefined || v === null) return '';
      return NUMERIC.has(h) && v !== '' ? Number(v) : v;
    });
  }

  // Finds an item's current row by id, right before writing, so sorting or inserting rows in the
  // Sheet meanwhile can't make the app overwrite the wrong row.
  async rowNumber(id) {
    const col = g.colLetter(this.header.indexOf('id'));
    const ids = await g.getValues(this.id, this.range(`${col}:${col}`));
    const i = ids.findIndex((r) => String(r[0] ?? '') === id);
    return i < 1 ? null : i + 1; // i = 0 is the header
  }

  async add(items) {
    if (items.length) await g.appendValues(this.id, this.range('A1'), items.map((it) => this.row(it)));
  }

  async update(item) {
    const n = await this.rowNumber(item.id);
    if (!n) return this.add([item]); // deleted in the Sheet meanwhile: put it back
    const last = g.colLetter(this.header.length - 1);
    await g.updateValues(this.id, this.range(`A${n}:${last}${n}`), [this.row(item)]);
  }

  async remove(id) {
    const n = await this.rowNumber(id);
    if (!n) return;
    await g.batchUpdate(this.id, [{
      deleteDimension: { range: { sheetId: this.sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n } },
    }]);
  }
}

export class Store extends EventTarget {
  items = [];
  status = 'idle'; // idle | loading | saving | saved | error | offline
  message = '';
  lastLoad = 0;

  constructor() {
    super();
    const sheetId = localStorage.getItem(SHEET_ID_KEY);
    this.backend = sheetId ? new SheetBackend(sheetId) : new LocalBackend();
  }

  get isSheet() { return this.backend.kind === 'sheet'; }
  get sheetUrl() { return this.isSheet ? this.backend.url : ''; }

  emit(status, message = '') {
    this.status = status;
    this.message = message;
    this.dispatchEvent(new Event('change'));
  }

  // Opens with the cached copy straight away, then fetches the Sheet if we can.
  async init() {
    if (this.isSheet) {
      try { this.items = (JSON.parse(localStorage.getItem(CACHE_KEY)) || []).map(normalize); } catch { this.items = []; }
      if (g.hasToken()) return this.reload();
      this.emit('offline', 'Showing your last copy. Reconnect Google to sync.');
    } else {
      this.items = await this.backend.load();
      this.emit('idle', 'Saved in this browser only');
    }
  }

  async reload() {
    if (!this.isSheet) return;
    this.emit('loading', 'Loading from Google Sheets…');
    try {
      this.items = await this.backend.load();
      this.lastLoad = Date.now();
      this.cache();
      this.emit('saved', 'Synced with Google Sheets');
    } catch (e) { this.fail(e); }
  }

  cache() {
    if (this.isSheet) localStorage.setItem(CACHE_KEY, JSON.stringify(this.items));
    else this.backend.saveAll(this.items);
  }

  fail(e) {
    console.error(e);
    if (e instanceof g.NeedsAuth) this.emit('offline', 'Google sign-in expired. Reconnect to keep syncing.');
    else this.emit('error', e.message || String(e));
    throw e;
  }

  // Every change: update memory and the screen first, then the Sheet. On failure the change is undone.
  async run(apply, write, undo) {
    apply();
    this.cache();
    if (!this.isSheet) { this.emit('idle', 'Saved in this browser only'); return; }
    this.emit('saving', 'Saving…');
    try {
      await write();
      this.cache();
      this.emit('saved', 'Saved to Google Sheets');
    } catch (e) {
      undo();
      this.cache();
      this.fail(e);
    }
  }

  get(id) { return this.items.find((i) => i.id === id); }

  save(item) {
    item = normalize({ ...item, updated: new Date().toISOString() });
    const i = this.items.findIndex((x) => x.id === item.id);
    const before = i >= 0 ? this.items[i] : null;
    return this.run(
      () => { if (before) this.items[i] = item; else this.items.push(item); },
      () => (before ? this.backend.update(item) : this.backend.add([item])),
      () => { if (before) this.items[this.items.indexOf(item)] = before; else this.items = this.items.filter((x) => x !== item); },
    );
  }

  remove(id) {
    const before = this.get(id);
    if (!before) return Promise.resolve();
    const at = this.items.indexOf(before);
    return this.run(
      () => { this.items = this.items.filter((x) => x.id !== id); },
      () => this.backend.remove(id),
      () => { this.items.splice(at, 0, before); },
    );
  }

  addMany(list) {
    const known = new Set(this.items.map((i) => i.id));
    const fresh = list.map(normalize).map((it) => (known.has(it.id) ? { ...it, id: normalize({}).id } : it));
    return this.run(
      () => { this.items.push(...fresh); },
      () => this.backend.add(fresh),
      () => { this.items = this.items.filter((x) => !fresh.includes(x)); },
    ).then(() => fresh.length);
  }

  // ---- Google connection ----

  // Signs in, then opens the app's Sheet (or makes one). Items saved in this browser are offered
  // for upload; `askUpload(localCount, sheetCount)` returns true to copy them over.
  async connect(askUpload) {
    await g.signIn({ consent: true });
    this.emit('loading', 'Looking for your Sheet in Google Drive…');
    try {
      const local = this.isSheet ? [] : this.items;
      const id = (await g.findSheet()) || (await g.createSheet(COLUMNS));
      const backend = new SheetBackend(id);
      const remote = await backend.load();
      const ids = new Set(remote.map((r) => r.id));
      const toUpload = local.filter((l) => !ids.has(l.id));
      let keepLocal = toUpload;
      if (toUpload.length && (await askUpload(toUpload.length, remote.length))) {
        await backend.add(toUpload);
        remote.push(...toUpload);
        keepLocal = [];
      }
      // The browser keeps only what didn't go to the Sheet; disconnecting later merges those back.
      // (Keeping uploaded ones too would bring back items you delete in the Sheet meanwhile.)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(keepLocal));
      localStorage.setItem(SHEET_ID_KEY, id);
      this.backend = backend;
      this.items = remote;
      this.lastLoad = Date.now();
      this.cache();
      this.emit('saved', 'Connected to Google Sheets');
    } catch (e) { this.fail(e); }
  }

  // After the token expires: sign in again without the account chooser, then pull changes.
  async reconnect() {
    await g.signIn();
    await this.reload();
  }

  // Stops syncing. The current list is kept in this browser so nothing disappears.
  async disconnect() {
    g.signOut();
    localStorage.removeItem(SHEET_ID_KEY);
    localStorage.removeItem(CACHE_KEY);
    this.backend = new LocalBackend();
    // Browser-only items you chose not to upload when connecting are still here: keep them too.
    const ids = new Set(this.items.map((i) => i.id));
    const leftovers = (await this.backend.load()).filter((i) => !ids.has(i.id));
    this.items = [...this.items, ...leftovers];
    await this.backend.saveAll(this.items);
    this.emit('idle', 'Disconnected. Saved in this browser only');
  }
}
