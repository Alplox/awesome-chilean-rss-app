export const allFeeds = [];
export const categories = {};
export const regions = {};
export const selectedFeeds = new Set();
export let currentLang = 'es';
export let domReady = false;
export const filters = {
  category: 'all',
  region: 'all',
  search: '',
  mainFeedOnly: false,
  showStale: false,
  showProxies: true,
  hiddenProxySites: new Set(),
  groupOpml: true,
  groupByRegion: false,
  keepSiteTogether: false,
  format: 'opml'
};
export const el = {};

export const KEYS = {
  THEME: 'awesome-rss-theme',
  LANG: 'awesome-rss-lang'
};

export const URLS = {
  FEEDS: 'https://raw.githubusercontent.com/alplox/awesome-chilean-rss/main/feeds-database.json',
  CATEGORIES: 'https://raw.githubusercontent.com/alplox/awesome-chilean-rss/main/categories.json',
  REGIONS: 'https://raw.githubusercontent.com/alplox/awesome-chilean-rss/main/regions.json'
};

export function setCurrentLang(lang) {
  currentLang = lang;
}

export function setDomReady() {
  domReady = true;
}
