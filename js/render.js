import { allFeeds, categories, regions, selectedFeeds, filters, el } from './state.js';
import { t } from './i18n.js';
import { getVisibleFeeds, getFeedsMatchingNarrowingFilters, isFeedDownloadable } from './filters.js';
import { playSuccess } from './sound.js';

export function showLoading() {
  el.loading.hidden = false;
  el.loading.textContent = t('loading');
  el.error.hidden = true;
  el.empty.hidden = true;
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

  let header = document.createElement('div');
  header.className = 'category-header';

  let title = document.createElement('h2');
  title.className = 'category-title';
  title.textContent = t(titleKey, { label: titleLabel });
  title.addEventListener('click', () => group.classList.toggle('collapsed'));
  header.appendChild(title);

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

  let scopeFn = scopeType === 'region' ? f => f.region : f => f.category;

  let selectBtn = document.createElement('button');
  selectBtn.className = 'category-action';
  selectBtn.setAttribute('data-cuelume-press', '');
  selectBtn.textContent = t('select-all');
  selectBtn.addEventListener('click', () => selectAllInScope(scopeKey, scopeFn));
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'category-action';
  deselectBtn.setAttribute('data-cuelume-press', '');
  deselectBtn.textContent = t('deselect-all');
  deselectBtn.addEventListener('click', () => deselectAllInScope(scopeKey, scopeFn));
  actions.appendChild(deselectBtn);

  header.appendChild(actions);
  group.appendChild(header);

  let list = document.createElement('div');
  list.className = 'category-feeds';

  let feedsBySite = {};
  for (let i = 0; i < feeds.length; i++) {
    let feed = feeds[i];
    if (!feedsBySite[feed.siteId]) feedsBySite[feed.siteId] = { name: feed.siteName, feeds: [] };
    feedsBySite[feed.siteId].feeds.push(feed);
  }

  let siteIds = Object.keys(feedsBySite);
  for (let s = 0; s < siteIds.length; s++) {
    let sid = siteIds[s];
    let siteGroup = feedsBySite[sid];
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

export function render() {
  if (!el.feedList) return;

  let visibleFeeds = getVisibleFeeds();

  if (visibleFeeds.length === 0) {
    el.feedList.innerHTML = '';
    el.empty.hidden = false;
    updateCounter();
    return;
  }
  el.empty.hidden = true;

  let siteCategoryMap = {};
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (!siteCategoryMap[feed.siteId]) {
      siteCategoryMap[feed.siteId] = { name: feed.siteName, cats: {} };
    }
    siteCategoryMap[feed.siteId].cats[feed.category] = true;
  }
  let frag = document.createDocumentFragment();

  if (filters.groupByRegion) {
    let groupedByRegion = {};
    for (let i = 0; i < visibleFeeds.length; i++) {
      let feed = visibleFeeds[i];
      let region = feed.region || 'uncategorized';
      
      if (filters.keepSiteTogether) {
        // Assign site to single region (first/main feed's region)
        let siteId = feed.siteId;
        if (!groupedByRegion[region]) groupedByRegion[region] = {};
        if (!groupedByRegion[region][siteId]) groupedByRegion[region][siteId] = { name: feed.siteName, feeds: [] };
        groupedByRegion[region][siteId].feeds.push(feed);
      } else {
        if (!groupedByRegion[region]) groupedByRegion[region] = [];
        groupedByRegion[region].push(feed);
      }
    }

    let sortedRegions = Object.keys(groupedByRegion).sort();
    for (let r = 0; r < sortedRegions.length; r++) {
      let regionKey = sortedRegions[r];
      let regionData = groupedByRegion[regionKey];
      let regionLabel = regions[regionKey] || t('uncategorized');
      
      if (filters.keepSiteTogether) {
        // Flatten sites into feeds array for buildGroup
        let feedsInRegion = [];
        let siteIds = Object.keys(regionData).sort();
        for (let s = 0; s < siteIds.length; s++) {
          let sid = siteIds[s];
          feedsInRegion.push(...regionData[sid].feeds);
        }
        frag.appendChild(buildGroup('group-region-label', regionLabel, feedsInRegion, siteCategoryMap, 'region', regionKey));
      } else {
        frag.appendChild(buildGroup('group-region-label', regionLabel, regionData, siteCategoryMap, 'region', regionKey));
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
      let catLabel = categories[catKey]
        ? categories[catKey].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim()
        : t('uncategorized');
      
      if (filters.keepSiteTogether) {
        let feedsInCat = [];
        let siteIds = Object.keys(catData).sort();
        for (let s = 0; s < siteIds.length; s++) {
          feedsInCat.push(...catData[siteIds[s]].feeds);
        }
        frag.appendChild(buildGroup('group-label', catLabel, feedsInCat, siteCategoryMap, 'category', catKey));
      } else {
        frag.appendChild(buildGroup('group-label', catLabel, catData, siteCategoryMap, 'category', catKey));
      }
    }
  } else {
    let feedsBySite = {};
    for (let u = 0; u < visibleFeeds.length; u++) {
      let vf = visibleFeeds[u];
      if (!feedsBySite[vf.siteId]) feedsBySite[vf.siteId] = { name: vf.siteName, feeds: [] };
      feedsBySite[vf.siteId].feeds.push(vf);
    }

    let siteIds = Object.keys(feedsBySite).sort();
    for (let s = 0; s < siteIds.length; s++) {
      let sid = siteIds[s];
      let sg = feedsBySite[sid];
      frag.appendChild(buildSiteGroup(sid, sg.name, sg.feeds, []));
    }
  }

  el.feedList.innerHTML = '';
  el.feedList.appendChild(frag);
  updateCounter();
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
  if (filters.groupByRegion) {
    downloadKey = 'download-' + filters.format + '-region';
  } else if (filters.groupOpml) {
    downloadKey = 'download-' + filters.format + '-category';
  } else {
    downloadKey = 'download-' + filters.format;
  }

  el.downloadBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
    '<path d="M7 1v8M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M1.5 10v2a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg> <span>' + t(downloadKey) + '</span>' +
    (downloadableCount > 0 ? ' <span class="download-count">' + downloadableCount + '</span>' : '');
}

function buildRegionGroup(regionKey, label, feeds, siteCategoryMap) {
  let group = document.createElement('div');
  group.className = 'category-group';

  let header = document.createElement('div');
  header.className = 'category-header';

  let title = document.createElement('h2');
  title.className = 'category-title';
  title.textContent = t('group-region-label', { label: label });
  title.addEventListener('click', function () {
    group.classList.toggle('collapsed');
  });
  header.appendChild(title);

  let total = feeds.length;
  let regionSelected = 0;
  for (let c = 0; c < feeds.length; c++) {
    if (selectedFeeds.has(feeds[c].id)) regionSelected++;
  }
  let catCounter = document.createElement('span');
  catCounter.className = 'category-counter';
  catCounter.textContent = regionSelected + '/' + total;
  header.appendChild(catCounter);

  let actions = document.createElement('div');
  actions.className = 'category-actions';

  let selectBtn = document.createElement('button');
  selectBtn.className = 'category-action';
  selectBtn.textContent = t('select-all');
  selectBtn.addEventListener('click', function () {
    selectAllInRegion(regionKey);
  });
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'category-action';
  deselectBtn.textContent = t('deselect-all');
  deselectBtn.addEventListener('click', function () {
    deselectAllInRegion(regionKey);
  });
  actions.appendChild(deselectBtn);

  header.appendChild(actions);
  group.appendChild(header);

  let list = document.createElement('div');
  list.className = 'category-feeds';

  let feedsBySite = {};
  for (let i = 0; i < feeds.length; i++) {
    let feed = feeds[i];
    if (!feedsBySite[feed.siteId]) {
      feedsBySite[feed.siteId] = { name: feed.siteName, feeds: [] };
    }
    feedsBySite[feed.siteId].feeds.push(feed);
  }

  let siteIds = Object.keys(feedsBySite);
  for (let s = 0; s < siteIds.length; s++) {
    let sid = siteIds[s];
    let siteGroup = feedsBySite[sid];

    let otherCats = getSiteCategories(siteCategoryMap, sid, null);
    let siteEl = buildSiteGroup(sid, siteGroup.name, siteGroup.feeds, otherCats);
    list.appendChild(siteEl);
  }

  group.appendChild(list);
  return group;
}

function buildSiteGroup(siteId, siteName, feeds, otherCats) {
  let wrapper = document.createElement('div');
  wrapper.className = 'site-group';

  let header = document.createElement('div');
  header.className = 'site-header';

  let title = document.createElement('span');
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
    let proxyHidden = filters.hiddenProxySites.has(siteId);
    proxyBtn.textContent = t(proxyHidden ? 'show-site-proxies' : 'hide-site-proxies');
    proxyBtn.addEventListener('click', function () {
      toggleSiteProxyVisibility(siteId);
    });
    actions.appendChild(proxyBtn);
  }

  let selectBtn = document.createElement('button');
  selectBtn.className = 'site-action';
  selectBtn.setAttribute('data-cuelume-press', '');
  selectBtn.textContent = t('select-all');
  selectBtn.addEventListener('click', function () {
    selectAllInSite(siteId);
  });
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'site-action';
  deselectBtn.setAttribute('data-cuelume-press', '');
  deselectBtn.textContent = t('deselect-all');
  deselectBtn.addEventListener('click', function () {
    deselectAllInSite(siteId);
  });
  actions.appendChild(deselectBtn);

  header.appendChild(actions);
  wrapper.appendChild(header);

  for (let i = 0; i < feeds.length; i++) {
    let item = buildFeedItem(feeds[i]);
    wrapper.appendChild(item);
  }

  if (otherCats.length > 0 && !filters.keepSiteTogether) {
    let note = document.createElement('div');
    note.className = 'cross-category-note';
    let catLabels = otherCats.map(slug => categories[slug] ? categories[slug].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim() : slug);
    note.textContent = t('cross-category-note', {
      site: siteName,
      cats: catLabels.join(', ')
    });
    wrapper.appendChild(note);
  }

  return wrapper;
}

function buildFeedItem(feed) {
  let item = document.createElement('label');
  item.className = 'feed-item' + (feed.isMain ? '' : ' feed-item--sub');
  item.dataset.feedId = feed.id;

  let checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'feed-checkbox';
  checkbox.dataset.feedId = feed.id;
  checkbox.dataset.cuelumeToggle = '';
  checkbox.checked = selectedFeeds.has(feed.id);
  checkbox.addEventListener('change', function () {
    toggleFeed(feed.id);
  });
  item.appendChild(checkbox);

  let label = document.createElement('div');
  label.className = 'feed-label';

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
  meta.textContent = feed.rssUrl;
  text.appendChild(meta);
  info.appendChild(text);

  if (feed.status !== 'active') {
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

  let actions = document.createElement('div');
  actions.className = 'feed-actions';

  let feedLink = document.createElement('a');
  feedLink.className = 'feed-link';
  feedLink.href = feed.rssUrl;
  feedLink.target = '_blank';
  feedLink.rel = 'noopener';
  feedLink.title = t('open-feed');
  feedLink.setAttribute('aria-label', 'Abrir URL del feed');
  feedLink.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8 2h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 8.5 12 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 8.5v3a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  feedLink.addEventListener('click', function (e) {
    e.stopPropagation();
  });
  actions.appendChild(feedLink);

  let copyBtn = document.createElement('button');
  copyBtn.className = 'copy-link';
  copyBtn.setAttribute('aria-label', t('copy-link'));
  copyBtn.title = t('copy-link');
  copyBtn.setAttribute('data-cuelume-press', '');
  copyBtn.innerHTML = '<svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7.5l3.5 3L12 4"/></svg>';
  copyBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    let copy = function () {
      copyBtn.classList.add('copied');
      playSuccess();
      setTimeout(function () { copyBtn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(feed.rssUrl).then(copy, fallback);
    } else {
      fallback();
    }
    function fallback() {
      let ta = document.createElement('textarea');
      ta.value = feed.rssUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copy();
    }
  });
  actions.appendChild(copyBtn);
  info.appendChild(actions);

  label.appendChild(info);
  item.appendChild(label);

  return item;
}

/* --- Selection --- */

function toggleFeed(id) {
  if (selectedFeeds.has(id)) {
    selectedFeeds.delete(id);
  } else {
    selectedFeeds.add(id);
  }
  updateCounter();
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

  let narrowing = getFeedsMatchingNarrowingFilters();
  let toRemove = [];
  selectedFeeds.forEach(function (id) {
    if (!visibleIds.has(id)) toRemove.push(id);
  });
  for (let j = 0; j < toRemove.length; j++) selectedFeeds.delete(toRemove[j]);
  syncCheckboxStates();
  updateCounter();
}

function updateCounter() {
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
    let ids = counters[i].dataset.feedIds.split(',').filter(Boolean);
    let sel = 0;
    for (let j = 0; j < ids.length; j++) {
      if (selectedFeeds.has(ids[j])) sel++;
    }
    counters[i].textContent = sel + '/' + ids.length;
  }

  if (hiddenCount > 0) {
    el.deselectHidden.classList.remove('is-hidden');
    el.deselectHidden.textContent = t('deselect-hidden', { count: hiddenCount.toLocaleString() });
  } else {
    el.deselectHidden.classList.add('is-hidden');
  }
}

function siteHasProxies(siteId) {
  for (let i = 0; i < allFeeds.length; i++) {
    if (allFeeds[i].siteId === siteId && allFeeds[i].isProxy) return true;
  }
  return false;
}

function toggleSiteProxyVisibility(siteId) {
  if (filters.hiddenProxySites.has(siteId)) {
    filters.hiddenProxySites.delete(siteId);
  } else {
    filters.hiddenProxySites.add(siteId);
    for (let i = 0; i < allFeeds.length; i++) {
      if (allFeeds[i].siteId === siteId && allFeeds[i].isProxy) {
        selectedFeeds.delete(allFeeds[i].id);
      }
    }
  }
  render();
}
