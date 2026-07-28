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
    for (let r in replacements) {
      if (replacements.hasOwnProperty(r)) {
        str = str.replace('{' + r + '}', replacements[r]);
      }
    }
  }
  return str;
}

export function applyTranslations() {
  document.title = t('title');
  document.documentElement.lang = currentLang;

  let i18nEls = document.querySelectorAll('[data-i18n]');
  for (let i = 0; i < i18nEls.length; i++) {
    i18nEls[i].textContent = t(i18nEls[i].getAttribute('data-i18n'));
  }

  let placeholderEls = document.querySelectorAll('[data-i18n-placeholder]');
  for (let j = 0; j < placeholderEls.length; j++) {
    placeholderEls[j].placeholder = t(placeholderEls[j].getAttribute('data-i18n-placeholder'));
  }

  let ariaEls = document.querySelectorAll('[data-i18n-aria]');
  for (let k = 0; k < ariaEls.length; k++) {
    ariaEls[k].setAttribute('aria-label', t(ariaEls[k].getAttribute('data-i18n-aria')));
  }

  let titleEls = document.querySelectorAll('[data-i18n-title]');
  for (let m = 0; m < titleEls.length; m++) {
    titleEls[m].setAttribute('title', t(titleEls[m].getAttribute('data-i18n-title')));
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
