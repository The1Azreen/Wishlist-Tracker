// Settings you fill in once. See README.md → "Connect Google Drive" for how to get the Client ID.
// A Client ID is not a secret: it only works on the web addresses you list for it in Google Cloud.

export const CONFIG = {
  // OAuth 2.0 Client ID (type "Web application") from console.cloud.google.com → APIs & Services → Credentials.
  // Leave empty and the app still works, saving to this browser only.
  googleClientId: '',

  // Name of the Google Sheet the app creates in your Drive, and the tab inside it.
  sheetTitle: 'Wishlist Tracker',
  sheetTab: 'Wishlist',

  // Currency for new items (you can change it per item). Any ISO code: SGD, MYR, JPY, USD…
  defaultCurrency: 'SGD',

  // Where the logo and the "Website" desktop icon link to.
  siteUrl: 'https://the1azreen.neocities.org/',
  repoUrl: 'https://github.com/The1Azreen/Wishlist-Tracker',
};
