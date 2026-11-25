// Items added to the wishlist automatically. Each has a fixed id: the app adds it if it isn't on
// the list yet, then remembers (in this browser) that it did, so deleting it later doesn't bring
// it back. To queue more, add entries with a new id.
//
// To add details to an entry that's already on the list, change it here and raise its `rev`: the
// app then fills in those fields once, but only where the item's field is still blank, so nothing
// you've typed is overwritten.

const DONE_KEY = 'wishlist.seeded';

export const SEED = [
  { id: 'seed-astebreed-ps4', rev: 2, name: 'Astebreed', category: 'Game', format: 'PS4',
    maker: 'Playism', physical_publisher: 'Limited Run Games', release_year: 2015, status: 'Wanted', priority: 'Medium' },
  { id: 'seed-othercide-ps4', rev: 2, name: 'Othercide', category: 'Game', format: 'PS4',
    maker: 'Focus Home Interactive', physical_publisher: 'Limited Run Games', release_year: 2020, status: 'Wanted', priority: 'Medium' },
  { id: 'seed-pawarumi-switch', rev: 2, name: 'Pawarumi', category: 'Game', format: 'Switch', edition: 'Definitive Edition',
    maker: 'Manufacture 43', physical_publisher: 'eastasiasoft, Play-Asia (limited edition)', status: 'Wanted', priority: 'Medium' },
  { id: 'seed-relayer-ps5', rev: 1, name: 'Relayer', category: 'Game', format: 'PS5',
    maker: 'Clouded Leopard Entertainment', physical_publisher: 'Red Art Games, Kadokawa Games (JP), Clouded Leopard Entertainment (Asia)',
    release_year: 2022, status: 'Wanted', priority: 'Medium' },
];

const SKIP = new Set(['id', 'rev', 'status', 'priority']); // never forced onto an existing item

function readDone() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY)) || []); } catch { return new Set(); }
}
const tag = (s) => `${s.id}@${s.rev || 1}`;

// What to do for the list as it is: `add` = new items, `fill` = existing items with blanks filled in.
export function seedPlan(items) {
  const done = readDone();
  const byId = new Map(items.map((i) => [i.id, i]));
  const add = [];
  const fill = [];
  for (const s of SEED) {
    if (done.has(tag(s))) continue;
    const have = byId.get(s.id);
    const { rev, ...fields } = s;
    if (!have) {
      // Never added before (no rev of it done) → add; otherwise it was deleted on purpose.
      if (![...done].some((d) => d === s.id || d.startsWith(`${s.id}@`))) add.push(fields);
      continue;
    }
    const patch = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!SKIP.has(k) && (have[k] === '' || have[k] == null)) patch[k] = v;
    }
    fill.push(Object.keys(patch).length ? { ...have, ...patch } : null);
  }
  return { add, fill: fill.filter(Boolean), all: SEED.filter((s) => !done.has(tag(s))) };
}

export function markSeeded(seeds) {
  const done = readDone();
  for (const s of seeds) done.add(tag(s));
  localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
}
