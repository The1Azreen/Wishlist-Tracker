// Automatic local copy. When the app is started with run.bat, its little server (serve.py) accepts
// the list at /api/backup and writes it to backups/wishlist.json in the repo folder (gitignored).
// Anywhere else (GitHub Pages, or `python -m http.server`) that address doesn't exist, and this
// quietly stays off: browsers can't write to your folders by themselves.

const ENDPOINT = 'api/backup';
const DELAY = 1500; // wait for a pause in edits, then save once

export function createBackup({ getItems, toCsv, onChange }) {
  const state = {
    available: false, // a serve.py is answering
    status: 'off',    // off | saving | saved | error
    saved: '',        // ISO time of the last copy on disk
    count: 0,         // items in the copy on disk
    error: '',
  };
  let lastJson = null;  // what's on disk, so unchanged lists aren't rewritten
  let seenItems = false; // the list had items this session (so an empty list is a real deletion)
  let timer = null;
  let running = null;

  const set = (patch) => { Object.assign(state, patch); onChange(); };

  async function detect() {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return state;
      const data = await res.json();
      lastJson = data.exists ? JSON.stringify(data.items) : null;
      set({ available: true, status: data.exists ? 'saved' : 'off', saved: data.saved || '', count: data.count || 0 });
    } catch { /* no server: stays off */ }
    return state;
  }

  async function readItems() {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Couldn't read the local copy (${res.status}).`);
    return (await res.json()).items || [];
  }

  function schedule() {
    if (!state.available) return;
    clearTimeout(timer);
    timer = setTimeout(flush, DELAY);
  }

  async function flush() {
    if (running) { await running; return schedule(); }
    const items = getItems();
    if (items.length) seenItems = true;
    const json = JSON.stringify(items);
    if (json === lastJson) return;
    if (!items.length && !seenItems) return; // still starting up: nothing to save yet
    running = (async () => {
      set({ status: 'saving', error: '' });
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, csv: toCsv(items), allowEmpty: seenItems }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
        if (!data.skipped) lastJson = json;
        set({ status: 'saved', saved: data.saved || state.saved, count: data.count ?? items.length });
      } catch (e) {
        // Server closed (run.bat window shut)? Say so plainly.
        const msg = e instanceof TypeError ? 'run.bat isn\'t running, so the local copy is paused.' : e.message;
        set({ status: 'error', error: msg });
      } finally {
        running = null;
      }
    })();
    await running;
  }

  // Save before the tab closes if an edit is still waiting.
  window.addEventListener('pagehide', () => {
    if (!state.available || !timer) return;
    const items = getItems();
    if (JSON.stringify(items) === lastJson || (!items.length && !seenItems)) return;
    fetch(ENDPOINT, {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, csv: toCsv(items), allowEmpty: seenItems }),
    }).catch(() => {});
  });

  return { state, detect, schedule, flush, readItems };
}
