import { allFeeds, categories, regions, selectedFeeds, URLS } from './state.js';
import { t } from './i18n.js';

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
  let sites = feedsData.sites;

  for (let s = 0; s < sites.length; s++) {
    let site = sites[s];
    let siteFeeds = site.feeds;

    for (let f = 0; f < siteFeeds.length; f++) {
      let feed = siteFeeds[f];
      let isProxy = feed.name.indexOf('[Proxy') !== -1;

      allFeeds.push({
        id: feed.id,
        siteId: site.id,
        siteName: site.name,
        feedName: feed.name,
        rssUrl: feed.rss_url,
        htmlUrl: feed.url || site.url,
        description: feed.description || site.description || '',
        category: feed.category || site.category,
        region: feed.region || site.region,
        status: feed.status,
        isMain: f === 0,
        isProxy: isProxy
      });

      selectedFeeds.add(feed.id);
    }
  }
}
