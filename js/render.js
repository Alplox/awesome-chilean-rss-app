import { allFeeds, categories, regions, selectedFeeds, filters, el } from './state.js';
import { t } from './i18n.js';
import { getVisibleFeeds, getFeedsMatchingNarrowingFilters, isFeedDownloadable } from './filters.js';

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
  let sortedCats = Object.keys(categories).sort(function (a, b) {
    return (categories[a].order || 999) - (categories[b].order || 999);
  });

  el.categoryFilter.innerHTML = '<option value="all">' + t('filter-category-all') + '</option>';
  for (let c = 0; c < sortedCats.length; c++) {
    let key = sortedCats[c];
    let label = categories[key].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim();
    let opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    el.categoryFilter.appendChild(opt);
  }

  let sortedRegions = Object.keys(regions).sort();
  el.regionFilter.innerHTML = '<option value="all">' + t('filter-region-all') + '</option>';
  for (let r = 0; r < sortedRegions.length; r++) {
    let rKey = sortedRegions[r];
    let rOpt = document.createElement('option');
    rOpt.value = rKey;
    rOpt.textContent = regions[rKey];
    el.regionFilter.appendChild(rOpt);
  }
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

  let siteCategoryMap = buildSiteCategoryMap();
  let frag = document.createDocumentFragment();

  if (filters.groupByRegion) {
    let groupedByRegion = {};
    for (let i = 0; i < visibleFeeds.length; i++) {
      let feed = visibleFeeds[i];
      let region = feed.region || 'uncategorized';
      if (!groupedByRegion[region]) groupedByRegion[region] = [];
      groupedByRegion[region].push(feed);
    }

    let sortedRegions = Object.keys(groupedByRegion).sort();
    for (let r = 0; r < sortedRegions.length; r++) {
      let regionKey = sortedRegions[r];
      let feedsInRegion = groupedByRegion[regionKey];
      let regionLabel = regions[regionKey] || t('uncategorized');

      let groupEl = buildRegionGroup(regionKey, regionLabel, feedsInRegion, siteCategoryMap);
      frag.appendChild(groupEl);
    }
  } else if (filters.groupOpml) {
    let grouped = {};
    for (let i = 0; i < visibleFeeds.length; i++) {
      let feed = visibleFeeds[i];
      let cat = feed.category || 'uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(feed);
    }

    let sortedCats = Object.keys(grouped).sort(function (a, b) {
      let orderA = categories[a] ? (categories[a].order || 999) : 999;
      let orderB = categories[b] ? (categories[b].order || 999) : 999;
      if (orderA !== orderB) return orderA - orderB;
      if (categories[a] && categories[b]) {
        return (categories[a].label || a).localeCompare(categories[b].label || b);
      }
      return a.localeCompare(b);
    });

    for (let g = 0; g < sortedCats.length; g++) {
      let catKey = sortedCats[g];
      let feedsInCat = grouped[catKey];
      let catLabel = categories[catKey]
        ? categories[catKey].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim()
        : t('uncategorized');

      let groupEl = buildCategoryGroup(catKey, catLabel, feedsInCat, siteCategoryMap);
      frag.appendChild(groupEl);
    }
  } else {
    let feedsBySite = {};
    for (let u = 0; u < visibleFeeds.length; u++) {
      let vf = visibleFeeds[u];
      if (!feedsBySite[vf.siteId]) {
        feedsBySite[vf.siteId] = { name: vf.siteName, feeds: [] };
      }
      feedsBySite[vf.siteId].feeds.push(vf);
    }

    let siteIds = Object.keys(feedsBySite).sort();
    for (let s = 0; s < siteIds.length; s++) {
      let sid = siteIds[s];
      let sg = feedsBySite[sid];
      let siteEl = buildSiteGroup(sid, sg.name, sg.feeds, []);
      frag.appendChild(siteEl);
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

function buildSiteCategoryMap() {
  let map = {};
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (!map[feed.siteId]) {
      map[feed.siteId] = { name: feed.siteName, cats: {} };
    }
    map[feed.siteId].cats[feed.category] = true;
  }
  return map;
}

function getSiteCategories(siteCategoryMap, siteId, currentCategory) {
  let entry = siteCategoryMap[siteId];
  if (!entry) return [];
  return Object.keys(entry.cats).filter(function (c) {
    return c !== currentCategory;
  });
}

function getCategoryLabel(slug) {
  if (!categories[slug]) return slug;
  return categories[slug].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim();
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

function buildCategoryGroup(catKey, label, feeds, siteCategoryMap) {
  let group = document.createElement('div');
  group.className = 'category-group';

  let header = document.createElement('div');
  header.className = 'category-header';

  let title = document.createElement('h2');
  title.className = 'category-title';
  title.textContent = t('group-label', { label: label });
  title.addEventListener('click', function () {
    group.classList.toggle('collapsed');
  });
  header.appendChild(title);

  let total = feeds.length;
  let catSelected = 0;
  for (let c = 0; c < feeds.length; c++) {
    if (selectedFeeds.has(feeds[c].id)) catSelected++;
  }
  let catCounter = document.createElement('span');
  catCounter.className = 'category-counter';
  catCounter.textContent = catSelected + '/' + total;
  header.appendChild(catCounter);

  let actions = document.createElement('div');
  actions.className = 'category-actions';

  let selectBtn = document.createElement('button');
  selectBtn.className = 'category-action';
  selectBtn.textContent = t('select-all');
  selectBtn.addEventListener('click', function () {
    selectAllInCategory(catKey);
  });
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'category-action';
  deselectBtn.textContent = t('deselect-all');
  deselectBtn.addEventListener('click', function () {
    deselectAllInCategory(catKey);
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

    let otherCats = getSiteCategories(siteCategoryMap, sid, catKey);
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
    let proxyHidden = filters.hiddenProxySites.has(siteId);
    proxyBtn.textContent = t(proxyHidden ? 'show-site-proxies' : 'hide-site-proxies');
    proxyBtn.addEventListener('click', function () {
      toggleSiteProxyVisibility(siteId);
    });
    actions.appendChild(proxyBtn);
  }

  let selectBtn = document.createElement('button');
  selectBtn.className = 'site-action';
  selectBtn.textContent = t('select-all');
  selectBtn.addEventListener('click', function () {
    selectAllInSite(siteId);
  });
  actions.appendChild(selectBtn);

  let deselectBtn = document.createElement('button');
  deselectBtn.className = 'site-action';
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

  if (otherCats.length > 0) {
    let note = document.createElement('div');
    note.className = 'cross-category-note';
    let catLabels = otherCats.map(getCategoryLabel);
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
  copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  copyBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    let copy = function () {
      copyBtn.classList.add('copied');
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

  if (feed.status !== 'active') {
    let tag = document.createElement('span');
    tag.className = 'tag tag-stale';
    tag.textContent = t('tag-stale');
    item.appendChild(tag);
  }

  if (feed.isProxy) {
    let proxyTag = document.createElement('span');
    proxyTag.className = 'tag tag-proxy';
    proxyTag.textContent = t('tag-proxy');
    item.appendChild(proxyTag);
  }

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

export function selectAllInCategory(catKey) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].category === catKey) {
      selectedFeeds.add(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

export function deselectAllInCategory(catKey) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].category === catKey) {
      selectedFeeds.delete(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

function selectAllInRegion(regionKey) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].region === regionKey) {
      selectedFeeds.add(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

function deselectAllInRegion(regionKey) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].region === regionKey) {
      selectedFeeds.delete(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

function selectAllInSite(siteId) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].siteId === siteId) {
      selectedFeeds.add(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

function deselectAllInSite(siteId) {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].siteId === siteId) {
      selectedFeeds.delete(visible[i].id);
    }
  }
  syncCheckboxStates();
  updateCounter();
}

function syncCheckboxStates() {
  let checkboxes = el.feedList.querySelectorAll('.feed-checkbox');
  for (let i = 0; i < checkboxes.length; i++) {
    let cb = checkboxes[i];
    cb.checked = selectedFeeds.has(cb.dataset.feedId);
  }
}

export function selectAllGlobal() {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    selectedFeeds.add(visible[i].id);
  }
  syncCheckboxStates();
  updateCounter();
}

export function deselectAllGlobal() {
  let visible = getVisibleFeeds();
  for (let i = 0; i < visible.length; i++) {
    selectedFeeds.delete(visible[i].id);
  }
  syncCheckboxStates();
  updateCounter();
}

export function deselectHidden() {
  let visible = getVisibleFeeds();
  let visibleIds = {};
  for (let i = 0; i < visible.length; i++) {
    visibleIds[visible[i].id] = true;
  }

  let narrowing = getFeedsMatchingNarrowingFilters();
  let narrowingIds = {};
  for (let i = 0; i < narrowing.length; i++) {
    narrowingIds[narrowing[i].id] = true;
  }

  let toRemove = [];
  selectedFeeds.forEach(function (id) {
    if (narrowingIds[id] && !visibleIds[id]) toRemove.push(id);
  });
  for (let j = 0; j < toRemove.length; j++) {
    selectedFeeds.delete(toRemove[j]);
  }
  syncCheckboxStates();
  updateCounter();
}

function updateCounter() {
  let visible = getVisibleFeeds();
  let visibleIds = {};
  for (let i = 0; i < visible.length; i++) {
    visibleIds[visible[i].id] = true;
  }

  let narrowing = getFeedsMatchingNarrowingFilters();
  let selectedCount = 0;
  for (let i = 0; i < visible.length; i++) {
    if (selectedFeeds.has(visible[i].id)) selectedCount++;
  }

  let hiddenCount = 0;
  for (let i = 0; i < narrowing.length; i++) {
    let id = narrowing[i].id;
    if (selectedFeeds.has(id) && !visibleIds[id]) hiddenCount++;
  }

  let totalSelected = selectedCount + hiddenCount;
  let counterText = t('counter-visible', { sel: totalSelected.toLocaleString(), vis: visible.length.toLocaleString() });
  if (hiddenCount > 0) {
    counterText += ' ' + t('counter-hidden', { hid: hiddenCount.toLocaleString() });
  }
  el.counter.textContent = counterText;
  updateDownloadBtns();

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
