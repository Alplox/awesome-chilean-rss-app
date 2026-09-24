import { setEnabled, play, warmSound } from './sound.js';
import { el, allFeeds, selectedFeeds, setDomReady, setCurrentLang, currentLang, filters } from './state.js';
import { setTheme, restoreTheme } from './theme.js';
import { loadData } from './data.js';
import { t, applyTranslations, restoreLanguage } from './i18n.js';
import { render, showLoading, showError, hideLoading, populateFilters, updateDownloadBtns, selectAllInCategory, deselectAllInCategory, deselectHidden, selectAllGlobal, deselectAllGlobal } from './render.js';
import { downloadFeeds } from './download.js';
import { getStoredItem, setStoredItem } from './storage.js';
import { setupCompactToolbar, updateCompactToolbar } from './compact-toolbar.js';

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
  el.toggleSiteTogether = document.getElementById('toggle-site-together');
  el.formatOptions = document.querySelectorAll('.format-option');
  el.downloadBtn = document.getElementById('download-btn');
  el.downloadAltBtn = document.getElementById('download-btn-alt');
  el.counter = document.getElementById('counter');
  el.deselectHidden = document.getElementById('deselect-hidden');
  el.selectAllBtn = document.getElementById('select-all-btn');
  el.deselectAllBtn = document.getElementById('deselect-all-btn');
  el.feedList = document.getElementById('feed-list');
  el.main = document.getElementById('main-content');
  el.loading = document.getElementById('loading');
  el.error = document.getElementById('error');
  el.empty = document.getElementById('empty');
  el.copyStatus = document.getElementById('copy-status');
  el.retryBtn = document.getElementById('retry-btn');
  el.themeBtns = document.querySelectorAll('.theme-btn');
  el.langSelect = document.getElementById('lang-select');
  el.soundToggle = document.getElementById('sound-toggle');
  el.backToTop = document.getElementById('back-to-top');
  setDomReady();
}

/* --- Event Listeners --- */
function setupEventListeners() {
  el.categoryFilter.addEventListener('change', function (e) {
    filters.category = e.target.value;
    updateCompactToolbar();
    render();
  });

  el.regionFilter.addEventListener('change', function (e) {
    filters.region = e.target.value;
    updateCompactToolbar();
    render();
  });

  let searchDebounce = null;
  let searchRaf = 0;
  el.searchInput.addEventListener('input', function (e) {
    filters.search = e.target.value;
    updateCompactToolbar();
    clearTimeout(searchDebounce);
    if (searchRaf) cancelAnimationFrame(searchRaf);
    searchDebounce = setTimeout(function () {
      searchRaf = requestAnimationFrame(function () { render(); });
    }, 180);
  });

  el.toggleMain.addEventListener('change', function (e) {
    filters.mainFeedOnly = e.target.checked;
    if (filters.mainFeedOnly) {
      filters.showStale = false;
      filters.showProxies = false;
    }
    syncToggles();
    render();
  });

  el.toggleStale.addEventListener('change', function (e) {
    filters.showStale = e.target.checked;
    if (filters.showStale) {
      filters.mainFeedOnly = false;
    }
    syncToggles();
    render();
  });

  el.toggleProxies.addEventListener('change', function (e) {
    filters.showProxies = e.target.checked;
    if (filters.showProxies) {
      filters.mainFeedOnly = false;
    }
    if (!filters.showProxies) {
      filters.hiddenProxySites.clear();
      for (let p = 0; p < allFeeds.length; p++) {
        if (allFeeds[p].isProxy) selectedFeeds.delete(allFeeds[p].id);
      }
    }
    syncToggles();
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

  el.toggleSiteTogether.addEventListener('change', function (e) {
    filters.keepSiteTogether = e.target.checked;
    syncToggles();
    render();
  });

  for (let j = 0; j < el.formatOptions.length; j++) {
    el.formatOptions[j].addEventListener('click', function () {
      if (this.classList.contains('active')) return;
      filters.format = this.dataset.format;

      for (let k = 0; k < el.formatOptions.length; k++) {
        el.formatOptions[k].classList.remove('active');
        el.formatOptions[k].setAttribute('aria-pressed', 'false');
      }
      this.classList.add('active');
      this.setAttribute('aria-pressed', 'true');

      updateDownloadBtns();
      updateCompactToolbar();
    });
  }

  el.downloadBtn.addEventListener('click', function () { downloadFeeds(filters.groupOpml || filters.groupByRegion); });
  el.downloadAltBtn.addEventListener('click', function () { downloadFeeds(false); });

  el.selectAllBtn.addEventListener('click', function () { selectAllGlobal(); });
  el.deselectAllBtn.addEventListener('click', function () { deselectAllGlobal(); });

  for (let k = 0; k < el.themeBtns.length; k++) {
    el.themeBtns[k].addEventListener('click', function () {
      setTheme(this.dataset.theme);
    });
    el.themeBtns[k].addEventListener('keydown', function (event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let currentIndex = Array.from(el.themeBtns).indexOf(this);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % el.themeBtns.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + el.themeBtns.length) % el.themeBtns.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = el.themeBtns.length - 1;
      let nextButton = el.themeBtns[nextIndex];
      nextButton.focus();
      setTheme(nextButton.dataset.theme);
    });
  }

  el.langSelect.addEventListener('change', function (e) {
    setLanguage(e.target.value);
  });

  el.soundToggle.addEventListener('click', function () {
    let muted = el.soundToggle.classList.toggle('muted');
    setEnabled(!muted).catch(() => {});
    setStoredItem('awesome-rss-muted', muted ? '1' : '');
    el.soundToggle.title = t(muted ? 'sound-enable' : 'sound-disable');
    el.soundToggle.setAttribute('aria-pressed', muted ? 'false' : 'true');
    el.soundToggle.setAttribute('aria-label', t('sound-label'));
    if (!muted) play('success').catch(() => {});
  });

  el.deselectHidden.addEventListener('click', deselectHidden);
  el.retryBtn.addEventListener('click', loadDataAndRender);

  // Back to top
  if (el.backToTop) {
    el.backToTop.addEventListener('click', function () {
      let prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
      el.backToTop.blur();
    });

    let ticking = false;
    let threshold = 200;
    let hideTimeout = 0;
    window.updateBackToTop = function updateBackToTop() {
      let shouldShow = window.scrollY > threshold;
      if (shouldShow) {
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = 0; }
        if (el.backToTop.hidden) el.backToTop.hidden = false;
        el.backToTop.classList.add('is-visible');
        el.backToTop.setAttribute('aria-hidden', 'false');
      } else {
        el.backToTop.classList.remove('is-visible');
        el.backToTop.setAttribute('aria-hidden', 'true');
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(function () {
          if (!el.backToTop.classList.contains('is-visible')) el.backToTop.hidden = true;
          hideTimeout = 0;
        }, 260);
      }
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(window.updateBackToTop);
      }
    }, { passive: true });
    window.addEventListener('resize', window.updateBackToTop);
    // Initial check delayed to allow content to render
    setTimeout(window.updateBackToTop, 500);
    window.updateBackToTop();
    // Also run after custom render events
    window.addEventListener('awesome-rss:rendered', window.updateBackToTop);
  }
}

/* --- Sync toggles → filters --- */
function syncToggles() {
  el.toggleMain.checked = filters.mainFeedOnly;
  el.toggleStale.checked = filters.showStale;
  el.toggleProxies.checked = filters.showProxies;
  el.toggleGroup.checked = filters.groupOpml;
  el.toggleRegion.checked = filters.groupByRegion;
  el.toggleSiteTogether.checked = filters.keepSiteTogether;

  let mainOnly = filters.mainFeedOnly;
  el.toggleStale.disabled = mainOnly;
  el.toggleProxies.disabled = mainOnly;
  el.toggleSiteTogether.disabled = mainOnly;
  el.toggleStale.parentElement.style.opacity = mainOnly ? '0.5' : '1';
  el.toggleProxies.parentElement.style.opacity = mainOnly ? '0.5' : '1';
  el.toggleSiteTogether.parentElement.style.opacity = mainOnly ? '0.5' : '1';

  let grouped = filters.groupOpml || filters.groupByRegion;
  el.downloadAltBtn.hidden = !grouped;
  updateCompactToolbar();
}

/* --- Language switching --- */
function setLanguage(lang) {
  if (!lang) return;
  setCurrentLang(lang);
  setStoredItem('awesome-rss-lang', lang);
  el.langSelect.value = lang;
  applyTranslations();
  el.soundToggle.title = t(el.soundToggle.classList.contains('muted') ? 'sound-enable' : 'sound-disable');
  populateFilters();
  render();
  updateDownloadBtns();
  updateCompactToolbar();
}

/* --- Init --- */
document.addEventListener('DOMContentLoaded', function () {
  cacheDom();
  warmSound();
  if (getStoredItem('awesome-rss-muted')) {
    el.soundToggle.classList.add('muted');
    setEnabled(false).catch(() => {});
    el.soundToggle.title = t('sound-enable');
    el.soundToggle.setAttribute('aria-pressed', 'false');
    el.soundToggle.setAttribute('aria-label', t('sound-label'));
  } else {
    el.soundToggle.title = t('sound-disable');
    el.soundToggle.setAttribute('aria-pressed', 'true');
    el.soundToggle.setAttribute('aria-label', t('sound-label'));
  }
  syncToggles();
  restoreTheme();
  restoreLanguage();
  el.langSelect.value = currentLang;
  applyTranslations();
  if (el.soundToggle.classList.contains('muted')) el.soundToggle.title = t('sound-enable');

  setupCompactToolbar();
  setupEventListeners();
  loadDataAndRender();
});

async function loadDataAndRender() {
  showLoading();
  el.retryBtn.disabled = true;
  try {
    await loadData();
    populateFilters();
    render();
    requestAnimationFrame(() => {
      hideLoading();
      updateDownloadBtns();
    });
  } catch (err) {
    showError(err.message);
  } finally {
    el.retryBtn.disabled = false;
  }
}
