import es from '../i18n/es.js';
import en from '../i18n/en.js';
import pt from '../i18n/pt.js';
import { currentLang, setCurrentLang } from './state.js';

let data = { es: Object.freeze(es), en: Object.freeze(en), pt: Object.freeze(pt) };

export function t(key, replacements) {
  let lang = data[currentLang];
  if (!lang) lang = data.es;
  let str = lang[key];
  if (str === undefined) str = data.es[key] || key;
  if (replacements) {
    return str.replace(/\{(\w+)\}/g, (_, k) => replacements[k] ?? '{' + k + '}');
  }
  return str;
}

export function applyTranslations() {
  document.title = t('title');
  document.documentElement.lang = currentLang;

  let allI18n = document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-aria], [data-i18n-title]');
  for (let i = 0; i < allI18n.length; i++) {
    let el = allI18n[i];
    if (el.hasAttribute('data-i18n')) el.textContent = t(el.getAttribute('data-i18n'));
    if (el.hasAttribute('data-i18n-placeholder')) el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    if (el.hasAttribute('data-i18n-aria')) el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    if (el.hasAttribute('data-i18n-title')) el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  }
}

export function restoreLanguage() {
  let saved = localStorage.getItem('awesome-rss-lang');
  if (saved && data[saved]) {
    setCurrentLang(saved);
  } else {
    let navLang = (navigator.language || '').slice(0, 2);
    if (data[navLang]) setCurrentLang(navLang);
  }
}
