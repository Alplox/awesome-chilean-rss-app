import { filters } from './state.js';
import { t } from './i18n.js';

let toolbar = null;
let mediaQuery = null;
let activePanel = null;
let compactMode = false;
let refs = null;
let homeRefs = null;

const panelDefinitions = {
  filters: { triggerId: 'compact-filters-toggle', panelId: 'compact-filters-panel', slotId: 'compact-filters-slot' },
  view: { triggerId: 'compact-view-toggle', panelId: 'compact-view-panel', slotId: 'compact-view-slot' },
  export: { triggerId: 'compact-export-toggle', panelId: 'compact-export-panel', slotId: 'compact-export-slot' }
};

function getHome(name) {
  const anchor = document.querySelector(`[data-home-slot="${name}"]`);
  return anchor ? { parent: anchor.parentNode, anchor } : null;
}

function collectRefs() {
  const filterGroup = document.querySelector('.filter-group');
  const viewRow = document.querySelector('.toolbar-row--grouped');
  const selectionGroup = document.querySelector('.selection-group');
  const downloadGroup = document.querySelector('.download-group');

  refs = {
    filterGroup,
    searchWrapper: filterGroup && filterGroup.querySelector('.search-wrapper'),
    viewRow,
    counter: document.getElementById('counter'),
    selectionGroup,
    deselectHidden: document.getElementById('deselect-hidden'),
    formatGroup: document.querySelector('.format-group'),
    downloadBtn: document.getElementById('download-btn'),
    altDownload: document.getElementById('download-btn-alt'),
    downloadGroup
  };

  homeRefs = {
    filterGroup: getHome('filter-group'),
    search: getHome('search'),
    viewRow: getHome('view-row'),
    counter: getHome('counter'),
    selection: getHome('selection'),
    deselectHidden: getHome('deselect-hidden'),
    format: getHome('format'),
    primaryDownload: getHome('primary-download'),
    altDownload: getHome('alt-download')
  };
}

function moveTo(element, slotId) {
  const slot = document.getElementById(slotId);
  if (element && slot && element.parentNode !== slot) slot.appendChild(element);
}

function restore(element, home) {
  if (!element || !home || !home.parent) return;
  if (element.parentNode !== home.parent || element.nextSibling !== home.anchor) {
    home.parent.insertBefore(element, home.anchor);
  }
}

function closePanel(name, restoreFocus = false) {
  const definition = panelDefinitions[name];
  if (!definition) return;
  const panel = document.getElementById(definition.panelId);
  const trigger = document.getElementById(definition.triggerId);
  if (panel) panel.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (activePanel === name) activePanel = null;
  if (restoreFocus && trigger) trigger.focus();
}

function closeActivePanel(restoreFocus = false) {
  if (activePanel) closePanel(activePanel, restoreFocus);
}

function openPanel(name) {
  if (!compactMode) return;
  if (activePanel === name) {
    closePanel(name, true);
    return;
  }
  closeActivePanel(false);
  const definition = panelDefinitions[name];
  const panel = document.getElementById(definition.panelId);
  const trigger = document.getElementById(definition.triggerId);
  if (!panel || !trigger) return;
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  activePanel = name;
  const firstControl = panel.querySelector('select, input, button:not(.panel-close)');
  if (firstControl) firstControl.focus();
}

function updateBadge() {
  if (!refs || !refs.filterGroup) return;
  let count = 0;
  if (filters.category !== 'all') count++;
  if (filters.region !== 'all') count++;
  if (filters.search) count++;
  if (filters.mainFeedOnly) count++;
  if (filters.showStale) count++;
  if (!filters.showProxies) count++;

  const trigger = document.getElementById('compact-filters-toggle');
  const badge = document.getElementById('compact-filter-badge');
  if (trigger) {
    const label = count > 0 ? t('compact-active-filters', { count }) : t('compact-filters');
    trigger.setAttribute('aria-label', label);
  }
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
}

function updateDownloadLabel() {
  if (!refs || !refs.downloadBtn) return;
  const label = refs.downloadBtn.querySelector('[data-download-label]')?.textContent;
  refs.downloadBtn.setAttribute('aria-label', label || t('download-opml'));
}

export function updateCompactToolbar() {
  if (!refs) return;
  updateBadge();
  updateDownloadLabel();
}

function moveCompactControls() {
  moveTo(refs.filterGroup, 'compact-filters-slot');
  moveTo(refs.viewRow, 'compact-view-slot');
  moveTo(refs.searchWrapper, 'compact-search-slot');
  moveTo(refs.counter, 'compact-counter-slot');
  moveTo(refs.selectionGroup, 'compact-selection-slot');
  moveTo(refs.deselectHidden, 'compact-selection-slot');
  moveTo(refs.downloadBtn, 'compact-download-slot');
  moveTo(refs.formatGroup, 'compact-export-slot');
  moveTo(refs.altDownload, 'compact-export-slot');
}

function restoreControls() {
  restore(refs.altDownload, homeRefs.altDownload);
  restore(refs.downloadBtn, homeRefs.primaryDownload);
  restore(refs.formatGroup, homeRefs.format);
  restore(refs.deselectHidden, homeRefs.deselectHidden);
  restore(refs.selectionGroup, homeRefs.selection);
  restore(refs.counter, homeRefs.counter);
  restore(refs.searchWrapper, homeRefs.search);
  restore(refs.viewRow, homeRefs.viewRow);
  restore(refs.filterGroup, homeRefs.filterGroup);
}

function syncMode() {
  if (!refs) return;
  const nextCompact = mediaQuery.matches;
  if (nextCompact === compactMode) {
    updateCompactToolbar();
    return;
  }

  closeActivePanel(false);
  compactMode = nextCompact;
  toolbar.classList.toggle('toolbar--compact', compactMode);
  document.body.classList.toggle('toolbar-compact', compactMode);
  document.getElementById('compact-toolbar').setAttribute('aria-hidden', String(!compactMode));

  if (compactMode) moveCompactControls();
  else restoreControls();
  updateCompactToolbar();
}

function setupPanelEvents() {
  Object.entries(panelDefinitions).forEach(([name, definition]) => {
    const trigger = document.getElementById(definition.triggerId);
    trigger.addEventListener('click', () => openPanel(name));
  });

  document.querySelectorAll('[data-compact-close]').forEach(button => {
    button.addEventListener('click', () => closePanel(button.dataset.compactClose, true));
  });

  document.addEventListener('click', event => {
    if (compactMode && activePanel && !toolbar.contains(event.target)) closeActivePanel(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compactMode && activePanel) {
      event.preventDefault();
      closeActivePanel(true);
    }
  });
}

export function setupCompactToolbar() {
  if (refs) return;
  toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  mediaQuery = window.matchMedia('(max-width: 700px), (max-height: 520px)');
  collectRefs();
  setupPanelEvents();

  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', syncMode);
  else mediaQuery.addListener(syncMode);
  window.addEventListener('resize', syncMode, { passive: true });
  window.addEventListener('awesome-rss:rendered', updateCompactToolbar);

  compactMode = false;
  syncMode();
}
