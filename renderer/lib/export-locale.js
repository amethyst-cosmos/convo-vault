"use strict";

function normalizeExportLocale(value) {
  if (typeof value !== "string" || value.length > 80) return "";
  try {
    const [locale] = Intl.getCanonicalLocales(value.trim().replace(/_/g, "-"));
    return locale && locale !== "und" && locale !== "auto" ? locale : "";
  } catch {
    return "";
  }
}

module.exports = { normalizeExportLocale };
