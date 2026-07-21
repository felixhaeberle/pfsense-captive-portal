/* ---------------------------------------------------------------------------
 * Captive portal client script.
 *
 * Everything here is progressive enhancement. The pages submit correctly with
 * JavaScript disabled: the tabs are CSS-only (radio + :checked), the terms gate
 * falls back to the browser's own `required` validation, and no navigation
 * depends on script.
 *
 * Two hard rules, both derived from how pfSense actually renders these pages:
 *
 *  1. No pfSense macro ($PORTAL_MESSAGE$, $CLIENT_IP$, …) may appear inside a
 *     <script> block. pfSense escapes them with htmlspecialchars(), which is
 *     safe for HTML text and quoted attributes but NOT for a JavaScript
 *     context. This script therefore reads every portal-supplied value out of
 *     the DOM instead.
 *  2. The submit button must be named `accept` and must carry a non-empty
 *     value — index.php dispatches on `if ($_POST['accept'])`. A scripted
 *     form.submit() drops the button's name/value entirely, so submission goes
 *     through requestSubmit() (which preserves it) and the markup carries a
 *     hidden `accept` as a second line of defence.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var CFG = window.__CP__ || {};
  var STRINGS = CFG.strings || {};
  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  var PAGE = body.getAttribute('data-page') || 'portal';

  function $(sel, scope) { return (scope || doc).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); }
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn, false); }

  /* localStorage throws outright in some private-browsing modes and inside the
   * iOS captive network assistant, so every access is guarded. */
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (err) { /* preferences simply don't persist */ }
    return null;
  }

  /* --- Theme ------------------------------------------------------------- */

  var THEME_KEY = 'cp-theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolveTheme(pref) {
    if (pref === 'dark' || pref === 'light') return pref;
    return media && media.matches ? 'dark' : 'light';
  }

  function applyTheme(pref) {
    var resolved = resolveTheme(pref);
    root.classList.toggle('dark', resolved === 'dark');
    root.setAttribute('data-theme', resolved);
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0a0a0a' : '#ffffff');
    $$('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', resolved === 'dark' ? 'true' : 'false');
    });
  }

  var themePref = store(THEME_KEY) || CFG.theme || 'system';
  applyTheme(themePref);

  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (themePref === 'system') applyTheme('system');
    });
  }

  $$('[data-theme-toggle]').forEach(function (btn) {
    on(btn, 'click', function () {
      themePref = resolveTheme(themePref) === 'dark' ? 'light' : 'dark';
      store(THEME_KEY, themePref);
      applyTheme(themePref);
    });
  });

  /* --- Language ---------------------------------------------------------- */

  var LANG_KEY = 'cp-lang';
  var langs = Object.keys(STRINGS);
  var lang = CFG.defaultLang || langs[0];

  function pickLanguage() {
    var saved = store(LANG_KEY);
    if (saved && STRINGS[saved]) return saved;
    if (!CFG.detectLang) return lang;
    var candidates = (navigator.languages || [navigator.language || '']).slice();
    for (var i = 0; i < candidates.length; i++) {
      var tag = String(candidates[i] || '').toLowerCase();
      if (STRINGS[tag]) return tag;
      var base = tag.split('-')[0];
      if (STRINGS[base]) return base;
    }
    return lang;
  }

  function translate(key) {
    var table = STRINGS[lang] || {};
    if (table[key] !== undefined) return table[key];
    var fallback = STRINGS[CFG.defaultLang] || {};
    return fallback[key] !== undefined ? fallback[key] : key;
  }

  function applyLanguage(next) {
    if (!STRINGS[next]) return;
    lang = next;
    root.setAttribute('lang', next);
    root.setAttribute('dir', translate('dir') === 'rtl' ? 'rtl' : 'ltr');

    /* textContent, never innerHTML — the strings are build-time constants, but
     * keeping the sink safe means a future translator can't introduce markup. */
    $$('[data-i18n]').forEach(function (el) {
      el.textContent = translate(el.getAttribute('data-i18n'));
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length === 2) el.setAttribute(parts[0].trim(), translate(parts[1].trim()));
      });
    });
    var select = $('[data-lang-select]');
    if (select) select.value = next;
  }

  if (langs.length) {
    applyLanguage(pickLanguage());
    on($('[data-lang-select]'), 'change', function (evt) {
      store(LANG_KEY, evt.target.value);
      applyLanguage(evt.target.value);
    });
  }

  /* --- Tabs -------------------------------------------------------------- */

  /* The radios drive the visuals via CSS. Script's only job is to keep ARIA
   * honest and — importantly — to blank the inputs in the panel the user just
   * left. pfSense checks auth_voucher BEFORE auth_user, so a stale voucher
   * value silently hijacks an account login. */
  var tabRadios = $$('[data-tab-radio]');

  function syncTabs() {
    tabRadios.forEach(function (radio) {
      var name = radio.getAttribute('data-tab-radio');
      var panel = $('[data-tab-panel="' + name + '"]');
      var label = $('label[for="' + radio.id + '"]');
      var active = radio.checked;

      if (label) label.setAttribute('aria-selected', active ? 'true' : 'false');
      if (!panel) return;
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');

      $$('input', panel).forEach(function (input) {
        if (active) {
          input.disabled = false;
          if (input.hasAttribute('data-required')) input.required = true;
        } else {
          input.value = '';
          input.disabled = true;
          input.required = false;
          clearError(input);
        }
      });
      if (active) {
        /* The call to action follows the auth method: "Sign in" for accounts,
         * "Redeem voucher", "Continue" for click-through. */
        var submitLabel = $('#submit .btn-label');
        var key = panel.getAttribute('data-submit-key');
        if (submitLabel && key) {
          submitLabel.setAttribute('data-i18n', key);
          submitLabel.textContent = translate(key);
        }
        var first = $('input:not([type=hidden])', panel);
        if (first && doc.activeElement !== first && tabsTouched) first.focus();
      }
    });
  }

  var tabsTouched = false;
  tabRadios.forEach(function (radio) {
    on(radio, 'change', function () { tabsTouched = true; syncTabs(); });
  });

  /* pfSense pre-fills the voucher field on its ?voucher= deep link (#VOUCHER#
   * substitution). If a code arrived that way, surface the voucher tab instead
   * of blanking it as a stale inactive-panel value. */
  var prefilledVoucher = $('[data-voucher]');
  if (prefilledVoucher && prefilledVoucher.value.trim()) {
    var voucherRadio = $('[data-tab-radio="voucher"]');
    if (voucherRadio) voucherRadio.checked = true;
  }

  if (tabRadios.length) syncTabs();

  /* Keyboard support: arrow keys move between tabs, matching the ARIA pattern. */
  $$('.tabs-trigger').forEach(function (label, index, all) {
    on(label, 'keydown', function (evt) {
      var delta = evt.key === 'ArrowRight' ? 1 : evt.key === 'ArrowLeft' ? -1 : 0;
      if (!delta) return;
      evt.preventDefault();
      var next = all[(index + delta + all.length) % all.length];
      var radio = doc.getElementById(next.getAttribute('for'));
      if (radio) { radio.checked = true; tabsTouched = true; syncTabs(); next.focus(); }
    });
  });

  /* --- Password reveal --------------------------------------------------- */

  $$('[data-reveal]').forEach(function (btn) {
    var input = doc.getElementById(btn.getAttribute('data-reveal'));
    if (!input) return;
    on(btn, 'click', function () {
      var shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.setAttribute('aria-pressed', shown ? 'false' : 'true');
      btn.setAttribute('aria-label', translate(shown ? 'action.show' : 'action.hide'));
      $$('[data-reveal-icon]', btn).forEach(function (icon) {
        icon.hidden = icon.getAttribute('data-reveal-icon') !== (shown ? 'show' : 'hide');
      });
      /* Keep the caret where the user left it rather than jumping to the end. */
      try { var p = input.selectionStart; input.focus(); input.setSelectionRange(p, p); } catch (e) { input.focus(); }
    });
  });

  /* --- Voucher formatting ------------------------------------------------ */

  var voucher = $('[data-voucher]');
  if (voucher && CFG.voucherAutoFormat) {
    var groups = (CFG.voucherFormat || '').split('-').map(function (g) { return g.length; });
    on(voucher, 'input', function () {
      var caretAtEnd = voucher.selectionStart === voucher.value.length;
      var raw = voucher.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      var out = [];
      var pos = 0;
      for (var i = 0; i < groups.length && pos < raw.length; i++) {
        out.push(raw.substr(pos, groups[i]));
        pos += groups[i];
      }
      if (pos < raw.length) out.push(raw.substr(pos));
      var formatted = out.filter(Boolean).join('-');
      if (formatted !== voucher.value) {
        voucher.value = formatted;
        if (caretAtEnd) { try { voucher.setSelectionRange(formatted.length, formatted.length); } catch (e) {} }
      }
      clearError(voucher);
    });
  }

  /* --- Validation -------------------------------------------------------- */

  function fieldError(input, messageKey) {
    var wrap = input.closest ? input.closest('.field') : null;
    input.setAttribute('aria-invalid', 'true');
    if (!wrap) return;
    var msg = $('.field-error', wrap);
    if (!msg) {
      msg = doc.createElement('p');
      msg.className = 'field-error';
      msg.id = input.id + '-error';
      wrap.appendChild(msg);
    }
    msg.textContent = translate(messageKey);
    msg.setAttribute('data-i18n', messageKey);
    input.setAttribute('aria-describedby', msg.id);
  }

  function clearError(input) {
    input.removeAttribute('aria-invalid');
    var wrap = input.closest ? input.closest('.field') : null;
    var msg = wrap && $('.field-error', wrap);
    if (msg) msg.remove();
  }

  var form = $('#login-form');
  var alertBox = $('#form-alert');
  var alertText = $('#form-alert-text');

  function showAlert(messageKey) {
    if (!alertBox) return;
    if (alertText) {
      alertText.textContent = translate(messageKey);
      alertText.setAttribute('data-i18n', messageKey);
    }
    alertBox.hidden = false;
  }

  if (form && CFG.validate) {
    /* Take over from native validation only now that script is running; a
     * no-JS client keeps the browser's own `required` handling instead. */
    form.noValidate = true;

    $$('input', form).forEach(function (input) {
      on(input, 'input', function () { clearError(input); });
    });

    on(form, 'submit', function (evt) {
      var problems = 0;
      var activePanel = $('.tabs-panel[aria-hidden="false"]') || form;

      $$('input[data-required]', activePanel).forEach(function (input) {
        if (input.disabled) return;
        if (!input.value.trim()) {
          fieldError(input, input.getAttribute('data-required'));
          if (!problems) input.focus();
          problems++;
        }
      });

      var terms = $('#terms');
      if (terms && !terms.checked) {
        terms.setAttribute('aria-invalid', 'true');
        showAlert('terms.required');
        if (!problems) terms.focus();
        problems++;
      }

      if (problems) { evt.preventDefault(); return; }

      /* Let the native submit proceed — it carries the clicked button's
       * name/value, which pfSense requires. Just reflect the busy state. */
      var submit = $('#submit');
      if (submit) {
        submit.setAttribute('data-busy', 'true');
        submit.setAttribute('aria-busy', 'true');
      }
      /* If the POST stalls (portal unreachable), release the button so the
       * user can retry rather than staring at a dead spinner. */
      window.setTimeout(function () {
        if (submit) { submit.removeAttribute('data-busy'); submit.removeAttribute('aria-busy'); }
      }, 15000);
    });

    var termsBox = $('#terms');
    on(termsBox, 'change', function () {
      if (termsBox.checked) {
        termsBox.removeAttribute('aria-invalid');
        if (alertBox && alertBox.getAttribute('data-static') !== 'true') alertBox.hidden = true;
      }
    });
  }

  /* --- Insecure transport notice ----------------------------------------- */

  if (CFG.warnInsecure && location.protocol === 'http:') {
    var notice = $('[data-insecure-notice]');
    if (notice) notice.hidden = false;
  }

  /* --- Logout page ------------------------------------------------------- */

  if (PAGE === 'logout') {
    var stage = $('[data-stage]');
    var redirect = $('[data-redirect]');
    var target = redirect ? redirect.getAttribute('href') : '';

    /* Only ever follow http/https. pfSense validates redirurl with is_URL()
     * server-side, but this page also renders on a path where that value came
     * straight from the client, so re-check the scheme before navigating. */
    var safeTarget = /^https?:\/\//i.test(target || '') ? target : '';

    var countdownEl = $('[data-countdown]');
    if (safeTarget && CFG.autoRedirect && countdownEl) {
      var left = CFG.autoRedirectDelay || 3;
      countdownEl.textContent = String(left);
      var timer = window.setInterval(function () {
        left--;
        countdownEl.textContent = String(left);
        if (left <= 0) {
          window.clearInterval(timer);
          window.location.href = safeTarget;
        }
      }, 1000);
      /* Any interaction cancels the automatic jump. */
      ['click', 'keydown', 'touchstart'].forEach(function (evt) {
        doc.addEventListener(evt, function cancel() {
          window.clearInterval(timer);
          var wrap = $('[data-countdown-wrap]');
          if (wrap) wrap.hidden = true;
        }, { once: true });
      });
    } else {
      var wrap = $('[data-countdown-wrap]');
      if (wrap) wrap.hidden = true;
    }

    var disconnectForm = $('#logout-form');
    on(disconnectForm, 'submit', function () {
      if (stage) stage.setAttribute('data-stage', 'disconnecting');
    });

    /* Session countdown, when RADIUS supplied a session timeout. */
    var timeoutEl = $('[data-session-timeout]');
    if (timeoutEl) {
      var seconds = parseInt(timeoutEl.getAttribute('data-session-timeout'), 10);
      if (seconds > 0) {
        var tick = function () {
          var h = Math.floor(seconds / 3600);
          var m = Math.floor((seconds % 3600) / 60);
          var s = seconds % 60;
          timeoutEl.textContent = (h ? h + ':' : '') +
            (h ? String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
          if (seconds-- <= 0) window.clearInterval(sessionTimer);
        };
        tick();
        var sessionTimer = window.setInterval(tick, 1000);
      }
    }
  }

  /* Reveal the page only once the theme class is settled, so a dark-mode user
   * never sees a white flash. The class is added by the inline head script. */
  root.classList.remove('cp-booting');
})();
