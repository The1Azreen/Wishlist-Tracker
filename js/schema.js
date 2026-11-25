// What a wishlist item is. The Google Sheet uses these keys as its header row (row 1), so the
// order here is the column order of a new Sheet. Columns are matched by name, not position, so
// you can reorder columns or add your own in the Sheet; the app keeps whatever it doesn't know.

export const COLUMNS = [
  'id', 'name', 'category', 'series', 'maker', 'format', 'edition', 'region', 'availability', 'release_year',
  'status', 'priority', 'condition', 'target_price', 'paid_price', 'currency',
  'where', 'link', 'image', 'notes', 'added', 'acquired', 'updated',
];

// Stored as numbers in the Sheet (so you can sum them there); everything else is text.
export const NUMERIC = new Set(['release_year', 'target_price', 'paid_price']);

export const STATUSES = [
  { id: 'Wanted',     hint: 'On the list' },
  { id: 'Hunting',    hint: 'Actively looking for it' },
  { id: 'Preordered', hint: 'Preordered, not out yet' },
  { id: 'Ordered',    hint: 'Bought, on its way' },
  { id: 'Owned',      hint: 'On the shelf' },
  { id: 'Dropped',    hint: 'No longer after it' },
];
export const OPEN_STATUSES = new Set(['Wanted', 'Hunting', 'Preordered', 'Ordered']);

export const PRIORITIES = ['High', 'Medium', 'Low'];
export const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2, '': 3 };

// Whether it can still be bought new. `short` is the chip shown on cards.
export const AVAILABILITY = [
  { id: 'In print',     short: 'In print', hint: 'Still made and sold new' },
  { id: 'Out of print', short: 'OOP',      hint: 'No longer made: second-hand or old stock only' },
  { id: 'Reprint',      short: 'Reprint',  hint: 'Was out of print, now reissued' },
];

export const CONDITIONS = ['Sealed / New', 'Complete (used)', 'Loose / Disc only', 'Any'];

// Each category relabels the shared "maker", "format" and "region" columns and suggests values.
// A suggestion is only a suggestion: you can type anything.
export const CATEGORIES = {
  Game: {
    icon: 'game', maker: 'Publisher', format: 'Platform', region: 'Region',
    formats: ['PS5', 'PS4', 'PS3', 'PS2', 'PS1', 'PSP', 'PS Vita', 'Switch 2', 'Switch', '3DS', 'DS',
      'Wii U', 'Wii', 'GameCube', 'N64', 'SNES', 'Game Boy Advance', 'Game Boy', 'Xbox Series X|S',
      'Xbox One', 'Xbox 360', 'Xbox', 'Dreamcast', 'Saturn', 'Mega Drive', 'PC Engine', 'Neo Geo', 'PC'],
    regions: ['Asia', 'JP', 'US', 'EU / PAL', 'KR', 'Region free'],
    editions: ['Standard', 'Limited', 'Collector\'s', 'Premium', 'Steelbook', 'Reprint', 'Best / Greatest Hits'],
  },
  Figure: {
    icon: 'figure', maker: 'Manufacturer', format: 'Scale / Line', region: null,
    formats: ['1/4', '1/6', '1/7', '1/8', 'Nendoroid', 'figma', 'Pop Up Parade', 'Prize', 'Garage kit',
      'Model kit', 'Statue', 'Plush', 'Acrylic stand'],
    editions: ['Standard', 'Limited', 'Exclusive', 'Reissue', 'Bonus edition'],
  },
  'Blu-ray': {
    icon: 'bluray', maker: 'Studio / Distributor', format: 'Format', region: 'Region',
    formats: ['Blu-ray', '4K UHD', 'DVD', 'Blu-ray box set', 'LaserDisc'],
    regions: ['A', 'B', 'C', 'Region free', 'DVD R1', 'DVD R2', 'DVD R3'],
    editions: ['Standard', 'Limited', 'Collector\'s', 'Steelbook', 'Box set'],
  },
  CD: {
    icon: 'cd', maker: 'Artist', format: 'Format', region: 'Pressing',
    formats: ['Album', 'Single', 'EP', 'Soundtrack', 'CD + DVD', 'CD + Blu-ray', 'SACD', 'Box set'],
    regions: ['JP', 'US', 'EU', 'KR', 'Asia'],
    editions: ['Standard', 'Limited', 'First press', 'Deluxe', 'Anniversary'],
  },
  Vinyl: {
    icon: 'vinyl', maker: 'Artist', format: 'Format', region: 'Pressing',
    formats: ['LP', '2LP', '3LP+', '7"', '10"', '12"', 'Picture disc', 'Box set'],
    regions: ['JP', 'US', 'UK', 'EU', 'Original press', 'Repress'],
    editions: ['Standard black', 'Coloured', 'Splatter', 'Limited', 'Signed'],
  },
  // Any music that isn't specifically a CD or a record (cassettes, digital, or "any format").
  Music: {
    icon: 'cd', maker: 'Artist', format: 'Format', region: 'Pressing',
    formats: ['Any format', 'CD', 'Vinyl', 'Cassette', 'Digital', 'MiniDisc', 'Box set', 'Soundtrack'],
    regions: ['JP', 'US', 'UK', 'EU', 'KR', 'Asia'],
    editions: ['Standard', 'Limited', 'Deluxe', 'Signed', 'Anniversary'],
  },
  Book: {
    icon: 'book', maker: 'Author', format: 'Format', region: 'Language',
    formats: ['Manga', 'Light novel', 'Novel', 'Artbook', 'Guidebook', 'Hardcover', 'Paperback', 'Magazine', 'Doujinshi'],
    regions: ['English', 'Japanese', 'Chinese', 'Malay'],
    editions: ['First edition', 'Standard', 'Limited', 'Special', 'Box set', 'Signed'],
  },
  Hardware: {
    icon: 'hardware', maker: 'Brand', format: 'Type', region: 'Region',
    formats: ['Console', 'Handheld', 'Controller', 'Accessory', 'Capture card', 'Audio', 'Display',
      'PC part', 'Peripheral', 'Mod / Repair part'],
    regions: ['JP', 'US', 'EU', 'Asia', 'Region free'],
    editions: ['Standard', 'Limited colour', 'Special edition', 'Bundle', 'Refurbished'],
  },
  Other: {
    icon: 'other', maker: 'Maker', format: 'Type', region: 'Region',
    formats: ['Merch', 'Poster', 'Keychain', 'Card', 'Clothing', 'Soundtrack', 'Misc'],
    editions: ['Standard', 'Limited', 'Event exclusive'],
  },
};
export const CATEGORY_NAMES = Object.keys(CATEGORIES);

export function categoryOf(item) {
  return CATEGORIES[item.category] || CATEGORIES.Other;
}

// "Where to hunt" links shown on each item: searches on sites that suit the category.
// Carousell and eBay are general; the rest are specialist databases or shops.
const q = (s) => encodeURIComponent(s);
const HUNT = {
  ebay: (s) => ['eBay', `https://www.ebay.com/sch/i.html?_nkw=${q(s)}`],
  carousell: (s) => ['Carousell', `https://www.carousell.sg/search/${q(s)}`],
  mandarake: (s) => ['Mandarake', `https://order.mandarake.co.jp/order/listPage/list?keyword=${q(s)}`],
  pricecharting: (s) => ['PriceCharting', `https://www.pricecharting.com/search-products?type=prices&q=${q(s)}`],
  mfc: (s) => ['MyFigureCollection', `https://www.google.com/search?q=${q('site:myfigurecollection.net ' + s)}`],
  amiami: (s) => ['AmiAmi', `https://www.google.com/search?q=${q('site:amiami.com ' + s)}`],
  discogs: (s) => ['Discogs', `https://www.discogs.com/search/?type=all&q=${q(s)}`],
  bluraycom: (s) => ['Blu-ray.com', `https://www.blu-ray.com/search/?quicksearch=1&section=bluraymovies&quicksearch_keyword=${q(s)}`],
  abebooks: (s) => ['AbeBooks', `https://www.abebooks.com/servlet/SearchResults?kn=${q(s)}`],
  shopping: (s) => ['Google Shopping', `https://www.google.com/search?tbm=shop&q=${q(s)}`],
};
const HUNT_BY_CATEGORY = {
  Game: ['pricecharting', 'ebay', 'carousell', 'mandarake'],
  Figure: ['mfc', 'amiami', 'mandarake', 'ebay', 'carousell'],
  'Blu-ray': ['bluraycom', 'ebay', 'carousell'],
  CD: ['discogs', 'mandarake', 'ebay', 'carousell'],
  Vinyl: ['discogs', 'ebay', 'carousell'],
  Music: ['discogs', 'mandarake', 'ebay', 'carousell'],
  Book: ['abebooks', 'mandarake', 'ebay', 'carousell'],
  Hardware: ['ebay', 'carousell', 'shopping'],
  Other: ['ebay', 'carousell', 'mandarake', 'shopping'],
};
export function huntLinks(item) {
  // Game platforms and editions help a search; artist does for music; the rest is noise.
  const extra = item.category === 'Game' ? item.format
    : ['CD', 'Vinyl', 'Music'].includes(item.category) ? item.maker : '';
  const term = [item.name, extra].filter(Boolean).join(' ').trim();
  return (HUNT_BY_CATEGORY[item.category] || HUNT_BY_CATEGORY.Other).map((k) => HUNT[k](term));
}

// Platform colours, matching the Collection Tracker's game cases.
export function platformColor(format) {
  const f = (format || '').toLowerCase();
  if (f.includes('switch 2')) return '#FF6FF2';
  if (/switch|3ds|\bds\b|wii|gamecube|n64|snes|game boy/.test(f)) return '#F7C948';
  if (f.includes('xbox')) return '#7CF0B5';
  if (/^ps|playstation|^pc$/.test(f)) return '#6DE0F6';
  if (/dreamcast|saturn|mega drive|sega/.test(f)) return '#8FA8FF';
  return null;
}

export function newItem(fields = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: newId(), name: '', category: 'Game', series: '', maker: '', format: '', edition: '', region: '',
    availability: '', release_year: '', status: 'Wanted', priority: 'Medium', condition: '', target_price: '', paid_price: '',
    currency: '', where: '', link: '', image: '', notes: '', added: today, acquired: '',
    updated: new Date().toISOString(),
    ...fields,
  };
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().slice(0, 13);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Cleans one item: known keys become strings (numbers for NUMERIC), unknown keys are kept.
export function normalize(raw) {
  const item = { ...raw };
  for (const key of COLUMNS) {
    let v = item[key];
    if (v === undefined || v === null) v = '';
    if (NUMERIC.has(key)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      item[key] = Number.isFinite(n) ? n : '';
    } else {
      item[key] = String(v).trim();
    }
  }
  if (!item.id) item.id = newId();
  if (!item.status) item.status = 'Wanted';
  return item;
}

// Only http(s) links are ever turned into <a href> / <img src>.
export function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}
