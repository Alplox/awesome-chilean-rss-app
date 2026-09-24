import { allFeeds, categories, regions, selectedFeeds, URLS } from './state.js';
import { t } from './i18n.js';

export const feedNameById = new Map();
export const feedsByCategory = new Map();
export const feedsByRegion = new Map();
export const feedsBySite = new Map();

const DATA_CACHE = 'awesome-rss-data-v1';
const CACHE_META_KEY = new URL('./__awesome-rss-data-cache-meta', document.baseURI).href;
const CACHE_TTL = 3600000;
const FETCH_TIMEOUT = 15000;

function isValidDataset(data) {
  return data && Array.isArray(data.sites);
}

async function loadFromCache() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(DATA_CACHE);
    const [feedsResponse, categoriesResponse, regionsResponse, metaResponse] = await Promise.all([
      cache.match(URLS.FEEDS),
      cache.match(URLS.CATEGORIES),
      cache.match(URLS.REGIONS),
      cache.match(CACHE_META_KEY)
    ]);
    if (!feedsResponse || !categoriesResponse || !regionsResponse || !metaResponse) return null;
    const savedAt = Number(await metaResponse.text());
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > CACHE_TTL) return null;
    const [feeds, categoryData, regionData] = await Promise.all([
      feedsResponse.json(),
      categoriesResponse.json(),
      regionsResponse.json()
    ]);
    return isValidDataset(feeds) ? { feeds, categories: categoryData, regions: regionData } : null;
  } catch {
    return null;
  }
}

async function saveToCache(responses) {
  if (!('caches' in window)) return;
  const cache = await caches.open(DATA_CACHE);
  await Promise.all([
    cache.put(URLS.FEEDS, responses[0].clone()),
    cache.put(URLS.CATEGORIES, responses[1].clone()),
    cache.put(URLS.REGIONS, responses[2].clone()),
    cache.put(CACHE_META_KEY, new Response(String(Date.now()), {
      headers: { 'Content-Type': 'text/plain' }
    }))
  ]);
}

function scheduleCacheSave(responses) {
  const save = function () { saveToCache(responses).catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(save, { timeout: 2000 });
  else setTimeout(save, 0);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(t('error-timeout'));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadData() {
  const cached = await loadFromCache();
  if (cached) {
    Object.assign(categories, cached.categories);
    Object.assign(regions, cached.regions);
    buildFeedList(cached.feeds);
    return;
  }

  const responses = await Promise.all([
    fetchWithTimeout(URLS.FEEDS),
    fetchWithTimeout(URLS.CATEGORIES),
    fetchWithTimeout(URLS.REGIONS)
  ]);
  if (!responses[0].ok) throw new Error(t('error-fetch', { status: responses[0].status }));
  if (!responses[1].ok) throw new Error(t('error-fetch', { status: responses[1].status }));
  if (!responses[2].ok) throw new Error(t('error-fetch', { status: responses[2].status }));

  const cacheResponses = responses.map(response => response.clone());
  const [feedsData, catsData, regionsData] = await Promise.all([
    responses[0].json(),
    responses[1].json(),
    responses[2].json()
  ]);
  if (!isValidDataset(feedsData)) throw new Error(t('error-invalid-data'));

  Object.assign(categories, catsData);
  Object.assign(regions, regionsData);
  buildFeedList(feedsData);
  scheduleCacheSave(cacheResponses);
}

function buildFeedList(feedsData) {
  allFeeds.length = 0;
  selectedFeeds.clear();
  feedNameById.clear();
  feedsByCategory.clear();
  feedsByRegion.clear();
  feedsBySite.clear();
  const sites = feedsData.sites;
  const firstMainSet = new Set();

  for (let s = 0; s < sites.length; s++) {
    const site = sites[s];
    const siteFeeds = site.feeds;
    for (let f = 0; f < siteFeeds.length; f++) {
      const feed = siteFeeds[f];
      const isProxy = feed.name.indexOf('[Proxy') !== -1;
      const isMain = feed.status === 'active' && !firstMainSet.has(site.id);
      if (isMain) firstMainSet.add(site.id);
      feedNameById.set(feed.id, feed.name);

      const category = feed.category || site.category;
      const region = feed.region || site.region;
      const description = feed.description || site.description || '';
      const searchIndex = (feed.name + ' ' + site.name + ' ' + description).toLowerCase();
      const entry = {
        id: feed.id,
        siteId: site.id,
        siteName: site.name,
        feedName: feed.name,
        rssUrl: feed.rss_url,
        htmlUrl: feed.url || site.url,
        category,
        region,
        status: feed.status,
        isMain,
        isProxy,
        duplicateOf: feed.duplicate_of || null,
        _search: searchIndex
      };

      allFeeds.push(entry);
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
