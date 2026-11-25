// Items added to the wishlist automatically, once each. Each has a fixed id: the app adds it if
// it isn't on the list yet, then remembers (in this browser) that it did, so deleting it later
// doesn't bring it back. To queue more, add entries with a new id.

const DONE_KEY = 'wishlist.seeded';

export const SEED = [
  { id: 'seed-astebreed-ps4', name: 'Astebreed', category: 'Game', format: 'PS4', status: 'Wanted', priority: 'Medium' },
  { id: 'seed-othercide-ps4', name: 'Othercide', category: 'Game', format: 'PS4', maker: 'Focus Home Interactive',
    release_year: 2020, status: 'Wanted', priority: 'Medium' },
];

// Returns the seed items still to add, given the ids already on the list.
export function pendingSeed(existingIds) {
  let done;
  try { done = new Set(JSON.parse(localStorage.getItem(DONE_KEY)) || []); } catch { done = new Set(); }
  return SEED.filter((s) => !done.has(s.id) && !existingIds.has(s.id));
}

export function markSeeded(items) {
  let done;
  try { done = JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch { done = []; }
  localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...done, ...items.map((i) => i.id)])]));
}
