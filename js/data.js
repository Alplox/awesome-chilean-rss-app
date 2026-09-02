import { allFeeds, categories, regions, selectedFeeds, URLS } from './state.js';
import { t } from './i18n.js';

export const feedNameById = new Map();
export const feedsByCategory = new Map();
export const feedsByRegion = new Map();
export const feedsBySite = new Map();

const CACHE_KEY = 'awesome-rss-data';
const CACHE_TTL = 3600000;

function loadFromCache() {
  try {
    let raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    let cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch { return null; }
}

function saveToCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded, ignore */ }
  // Also warm Cache API async (non-blocking) for SW
  if ('caches' in window) {
    caches.open('awesome-rss-v1').then(c => {
      let blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      let res = new Response(blob, { headers: { 'Content-Type': 'application/json', 'X-Cached-At': String(Date.now()) } });
      c.put('/__awesome-rss-data-cache', res).catch(() => {});
    }).catch(() => {});
  }
}

export async function loadData() {
  let cached = loadFromCache();
  if (cached) {
    Object.assign(categories, cached.categories);
    Object.assign(regions, cached.regions);
    buildFeedList(cached.feeds);
    return;
  }

  let [feedsRes, catsRes, regionsRes] = await Promise.all([
    fetch(URLS.FEEDS),
    fetch(URLS.CATEGORIES),
    fetch(URLS.REGIONS)
  ]);

  if (!feedsRes.ok) throw new Error(t('error-fetch', { status: feedsRes.status }));
  if (!catsRes.ok) throw new Error(t('error-fetch', { status: catsRes.status }));
  if (!regionsRes.ok) throw new Error(t('error-fetch', { status: regionsRes.status }));

  let feedsData = await feedsRes.json();
  let catsData = await catsRes.json();
  let regionsData = await regionsRes.json();

  saveToCache({ feeds: feedsData, categories: catsData, regions: regionsData });

  Object.assign(categories, catsData);
  Object.assign(regions, regionsData);
  buildFeedList(feedsData);
}

function buildFeedList(feedsData) {
  allFeeds.length = 0;
  feedNameById.clear();
  feedsByCategory.clear();
  feedsByRegion.clear();
  feedsBySite.clear();
  let sites = feedsData.sites;

  let firstMainSet = new Set();

  for (let s = 0; s < sites.length; s++) {
    let site = sites[s];
    let siteFeeds = site.feeds;

    for (let f = 0; f < siteFeeds.length; f++) {
      let feed = siteFeeds[f];
      let isProxy = feed.name.indexOf('[Proxy') !== -1;
      let isMain = feed.status === 'active' && !firstMainSet.has(site.id);
      if (isMain) firstMainSet.add(site.id);

      feedNameById.set(feed.id, feed.name);

      let category = feed.category || site.category;
      let region = feed.region || site.region;
      let description = feed.description || site.description || '';
      let feedName = feed.name;
      let siteName = site.name;
      // Precomputed lowercased search index to avoid toLowerCase on every filter pass
      let searchIndex = (feedName + ' ' + siteName + ' ' + description).toLowerCase();

      let entry = {
        id: feed.id,
        siteId: site.id,
        siteName: siteName,
        feedName: feedName,
        rssUrl: feed.rss_url,
        htmlUrl: feed.url || site.url,
        description: description,
        category: category,
        region: region,
        status: feed.status,
        isMain: isMain,
        isProxy: isProxy,
        duplicateOf: feed.duplicate_of || null,
        _search: searchIndex
      };

      allFeeds.push(entry);

      // Indexes for faster category/region filtering
      if (category) {
        if (!feedsByCategory.has(category)) feedsByCategory.set(category, []);
        feedsByCategory.get(category).push(entry);
      }
      if (region) {
        if (!feedsByRegion.has(region)) feedsByRegion.set(region, []);
        feedsByRegion.get(region).push(entry);
      }
      if (!feedsBySite.has(site.id)) feedsBySite.set(site.id, []);
      feedsBySite.get(site.id).push(entry);

      selectedFeeds.add(feed.id);
    }
  }
}
