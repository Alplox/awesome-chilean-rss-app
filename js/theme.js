import { KEYS } from './state.js';
import { getStoredItem, setStoredItem } from './storage.js';

export function setTheme(theme) {
  let root = document.documentElement;
  root.classList.add('no-animate');
  root.setAttribute('data-theme', theme);
  root.getBoundingClientRect();
  setStoredItem(KEYS.THEME, theme);
  let btns = document.querySelectorAll('.theme-btn');
  for (let i = 0; i < btns.length; i++) {
    let isActive = btns[i].dataset.theme === theme;
    btns[i].classList.toggle('active', isActive);
    btns[i].setAttribute('aria-checked', isActive ? 'true' : 'false');
    btns[i].tabIndex = isActive ? 0 : -1;
  }
  let meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    let bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }
  root.classList.remove('no-animate');
}

export function restoreTheme() {
  let saved = getStoredItem(KEYS.THEME);
  if (saved) setTheme(saved);
}
