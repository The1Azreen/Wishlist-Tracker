// Google sign-in and the Drive/Sheets calls, straight from the browser (no server).
//
// Sign-in uses Google Identity Services' token flow with only the "drive.file" scope: the app can
// see and change only the files it created itself (its own Sheet), nothing else in your Drive.
// Tokens last an hour; the app asks for a new one when needed (a popup that closes by itself once
// you've agreed the first time).

import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'wishlist.token';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

export class NeedsAuth extends Error {
  constructor() { super('Google sign-in needed'); this.name = 'NeedsAuth'; }
}

let tokenClient = null;
let token = readToken();
let pending = null; // { resolve, reject } of the sign-in in progress

export const isConfigured = () => Boolean(CONFIG.googleClientId);

function readToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    return t && t.expires_at > Date.now() + 60_000 ? t : null;
  } catch { return null; }
}

export const hasToken = () => Boolean(token && token.expires_at > Date.now() + 60_000);

let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisLoading = null; reject(new Error('Could not load Google sign-in. Check your connection or ad blocker.')); };
    document.head.append(s);
  });
  return gisLoading;
}

// Loads Google's script early so the sign-in popup opens straight from the click.
export async function prepare() {
  if (!isConfigured()) return;
  await loadGis();
  tokenClient ||= google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending; pending = null;
      if (resp.error) { p?.reject(new Error(resp.error_description || resp.error)); return; }
      token = { access_token: resp.access_token, expires_at: Date.now() + Number(resp.expires_in || 3600) * 1000 };
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      p?.resolve(token);
    },
    error_callback: (err) => {
      const p = pending; pending = null;
      p?.reject(new Error(err.type === 'popup_closed' ? 'Sign-in window was closed.'
        : err.type === 'popup_failed_to_open' ? 'The sign-in popup was blocked. Allow popups for this page.'
        : err.message || 'Sign-in failed.'));
    },
  });
}

// Call from a click handler (browsers only allow popups right after a click).
// consent=true shows Google's account chooser even if you've signed in before.
export async function signIn({ consent = false } = {}) {
  if (!isConfigured()) throw new Error('No Google Client ID yet: add it to js/config.js (see README).');
  await prepare();
  pending?.reject(new Error('Sign-in restarted.'));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: consent ? 'select_account' : '' });
  });
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.access_token, () => {});
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

async function api(method, url, body) {
  if (!hasToken()) throw new NeedsAuth();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { token = null; sessionStorage.removeItem(TOKEN_KEY); throw new NeedsAuth(); }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `${res.status} ${res.statusText}`;
    const err = new Error(`Google: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- Drive ----

// Newest Sheet with our title that this app created (drive.file can't see anything else).
export async function findSheet() {
  const q = `name = '${CONFIG.sheetTitle.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `${DRIVE}?q=${encodeURIComponent(q)}&orderBy=modifiedTime%20desc&fields=files(id,name)&pageSize=5`;
  const data = await api('GET', url);
  return data.files?.[0]?.id || null;
}

// ---- Sheets ----

export async function createSheet(header) {
  const data = await api('POST', SHEETS, {
    properties: { title: CONFIG.sheetTitle },
    sheets: [{ properties: { title: CONFIG.sheetTab, gridProperties: { frozenRowCount: 1 } } }],
  });
  const id = data.spreadsheetId;
  const sheetId = data.sheets[0].properties.sheetId;
  await updateValues(id, `${quote(CONFIG.sheetTab)}!A1`, [header]);
  // Bold, coloured header so the Sheet is pleasant to edit by hand too.
  await batchUpdate(id, [{
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: {
        textFormat: { bold: true, foregroundColor: rgb('#F7C948') },
        backgroundColor: rgb('#2B1B4F'),
      } },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  }]);
  return id;
}

export const getMeta = (id) =>
  api('GET', `${SHEETS}/${id}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`);

export async function getValues(id, range) {
  const url = `${SHEETS}/${id}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  return (await api('GET', url)).values || [];
}

// RAW: text stays text (a name starting with "=" is never run as a formula), numbers stay numbers.
export const updateValues = (id, range, values) =>
  api('PUT', `${SHEETS}/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { values });

export const batchUpdateValues = (id, data) =>
  api('POST', `${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data });

export const appendValues = (id, range, values) =>
  api('POST', `${SHEETS}/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values });

export const batchUpdate = (id, requests) => api('POST', `${SHEETS}/${id}:batchUpdate`, { requests });

export const quote = (tab) => `'${tab.replace(/'/g, "''")}'`;

export function colLetter(index) { // 0 → A, 26 → AA
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { red: (n >> 16 & 255) / 255, green: (n >> 8 & 255) / 255, blue: (n & 255) / 255 };
}
