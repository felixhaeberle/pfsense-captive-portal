#!/usr/bin/env node
/**
 * build.mjs — assemble the three uploadable captive portal pages.
 *
 *   node tools/build.mjs [--config config.json] [--out .] [--pretty]
 *
 * Reads config.json plus the sources in src/ and writes portal.html,
 * error.html and logout.html at the repository root, each one self-contained:
 * no external stylesheet, no external script, no third-party request. That is
 * a hard requirement rather than an optimisation — a pre-authentication client
 * cannot reach anything except the firewall itself, so a CDN reference is a
 * guaranteed broken page.
 *
 * Zero dependencies, on purpose. `node tools/build.mjs` on a clean checkout.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PRETTY = flag('pretty');
const OUT = path.resolve(ROOT, opt('out', '.'));
const config = readJSON(opt('config', 'config.json'));
const i18n = readJSON('src/i18n.json');

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, rel), 'utf8'));
}
function read(rel) {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
}

/* --- Escaping -------------------------------------------------------------
 *
 * Config values are author-controlled, not attacker-controlled, but they land
 * in HTML and a stray quote in a brand name would silently break an attribute.
 * ------------------------------------------------------------------------ */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Only http(s), protocol-relative and same-document/relative URLs survive. */
function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9._~\-/#?]/i.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  console.warn(`  ! dropped unsupported URL scheme: ${raw}`);
  return '';
}

/* --- Icons (inline, so nothing is fetched) -------------------------------- */

const ICONS = {
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.4 3.4M6.6 6.6A18.6 18.6 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.5"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.1a6 6 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>',
};

/* --- Strings -------------------------------------------------------------- */

const LANGS = (config.i18n?.enabled ? config.i18n.languages : [config.i18n?.default || 'en'])
  .filter((code) => {
    if (i18n[code]) return true;
    console.warn(`  ! unknown language "${code}" — skipped`);
    return false;
  });

const DEFAULT_LANG = LANGS.includes(config.i18n?.default) ? config.i18n.default : LANGS[0];

const strings = {};
for (const code of LANGS) {
  strings[code] = {};
  for (const [key, value] of Object.entries(i18n[code])) {
    strings[code][key] = String(value).replace(/\$BRAND\$/g, config.brand?.name ?? '');
  }
}

/** Build-time text in the default language, so a no-JS page still reads well. */
const t = (key) => strings[DEFAULT_LANG]?.[key] ?? key;

/* --- Assets --------------------------------------------------------------- */

function logoMarkup() {
  const src = config.brand?.logo;
  if (!src) return '';
  const wide = config.brand?.logoWide ? ' brand-logo--wide' : '';

  /* An inline <svg> keeps the page self-contained and lets the mark inherit
   * currentColor, so it recolours correctly in dark mode. */
  if (src.endsWith('.svg') && fs.existsSync(path.resolve(ROOT, src))) {
    const svg = read(src)
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    return `<span class="brand-logo${wide}">${svg}</span>`;
  }
  return `<span class="brand-logo${wide}"><img src="${esc(src)}" alt=""></span>`;
}

function faviconTag() {
  if (!config.brand?.favicon) return '';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23171717' stroke-width='2.4' stroke-linecap='round'><path d='M5 12.55a11 11 0 0 1 14 0'/><path d='M8.5 16.1a6 6 0 0 1 7 0'/><path d='M12 20h.01'/></svg>`;
  return `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg).replace(/%2F/g, '/').replace(/%3D/g, '=').replace(/%20/g, ' ').replace(/%27/g, "'")}">`;
}

/* --- CSS ------------------------------------------------------------------ */

function buildCss() {
  let css = read('src/tokens.css') + '\n' + read('src/app.css');

  const overrides = [];
  if (config.theme?.radius) overrides.push(`  --radius: ${config.theme.radius};`);
  if (config.theme?.primary) overrides.push(`  --primary: ${config.theme.primary};`);
  if (config.theme?.primaryForeground) overrides.push(`  --primary-foreground: ${config.theme.primaryForeground};`);
  if (overrides.length) css += `\n/* config.json overrides */\n:root {\n${overrides.join('\n')}\n}\n`;

  const bg = config.theme?.backgroundImage;
  if (bg) {
    css += `\n.backdrop {\n  background-image: url("${encodeURI(bg)}");\n}\n`;
    if (config.theme?.backgroundBlur) css += `.backdrop { filter: blur(3px); transform: scale(1.03); }\n`;
  }

  return PRETTY ? css : squeeze(css);
}

/** Conservative shrink: drop comments and redundant blank lines, keep the
 *  structure readable. Anyone auditing an uploaded page can still follow it. */
function squeeze(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line.trim() !== '' || (all[i - 1] ?? '').trim() !== '')
    .join('\n')
    .trim();
}

function squeezeJs(js) {
  return js
    .split('\n')
    .filter((line) => !/^\s*\/\*|^\s*\*|^\s*\/\//.test(line))
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line.trim() !== '' || (all[i - 1] ?? '').trim() !== '')
    .join('\n')
    .trim();
}

/* --- Inline script -------------------------------------------------------- */

/** Safe to embed in <script>: no `</script>` sequence, no HTML comment opener. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* Runs before first paint so a dark-mode client never sees a white flash. */
const BOOT_JS = `(function(){try{var p=localStorage.getItem('cp-theme')||${jsonForScript(config.theme?.default || 'system')};var d=p==='dark'||(p!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

function appScript() {
  const runtime = {
    theme: config.theme?.default || 'system',
    defaultLang: DEFAULT_LANG,
    detectLang: !!config.i18n?.detect,
    strings,
    validate: config.security?.clientSideValidation !== false,
    warnInsecure: config.security?.warnOnInsecureTransport !== false,
    voucherFormat: config.auth?.voucherFormat || '',
    voucherAutoFormat: !!config.auth?.voucherAutoFormat,
    autoRedirect: config.logout?.autoRedirect !== false,
    autoRedirectDelay: Number(config.logout?.autoRedirectDelay) || 3,
  };
  const body = PRETTY ? read('src/app.js') : squeezeJs(read('src/app.js'));
  return `window.__CP__=${jsonForScript(runtime)};\n${body}`;
}

/* --- Content Security Policy ---------------------------------------------- */

const sha256 = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function cspMeta(styleText, scriptTexts) {
  if (config.security?.csp === false) return '';
  const scriptHashes = scriptTexts.map(sha256).join(' ');
  const policy = [
    `default-src 'none'`,
    `img-src 'self' data:`,
    `style-src ${sha256(styleText)}`,
    `script-src ${scriptHashes}`,
    `form-action 'self'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${esc(policy)}">`;
}

/* --- Page fragments ------------------------------------------------------- */

function chrome() {
  const parts = [];
  if (config.theme?.allowToggle !== false) {
    parts.push(
      `<button type="button" class="btn btn-ghost btn--icon" data-theme-toggle aria-pressed="false"` +
        ` aria-label="${esc(t('theme.toggle'))}" data-i18n-attr="aria-label:theme.toggle">` +
        `<span class="sr-only" data-i18n="theme.toggle">${esc(t('theme.toggle'))}</span>` +
        `<span class="theme-icon theme-icon--light">${ICONS.sun}</span>` +
        `<span class="theme-icon theme-icon--dark">${ICONS.moon}</span>` +
        `</button>`
    );
  }
  if (config.i18n?.enabled && LANGS.length > 1) {
    const options = LANGS.map(
      (code) => `<option value="${esc(code)}"${code === DEFAULT_LANG ? ' selected' : ''}>${esc(code.toUpperCase())}</option>`
    ).join('');
    parts.push(
      `<label class="sr-only" for="lang" data-i18n="lang.label">${esc(t('lang.label'))}</label>` +
        `<select class="select" id="lang" data-lang-select>${options}</select>`
    );
  }
  return parts.length ? `<div class="chrome">${parts.join('')}</div>` : '';
}

function field({ id, name, labelKey, type = 'text', placeholderKey, autocomplete, requiredKey, extraClass = '', hintKey, reveal, inputmode, maxlength, disabled, dataAttr = '' }) {
  const attrs = [
    `class="input${extraClass}"`,
    `id="${esc(id)}"`,
    `name="${esc(name)}"`,
    `type="${esc(type)}"`,
    autocomplete ? `autocomplete="${esc(autocomplete)}"` : `autocomplete="off"`,
    placeholderKey ? `placeholder="${esc(t(placeholderKey))}" data-i18n-attr="placeholder:${placeholderKey}"` : '',
    /* `required` is added at runtime by the script, and only to the inputs of
     * the ACTIVE tab panel. Baking it into the markup would break the no-JS
     * path: a display:none input that is required-and-empty is "invalid but
     * not focusable", and the browser refuses to submit the form at all. */
    requiredKey ? `data-required="${esc(requiredKey)}"` : '',
    inputmode ? `inputmode="${esc(inputmode)}"` : '',
    maxlength ? `maxlength="${Number(maxlength)}"` : '',
    disabled ? 'disabled' : '',
    dataAttr,
    `spellcheck="false"`,
  ].filter(Boolean).join(' ');

  const input = `<input ${attrs}>`;
  const control = reveal
    ? `<div class="input-group">${input}` +
      `<button type="button" class="input-affix" data-reveal="${esc(id)}" aria-pressed="false"` +
      ` aria-label="${esc(t('action.show'))}" data-i18n-attr="aria-label:action.show">` +
      `<span data-reveal-icon="show">${ICONS.eye}</span>` +
      `<span data-reveal-icon="hide" hidden>${ICONS.eyeOff}</span>` +
      `</button></div>`
    : input;

  return (
    `<div class="field">` +
    `<label class="label" for="${esc(id)}" data-i18n="${labelKey}">${esc(t(labelKey))}</label>` +
    control +
    (hintKey ? `<p class="field-hint" data-i18n="${hintKey}">${esc(t(hintKey))}</p>` : '') +
    `</div>`
  );
}

function accountPanel(disabled) {
  return (
    field({
      id: 'auth_user', name: 'auth_user', labelKey: 'label.username',
      placeholderKey: 'placeholder.username',
      autocomplete: config.auth?.usernameAutocomplete || 'username',
      requiredKey: 'error.empty.user', disabled,
    }) +
    field({
      id: 'auth_pass', name: 'auth_pass', labelKey: 'label.password', type: 'password',
      placeholderKey: 'placeholder.password', autocomplete: 'current-password',
      requiredKey: 'error.empty.pass', reveal: config.auth?.showPasswordToggle !== false, disabled,
    })
  );
}

function secondaryPanel(disabled) {
  return (
    field({
      id: 'auth_user2', name: 'auth_user2', labelKey: 'label.username',
      placeholderKey: 'placeholder.username', autocomplete: 'username',
      requiredKey: 'error.empty.user', disabled,
    }) +
    field({
      id: 'auth_pass2', name: 'auth_pass2', labelKey: 'label.password', type: 'password',
      placeholderKey: 'placeholder.password', autocomplete: 'current-password',
      requiredKey: 'error.empty.pass', reveal: config.auth?.showPasswordToggle !== false, disabled,
    })
  );
}

function voucherPanel(disabled) {
  /* value="#VOUCHER#" supports pfSense's deep-link form,
   * /index.php?zone=<zone>&voucher=CODE, which pre-fills the field. */
  return field({
    id: 'auth_voucher', name: 'auth_voucher', labelKey: 'label.voucher',
    placeholderKey: 'placeholder.voucher', extraClass: ' input--mono',
    requiredKey: 'error.empty.voucher', hintKey: 'hint.voucher',
    dataAttr: 'data-voucher value="#VOUCHER#" autocapitalize="characters"', disabled,
  });
}

function guestPanel() {
  return `<p class="field-hint" data-i18n="hint.guest">${esc(t('hint.guest') || '')}</p>`;
}

const PANELS = {
  account: { labelKey: 'tab.account', icon: ICONS.lock, render: accountPanel },
  account2: { labelKey: 'tab.account2', icon: ICONS.lock, render: secondaryPanel },
  voucher: { labelKey: 'tab.voucher', icon: ICONS.ticket, render: voucherPanel },
  guest: { labelKey: 'tab.guest', icon: ICONS.wifi, render: guestPanel },
};

function authSection() {
  const methods = (config.auth?.methods || ['account']).filter((m) => {
    if (PANELS[m]) return true;
    console.warn(`  ! unknown auth method "${m}" — skipped`);
    return false;
  });
  if (!methods.length) throw new Error('config.auth.methods is empty — nothing to render');

  const active = methods.includes(config.auth?.defaultMethod) ? config.auth.defaultMethod : methods[0];

  if (methods.length === 1) return PANELS[methods[0]].render(false);

  /* CSS-only tabs. The radios sit before both the list and the panels so
   * `:checked ~` can reach either. `form="cp-detached"` names no existing form,
   * which leaves the radios without a form owner — they still group by name,
   * but they are never submitted, so pfSense sees only the auth fields. */
  const radios = methods
    .map((m) => `<input type="radio" name="cp-tab" id="tab-${m}" class="tab-radio" form="cp-detached" data-tab-radio="${m}"${m === active ? ' checked' : ''}>`)
    .join('');

  const triggers = methods
    .map((m) => `<label class="tabs-trigger" for="tab-${m}" role="tab" aria-selected="${m === active}" aria-controls="panel-${m}" tabindex="0">${PANELS[m].icon}<span data-i18n="${PANELS[m].labelKey}">${esc(t(PANELS[m].labelKey))}</span></label>`)
    .join('');

  /* All inputs are rendered enabled so a no-JS client can use whichever panel
   * the CSS tabs reveal; the script disables and blanks inactive panels at
   * runtime (pfSense evaluates auth_voucher before auth_user, so a filled but
   * hidden voucher field must never ride along on an account submit). */
  const panels = methods
    .map((m) => `<div class="tabs-panel" id="panel-${m}" data-tab-panel="${m}" role="tabpanel" aria-hidden="${m !== active}">${PANELS[m].render(false)}</div>`)
    .join('');

  return `<div class="tabs">${radios}<div class="tabs-list" role="tablist">${triggers}</div><div class="tabs-panels">${panels}</div></div>`;
}

function termsSection() {
  if (!config.terms?.required) return '';
  const target = config.terms?.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
  const termsUrl = safeUrl(config.terms?.termsUrl);
  const privacyUrl = safeUrl(config.terms?.privacyUrl);

  const link = (url, key) =>
    url ? `<a href="${esc(url)}"${target} data-i18n="${key}">${esc(t(key))}</a>` : `<span data-i18n="${key}">${esc(t(key))}</span>`;

  const label =
    `<span data-i18n="terms.prefix">${esc(t('terms.prefix'))}</span> ` +
    link(termsUrl, 'terms.link') +
    (privacyUrl ? ` <span data-i18n="terms.middle">${esc(t('terms.middle'))}</span> ${link(privacyUrl, 'terms.privacy')}` : '') +
    '.';

  return (
    `<div class="checkbox-row">` +
    `<input type="checkbox" class="checkbox" id="terms" required>` +
    `<label class="checkbox-label" for="terms">${label}</label>` +
    `</div>`
  );
}

function insecureNotice() {
  if (config.security?.warnOnInsecureTransport === false) return '';
  return (
    `<p class="field-hint notice-insecure" data-insecure-notice hidden>` +
    `${ICONS.unlock}<span data-i18n="notice.insecure">${esc(t('notice.insecure') || '')}</span></p>`
  );
}

function clientInfo() {
  if (!config.logout?.showSessionDetails) return '';
  /* Both macros are htmlspecialchars()-escaped by pfSense and sit in element
   * text, which is a safe sink. CLIENT_MAC is empty unless MAC filtering is on. */
  return (
    `<p class="footer-meta">` +
    `<span class="badge badge-outline mono">$CLIENT_IP$</span>` +
    `<span class="badge badge-outline mono mac-badge">$CLIENT_MAC$</span>` +
    `</p>`
  );
}

function footer() {
  const text = config.footer?.text ? `<span data-i18n="footer.help">${esc(config.footer.text)}</span>` : '';
  if (!text) return '';
  return `<p class="footer">${text}</p>`;
}

/* --- Page assembly -------------------------------------------------------- */

function shell({ page, title, cardHtml, extraBodyClass = '' }) {
  const css = buildCss();
  const script = appScript();
  const bodyClasses = ['cp-page', config.theme?.backgroundImage ? 'has-backdrop' : 'no-backdrop', extraBodyClass]
    .filter(Boolean).join(' ');

  const head = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="theme-color" content="#ffffff">`,
    `<meta name="robots" content="noindex, nofollow">`,
    /* Keeps the session id in the logout page out of any outbound Referer. */
    `<meta name="referrer" content="no-referrer">`,
    cspMeta(css, [BOOT_JS, script]),
    `<title>${esc(title)}</title>`,
    faviconTag(),
    `<style>${css}</style>`,
    `<script>${BOOT_JS}</script>`,
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="${esc(DEFAULT_LANG)}" dir="ltr" class="cp-booting">
<head>
${head}
</head>
<body class="${esc(bodyClasses)}" data-page="${esc(page)}">
<div class="backdrop" aria-hidden="true"></div>
${chrome()}
<main class="shell">
${cardHtml}
${footer()}
</main>
<script>${script}</script>
</body>
</html>
`;
}

function loginCard({ isError }) {
  const alertBlock = isError
    ? `<div class="alert alert-destructive" id="form-alert" role="alert" data-static="true">` +
      ICONS.alert +
      `<p class="alert-title" id="form-alert-text" data-i18n="error.generic">${esc(t('error.generic'))}</p>` +
      /* $PORTAL_MESSAGE$ is the backend's own text (bad password, expired
       * voucher, RADIUS Reply-Message). pfSense htmlspecialchars() it, and it
       * lands in element text — a safe sink. `.alert-description:empty` in the
       * stylesheet hides this line when the backend sent nothing. */
      `<p class="alert-description">$PORTAL_MESSAGE$</p>` +
      `</div>`
    : `<div class="alert alert-destructive" id="form-alert" role="alert" data-static="false" hidden>` +
      ICONS.alert +
      `<p class="alert-title" id="form-alert-text"></p>` +
      `</div>`;

  return `<div class="card">
<div class="card-header">
<div class="brand">${logoMarkup()}</div>
<h1 class="card-title" data-i18n="portal.title">${esc(t('portal.title'))}</h1>
<p class="card-description" data-i18n="portal.subtitle">${esc(t('portal.subtitle'))}</p>
</div>
<form class="card-content" id="login-form" method="post" action="$PORTAL_ACTION$">
${alertBlock}
${authSection()}
${termsSection()}
${insecureNotice()}
<input type="hidden" name="redirurl" value="$PORTAL_REDIRURL$">
<input type="hidden" name="zone" value="$PORTAL_ZONE$">
<input type="hidden" name="accept" value="1">
<button type="submit" class="btn btn-default btn--block btn--lg" id="submit" name="accept" value="login">
<span class="btn-label" data-i18n="action.signin">${esc(t('action.signin'))}</span>
<span class="btn-spinner" aria-hidden="true"></span>
</button>
</form>
${clientInfo() ? `<div class="card-footer">${clientInfo()}</div>` : ''}
</div>`;
}

/* The logout page is the odd one out: pfSense `include`s it directly, so it is
 * executed as PHP and receives NO macro substitution at all. The values arrive
 * as PHP variables instead — and, unlike macros, they are NOT escaped for us.
 * Every one is passed through htmlspecialchars() below.
 *
 * The variables also differ by code path: portal_allow() supplies the full set,
 * while an already-authenticated client re-hitting the portal (index.php) gets
 * only $logouturl, $sessionid, $cpzone and a partial $attributes. Everything is
 * therefore isset()-guarded — the stock template is not, which is why it
 * renders `href=""` on that second path. */
function logoutCard() {
  const details = config.logout?.showSessionDetails !== false;
  const disconnect = config.logout?.showDisconnectButton !== false;

  return `<?php
// Values supplied by pfSense. Prefixed to avoid colliding with variables in
// the including scope (this file is include()d from inside portal_allow()).
$cptpl_logouturl = isset($logouturl) ? $logouturl : '/';
$cptpl_sessionid = isset($sessionid) ? $sessionid : '';
$cptpl_zone      = isset($cpzone) ? $cpzone : '';
$cptpl_redirurl  = isset($my_redirurl) ? $my_redirurl : '';
$cptpl_ip        = isset($clientip) ? $clientip : '';
$cptpl_mac       = isset($clientmac) ? $clientmac : '';
$cptpl_user      = isset($username) ? $username : '';
$cptpl_timeout   = (isset($attributes) && is_array($attributes) && isset($attributes['session_timeout'])) ? (int)$attributes['session_timeout'] : 0;
$cptpl_message   = (isset($message) && $message !== 0 && $message !== '0') ? (string)$message : '';
// Only ever emit an http(s) redirect target.
$cptpl_redir_ok  = ($cptpl_redirurl !== '' && preg_match('#^https?://#i', $cptpl_redirurl) === 1);
?>
<div class="card" data-stage="connected">
<div class="card-header">
<div class="brand">${logoMarkup()}</div>
<h1 class="card-title" data-i18n="logout.title">${esc(t('logout.title'))}</h1>
<p class="card-description" data-i18n="logout.subtitle">${esc(t('logout.subtitle'))}</p>
</div>
<div class="card-content">
<div class="status-pill"><span class="badge badge-success"><span class="badge-dot badge-dot--pulse"></span><span data-i18n="logout.online">${esc(t('logout.online'))}</span></span></div>
<?php if ($cptpl_message !== ''): ?>
<div class="alert" role="status">${ICONS.check}<p class="alert-title"><?= htmlspecialchars($cptpl_message, ENT_QUOTES, 'UTF-8') ?></p></div>
<?php endif; ?>
${details ? `<dl class="details">
<?php if ($cptpl_user !== ''): ?>
<dt data-i18n="logout.user">${esc(t('logout.user'))}</dt><dd><?= htmlspecialchars($cptpl_user, ENT_QUOTES, 'UTF-8') ?></dd>
<?php endif; ?>
<?php if ($cptpl_ip !== ''): ?>
<dt data-i18n="logout.ip">${esc(t('logout.ip'))}</dt><dd><?= htmlspecialchars($cptpl_ip, ENT_QUOTES, 'UTF-8') ?></dd>
<?php endif; ?>
<?php if ($cptpl_mac !== ''): ?>
<dt data-i18n="logout.mac">${esc(t('logout.mac'))}</dt><dd><?= htmlspecialchars($cptpl_mac, ENT_QUOTES, 'UTF-8') ?></dd>
<?php endif; ?>
<?php if ($cptpl_timeout > 0): ?>
<dt data-i18n="logout.remaining">${esc(t('logout.remaining'))}</dt><dd data-session-timeout="<?= $cptpl_timeout ?>">—</dd>
<?php endif; ?>
</dl>` : ''}
<?php if ($cptpl_redir_ok): ?>
<a class="btn btn-default btn--block btn--lg" data-redirect href="<?= htmlspecialchars($cptpl_redirurl, ENT_QUOTES, 'UTF-8') ?>"><span data-i18n="action.browse">${esc(t('action.browse'))}</span></a>
<p class="field-hint" data-countdown-wrap><span data-i18n="logout.redirect">${esc(t('logout.redirect'))}</span> <span data-countdown>—</span></p>
<?php endif; ?>
</div>
${disconnect ? `<div class="card-footer">
<hr class="separator">
<p class="field-hint" data-i18n="logout.hint">${esc(t('logout.hint'))}</p>
<form id="logout-form" method="post" action="<?= htmlspecialchars($cptpl_logouturl, ENT_QUOTES, 'UTF-8') ?>">
<input type="hidden" name="logout_id" value="<?= htmlspecialchars($cptpl_sessionid, ENT_QUOTES, 'UTF-8') ?>">
<input type="hidden" name="zone" value="<?= htmlspecialchars($cptpl_zone, ENT_QUOTES, 'UTF-8') ?>">
<button type="submit" name="logout" value="1" class="btn btn-outline btn--block"><span data-i18n="action.disconnect">${esc(t('action.disconnect'))}</span></button>
</form>
</div>` : ''}
</div>`;
}

/* --- Safety checks -------------------------------------------------------- */

/** pfSense str_replace()s these tokens across the whole page output, including
 *  <style> and <script>. If one ever appeared there it would be rewritten at
 *  request time and the CSP hash computed here would no longer match. */
const MACROS = [
  'PORTAL_ACTION', 'PORTAL_ZONE', 'PORTAL_REDIRURL', 'PORTAL_MESSAGE',
  'CLIENT_MAC', 'CLIENT_IP', 'USERNAME', 'PASSWORD', 'VOUCHER',
];

function audit(name, html) {
  const problems = [];

  for (const block of [...html.matchAll(/<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi)]) {
    for (const macro of MACROS) {
      if (block[2].includes(`$${macro}$`) || block[2].includes(`#${macro}#`)) {
        problems.push(`macro ${macro} appears inside a <${block[1]}> block — it would break the CSP hash and is an XSS sink`);
      }
    }
  }

  /* pfSense runs the login and error pages through the PHP interpreter, so a
   * stray "<?" in those two would be swallowed. The logout page is PHP by
   * design and is exempt. */
  if (name !== 'logout.html' && /<\?/.test(html)) {
    problems.push('contains "<?" — the PHP interpreter would consume it');
  }

  if (!/name="accept"/.test(html) && name !== 'logout.html') {
    problems.push('no field named "accept" — index.php would never enter the auth branch');
  }

  if (/\bhttps?:\/\/(?!\$)/.test(html.replace(/<\/?a\b[^>]*>/gi, ''))) {
    const hits = [...html.matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/gi)]
      .map((m) => m[1])
      .filter((u) => !u.startsWith('http://www.w3.org/'));
    for (const hit of hits) {
      if (!config.terms?.termsUrl?.includes(hit) && !config.terms?.privacyUrl?.includes(hit)) {
        problems.push(`external resource ${hit} — unreachable before authentication`);
      }
    }
  }

  return problems;
}

/* --- Write ---------------------------------------------------------------- */

const pages = [
  { file: 'portal.html', html: shell({ page: 'portal', title: `${config.brand?.title || 'Wi-Fi'} — ${t('portal.title')}`, cardHtml: loginCard({ isError: false }) }) },
  { file: 'error.html', html: shell({ page: 'error', title: `${config.brand?.title || 'Wi-Fi'} — ${t('portal.title')}`, cardHtml: loginCard({ isError: true }) }) },
  { file: 'logout.html', html: shell({ page: 'logout', title: `${config.brand?.title || 'Wi-Fi'} — ${t('logout.title')}`, cardHtml: logoutCard() }) },
];

let failed = false;
console.log(`building ${pages.length} pages → ${path.relative(process.cwd(), OUT) || '.'}`);

for (const { file, html } of pages) {
  const problems = audit(file, html);
  for (const problem of problems) {
    console.error(`  ✗ ${file}: ${problem}`);
    failed = true;
  }
  fs.writeFileSync(path.join(OUT, file), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`  ${problems.length ? '✗' : '✓'} ${file}  ${kb} KB`);
}

console.log(`  languages: ${LANGS.join(', ')} (default ${DEFAULT_LANG})`);
console.log(`  auth methods: ${(config.auth?.methods || []).join(', ')}`);
console.log(`  CSP: ${config.security?.csp === false ? 'disabled' : 'hash-based, self-contained'}`);

if (failed) {
  console.error('\nbuild finished with problems — do not upload these pages');
  process.exit(1);
}
