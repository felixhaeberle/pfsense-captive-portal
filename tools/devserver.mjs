#!/usr/bin/env node
/**
 * devserver.mjs — a local stand-in for the pfSense captive portal backend.
 *
 * It exists so the portal pages can be exercised in a real browser without a
 * firewall: it performs the same macro substitution pfSense does, serves the
 * uploaded-asset namespace the same way, and implements the login / error /
 * logout round trip.
 *
 * Usage:  node tools/devserver.mjs [--port 8080] [--root .]
 *
 * Test users:  demo / demo        (valid credentials)
 *              voucher 1234-5678  (valid voucher)
 *              anything else      -> error page
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(arg('port', 8080));
const ROOT = path.resolve(arg('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));

const ZONE = 'guestwifi';
const ACTION = `/index.php?zone=${ZONE}`;
const LOGOUT_URL = `/index.php?zone=${ZONE}&logout_id=6f4a1c2b-demo-session&`;

const VALID_USER = { user: 'demo', pass: 'demo' };
const VALID_VOUCHER = '1234-5678';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

/**
 * pfSense replaces these tokens by straight string substitution before the page
 * is handed to the client. Values below mirror what a real zone emits.
 */
function macros(overrides = {}) {
  return {
    $PORTAL_ACTION$: ACTION,
    $PORTAL_REDIRURL$: 'http://neverssl.com/',
    $PORTAL_MESSAGE$: '',
    $PORTAL_ZONE$: ZONE,
    $CLIENT_MAC$: '3c:22:fb:8a:41:d9',
    $CLIENT_IP$: '192.168.20.137',
    $PORTAL_LOGOUT_URL$: LOGOUT_URL,
    /* pfSense always substitutes the #…# forms too; #VOUCHER# is populated
     * only on the ?voucher= deep-link path and empty otherwise. */
    '#VOUCHER#': '',
    '#USERNAME#': '',
    '#PASSWORD#': '',
    ...overrides,
  };
}

/**
 * Minimal PHP-template emulator for the patterns OUR pages emit: strips the
 * `<?php … ?>` prelude blocks, evaluates `<?php if (EXPR): ?> … <?php endif; ?>`
 * with boolean variables, and expands `<?= htmlspecialchars($var …) ?>` /
 * `<?= $var ?>` echo tags. Real pfSense runs the genuine PHP interpreter.
 */
function evalPhpTemplate(html, values) {
  const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const truthy = (expr) => {
    const cmp = expr.match(/^\$(\w+)\s*(!==|>)\s*(.+)$/);
    if (cmp) {
      const value = values[cmp[1]];
      if (cmp[2] === '>') return Number(value) > Number(cmp[3]);
      return String(value) !== cmp[3].replace(/['"]/g, '');
    }
    // Boolean combinations of variables: ($a || $b) && !$c …
    const jsExpr = expr.replace(/\$(\w+)/g, (_, name) => JSON.stringify(Boolean(values[name])));
    if (!/^[\strue false()!&|]+$/.test(jsExpr)) return true;
    try {
      return new Function(`return (${jsExpr});`)();
    } catch {
      return true;
    }
  };

  html = html.replace(/<\?php if \((.*?)\): \?>([\s\S]*?)<\?php endif; \?>/g, (_, cond, body) => (truthy(cond.trim()) ? body : ''));
  html = html.replace(/<\?=\s*htmlspecialchars\(\$(\w+)[^)]*\)\s*\?>/g, (_, name) => escapeHtml(values[name] ?? ''));
  html = html.replace(/<\?=\s*\$(\w+)\s*\?>/g, (_, name) => escapeHtml(values[name] ?? ''));
  html = html.replace(/<\?php\b(?!=)[\s\S]*?\?>\n?/g, '');
  return html;
}

function render(file, overrides, phpVars) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  html = evalPhpTemplate(html, {
    cptpl_accounts: true,
    cptpl_accounts2: false,
    cptpl_vouchers: true,
    cptpl_guest: false,
    ...phpVars,
  });
  for (const [token, value] of Object.entries(macros(overrides))) {
    html = html.split(token).join(value);
  }
  return html;
}

/**
 * The logout page is a PHP template on real pfSense (include()d, no macro
 * substitution). Emulate just enough of PHP for our own template so the page
 * can be exercised here: strip the prelude, resolve the <?php if ?> blocks and
 * expand the <?= htmlspecialchars($cptpl_X …) ?> echoes with mock values.
 */
function renderLogout(vars = {}) {
  const values = {
    cptpl_logouturl: '/',
    cptpl_sessionid: '6f4a1c2b-demo-session',
    cptpl_zone: ZONE,
    cptpl_redirurl: 'http://neverssl.com/',
    cptpl_ip: '192.168.20.137',
    cptpl_mac: '3c:22:fb:8a:41:d9',
    cptpl_user: 'demo',
    cptpl_timeout: 3600,
    cptpl_message: '',
    ...vars,
  };
  values.cptpl_redir_ok = /^https?:\/\//i.test(values.cptpl_redirurl);

  return evalPhpTemplate(fs.readFileSync(path.join(ROOT, 'logout.html'), 'utf8'), values);
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 64 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(new URLSearchParams(data)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST') {
    const form = await readBody(req).catch(() => new URLSearchParams());
    const user = form.get('auth_user') ?? '';
    const pass = form.get('auth_pass') ?? '';
    const voucher = (form.get('auth_voucher') ?? '').trim();
    const redirurl = form.get('redirurl') ?? '';

    console.log(`[POST] user=${JSON.stringify(user)} voucher=${JSON.stringify(voucher)} redirurl=${JSON.stringify(redirurl)}`);

    // Mirrors index.php's dispatch: accept must be truthy, voucher wins.
    if (!form.get('accept')) return send(res, 200, render('portal.html'));

    const ok =
      voucher !== ''
        ? voucher.replace(/[\s-]+/g, '') === VALID_VOUCHER.replace(/-/g, '')
        : user === VALID_USER.user && pass === VALID_USER.pass;

    if (ok) {
      return send(res, 200, renderLogout({
        cptpl_redirurl: redirurl,
        cptpl_user: voucher ? voucher : user,
        cptpl_message: voucher ? 'Voucher accepted: 120 minutes.' : '',
      }));
    }
    return send(res, 200, render('error.html', {
      $PORTAL_MESSAGE$: voucher ? 'Voucher invalid or expired.' : 'Invalid credentials specified.',
      $PORTAL_REDIRURL$: redirurl,
    }));
  }

  // Explicit page routes, plus an ?msg= escape hatch for injection testing.
  if (url.pathname === '/logout') {
    return send(res, 200, renderLogout(url.searchParams.has('bare')
      ? { cptpl_redirurl: '', cptpl_user: '', cptpl_ip: '', cptpl_mac: '', cptpl_timeout: 0 }
      : {}));
  }

  const pages = { '/': 'portal.html', '/index.php': 'portal.html', '/portal': 'portal.html', '/error': 'error.html' };
  if (pages[url.pathname]) {
    const overrides = {};
    if (url.searchParams.has('msg')) overrides.$PORTAL_MESSAGE$ = url.searchParams.get('msg');
    if (url.searchParams.has('voucher')) overrides['#VOUCHER#'] = url.searchParams.get('voucher');
    if (url.searchParams.has('redirurl')) overrides.$PORTAL_REDIRURL$ = url.searchParams.get('redirurl');
    if (url.searchParams.has('logout_id')) return send(res, 200, '<!doctype html><meta charset=utf-8><title>Disconnected</title><body style="font:16px system-ui;padding:2rem">Session terminated by the firewall.</body>');

    // Zone-feature flags, mirroring what the auth.detect PHP prelude computes
    // on real pfSense: ?noaccounts and/or ?novouchers simulate zones with the
    // respective method disabled; both off yields the click-through fallback.
    const accounts = !url.searchParams.has('noaccounts');
    const vouchers = !url.searchParams.has('novouchers');
    const phpVars = {
      cptpl_accounts: accounts,
      cptpl_vouchers: vouchers,
      cptpl_guest: !accounts && !vouchers,
    };
    return send(res, 200, render(pages[url.pathname], overrides, phpVars));
  }

  // Uploaded assets: pfSense stores them prefixed with `captiveportal-` but the
  // pages reference them without the prefix, so resolve both spellings.
  const name = path.basename(url.pathname);
  /* Requests use pfSense's flat `captiveportal-…` naming; the repo keeps
   * sources under src/assets/ — resolve both spellings in both places. */
  const bare = name.replace(/^captiveportal-/i, '');
  for (const candidate of [name, `captiveportal-${name}`, path.join('src/assets', name), path.join('src/assets', bare)]) {
    const file = path.join(ROOT, candidate);
    if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] ?? 'application/octet-stream');
    }
  }

  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log(`pfSense captive portal mock listening on http://localhost:${PORT}`);
  console.log(`  login: ${VALID_USER.user}/${VALID_USER.pass}   voucher: ${VALID_VOUCHER}`);
});
