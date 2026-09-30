/* Tripto internationalization runtime. English source is the resilient offline fallback. */
(() => {
  "use strict";
  const STORAGE_KEY = "tripto_locale_v1";
  const SUPPORTED = Object.freeze(["en", "de", "fr", "es", "ru"]);
  const names = Object.freeze({ en: "English", de: "Deutsch", fr: "Français", es: "Español", ru: "Русский" });
  // Only English is offered right now. Ignore any stored or browser locale so no
  // visitor lands in a hidden language; other locales stay wired up for later.
  let locale = "en";
  let source = Object.create(null);
  let messages = Object.create(null);
  let plurals = Object.create(null);
  let countNouns = []; // english "{count} noun" -> plural key; safe before patterns load
  let patternsAll = [];                  // {re, names, key} — match on text nodes AND attributes
  let patternsAttr = [];                 // {re, names, key} — match on attributes only (user-data captures)
  let loading = Promise.resolve();
  let observer;
  let loadSequence = 0;
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let originalTitle = null;
  function normalize(value) { const base = String(value || "en").toLowerCase().split(/[-_]/)[0]; return SUPPORTED.includes(base) ? base : "en"; }
  function readStored() { try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } }
  function interpolate(value, vars) { return String(value ?? "").replace(/\{(\w+)\}/g, (_, key) => vars?.[key] == null ? `{${key}}` : String(vars[key])); }
  // A stale service worker from a previous deploy serves cached locale bytes and
  // ignores our ?v= token, so a content update never lands. When the fetched
  // bundle's stamped version differs from this build's token we evict the old
  // worker + caches once and reload to pull fresh bytes straight from network.
  async function purgeAndReload() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
      if (globalThis.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch (_) {}
    try { location.reload(); } catch (_) {}
  }
  function selfHealIfStale(bundleVersion) {
    const expected = globalThis.__TRIPTO_ASSET_VER;
    if (!expected || bundleVersion === expected) return false; // no token, or already fresh
    try { // guard: heal at most once per (session, deploy) so we never reload-loop
      if (sessionStorage.getItem("tripto_i18n_healed") === expected) return false;
      sessionStorage.setItem("tripto_i18n_healed", expected);
    } catch (_) {}
    purgeAndReload();
    return true;
  }
  function keyFor(text) { return source[String(text || "").trim()] || null; }
  function t(key, vars, fallback) { return interpolate(messages[key] || fallback || key, vars); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function compile(en) {
    let re = "^", names = [], rx = /\{(\w+)\}/g, m, last = 0;
    // {plural} is an English suffix marker ("s"/""), so it must match EMPTY too — otherwise the singular
    // form ("1 server trip") never matches and stays English. All other placeholders require ≥1 char.
    while ((m = rx.exec(en))) { re += escapeRe(en.slice(last, m.index)) + (m[1] === "plural" ? "(.*?)" : "(.+?)"); names.push(m[1]); last = m.index + m[0].length; }
    return { re: new RegExp(re + escapeRe(en.slice(last)) + "$"), names };
  }
  function buildPatterns(spec) {
    countNouns = []; patternsAll = []; patternsAttr = [];
    const counts = [];
    for (const [en, nounKey] of Object.entries(spec.countNouns || {})) { const c = compile(en); counts.push({ ...c, noun: nounKey }); }
    countNouns = counts;
    for (const p of spec.patterns || []) { const c = compile(p.en); const entry = { ...c, key: p.key }; (p.scope === "all" ? patternsAll : patternsAttr).push(entry); }
  }
  // Translate a full string via count-plural rules or interpolation patterns; null if nothing safe matches.
  function translateDynamic(text, allowAttrScope) {
    const s = String(text).trim();
    if (!s) return null;
    for (const c of countNouns) { const m = c.re.exec(s); if (m) { const count = String(m[1]).trim(); if (/^\d+(?:[.,]\d+)?$/.test(count)) return plural(c.noun, Number(count.replace(',', '.'))); } }
    const pools = allowAttrScope ? [patternsAll, patternsAttr] : [patternsAll];
    for (const pool of pools) for (const p of pool) {
      const m = p.re.exec(s); if (!m) continue;
      if (!messages[p.key]) continue;
      const vars = {}; p.names.forEach((n, i) => {
        const raw = m[i + 1];
        const nestedKey = keyFor(raw);
        // Dynamic UI labels can embed a static title (for example, “Close
        // Notifications”). Translate that title as well, while preserving user
        // supplied values that have no message key.
        vars[n] = nestedKey && messages[nestedKey] ? t(nestedKey) : raw;
      });
      return interpolate(messages[p.key], vars);
    }
    return null;
  }
  function translateText(node) {
    if (!node || !node.nodeValue || !node.nodeValue.trim()) return;
    if (node.parentElement?.closest('[translate="no"]')) return;
    const raw = originalText.get(node) || node.nodeValue, leading = raw.match(/^\s*/)?.[0] || "", trailing = raw.match(/\s*$/)?.[0] || "";
    if (locale === "en") { if (originalText.has(node)) node.nodeValue = raw; return; }
    const trimmed = raw.trim();
    const key = keyFor(trimmed);
    if (key && messages[key]) { originalText.set(node, raw); node.nodeValue = leading + t(key) + trailing; return; }
    const dyn = translateDynamic(trimmed, false);
    if (dyn != null && dyn !== trimmed) { originalText.set(node, raw); node.nodeValue = leading + dyn + trailing; }
  }
  function translateAttr(element) {
    if (element?.closest?.('[translate="no"]')) return;
    ["aria-label", "title", "placeholder", "alt"].forEach(attribute => {
      const originals = originalAttributes.get(element) || Object.create(null);
      const value = originals[attribute] || element.getAttribute(attribute); if (!value || !value.trim()) return;
      if (locale === "en") { if (originals[attribute]) element.setAttribute(attribute, value); return; }
      const key = keyFor(value);
      if (key && messages[key]) { originals[attribute] = value; originalAttributes.set(element, originals); element.setAttribute(attribute, t(key)); return; }
      const dyn = translateDynamic(value, true);
      if (dyn != null && dyn !== value.trim()) { originals[attribute] = value; originalAttributes.set(element, originals); element.setAttribute(attribute, dyn); }
    });
  }
  function translateRoot(root = document) {
    document.documentElement.lang = locale;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttr(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) { const parent = node.parentElement; return parent && !parent.closest('[translate="no"]') && !["SCRIPT","STYLE","NOSCRIPT"].includes(parent.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(translateText);
    root.querySelectorAll?.("[aria-label],[title],[placeholder],[alt]").forEach(translateAttr);
    if (root === document) translateTitle();
  }
  function translateTitle() {
    const raw = originalTitle || document.title;
    if (locale === "en") { if (originalTitle) document.title = originalTitle; return; }
    const key = keyFor(raw);
    if (key && messages[key]) { originalTitle = raw; document.title = t(key); return; }
    const dyn = translateDynamic(raw, false); if (dyn != null && dyn !== raw.trim()) { originalTitle = raw; document.title = dyn; }
  }
  async function load(next) {
    const request = ++loadSequence;
    locale = normalize(next);
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
    // Locale bundles are served immutable with no path hash, so version the query
    // (from the deploy token in index.html) or a content change never reaches a
    // browser that already cached the old bytes. A new token = a new URL = fresh.
    const v = (globalThis.__TRIPTO_ASSET_VER ? "?v=" + encodeURIComponent(globalThis.__TRIPTO_ASSET_VER) : "");
    loading = Promise.all([
      fetch(`/lang/source-map.json${v}`, {cache:"force-cache"}),
      fetch(`/lang/${locale}.json${v}`, {cache:"force-cache"}),
      fetch(`/lang/patterns.json${v}`, {cache:"force-cache"}).catch(() => null),
    ])
      .then(async ([sourceResponse, messageResponse, patternResponse]) => {
        if (!sourceResponse.ok || !messageResponse.ok) throw new Error("locale unavailable");
        const bundle = await messageResponse.json();
        if (request !== loadSequence) return;
        if (selfHealIfStale(bundle.version)) return; // stale worker detected; reloading
        source = await sourceResponse.json();
        messages = bundle.messages || {}; plurals = bundle.plural || {};
        try { if (patternResponse && patternResponse.ok) buildPatterns(await patternResponse.json()); } catch (_) {}
        translateRoot(document); installLegalSelector();
        const legalLanguage = document.querySelector('.legal-language');
        if (legalLanguage) legalLanguage.value = locale;
        document.dispatchEvent(new CustomEvent("tripto:localechange", {detail:{locale}}));
      })
      .catch(() => { if (request === loadSequence) { locale = "en"; document.documentElement.lang = "en"; } });
    return loading;
  }
  function observe(root) { if (observer) observer.disconnect(); observer = new MutationObserver(records => { if (locale === "en") return; records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) translateText(node); else if (node.nodeType === Node.ELEMENT_NODE) translateRoot(node); })); }); observer.observe(document.body, {childList:true,subtree:true}); }
  function formatDate(value, options = {}) { return new Intl.DateTimeFormat(locale, options).format(value); }
  function formatNumber(value, options = {}) { return new Intl.NumberFormat(locale, options).format(value); }
  function formatCurrency(value, currency, options = {}) { return new Intl.NumberFormat(locale, {style:"currency",currency,...options}).format(value); }
  function plural(key, count) { const rule = new Intl.PluralRules(locale).select(Number(count)); const template = plurals?.[key]?.[rule] || plurals?.[key]?.other || `{count}`; return interpolate(template,{count:formatNumber(count)}); }
  function installLegalSelector() {
    const header = document.querySelector(".legal-top");
    if (!header || header.querySelector(".legal-language")) return;
    const select = document.createElement("select");
    select.className = "legal-language"; select.setAttribute("aria-label", "Language");
    select.innerHTML = SUPPORTED.map(code => `<option value="${code}">${names[code]}</option>`).join("");
    select.value = locale;
    select.addEventListener("change", () => load(select.value));
    header.insertBefore(select, header.querySelector(".legal-app-link") || null);
  }
  globalThis.TriptoI18n = Object.freeze({supported:SUPPORTED,names,get locale(){return locale;},normalize,t,keyFor,load,setLocale:load,ready:()=>loading,translate:translateRoot,observe,formatDate,formatNumber,formatCurrency,plural});
  load(locale);
})();
