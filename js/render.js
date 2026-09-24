import { allFeeds, categories, regions, selectedFeeds, filters, el } from './state.js';
import { feedNameById, feedsBySite } from './data.js';
import { t } from './i18n.js';
import { getVisibleFeeds, getFeedsMatchingNarrowingFilters, isFeedDownloadable } from './filters.js';
import { playSuccess } from './sound.js';
import { Virtualizer } from './virtualization.js';

const VIRTUAL_OVERSCAN_PX = 700;

let _visibleFeeds = [];
let _siteCategoryMap = null;
let _renderRaf = 0;
let _virtualizer = null;
let _virtualItems = [];
let _collapsedGroups = new Set();
let _delegationBound = false;

function feedDisplayUrl(feed) {
  return feed.rssUrl;
}

function emitRendered() {
  try { window.dispatchEvent(new CustomEvent('awesome-rss:rendered')); } catch (error) {}
  if (window.updateBackToTop) window.updateBackToTop();
}

function resetVirtualizer() {
  if (_virtualizer) {
    _virtualizer.destroy();
    _virtualizer = null;
  }
  _virtualItems = [];
}

export function showLoading() {
  resetVirtualizer();
  el.loading.hidden = false;
  el.loading.textContent = t('loading');
  el.error.hidden = true;
  el.empty.hidden = true;
  el.main.setAttribute('aria-busy', 'true');
  el.feedList.style.minHeight = '60vh';
  el.feedList.replaceChildren();
}

export function hideLoading() {
  el.loading.hidden = true;
}

export function showError(msg) {
  el.loading.hidden = true;
  el.main.setAttribute('aria-busy', 'false');
  el.error.hidden = false;
  let message = el.error.querySelector('[data-i18n="error"]');
  if (message) message.textContent = msg;
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

  const categoryValue = filters.category;
  const regionValue = filters.region;
  let sortedCats = Object.keys(categories).sort((a, b) => (categories[a].order || 999) - (categories[b].order || 999));
  el.categoryFilter.replaceChildren();
  let allCategoriesOption = document.createElement('option');
  allCategoriesOption.value = 'all';
  allCategoriesOption.textContent = t('filter-category-all');
  el.categoryFilter.appendChild(allCategoriesOption);
  for (let c = 0; c < sortedCats.length; c++) {
    let key = sortedCats[c];
    let label = cleanLabel(categories[key].label);
    let opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label + ' (' + (catCounts[key] || 0) + ')';
    el.categoryFilter.appendChild(opt);
  }
  el.categoryFilter.value = categoryValue;

  let regionKeys = Object.keys(regions);
  el.regionFilter.replaceChildren();
  let allRegionsOption = document.createElement('option');
  allRegionsOption.value = 'all';
  allRegionsOption.textContent = t('filter-region-all');
  el.regionFilter.appendChild(allRegionsOption);
  for (let r = 0; r < regionKeys.length; r++) {
    let rKey = regionKeys[r];
    let rOpt = document.createElement('option');
    rOpt.value = rKey;
    rOpt.textContent = regions[rKey] + ' (' + (regionCounts[rKey] || 0) + ')';
    el.regionFilter.appendChild(rOpt);
  }
  el.regionFilter.value = regionValue;

  let staleText = el.toggleStale.parentElement.querySelector('.toggle-text');
  if (staleText) staleText.textContent = t(staleText.getAttribute('data-i18n')) + ' (' + staleCount + ')';
  let proxyText = el.toggleProxies.parentElement.querySelector('.toggle-text');
  if (proxyText) proxyText.textContent = t(proxyText.getAttribute('data-i18n')) + ' (' + proxyCount + ')';
}

function cleanLabel(label) {
  return String(label || '').replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim();
}

function groupKey(scopeType, scopeKey) {
  return scopeType + ':' + scopeKey;
}

function buildSiteMap(feeds) {
  let sites = new Map();
  for (let i = 0; i < feeds.length; i++) {
    let feed = feeds[i];
    let site = sites.get(feed.siteId);
    if (!site) {
      site = { siteId: feed.siteId, siteName: feed.siteName, feeds: [] };
      sites.set(feed.siteId, site);
    }
    site.feeds.push(feed);
  }
  return sites;
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

function addHiddenProxyPlaceholders(grouped, scopeType) {
  if (filters.hiddenProxySites.size === 0) return;
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (!feed.isProxy || !filters.hiddenProxySites.has(feed.siteId) || !passesExceptHiddenSite(feed)) continue;
    let scopeKey = scopeType === 'region' ? (feed.region || 'uncategorized') : (feed.category || 'uncategorized');
    if (!grouped.has(scopeKey)) grouped.set(scopeKey, new Map());
    let sites = grouped.get(scopeKey);
    if (!sites.has(feed.siteId)) {
      sites.set(feed.siteId, { siteId: feed.siteId, siteName: feed.siteName, feeds: [] });
    }
  }
}

function createGroup(scopeType, scopeKey) {
  let titleKey = scopeType === 'region' ? 'group-region-label' : 'group-label';
  let titleLabel = scopeType === 'region'
    ? (regions[scopeKey] || t('uncategorized'))
    : (categories[scopeKey] ? cleanLabel(categories[scopeKey].label) : t('uncategorized'));
  return { scopeType, scopeKey, titleKey, titleLabel, sites: new Map() };
}

function buildGroupedModel(visibleFeeds, scopeType) {
  let grouped = new Map();
  for (let i = 0; i < visibleFeeds.length; i++) {
    let feed = visibleFeeds[i];
    let scopeKey = scopeType === 'region' ? (feed.region || 'uncategorized') : (feed.category || 'uncategorized');
    if (!grouped.has(scopeKey)) grouped.set(scopeKey, new Map());
    let sites = grouped.get(scopeKey);
    let site = sites.get(feed.siteId);
    if (!site) {
      site = { siteId: feed.siteId, siteName: feed.siteName, feeds: [] };
      sites.set(feed.siteId, site);
    }
    site.feeds.push(feed);
  }
  addHiddenProxyPlaceholders(grouped, scopeType);

  let groups = Array.from(grouped, ([scopeKey, sites]) => {
    let group = createGroup(scopeType, scopeKey);
    group.sites = sites;
    return group;
  });

  groups.sort((a, b) => {
    if (scopeType === 'category') {
      let orderA = categories[a.scopeKey] ? (categories[a.scopeKey].order || 999) : 999;
      let orderB = categories[b.scopeKey] ? (categories[b.scopeKey].order || 999) : 999;
      if (orderA !== orderB) return orderA - orderB;
    }
    return a.titleLabel.localeCompare(b.titleLabel);
  });
  return groups;
}

function buildFlatModel(visibleFeeds) {
  let sites = buildSiteMap(visibleFeeds);
  if (filters.hiddenProxySites.size > 0) {
    for (let i = 0; i < allFeeds.length; i++) {
      let feed = allFeeds[i];
      if (!feed.isProxy || !filters.hiddenProxySites.has(feed.siteId) || !passesExceptHiddenSite(feed)) continue;
      if (!sites.has(feed.siteId)) {
        sites.set(feed.siteId, { siteId: feed.siteId, siteName: feed.siteName, feeds: [] });
      }
    }
  }
  return Array.from(sites.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
}

function otherCategoriesForSite(siteId, group) {
  let entry = _siteCategoryMap && _siteCategoryMap[siteId];
  if (!entry) return [];
  let exclude = group && group.scopeType === 'category' ? group.scopeKey : null;
  return Object.keys(entry.cats).filter(category => category !== exclude);
}

function isCompactViewport() {
  return window.innerWidth <= 700;
}

function estimateCategoryHeight() {
  return isCompactViewport() ? 92 : 52;
}

function estimateSiteHeight(site) {
  const rowHeight = isCompactViewport() ? 92 : 48;
  const hasNote = site.otherCats.length > 0 && !filters.keepSiteTogether && !filters.mainFeedOnly;
  return 42 + site.feeds.length * rowHeight + (hasNote ? 48 : 0) + 8;
}

function buildVirtualItems() {
  let items = [];
  if (filters.groupByRegion || filters.groupOpml) {
    let scopeType = filters.groupByRegion ? 'region' : 'category';
    let groups = buildGroupedModel(_visibleFeeds, scopeType);
    for (let g = 0; g < groups.length; g++) {
      let group = groups[g];
      let selectedCount = 0;
      let totalCount = 0;
      for (let site of group.sites.values()) {
        totalCount += site.feeds.length;
        for (let feed of site.feeds) {
          if (selectedFeeds.has(feed.id)) selectedCount++;
        }
      }
      group.selectedCount = selectedCount;
      group.totalCount = totalCount;

      items.push({
        type: 'category',
        group,
        estimatedHeight: estimateCategoryHeight()
      });

      if (_collapsedGroups.has(groupKey(group.scopeType, group.scopeKey))) continue;
      let siteIds = Array.from(group.sites.keys()).sort();
      for (let s = 0; s < siteIds.length; s++) {
        let site = group.sites.get(siteIds[s]);
        site.otherCats = otherCategoriesForSite(site.siteId, group);
        items.push({
          type: 'site',
          group,
          site,
          estimatedHeight: estimateSiteHeight(site)
        });
      }
    }
  } else {
    let sites = buildFlatModel(_visibleFeeds);
    for (let s = 0; s < sites.length; s++) {
      let site = sites[s];
      site.otherCats = [];
      items.push({ type: 'site', group: null, site, estimatedHeight: estimateSiteHeight(site) });
    }
  }
  return items;
}

function ensureVirtualizer() {
  if (_virtualizer) return _virtualizer;
  _virtualizer = new Virtualizer(el.feedList, {
    overscanPx: VIRTUAL_OVERSCAN_PX,
    estimateHeight: item => item.estimatedHeight,
    createContent: item => {
      let content = item.type === 'category' ? buildCategoryBlock(item) : buildSiteBlock(item);
      content.dataset.virtualType = item.type;
      return content;
    }
  });
  return _virtualizer;
}

function buildCategoryBlock(item) {
  let group = item.group;
  let key = groupKey(group.scopeType, group.scopeKey);
  let collapsed = _collapsedGroups.has(key);
  let groupNode = document.createElement('section');
  groupNode.className = 'category-group' + (collapsed ? ' collapsed' : '');
  groupNode.dataset.scopeKey = group.scopeKey;
  groupNode.dataset.scopeType = group.scopeType;
  groupNode.dataset.groupKey = key;

  let header = document.createElement('div');
  header.className = 'category-header';

  let heading = document.createElement('h2');
  heading.className = 'category-heading';
  let title = document.createElement('button');
  title.type = 'button';
  title.className = 'category-title';
  title.textContent = t(group.titleKey, { label: group.titleLabel });
  title.dataset.action = 'toggle-collapse';
  title.dataset.groupKey = key;
  title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  heading.appendChild(title);
  header.appendChild(heading);

  let counter = document.createElement('span');
  counter.className = 'category-counter';
  counter.dataset.scopeType = group.scopeType;
  counter.dataset.scopeKey = group.scopeKey;
  counter.textContent = group.selectedCount + '/' + group.totalCount;
  header.appendChild(counter);

  let actions = document.createElement('div');
  actions.className = 'category-actions';
  actions.appendChild(buildScopeAction('scope-select', group, t('select-all')));
  actions.appendChild(buildScopeAction('scope-deselect', group, t('deselect-all')));
  header.appendChild(actions);
  groupNode.appendChild(header);
  return groupNode;
}

function buildScopeAction(action, group, label) {
  let button = document.createElement('button');
  button.className = 'category-action';
  button.setAttribute('data-cuelume-press', '');
  button.dataset.action = action;
  button.dataset.groupKey = groupKey(group.scopeType, group.scopeKey);
  button.textContent = label;
  button.setAttribute('aria-label', label + ': ' + group.titleLabel);
  return button;
}

function buildSiteBlock(item) {
  let site = item.site;
  let wrapper = document.createElement('section');
  wrapper.className = 'site-group';
  wrapper.dataset.siteId = site.siteId;

  let header = document.createElement('div');
  header.className = 'site-header';
  let title = document.createElement('h2');
  title.className = 'site-header-title';
  title.textContent = site.siteName;
  header.appendChild(title);

  let actions = document.createElement('div');
  actions.className = 'site-actions';
  if (siteHasProxies(site.siteId) && filters.showProxies) {
    let proxyBtn = document.createElement('button');
    proxyBtn.className = 'site-action';
    proxyBtn.setAttribute('data-cuelume-press', '');
    proxyBtn.dataset.action = 'site-toggle-proxies';
    proxyBtn.dataset.siteId = site.siteId;
    let proxyHidden = filters.hiddenProxySites.has(site.siteId);
    proxyBtn.textContent = t(proxyHidden ? 'show-site-proxies' : 'hide-site-proxies');
    proxyBtn.setAttribute('aria-label', proxyBtn.textContent + ': ' + site.siteName);
    actions.appendChild(proxyBtn);
  }

  if (site.feeds.length > 0) {
    let selectBtn = document.createElement('button');
    selectBtn.className = 'site-action';
    selectBtn.setAttribute('data-cuelume-press', '');
    selectBtn.dataset.action = 'site-select';
    selectBtn.dataset.siteId = site.siteId;
    selectBtn.textContent = t('select-all');
    selectBtn.setAttribute('aria-label', selectBtn.textContent + ': ' + site.siteName);
    actions.appendChild(selectBtn);

    let deselectBtn = document.createElement('button');
    deselectBtn.className = 'site-action';
    deselectBtn.setAttribute('data-cuelume-press', '');
    deselectBtn.dataset.action = 'site-deselect';
    deselectBtn.dataset.siteId = site.siteId;
    deselectBtn.textContent = t('deselect-all');
    deselectBtn.setAttribute('aria-label', deselectBtn.textContent + ': ' + site.siteName);
    actions.appendChild(deselectBtn);
  }
  header.appendChild(actions);
  wrapper.appendChild(header);

  for (let i = 0; i < site.feeds.length; i++) {
    wrapper.appendChild(buildFeedItem(site.feeds[i]));
  }

  if (site.otherCats.length > 0 && !filters.keepSiteTogether && !filters.mainFeedOnly) {
    let note = document.createElement('div');
    note.className = 'cross-category-note';
    let catLabels = site.otherCats.map(slug => categories[slug] ? cleanLabel(categories[slug].label) : slug);
    note.textContent = t('cross-category-note', { site: site.siteName, cats: catLabels.join(', ') });
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

  let content = document.createElement('div');
  content.className = 'feed-label';
  let label = document.createElement('label');
  label.className = 'feed-main-label';
  label.htmlFor = checkboxId;

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
  label.appendChild(info);
  content.appendChild(label);

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
    content.appendChild(tag);
  } else if (feed.status !== 'active') {
    let tag = document.createElement('span');
    tag.className = 'tag tag-stale';
    tag.textContent = t('tag-stale');
    content.appendChild(tag);
  }

  if (feed.isProxy) {
    let proxyTag = document.createElement('span');
    proxyTag.className = 'tag tag-proxy';
    proxyTag.textContent = t('tag-proxy');
    content.appendChild(proxyTag);
  }
  item.appendChild(content);

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

function ensureDelegation() {
  if (_delegationBound || !el.feedList) return;
  _delegationBound = true;

  el.feedList.addEventListener('change', function (event) {
    let checkbox = event.target.closest('.feed-checkbox');
    if (checkbox && checkbox.dataset.feedId) toggleFeed(checkbox.dataset.feedId, checkbox.checked);
  });

  el.feedList.addEventListener('click', function (event) {
    let title = event.target.closest('.category-title[data-action="toggle-collapse"]');
    if (title) {
      toggleGroupCollapsed(title.dataset.groupKey, title);
      return;
    }

    let scopeButton = event.target.closest('[data-action="scope-select"], [data-action="scope-deselect"]');
    if (scopeButton) {
      let [scopeType, scopeKey] = scopeButton.dataset.groupKey.split(':');
      let matcher = scopeType === 'region' ? feed => feed.region || 'uncategorized' : feed => feed.category || 'uncategorized';
      if (scopeButton.dataset.action === 'scope-select') selectAllInScope(scopeKey, matcher);
      else deselectAllInScope(scopeKey, matcher);
      return;
    }

    let siteAction = event.target.closest('.site-action[data-action]');
    if (siteAction) {
      let action = siteAction.dataset.action;
      let siteId = siteAction.dataset.siteId;
      if (action === 'site-select') selectAllInSite(siteId);
      else if (action === 'site-deselect') deselectAllInSite(siteId);
      else if (action === 'site-toggle-proxies') toggleSiteProxyVisibility(siteId);
      return;
    }

    let copyButton = event.target.closest('.copy-link[data-feed-id]');
    if (copyButton) {
      event.stopPropagation();
      copyFeedUrl(copyButton);
      return;
    }

    if (event.target.closest('.feed-link') || event.target.closest('.report-link')) event.stopPropagation();
  });
}

function copyFeedUrl(copyButton) {
  let feed = allFeeds.find(item => item.id === copyButton.dataset.feedId);
  if (!feed) return;
  let url = feedDisplayUrl(feed);
  let showCopied = function () {
    copyButton.classList.add('copied');
    if (el.copyStatus) {
      el.copyStatus.textContent = t('copy-success');
      setTimeout(() => { el.copyStatus.textContent = ''; }, 1500);
    }
    playSuccess().catch(() => {});
    setTimeout(function () { copyButton.classList.remove('copied'); }, 1500);
  };
  let fallback = function () {
    let activeElement = document.activeElement;
    let textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = document.execCommand('copy');
    textarea.remove();
    if (activeElement && activeElement.focus) activeElement.focus();
    if (copied) showCopied();
    else if (el.copyStatus) el.copyStatus.textContent = t('copy-error');
  };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(showCopied, fallback);
  else fallback();
}

function toggleGroupCollapsed(key, titleElement) {
  const beforeTop = titleElement.getBoundingClientRect().top;
  if (_collapsedGroups.has(key)) _collapsedGroups.delete(key);
  else _collapsedGroups.add(key);
  render();
  requestAnimationFrame(function () {
    let replacement = Array.from(el.feedList.querySelectorAll('.category-title')).find(node => node.dataset.groupKey === key);
    if (replacement) window.scrollBy(0, replacement.getBoundingClientRect().top - beforeTop);
  });
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
  _visibleFeeds = getVisibleFeeds();
  if (_visibleFeeds.length === 0) {
    _virtualItems = [];
    if (_virtualizer) _virtualizer.setItems([]);
    else el.feedList.replaceChildren();
    el.feedList.style.minHeight = '';
    el.empty.hidden = false;
    el.main.setAttribute('aria-busy', 'false');
    updateCounter();
    emitRendered();
    return;
  }

  el.empty.hidden = true;
  _siteCategoryMap = {};
  for (let i = 0; i < allFeeds.length; i++) {
    let feed = allFeeds[i];
    if (!_siteCategoryMap[feed.siteId]) _siteCategoryMap[feed.siteId] = { name: feed.siteName, cats: {} };
    _siteCategoryMap[feed.siteId].cats[feed.category] = true;
  }

  _virtualItems = buildVirtualItems();
  let virtualizer = ensureVirtualizer();
  virtualizer.setItems(_virtualItems);
  el.feedList.style.minHeight = '';
  el.main.setAttribute('aria-busy', 'false');
  updateCounter();
  emitRendered();
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

  let label = el.downloadBtn.querySelector('[data-download-label]');
  if (!label) {
    label = el.downloadBtn.querySelector('span:not(.download-count)');
    if (label) label.dataset.downloadLabel = '';
  }
  if (label) label.textContent = t(downloadKey);

  let badge = el.downloadBtn.querySelector('.download-count');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'download-count';
    el.downloadBtn.appendChild(badge);
  }
  badge.textContent = downloadableCount.toLocaleString();
  badge.hidden = downloadableCount === 0;
}

function toggleFeed(id, checked) {
  if (checked) selectedFeeds.add(id);
  else selectedFeeds.delete(id);
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

export function selectAllInCategory(categoryKey) { selectAllInScope(categoryKey, feed => feed.category || 'uncategorized'); }
export function deselectAllInCategory(categoryKey) { deselectAllInScope(categoryKey, feed => feed.category || 'uncategorized'); }
function selectAllInRegion(regionKey) { selectAllInScope(regionKey, feed => feed.region || 'uncategorized'); }
function deselectAllInRegion(regionKey) { deselectAllInScope(regionKey, feed => feed.region || 'uncategorized'); }
function selectAllInSite(siteId) { selectAllInScope(siteId, feed => feed.siteId); }
function deselectAllInSite(siteId) { deselectAllInScope(siteId, feed => feed.siteId); }

function syncCheckboxStates() {
  let checkboxes = el.feedList.querySelectorAll('.feed-checkbox');
  for (let i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = selectedFeeds.has(checkboxes[i].dataset.feedId);
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
  let visibleIds = new Set(getVisibleFeeds().map(feed => feed.id));
  let toRemove = [];
  selectedFeeds.forEach(id => {
    if (!visibleIds.has(id)) toRemove.push(id);
  });
  for (let i = 0; i < toRemove.length; i++) selectedFeeds.delete(toRemove[i]);
  syncCheckboxStates();
  updateCounter();
}

function buildScopeStats(visible) {
  let stats = new Map();
  for (let i = 0; i < visible.length; i++) {
    let feed = visible[i];
    for (let scopeType of ['category', 'region']) {
      let key = scopeType + ':' + (feed[scopeType] || 'uncategorized');
      let entry = stats.get(key);
      if (!entry) {
        entry = { total: 0, selected: 0 };
        stats.set(key, entry);
      }
      entry.total++;
      if (selectedFeeds.has(feed.id)) entry.selected++;
    }
  }
  return stats;
}

function updateCounter() {
  let visible = getVisibleFeeds();
  let visibleIds = new Set(visible.map(feed => feed.id));
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
  if (hiddenCount > 0) counterText += ' ' + t('counter-hidden', { hid: hiddenCount.toLocaleString() });
  el.counter.textContent = counterText;
  updateDownloadBtns();

  let stats = buildScopeStats(visible);
  let counters = el.feedList.querySelectorAll('.category-counter');
  for (let i = 0; i < counters.length; i++) {
    let counter = counters[i];
    let entry = stats.get(counter.dataset.scopeType + ':' + counter.dataset.scopeKey);
    if (entry) counter.textContent = entry.selected + '/' + entry.total;
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
  const previousScroll = window.scrollY;
  if (filters.hiddenProxySites.has(siteId)) {
    filters.hiddenProxySites.delete(siteId);
  } else {
    filters.hiddenProxySites.add(siteId);
    for (let i = 0; i < allFeeds.length; i++) {
      if (allFeeds[i].siteId === siteId && allFeeds[i].isProxy) selectedFeeds.delete(allFeeds[i].id);
    }
  }
  render();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      let maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(previousScroll, maxScroll));
    });
  });
}

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
  let popoverWidth = popoverEl.offsetWidth;
  let popoverHeight = popoverEl.offsetHeight;
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let left = rect.left + rect.width / 2 - popoverWidth / 2;
  if (left < 8) left = 8;
  if (left + popoverWidth > viewportWidth - 8) left = viewportWidth - popoverWidth - 8;
  let top = rect.bottom + 6;
  if (top + popoverHeight > viewportHeight - 8) top = rect.top - popoverHeight - 6;
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

document.addEventListener('mouseover', function (event) {
  let tag = event.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    clearTimeout(hoverTimeout);
    showPopover(tag);
  }
});

document.addEventListener('mouseout', function (event) {
  let tag = event.target.closest('.tag-duplicate[data-popover]');
  if (!tag) return;
  let related = event.relatedTarget;
  if (!related) {
    hoverTimeout = setTimeout(hidePopover, 150);
    return;
  }
  if (related === popoverEl || (popoverEl && popoverEl.contains(related))) return;
  if (related.closest && related.closest('.tag-duplicate[data-popover]')) return;
  hoverTimeout = setTimeout(hidePopover, 150);
});

document.addEventListener('click', function (event) {
  let tag = event.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    event.stopPropagation();
    if (isOpen(tag)) hidePopover();
    else showPopover(tag);
    return;
  }
  hidePopover();
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && popoverEl && !popoverEl.hidden) {
    let owner = popoverEl._owner;
    hidePopover();
    if (owner) owner.focus();
  }
});

document.addEventListener('focusin', function (event) {
  let tag = event.target.closest('.tag-duplicate[data-popover]');
  if (tag) {
    clearTimeout(hoverTimeout);
    showPopover(tag);
  }
});

document.addEventListener('focusout', function (event) {
  let tag = event.target.closest('.tag-duplicate[data-popover]');
  if (!tag) return;
  hoverTimeout = setTimeout(function () {
    let active = document.activeElement;
    if (active && active.closest && active.closest('.tag-duplicate[data-popover]')) return;
    if (popoverEl && popoverEl.contains(active)) return;
    hidePopover();
  }, 100);
});
