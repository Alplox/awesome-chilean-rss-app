import { KEYS } from './state.js';

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(KEYS.THEME, theme);
  let btns = document.querySelectorAll('.theme-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.theme === theme);
  }
}

export function restoreTheme() {
  let saved = localStorage.getItem(KEYS.THEME);
  if (saved) setTheme(saved);
}
