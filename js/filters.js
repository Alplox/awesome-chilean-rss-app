import { allFeeds, filters, selectedFeeds } from './state.js';
import { feedsByCategory, feedsByRegion } from './data.js';

let _cachedVisible = null;
let _cachedVisibleKey = '';
let _cachedNarrowing = null;
let _cachedNarrowingKey = '';

function buildCacheKey(includeCategoryRegionSearch) {
  let hiddenKey = '';
  if (filters.hiddenProxySites.size > 0) {
    // Sorted join to avoid key collision when same size but different sites
    hiddenKey = Array.from(filters.hiddenProxySites).sort().join(',');
  }
  let base = (filters.showStale ? '1' : '0') + '|' + (filters.showProxies ? '1' : '0') + '|' + (filters.mainFeedOnly ? '1' : '0') + '|' + hiddenKey + '|' + allFeeds.length;
  if (includeCategoryRegionSearch) {
    return base + '|' + filters.category + '|' + filters.region + '|' + filters.search;
  }
  return base;
}

function filterFeeds(includeCategoryRegionSearch) {
  let key = buildCacheKey(includeCategoryRegionSearch);
  if (includeCategoryRegionSearch && _cachedVisible && _cachedVisibleKey === key) return _cachedVisible;
  if (!includeCategoryRegionSearch && _cachedNarrowing && _cachedNarrowingKey === key) return _cachedNarrowing;

  let results = [];
  let q = includeCategoryRegionSearch && filters.search ? filters.search.toLowerCase() : '';
  let hasSearch = !!q;
  let catFilter = includeCategoryRegionSearch ? filters.category : 'all';
  let regionFilter = includeCategoryRegionSearch ? filters.region : 'all';

  // Narrow candidate set using indexes when possible
  let candidates = allFeeds;
  if (includeCategoryRegionSearch) {
    if (catFilter !== 'all' && regionFilter !== 'all') {
      // Intersect: start from smaller bucket
      let catBucket = feedsByCategory.get(catFilter) || [];
      let regBucket = feedsByRegion.get(regionFilter) || [];
      if (catBucket.length < regBucket.length) {
        candidates = catBucket;
      } else {
        candidates = regBucket;
      }
    } else if (catFilter !== 'all') {
      candidates = feedsByCategory.get(catFilter) || [];
    } else if (regionFilter !== 'all') {
      candidates = feedsByRegion.get(regionFilter) || [];
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    let feed = candidates[i];

    if (!filters.showStale && feed.status !== 'active') continue;
    if (feed.isProxy && (!filters.showProxies || filters.hiddenProxySites.has(feed.siteId))) continue;
    if (filters.mainFeedOnly && !feed.isMain) continue;

    if (includeCategoryRegionSearch) {
      // When we narrowed via index we still need to check the other dimension if both filters active and we picked one bucket
      if (catFilter !== 'all' && feed.category !== catFilter) continue;
      if (regionFilter !== 'all' && feed.region !== regionFilter) continue;

      if (hasSearch) {
        // Use precomputed _search index
        if (feed._search.indexOf(q) === -1) continue;
      }
    }

    results.push(feed);
  }

  if (includeCategoryRegionSearch) {
    _cachedVisible = results;
    _cachedVisibleKey = key;
  } else {
    _cachedNarrowing = results;
    _cachedNarrowingKey = key;
  }
  return results;
}

export function getVisibleFeeds() {
  return filterFeeds(true);
}

export function getFeedsMatchingNarrowingFilters() {
  return filterFeeds(false);
}

export function invalidateFilterCache() {
  _cachedVisible = null;
  _cachedNarrowing = null;
  _cachedVisibleKey = '';
  _cachedNarrowingKey = '';
}

export function isFeedDownloadable(feed) {
  if (!feed) return false;
  if (!feed.id) return false;
  if (!selectedFeeds.has(feed.id)) return false;
  if (!filters.showStale && feed.status !== 'active') return false;
  if (feed.isProxy && (!filters.showProxies || filters.hiddenProxySites.has(feed.siteId))) return false;
  if (filters.mainFeedOnly && !feed.isMain) return false;
  return true;
}
