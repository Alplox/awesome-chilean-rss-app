import { allFeeds, categories, regions, selectedFeeds, filters, el } from './state.js';
import { feedNameById, feedsBySite } from './data.js';
import { t } from './i18n.js';
import { getVisibleFeeds, getFeedsMatchingNarrowingFilters, isFeedDownloadable } from './filters.js';
import { playSuccess } from './sound.js';

const PAGE_SIZE = 80;
const SENTINEL_MARGIN = '800px';

let _visibleFeeds = [];
let _siteCategoryMap = null;
let _renderRaf = 0;
let _observer = null;
let _sentinel = null;
let _renderedGroups = 0;
let _groupNodes = [];
let _delegationBound = false;

function feedDisplayUrl(feed) {
  return filters.format === 'html' ? feed.htmlUrl : feed.rssUrl;
}

export function showLoading() {
  el.loading.hidden = false;
  el.loading.textContent = t('loading');
  el.error.hidden = true;
  el.empty.hidden = true;
  el.feedList.style.minHeight = '60vh';
  el.feedList.innerHTML = '';
}

export function hideLoading() {
  el.loading.hidden = true;
}

export function showError(msg) {
  el.loading.hidden = true;
  el.error.hidden = false;
  el.error.textContent = msg;
}

export function populateFilters() {
  let catCounts = {};
  let regionCounts = {};
  let proxyCount = 0;
  let staleCount = 0;
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (feed.isProxy) proxyCount++;
    if (feed.status !== 'active') staleCount++;
    if (feed.category) catCounts[feed.category] = (catCounts[feed.category] || 0) + 1;
    if (feed.region) regionCounts[feed.region] = (regionCounts[feed.region] || 0) + 1;
  }

  let sortedCats = Object.keys(categories).sort((a, b) => (categories[a].order || 999) - (categories[b].order || 999));
  el.categoryFilter.innerHTML = '<option value="all">' + t('filter-category-all') + '</option>';
  for (let c = 0; c < sortedCats.length; c++) {
    let key = sortedCats[c];
    let label = categories[key].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim();
    let opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label + ' (' + (catCounts[key] || 0) + ')';
    el.categoryFilter.appendChild(opt);
  }

  let regionKeys = Object.keys(regions);
  el.regionFilter.innerHTML = '<option value="all">' + t('filter-region-all') + '</option>';
  for (let r = 0; r < regionKeys.length; r++) {
    let rKey = regionKeys[r];
    let rOpt = document.createElement('option');
    rOpt.value = rKey;
    rOpt.textContent = regions[rKey] + ' (' + (regionCounts[rKey] || 0) + ')';
    el.regionFilter.appendChild(rOpt);
  }

  let staleText = el.toggleStale.parentElement.querySelector('.toggle-text');
  if (staleText) staleText.textContent = t(staleText.getAttribute('data-i18n')) + ' (' + staleCount + ')';
  let proxyText = el.toggleProxies.parentElement.querySelector('.toggle-text');
  if (proxyText) proxyText.textContent = t(proxyText.getAttribute('data-i18n')) + ' (' + proxyCount + ')';
}

function buildGroup(titleKey, titleLabel, feeds, siteCategoryMap, scopeType, scopeKey) {
  let group = document.createElement('div');
  group.className = 'category-group';
  group.dataset.scopeKey = scopeKey;
  group.dataset.scopeType = scopeType;

  let header = document.createElement('div');
  header.className = 'category-header';

  let heading = document.createElement('h2');
  heading.style.cssText = 'margin:0;font:inherit;display:flex;align-items:center;flex:1';
  let title = document.createElement('button');
  title.type = 'button';
  title.className = 'category-title';
  title.textContent = t(titleKey, { label: titleLabel });
  title.dataset.action = 'toggle-collapse';
  title.setAttribute('aria-expanded', 'true');
  let listId = 'category-feeds-' + scopeType + '-' + scopeKey.replace(/\s+/g, '-');
  title.setAttribute('aria-controls', listId);
  heading.appendChild(title);
  header.appendChild(heading);

  let total = feeds.length;
  let scopeSelected = 0;
  for (let c = 0; c < feeds.length; c++) {
    if (selectedFeeds.has(feeds[c].id)) scopeSelected++;
  }
  let counter = document.createElement('span');
  counter.className = 'category-counter';
  counter.dataset.feedIds = feeds.map(f => f.id).join(',');
  counter.textContent = scopeSelected + '/' + total;
  header.appendChild(counter);

  let actions = document.createElement('div');
  actions.className = 'category-actions';

  let selectBtn = document.createElement('button');
  selectBtn.className = 'category-action';
  selectBtn.setAttribute('data-cuelume-press', '');
  selectBtn.dataset.action = 'scope-select';
  selectBtn.dataset.scopeKey = scopeKey;
  selectBtn.dataset.scopeType = scopeType;
  selectBtn.textContent = t('select-all');
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'category-action';
  deselectBtn.setAttribute('data-cuelume-press', '');
  deselectBtn.dataset.action = 'scope-deselect';
  deselectBtn.dataset.scopeKey = scopeKey;
  deselectBtn.dataset.scopeType = scopeType;
  deselectBtn.textContent = t('deselect-all');
  actions.appendChild(deselectBtn);

  header.appendChild(actions);
  group.appendChild(header);

  let list = document.createElement('div');
  list.className = 'category-feeds';
  list.id = 'category-feeds-' + scopeType + '-' + scopeKey.replace(/\s+/g, '-');

  let feedsBySiteLocal = {};
  for (let i = 0; i < feeds.length; i++) {
    let feed = feeds[i];
    if (!feedsBySiteLocal[feed.siteId]) feedsBySiteLocal[feed.siteId] = { name: feed.siteName, feeds: [] };
    feedsBySiteLocal[feed.siteId].feeds.push(feed);
  }

  let siteIds = Object.keys(feedsBySiteLocal);
  for (let s = 0; s < siteIds.length; s++) {
    let sid = siteIds[s];
    let siteGroup = feedsBySiteLocal[sid];
    let otherCats = [];
    let entry = siteCategoryMap[sid];
    if (entry) {
      let exclude = scopeType === 'category' ? scopeKey : null;
      otherCats = Object.keys(entry.cats).filter(c => c !== exclude);
    }
    let siteEl = buildSiteGroup(sid, siteGroup.name, siteGroup.feeds, otherCats);
    list.appendChild(siteEl);
  }

  group.appendChild(list);
  return group;
}

function ensureDelegation() {
  if (_delegationBound || !el.feedList) return;
  _delegationBound = true;

  // Change delegation for checkboxes
  el.feedList.addEventListener('change', function (e) {
    let cb = e.target.closest('.feed-checkbox');
    if (cb && cb.dataset.feedId) {
      toggleFeed(cb.dataset.feedId, cb.checked);
    }
  });

  el.feedList.addEventListener('click', function (e) {
    // Category collapse
    let title = e.target.closest('.category-title[data-action="toggle-collapse"]');
    if (title) {
      let group = title.closest('.category-group');
      if (group) {
        let collapsed = group.classList.toggle('collapsed');
        title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      return;
    }

    // Scope select/deselect (category/region)
    let scopeBtn = e.target.closest('[data-action="scope-select"], [data-action="scope-deselect"]');
    if (scopeBtn) {
      let key = scopeBtn.dataset.scopeKey;
      let type = scopeBtn.dataset.scopeType;
      let fn = type === 'region' ? (f) => f.region : (f) => f.category;
      if (scopeBtn.dataset.action === 'scope-select') selectAllInScope(key, fn);
      else deselectAllInScope(key, fn);
      return;
    }

    // Site actions
    let siteAction = e.target.closest('.site-action[data-action]');
    if (siteAction) {
      let act = siteAction.dataset.action;
      let siteId = siteAction.dataset.siteId;
      if (act === 'site-select') selectAllInSite(siteId);
      else if (act === 'site-deselect') deselectAllInSite(siteId);
      else if (act === 'site-toggle-proxies') toggleSiteProxyVisibility(siteId);
      return;
    }

    // Copy button
    let copyBtn = e.target.closest('.copy-link[data-feed-id]');
    if (copyBtn) {
      e.stopPropagation();
      let fid = copyBtn.dataset.feedId;
      let feed = allFeeds.find(f => f.id === fid);
      if (!feed) return;
      let url = feedDisplayUrl(feed);
      let doCopied = function () {
        copyBtn.classList.add('copied');
        playSuccess();
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 1500);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(doCopied, fallback);
      } else {
        fallback();
      }
      function fallback() {
        let ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        doCopied();
      }
      return;
    }

    // Prevent label click from double toggling when clicking links inside
    if (e.target.closest('.feed-link') || e.target.closest('.report-link')) {
      e.stopPropagation();
    }
  });
}

function cleanupObserver() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  if (_sentinel && _sentinel.parentNode) {
    _sentinel.remove();
  }
  _sentinel = null;
}

function passesExceptHiddenSite(feed) {
  if (!filters.showStale && feed.status !== 'active') return false;
  if (feed.isProxy && !filters.showProxies) return false;
  if (filters.mainFeedOnly && !feed.isMain) return false;
  if (filters.category !== 'all' && feed.category !== filters.category) return false;
  if (filters.region !== 'all' && feed.region !== filters.region) return false;
  if (filters.search && feed._search.indexOf(filters.search.toLowerCase()) === -1) return false;
  return true;
}

function buildAllGroups(visibleFeeds, siteCategoryMap) {
  let groups = [];

  if (filters.groupByRegion) {
    let groupedByRegion = {};
    for (let i = 0; i < visibleFeeds.length; i++) {
      let feed = visibleFeeds[i];
      let region = feed.region || 'uncategorized';
      if (filters.keepSiteTogether) {
        let siteId = feed.siteId;
        if (!groupedByRegion[region]) groupedByRegion[region] = {};
        if (!groupedByRegion[region][siteId]) groupedByRegion[region][siteId] = { name: feed.siteName, feeds: [] };
        groupedByRegion[region][siteId].feeds.push(feed);
      } else {
        if (!groupedByRegion[region]) groupedByRegion[region] = [];
        groupedByRegion[region].push(feed);
      }
    }
    // Include placeholder sites where proxies are hidden but site should remain visible
    if (filters.hiddenProxySites.size > 0) {
      let seenSites = new Set();
      for (let k in groupedByRegion) {
        let v = groupedByRegion[k];
        if (filters.keepSiteTogether) for (let sid in v) seenSites.add(sid);
        else for (let f of v) seenSites.add(f.siteId);
      }
      for (let feed of allFeeds) {
        if (!feed.isProxy || !filters.hiddenProxySites.has(feed.siteId) || seenSites.has(feed.siteId)) continue;
        if (!passesExceptHiddenSite(feed)) continue;
        let region = feed.region || 'uncategorized';
        if (filters.keepSiteTogether) {
          if (!groupedByRegion[region]) groupedByRegion[region] = {};
          if (!groupedByRegion[region][feed.siteId]) groupedByRegion[region][feed.siteId] = { name: feed.siteName, feeds: [] };
          seenSites.add(feed.siteId);
        } else {
          // For non-keepSiteTogether, site still belongs to its region group but as empty - create group if missing
          if (!groupedByRegion[region]) groupedByRegion[region] = [];
          // Mark as seen to avoid duplicates; actual placeholder will be added via buildGroup handling
          // We inject a placeholder marker by ensuring region exists; buildGroup will create placeholder siteGroups for these sites
          if (!groupedByRegion.__hiddenSites) groupedByRegion.__hiddenSites = {};
          if (!groupedByRegion.__hiddenSites[region]) groupedByRegion.__hiddenSites[region] = {};
          groupedByRegion.__hiddenSites[region][feed.siteId] = feed.siteName;
          seenSites.add(feed.siteId);
        }
      }
      // For non-keepSiteTogether with hidden sites, ensure groups exist and will render placeholders
      if (groupedByRegion.__hiddenSites) {
        for (let reg in groupedByRegion.__hiddenSites) {
          if (reg.startsWith('__')) continue;
        }
      }
    }
    let sortedRegions = Object.keys(groupedByRegion).filter(k => !k.startsWith('__')).sort();
    for (let r = 0; r < sortedRegions.length; r++) {
      let regionKey = sortedRegions[r];
      let regionData = groupedByRegion[regionKey];
      let regionLabel = regions[regionKey] || t('uncategorized');
      if (filters.keepSiteTogether) {
        let feedsInRegion = [];
        let siteIds = Object.keys(regionData).sort();
        for (let s = 0; s < siteIds.length; s++) feedsInRegion.push(...regionData[siteIds[s]].feeds);
        let g = buildGroup('group-region-label', regionLabel, feedsInRegion, siteCategoryMap, 'region', regionKey);
        // Inject placeholder siteGroups for hidden proxy sites in this region (keepSiteTogether already handled)
        if (groupedByRegion.__hiddenSites && groupedByRegion.__hiddenSites[regionKey]) {
          let hiddenMap = groupedByRegion.__hiddenSites[regionKey];
          let list = g.querySelector('.category-feeds');
          for (let sid in hiddenMap) {
            if (g.querySelector(`[data-site-id="${sid}"]`)) continue;
            list.appendChild(buildSiteGroup(sid, hiddenMap[sid], [], []));
          }
        }
        groups.push(g);
      } else {
        // For flat keepSiteTogether false, need to also inject placeholders
        let baseFeeds = regionData;
        let g = buildGroup('group-region-label', regionLabel, baseFeeds, siteCategoryMap, 'region', regionKey);
        if (groupedByRegion.__hiddenSites && groupedByRegion.__hiddenSites[regionKey]) {
          let hiddenMap = groupedByRegion.__hiddenSites[regionKey];
          let list = g.querySelector('.category-feeds');
          for (let sid in hiddenMap) {
            if (g.querySelector(`[data-site-id="${sid}"]`)) continue;
            list.appendChild(buildSiteGroup(sid, hiddenMap[sid], [], []));
          }
        }
        groups.push(g);
      }
    }
    // If there were hidden sites whose region was not yet in groupedByRegion, create groups for them
    if (filters.hiddenProxySites.size > 0 && groupedByRegion.__hiddenSites) {
      for (let reg in groupedByRegion.__hiddenSites) {
        if (sortedRegions.includes(reg)) continue;
        let regionLabel = regions[reg] || t('uncategorized');
        let g = buildGroup('group-region-label', regionLabel, [], siteCategoryMap, 'region', reg);
        let list = g.querySelector('.category-feeds');
        let hiddenMap = groupedByRegion.__hiddenSites[reg];
        for (let sid in hiddenMap) list.appendChild(buildSiteGroup(sid, hiddenMap[sid], [], []));
        groups.push(g);
      }
    }
  } else if (filters.groupOpml) {
    let grouped = {};
    for (let i = 0; i < visibleFeeds.length; i++) {
      let feed = visibleFeeds[i];
      let cat = feed.category || 'uncategorized';
      if (filters.keepSiteTogether) {
        let siteId = feed.siteId;
        if (!grouped[cat]) grouped[cat] = {};
        if (!grouped[cat][siteId]) grouped[cat][siteId] = { name: feed.siteName, feeds: [] };
        grouped[cat][siteId].feeds.push(feed);
      } else {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(feed);
      }
    }
    // Placeholder handling for hidden proxy sites
    let hiddenByCat = {};
    if (filters.hiddenProxySites.size > 0) {
      let seenSitesPerCat = {};
      for (let cat in grouped) {
        seenSitesPerCat[cat] = new Set();
        let v = grouped[cat];
        if (filters.keepSiteTogether) for (let sid in v) seenSitesPerCat[cat].add(sid);
        else for (let f of v) seenSitesPerCat[cat].add(f.siteId);
      }
      for (let feed of allFeeds) {
        if (!feed.isProxy || !filters.hiddenProxySites.has(feed.siteId)) continue;
        if (!passesExceptHiddenSite(feed)) continue;
        let cat = feed.category || 'uncategorized';
        if (!seenSitesPerCat[cat] || !seenSitesPerCat[cat].has(feed.siteId)) {
          if (!hiddenByCat[cat]) hiddenByCat[cat] = {};
          hiddenByCat[cat][feed.siteId] = feed.siteName;
          if (!seenSitesPerCat[cat]) seenSitesPerCat[cat] = new Set();
          seenSitesPerCat[cat].add(feed.siteId);
          if (!grouped[cat]) grouped[cat] = filters.keepSiteTogether ? {} : [];
        }
      }
    }
    let sortedCats = Object.keys(grouped).sort((a, b) => {
      let orderA = categories[a] ? (categories[a].order || 999) : 999;
      let orderB = categories[b] ? (categories[b].order || 999) : 999;
      if (orderA !== orderB) return orderA - orderB;
      if (categories[a] && categories[b]) return (categories[a].label || a).localeCompare(categories[b].label || b);
      return a.localeCompare(b);
    });
    for (let g = 0; g < sortedCats.length; g++) {
      let catKey = sortedCats[g];
      let catData = grouped[catKey];
      let catLabel = categories[catKey] ? categories[catKey].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim() : t('uncategorized');
      let gEl;
      if (filters.keepSiteTogether) {
        let feedsInCat = [];
        let siteIds = Object.keys(catData).sort();
        for (let s = 0; s < siteIds.length; s++) feedsInCat.push(...catData[siteIds[s]].feeds);
        gEl = buildGroup('group-label', catLabel, feedsInCat, siteCategoryMap, 'category', catKey);
      } else {
        gEl = buildGroup('group-label', catLabel, catData, siteCategoryMap, 'category', catKey);
      }
      // Inject placeholder siteGroups for hidden sites in this category
      if (hiddenByCat[catKey]) {
        let list = gEl.querySelector('.category-feeds');
        for (let sid in hiddenByCat[catKey]) {
          if (gEl.querySelector(`[data-site-id="${sid}"]`)) continue;
          list.appendChild(buildSiteGroup(sid, hiddenByCat[catKey][sid], [], []));
        }
      }
      groups.push(gEl);
    }
  } else {
    let feedsBySiteLocal = {};
    for (let u = 0; u < visibleFeeds.length; u++) {
      let vf = visibleFeeds[u];
      if (!feedsBySiteLocal[vf.siteId]) feedsBySiteLocal[vf.siteId] = { name: vf.siteName, feeds: [] };
      feedsBySiteLocal[vf.siteId].feeds.push(vf);
    }
    // Add placeholders for hidden proxy sites with no visible feeds
    if (filters.hiddenProxySites.size > 0) {
      for (let feed of allFeeds) {
        if (!feed.isProxy || !filters.hiddenProxySites.has(feed.siteId)) continue;
        if (feedsBySiteLocal[feed.siteId]) continue;
        if (!passesExceptHiddenSite(feed)) continue;
        feedsBySiteLocal[feed.siteId] = { name: feed.siteName, feeds: [] };
      }
    }
    let siteIds = Object.keys(feedsBySiteLocal).sort();
    for (let s = 0; s < siteIds.length; s++) {
      let sid = siteIds[s];
      let sg = feedsBySiteLocal[sid];
      groups.push(buildSiteGroup(sid, sg.name, sg.feeds, []));
    }
  }
  return groups;
}

function renderNextChunk() {
  if (!_groupNodes.length) return;
  let remaining = _groupNodes.length - _renderedGroups;
  if (remaining <= 0) {
    cleanupObserver();
    return;
  }
  let take = Math.min(PAGE_SIZE, remaining);
  // For grouped mode, page by groups; for flat site-groups, also by groups (each site is a group)
  // Estimate: PAGE_SIZE groups ~ 80 sites -> ~ 200-400 feeds
  let frag = document.createDocumentFragment();
  for (let i = 0; i < take; i++) {
    frag.appendChild(_groupNodes[_renderedGroups + i]);
  }
  _renderedGroups += take;
  // Insert before sentinel if present
  if (_sentinel && _sentinel.parentNode === el.feedList) {
    el.feedList.insertBefore(frag, _sentinel);
  } else {
    el.feedList.appendChild(frag);
  }
  if (_renderedGroups >= _groupNodes.length) {
    cleanupObserver();
  }
  if (window.updateBackToTop) window.updateBackToTop();
}

function setupPaginationObserver() {
  if (_groupNodes.length <= _renderedGroups) return;
  if (_observer) _observer.disconnect();
  _sentinel = document.createElement('div');
  _sentinel.className = 'pagination-sentinel';
  _sentinel.setAttribute('aria-hidden', 'true');
  _sentinel.style.cssText = 'height:1px; visibility:hidden;';
  el.feedList.appendChild(_sentinel);
  _observer = new IntersectionObserver(function (entries) {
    for (let e of entries) {
      if (e.isIntersecting) {
        // Render next chunk in rAF to avoid jank
        requestAnimationFrame(renderNextChunk);
        break;
      }
    }
  }, { root: null, rootMargin: SENTINEL_MARGIN, threshold: 0 });
  _observer.observe(_sentinel);
}

export function render() {
  if (!el.feedList) return;
  ensureDelegation();
  if (_renderRaf) cancelAnimationFrame(_renderRaf);
  _renderRaf = requestAnimationFrame(function () {
    _renderRaf = 0;
    doRender();
  });
}

function doRender() {
  // Allow fast path for selection-only changes without full rebuild? For now full rebuild but paginated
  _visibleFeeds = getVisibleFeeds();

  if (_visibleFeeds.length === 0) {
    cleanupObserver();
    _groupNodes = [];
    _renderedGroups = 0;
    el.feedList.style.minHeight = '';
    el.feedList.innerHTML = '';
    el.empty.hidden = false;
    updateCounter();
    try { window.dispatchEvent(new CustomEvent('awesome-rss:rendered')); } catch (e) {}
    if (window.updateBackToTop) window.updateBackToTop();
    return;
  }
  el.empty.hidden = true;

  _siteCategoryMap = {};
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (!_siteCategoryMap[feed.siteId]) _siteCategoryMap[feed.siteId] = { name: feed.siteName, cats: {} };
    _siteCategoryMap[feed.siteId].cats[feed.category] = true;
  }

  // Build all groups as detached nodes
  _groupNodes = buildAllGroups(_visibleFeeds, _siteCategoryMap);
  _renderedGroups = 0;

  cleanupObserver();
  el.feedList.style.minHeight = '';
  el.feedList.innerHTML = '';

  // For small sets, render all at once without observer
  if (_groupNodes.length <= PAGE_SIZE) {
    let frag = document.createDocumentFragment();
    for (let i = 0; i < _groupNodes.length; i++) frag.appendChild(_groupNodes[i]);
    el.feedList.appendChild(frag);
    _renderedGroups = _groupNodes.length;
  } else {
    // Render first page immediately
    renderNextChunk();
    setupPaginationObserver();
  }

  updateCounter();
  // Notify back-to-top to re-evaluate visibility after DOM height changed
  try { window.dispatchEvent(new CustomEvent('awesome-rss:rendered')); } catch (e) {}
  if (window.updateBackToTop) window.updateBackToTop();
}

export function updateDownloadBtns() {
  let downloadableCount = 0;
  for (let i = 0; i < allFeeds.length; i++) {
    if (isFeedDownloadable(allFeeds[i])) downloadableCount++;
  }
  let disabled = downloadableCount === 0;
  el.downloadBtn.disabled = disabled;
  el.downloadAltBtn.disabled = disabled;

  let isGrouped = filters.groupByRegion || filters.groupOpml;
  el.downloadAltBtn.hidden = !isGrouped;

  let downloadKey;
  if (filters.groupByRegion) downloadKey = 'download-' + filters.format + '-region';
  else if (filters.groupOpml) downloadKey = 'download-' + filters.format + '-category';
  else downloadKey = 'download-' + filters.format;

  el.downloadBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
    '<path d="M7 1v8M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M1.5 10v2a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg> <span>' + t(downloadKey) + '</span>' +
    ' <span class="download-count">' + downloadableCount + '</span>';
  let badge = el.downloadBtn.querySelector('.download-count');
  if (badge) badge.hidden = downloadableCount === 0;
}

function buildSiteGroup(siteId, siteName, feeds, otherCats) {
  let wrapper = document.createElement('div');
  wrapper.className = 'site-group';
  wrapper.dataset.siteId = siteId;

  let header = document.createElement('div');
  header.className = 'site-header';

  let title = document.createElement('h3');
  title.className = 'site-header-title';
  title.textContent = siteName;
  header.appendChild(title);

  let actions = document.createElement('div');
  actions.className = 'site-actions';

  let hasProxy = siteHasProxies(siteId);
  if (hasProxy && filters.showProxies) {
    let proxyBtn = document.createElement('button');
    proxyBtn.className = 'site-action';
    proxyBtn.setAttribute('data-cuelume-press', '');
    proxyBtn.dataset.action = 'site-toggle-proxies';
    proxyBtn.dataset.siteId = siteId;
    let proxyHidden = filters.hiddenProxySites.has(siteId);
    proxyBtn.textContent = t(proxyHidden ? 'show-site-proxies' : 'hide-site-proxies');
    actions.appendChild(proxyBtn);
  }

  let selectBtn = document.createElement('button');
  selectBtn.className = 'site-action';
  selectBtn.setAttribute('data-cuelume-press', '');
  selectBtn.dataset.action = 'site-select';
  selectBtn.dataset.siteId = siteId;
  selectBtn.textContent = t('select-all');
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'site-action';
  deselectBtn.setAttribute('data-cuelume-press', '');
  deselectBtn.dataset.action = 'site-deselect';
  deselectBtn.dataset.siteId = siteId;
  deselectBtn.textContent = t('deselect-all');
  actions.appendChild(deselectBtn);

  header.appendChild(actions);
  wrapper.appendChild(header);

  for (let i = 0; i < feeds.length; i++) {
    let item = buildFeedItem(feeds[i]);
    wrapper.appendChild(item);
  }

  if (otherCats.length > 0 && !filters.keepSiteTogether && !filters.mainFeedOnly) {
    let note = document.createElement('div');
    note.className = 'cross-category-note';
    let catLabels = otherCats.map(slug => categories[slug] ? categories[slug].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim() : slug);
    note.textContent = t('cross-category-note', { site: siteName, cats: catLabels.join(', ') });
    wrapper.appendChild(note);
  }

  return wrapper;
}

function buildFeedItem(feed) {
  let item = document.createElement('div');
  item.className = 'feed-item' + (feed.isMain ? '' : ' feed-item--sub');
  item.dataset.feedId = feed.id;

  let checkboxId = 'feed-cb-' + feed.id;
  let checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = checkboxId;
  checkbox.className = 'feed-checkbox';
  checkbox.dataset.feedId = feed.id;
  checkbox.dataset.cuelumeToggle = '';
  checkbox.checked = selectedFeeds.has(feed.id);
  checkbox.setAttribute('aria-label', feed.feedName + ' — ' + feedDisplayUrl(feed));
  item.appendChild(checkbox);

  let label = document.createElement('label');
  label.className = 'feed-label';
  label.setAttribute('for', checkboxId);

  let info = document.createElement('div');
  info.className = 'feed-info';

  let text = document.createElement('div');
  text.className = 'feed-text';

  let name = document.createElement('span');
  name.className = 'feed-name';
  name.textContent = feed.feedName;
  text.appendChild(name);

  let meta = document.createElement('span');
  meta.className = 'feed-meta';
  meta.textContent = feedDisplayUrl(feed);
  text.appendChild(meta);
  info.appendChild(text);

  if (feed.status === 'duplicate') {
    let tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'tag tag-duplicate';
    tag.textContent = t('tag-duplicate');
    tag.setAttribute('aria-label', t('tag-duplicate') + (feed.duplicateOf ? ': ' + (feedNameById.get(feed.duplicateOf) || feed.duplicateOf) : ''));
    if (feed.duplicateOf) {
      let originalName = feedNameById.get(feed.duplicateOf) || feed.duplicateOf;
      tag.dataset.popover = originalName;
      tag.setAttribute('aria-describedby', 'popover');
      tag.setAttribute('aria-expanded', 'false');
    }
    info.appendChild(tag);
  } else if (feed.status !== 'active') {
    let tag = document.createElement('span');
    tag.className = 'tag tag-stale';
    tag.textContent = t('tag-stale');
    info.appendChild(tag);
  }

  if (feed.isProxy) {
    let proxyTag = document.createElement('span');
    proxyTag.className = 'tag tag-proxy';
    proxyTag.textContent = t('tag-proxy');
    info.appendChild(proxyTag);
  }

  label.appendChild(info);
  item.appendChild(label);

  let actions = document.createElement('div');
  actions.className = 'feed-actions';

  let feedLink = document.createElement('a');
  feedLink.className = 'feed-link';
  feedLink.href = feedDisplayUrl(feed);
  feedLink.target = '_blank';
  feedLink.rel = 'noopener';
  feedLink.title = t('open-feed');
  feedLink.setAttribute('aria-label', t('open-feed') + ': ' + feed.feedName);
  feedLink.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8 2h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 8.5 12 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 8.5v3a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  actions.appendChild(feedLink);

  let copyBtn = document.createElement('button');
  copyBtn.className = 'copy-link';
  copyBtn.dataset.feedId = feed.id;
  copyBtn.setAttribute('aria-label', t('copy-link') + ': ' + feed.feedName);
  copyBtn.title = t('copy-link');
  copyBtn.setAttribute('data-cuelume-press', '');
  copyBtn.innerHTML = '<svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7.5l3.5 3L12 4"/></svg>';
  actions.appendChild(copyBtn);

  let reportBtn = document.createElement('a');
  reportBtn.className = 'report-link';
  reportBtn.href = 'https://github.com/alplox/awesome-chilean-rss/issues/new?title=Broken+feed+link&body=' + encodeURIComponent('Feed URL: ' + feed.rssUrl);
  reportBtn.target = '_blank';
  reportBtn.rel = 'noopener';
  reportBtn.title = t('report-link');
  reportBtn.setAttribute('aria-label', t('report-link') + ': ' + feed.feedName);
  reportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1L13 12H1L7 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 6v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="10" r="0.5" fill="currentColor"/></svg>';
  actions.appendChild(reportBtn);

  item.appendChild(actions);

  return item;
}

/* --- Selection --- */

function toggleFeed(id, checked) {
  if (checked === undefined) {
    if (selectedFeeds.has(id)) selectedFeeds.delete(id);
    else selectedFeeds.add(id);
  } else {
    if (checked) selectedFeeds.add(id);
    else selectedFeeds.delete(id);
  }
  // Update single checkbox already reflects, just update counters efficiently
  updateCounterIncremental();
}

function selectAllInScope(key, scope) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (scope(visible[i]) === key) selectedFeeds.add(visible[i].id);
  }
  syncCheckboxStates();
  updateCounter();
}

function deselectAllInScope(key, scope) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (scope(visible[i]) === key) selectedFeeds.delete(visible[i].id);
  }
  syncCheckboxStates();
  updateCounter();
}

export function selectAllInCategory(catKey) { selectAllInScope(catKey, f => f.category); }
export function deselectAllInCategory(catKey) { deselectAllInScope(catKey, f => f.category); }
function selectAllInRegion(regionKey) { selectAllInScope(regionKey, f => f.region); }
function deselectAllInRegion(regionKey) { deselectAllInScope(regionKey, f => f.region); }
function selectAllInSite(siteId) { selectAllInScope(siteId, f => f.siteId); }
function deselectAllInSite(siteId) { deselectAllInScope(siteId, f => f.siteId); }

function syncCheckboxStates() {
  let checkboxes = el.feedList.querySelectorAll('.feed-checkbox');
  for (let i = 0; i < checkboxes.length; i++) {
    let cb = checkboxes[i];
    cb.checked = selectedFeeds.has(cb.dataset.feedId);
  }
}

export function selectAllGlobal() {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) selectedFeeds.add(visible[i].id);
  syncCheckboxStates();
  updateCounter();
}

export function deselectAllGlobal() {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) selectedFeeds.delete(visible[i].id);
  syncCheckboxStates();
  updateCounter();
}

export function deselectHidden() {
  let visible = getVisibleFeeds();
  let visibleIds = new Set(visible.map(f => f.id));
  let toRemove = [];
  selectedFeeds.forEach(function (id) {
    if (!visibleIds.has(id)) toRemove.push(id);
  });
  for (let j = 0; j < toRemove.length; j++) selectedFeeds.delete(toRemove[j]);
  syncCheckboxStates();
  updateCounter();
}

function updateCounterIncremental() {
  // Fast path for single toggle: update counters without full getVisibleFeeds re-scan if possible
  // For correctness with small cost, delegate to full updateCounter (still cached)
  updateCounter();
}

function updateCounter() {
  // Uses cached getVisibleFeeds
  let visible = getVisibleFeeds();
  let visibleIds = new Set(visible.map(f => f.id));

  let narrowing = getFeedsMatchingNarrowingFilters();
  let selectedCount = 0;
  for (let i = 0; i < visible.length; i++) {
    if (selectedFeeds.has(visible[i].id)) selectedCount++;
  }

  let hiddenCount = 0;
  for (let i = 0; i < narrowing.length; i++) {
    let id = narrowing[i].id;
    if (selectedFeeds.has(id) && !visibleIds.has(id)) hiddenCount++;
  }

  let totalSelected = selectedCount + hiddenCount;
  let counterText = t('counter-visible', { sel: totalSelected.toLocaleString(), vis: visible.length.toLocaleString() });
  if (hiddenCount > 0) {
    counterText += ' ' + t('counter-hidden', { hid: hiddenCount.toLocaleString() });
  }
  el.counter.textContent = counterText;
  updateDownloadBtns();

  let counters = el.feedList.querySelectorAll('.category-counter');
  for (let i = 0; i < counters.length; i++) {
    let counter = counters[i];
    let group = counter.closest('.category-group');
    let scopeKey = group ? group.dataset.scopeKey : null;
    let scopeType = group ? group.dataset.scopeType : null;
    let total = 0;
    let sel = 0;
    if (scopeKey && scopeType) {
      for (let v = 0; v < visible.length; v++) {
        let f = visible[v];
        let match = scopeType === 'region' ? f.region === scopeKey : f.category === scopeKey;
        // Handle uncategorized
        if (scopeKey === 'uncategorized') match = !f[scopeType] || f[scopeType] === 'uncategorized';
        if (match) {
          total++;
          if (selectedFeeds.has(f.id)) sel++;
        }
      }
      counter.textContent = sel + '/' + total;
    } else {
      // Fallback to old dataset logic for flat groups
      let ids = counter.dataset.feedIds.split(',').filter(Boolean);
      sel = 0;
      for (let j = 0; j < ids.length; j++) if (selectedFeeds.has(ids[j])) sel++;
      counter.textContent = sel + '/' + ids.length;
    }
  }

  if (hiddenCount > 0) {
    el.deselectHidden.classList.remove('is-hidden');
    el.deselectHidden.textContent = t('deselect-hidden', { count: hiddenCount.toLocaleString() });
  } else {
    el.deselectHidden.classList.add('is-hidden');
  }
}

function siteHasProxies(siteId) {
  let list = feedsBySite.get(siteId);
  if (!list) return false;
  for (let i = 0; i < list.length; i++) if (list[i].isProxy) return true;
  return false;
}

function toggleSiteProxyVisibility(siteId) {
  let willHide = !filters.hiddenProxySites.has(siteId);
  let prevY = window.scrollY;
  if (willHide) {
    filters.hiddenProxySites.add(siteId);
    for (let i = 0; i < allFeeds.length; i++) {
      if (allFeeds[i].siteId === siteId && allFeeds[i].isProxy) {
        selectedFeeds.delete(allFeeds[i].id);
      }
    }
  } else {
    filters.hiddenProxySites.delete(siteId);
  }

  // Incremental DOM update to avoid scroll jump from full rebuild
  let siteGroups = el.feedList ? el.feedList.querySelectorAll(`.site-group[data-site-id="${siteId}"]`) : [];
  if (siteGroups.length > 0) {
    siteGroups.forEach(function (sg) {
      let proxyItems = [];
      let items = sg.querySelectorAll('.feed-item');
      items.forEach(function (item) {
        let fid = item.dataset.feedId;
        let feed = allFeeds.find(f => f.id === fid);
        if (feed && feed.isProxy) proxyItems.push(item);
      });
      proxyItems.forEach(function (item) {
        item.style.display = willHide ? 'none' : '';
      });
      // Update button text in this siteGroup
      let btn = sg.querySelector('.site-action[data-action="site-toggle-proxies"]');
      if (btn) btn.textContent = t(willHide ? 'show-site-proxies' : 'hide-site-proxies');
      // If hiding and no visible items left, keep header visible (no extra work)
    });
    // Update counters without full rebuild
    updateCounter();
    // Preserve scroll (no jump)
    requestAnimationFrame(function () {
      let newY = window.scrollY;
      if (Math.abs(newY - prevY) > 2) window.scrollTo(0, prevY);
    });
    return;
  }

  // Site not in current viewport (due to pagination) — fallback to full render with scroll preservation
  let savedY = prevY;
  let savedHeight = document.documentElement.scrollHeight;
  render();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      let newHeight = document.documentElement.scrollHeight;
      // If content shrank, clamp scroll
      let targetY = Math.min(savedY, Math.max(0, newHeight - window.innerHeight));
      if (Math.abs(window.scrollY - targetY) > 2) window.scrollTo(0, targetY);
    });
  });
}

/* --- Duplicate tag popover --- */
let popoverEl = null;
let hoverTimeout = null;

function showPopover(tag) {
  if (!popoverEl) {
    popoverEl = document.createElement('div');
    popoverEl.className = 'popover';
    popoverEl.id = 'popover';
    popoverEl.setAttribute('role', 'tooltip');
    document.body.appendChild(popoverEl);
  }
  popoverEl.textContent = tag.dataset.popover;
  popoverEl.hidden = false;
  popoverEl._owner = tag;
  if (tag.tagName === 'BUTTON') tag.setAttribute('aria-expanded', 'true');
  let rect = tag.getBoundingClientRect();
  let pw = popoverEl.offsetWidth;
  let ph = popoverEl.offsetHeight;
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let left = rect.left + rect.width / 2 - pw / 2;
  if (left < 8) left = 8;
  if (left + pw > vw - 8) left = vw - pw - 8;
  let top = rect.bottom + 6;
  if (top + ph > vh - 8) top = rect.top - ph - 6;
  popoverEl.style.left = left + 'px';
  popoverEl.style.top = top + 'px';
}

function hidePopover() {
  if (popoverEl) {
    popoverEl.hidden = true;
    if (popoverEl._owner && popoverEl._owner.tagName === 'BUTTON') popoverEl._owner.setAttribute('aria-expanded', 'false');
  }
}

function isOpen(tag) {
  return popoverEl && !popoverEl.hidden && popoverEl._owner === tag;
}

document.addEventListener('mouseover', function (e) {
  let tag = e.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    clearTimeout(hoverTimeout);
    showPopover(tag);
  }
});

document.addEventListener('mouseout', function (e) {
  let tag = e.target.closest('.tag-duplicate[data-popover]');
  if (!tag) return;
  let related = e.relatedTarget;
  if (!related) { hoverTimeout = setTimeout(hidePopover, 150); return; }
  if (related === popoverEl || (popoverEl && popoverEl.contains(related))) return;
  if (related.closest && related.closest('.tag-duplicate[data-popover]')) return;
  hoverTimeout = setTimeout(hidePopover, 150);
});

document.addEventListener('click', function (e) {
  let tag = e.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    e.stopPropagation();
    if (isOpen(tag)) {
      hidePopover();
    } else {
      showPopover(tag);
    }
    return;
  }
  hidePopover();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && popoverEl && !popoverEl.hidden) {
    let owner = popoverEl._owner;
    hidePopover();
    if (owner) owner.focus();
  }
});

document.addEventListener('focusin', function (e) {
  let tag = e.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    clearTimeout(hoverTimeout);
    showPopover(tag);
  }
});

document.addEventListener('focusout', function (e) {
  let tag = e.target.closest('.tag-duplicate[data-popover]');
  if (!tag) return;
  // delay to allow focus to move to another duplicate tag
  hoverTimeout = setTimeout(function () {
    let active = document.activeElement;
    if (active && active.closest && active.closest('.tag-duplicate[data-popover]')) return;
    if (popoverEl && popoverEl.contains(active)) return;
    hidePopover();
  }, 100);
});
