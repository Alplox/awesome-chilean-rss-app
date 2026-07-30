import { KEYS } from './state.js';

export function setTheme(theme) {
  let root = document.documentElement;
  root.classList.add('no-animate');
  root.setAttribute('data-theme', theme);
  root.getBoundingClientRect();
  localStorage.setItem(KEYS.THEME, theme);
  let btns = document.querySelectorAll('.theme-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.theme === theme);
  }
  root.classList.remove('no-animate');
}

export function restoreTheme() {
  let saved = localStorage.getItem(KEYS.THEME);
  if (saved) setTheme(saved);
}
