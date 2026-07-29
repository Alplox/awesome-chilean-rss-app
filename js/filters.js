import { allFeeds, filters, selectedFeeds } from './state.js';

function filterFeeds(includeCategoryRegionSearch) {
  let results = [];

  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];

    if (!filters.showStale && feed.status !== 'active') continue;
    if (feed.isProxy && (!filters.showProxies || filters.hiddenProxySites.has(feed.siteId))) continue;
    if (filters.mainFeedOnly && !feed.isMain) continue;

    if (includeCategoryRegionSearch) {
      if (filters.category !== 'all' && feed.category !== filters.category) continue;
      if (filters.region !== 'all' && feed.region !== filters.region) continue;

      if (filters.search) {
        let q = filters.search.toLowerCase();
        let nameMatch = feed.feedName.toLowerCase().indexOf(q) !== -1;
        let siteMatch = feed.siteName.toLowerCase().indexOf(q) !== -1;
        let descMatch = feed.description.toLowerCase().indexOf(q) !== -1;
        if (!nameMatch && !siteMatch && !descMatch) continue;
      }
    }

    results.push(feed);
  }

  return results;
}

export function getVisibleFeeds() {
  return filterFeeds(true);
}

export function getFeedsMatchingNarrowingFilters() {
  return filterFeeds(false);
}

export function isFeedDownloadable(feed) {
  if (!feed) return false;
  if (!feed.id) return false;
  if (!selectedFeeds.has(feed.id)) return false;
  if (!filters.showStale && feed.status !== 'active') return false;
  if (feed.isProxy && (!filters.showProxies || filters.hiddenProxySites.has(feed.siteId))) return false;
  if (filters.mainFeedOnly && !feed.isMain) return false;
  if (filters.category !== 'all' && feed.category !== filters.category) return false;
  if (filters.region !== 'all' && feed.region !== filters.region) return false;
  return true;
}
