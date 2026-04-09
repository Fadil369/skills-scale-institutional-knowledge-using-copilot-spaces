/**
 * @brainsait/i18n
 * Bilingual AR/EN localization for the BrainSAIT healthcare platform
 * Merges translations from brainsait-rcm and brainsait-mcp-dxt into one canonical source
 */

import ar from '../locales/ar.json' assert { type: 'json' };
import en from '../locales/en.json' assert { type: 'json' };

const LOCALES = { ar, en };

/**
 * Get a translated string by key for the given locale.
 * Supports dot-notation keys (e.g. "claims.status.approved").
 * Falls back to English if the key is missing in Arabic.
 *
 * @param {string} key - dot-notation translation key
 * @param {'ar'|'en'} locale - target language
 * @param {object} [vars] - interpolation variables { name: 'value' }
 * @returns {string}
 */
export function t(key, locale = 'en', vars = {}) {
  const dict = LOCALES[locale] ?? LOCALES.en;
  const fallback = LOCALES.en;

  let value = _get(dict, key) ?? _get(fallback, key) ?? key;

  for (const [k, v] of Object.entries(vars)) {
    value = value.replaceAll(`{{${k}}}`, String(v));
  }

  return value;
}

/** Get the text direction for a locale */
export function dir(locale) {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Get the HTML lang attribute value */
export function lang(locale) {
  return locale === 'ar' ? 'ar-SA' : 'en-US';
}

/** List all supported locales */
export const SUPPORTED_LOCALES = ['ar', 'en'];

/** Default locale */
export const DEFAULT_LOCALE = 'ar';

function _get(obj, dotKey) {
  return dotKey.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}
