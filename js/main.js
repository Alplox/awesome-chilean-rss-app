import { el, allFeeds, selectedFeeds, setDomReady, setCurrentLang, filters } from './state.js';
import { setTheme, restoreTheme } from './theme.js';
import { loadData } from './data.js';
import { t, applyTranslations, restoreLanguage } from './i18n.js';
import { render, showLoading, showError, hideLoading, populateFilters, updateDownloadBtns, selectAllInCategory, deselectAllInCategory, deselectHidden, selectAllGlobal, deselectAllGlobal } from './render.js';
import { downloadFeeds } from './download.js';

/* --- DOM Cache --- */
function cacheDom() {
  el.categoryFilter = document.getElementById('filter-category');
  el.regionFilter = document.getElementById('filter-region');
  el.searchInput = document.getElementById('filter-search');
  el.toggleMain = document.getElementById('toggle-main');
  el.toggleStale = document.getElementById('toggle-stale');
  el.toggleProxies = document.getElementById('toggle-proxies');
  el.toggleGroup = document.getElementById('toggle-group');
  el.toggleRegion = document.getElementById('toggle-region');
  el.formatOptions = document.querySelectorAll('.format-option');
  el.downloadBtn = document.getElementById('download-btn');
  el.downloadAltBtn = document.getElementById('download-btn-alt');
  el.counter = document.getElementById('counter');
  el.deselectHidden = document.getElementById('deselect-hidden');
  el.selectAllBtn = document.getElementById('select-all-btn');
  el.deselectAllBtn = document.getElementById('deselect-all-btn');
  el.feedList = document.getElementById('feed-list');
  el.loading = document.getElementById('loading');
  el.error = document.getElementById('error');
  el.empty = document.getElementById('empty');
  el.themeBtns = document.querySelectorAll('.theme-btn');
  el.langSelect = document.getElementById('lang-select');
  setDomReady();
}

/* --- Event Listeners --- */
function setupEventListeners() {
  el.categoryFilter.addEventListener('change', function (e) {
    filters.category = e.target.value;
    render();
  });

  el.regionFilter.addEventListener('change', function (e) {
    filters.region = e.target.value;
    render();
  });

  el.searchInput.addEventListener('input', function (e) {
    filters.search = e.target.value;
    render();
  });

  el.toggleMain.addEventListener('change', function (e) {
    filters.mainFeedOnly = e.target.checked;
    render();
  });

  el.toggleStale.addEventListener('change', function (e) {
    filters.showStale = e.target.checked;
    render();
  });

  el.toggleProxies.addEventListener('change', function (e) {
    filters.showProxies = e.target.checked;
    if (!filters.showProxies) {
      filters.hiddenProxySites.clear();
      for (let p = 0; p < allFeeds.length; p++) {
        if (allFeeds[p].isProxy) selectedFeeds.delete(allFeeds[p].id);
      }
    }
    render();
  });

  el.toggleGroup.addEventListener('change', function (e) {
    filters.groupOpml = e.target.checked;
    if (filters.groupOpml) filters.groupByRegion = false;
    syncToggles();
    render();
  });

  el.toggleRegion.addEventListener('change', function (e) {
    filters.groupByRegion = e.target.checked;
    if (filters.groupByRegion) filters.groupOpml = false;
    syncToggles();
    render();
  });

  for (let j = 0; j < el.formatOptions.length; j++) {
    el.formatOptions[j].addEventListener('click', function () {
      if (this.classList.contains('active')) return;
      filters.format = this.dataset.format;

      for (let k = 0; k < el.formatOptions.length; k++) {
        el.formatOptions[k].classList.remove('active');
      }
      this.classList.add('active');

      updateDownloadBtns();
    });
  }

  el.downloadBtn.addEventListener('click', function () { downloadFeeds(true); });
  el.downloadAltBtn.addEventListener('click', function () { downloadFeeds(false); });

  el.selectAllBtn.addEventListener('click', function () { selectAllGlobal(); });
  el.deselectAllBtn.addEventListener('click', function () { deselectAllGlobal(); });

  for (let k = 0; k < el.themeBtns.length; k++) {
    el.themeBtns[k].addEventListener('click', function () {
      setTheme(this.dataset.theme);
    });
  }

  el.langSelect.addEventListener('change', function (e) {
    setLanguage(e.target.value);
  });

  el.deselectHidden.addEventListener('click', deselectHidden);
}

/* --- Sync toggles → filters --- */
function syncToggles() {
  el.toggleMain.checked = filters.mainFeedOnly;
  el.toggleStale.checked = filters.showStale;
  el.toggleProxies.checked = filters.showProxies;
  el.toggleGroup.checked = filters.groupOpml;
  el.toggleRegion.checked = filters.groupByRegion;
}

/* --- Language switching --- */
function setLanguage(lang) {
  if (!lang) return;
  setCurrentLang(lang);
  localStorage.setItem('awesome-rss-lang', lang);
  el.langSelect.value = lang;
  applyTranslations();
  populateFilters();
  render();
  updateDownloadBtns();
}

/* --- Init --- */
document.addEventListener('DOMContentLoaded', function () {
  cacheDom();
  syncToggles();
  restoreTheme();
  restoreLanguage();
  applyTranslations();

  setupEventListeners();
  loadDataAndRender();
});

async function loadDataAndRender() {
  showLoading();
  try {
    await loadData();
    populateFilters();
    hideLoading();
    render();
    updateDownloadBtns();
  } catch (err) {
    showError(err.message);
  }
}
