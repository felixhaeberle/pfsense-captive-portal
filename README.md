# pfSense Captive Portal — shadcn edition

Modern, secure, self-contained login pages for the pfSense® captive portal.
Compatible with **pfSense CE 2.7.x / 2.8.x** and **pfSense Plus 24.x / 25.x**.

Three pages, generated from one config file:

| Page | Uploaded as | What it does |
|---|---|---|
| `portal.html` | Portal page contents | Login: account and/or voucher, terms gate, i18n, dark mode |
| `error.html` | Auth error page contents | Same login card plus the firewall's error message (`$PORTAL_MESSAGE$`) |
| `logout.html` | Logout page contents | "You're connected" status, session details, countdown redirect, disconnect button |

## Why this exists

The pfSense captive portal ships with a bare-bones template. Custom pages are
easy to get **subtly wrong** — the backend has sharp edges (the submit button
must be named `accept`; the voucher field wins over username/password; the
logout page is executed as PHP with **unescaped** variables; pre-auth clients
cannot load anything from the internet). These pages get all of that right, and
look like a product while doing it.

## Features

- **shadcn/ui design, zero dependencies.** The current shadcn "new-york" look
  (OKLCH neutral palette, translucent dark-mode borders, 3px focus ring,
  `aria-invalid` treatment) hand-translated to vanilla CSS. No React, no
  Tailwind, no build-time npm installs — `node tools/build.mjs` on a stock
  Node ≥ 18 is the whole toolchain.
- **Fully self-contained pages.** All CSS, JS and icons are inlined; the logo
  SVG is embedded. Nothing is fetched from a CDN — which matters, because a
  pre-authentication client *can't reach a CDN*.
- **Dark mode** — follows the OS, with an optional toggle, no white flash.
- **i18n** — EN/DE/FR/ES/IT included, auto-detected from the browser,
  switchable at runtime, trivially extensible in `src/i18n.json`.
- **Auth methods as tabs** — local/RADIUS/LDAP account, secondary auth server
  (`auth_user2`), vouchers (auto-formatting input, `?voucher=` deep-link
  prefill, multi-code support), and click-through guest mode. CSS-only tabs:
  everything works with JavaScript disabled.
- **Container queries** — the card adapts to the space it actually gets, so it
  lays out correctly inside the iOS/macOS Captive Network Assistant and
  Android's sign-in sheet, which lie about the viewport.
- **Hardened**:
  - Hash-based Content-Security-Policy (`default-src 'none'`) baked into each
    page — injected inline script or event handlers won't execute even if
    output escaping ever regresses (verified with live injection tests).
  - pfSense macros only ever appear in safe HTML sinks — never inside
    `<script>`/`<style>` (the build fails if one does).
  - The logout template escapes every PHP variable with
    `htmlspecialchars(ENT_QUOTES)` and `isset()`-guards the code path where
    pfSense supplies no variables (the stock template renders `href=""` there).
  - Redirect targets are re-validated to `http(s)://` in both PHP and JS.
  - `autocomplete="username"` / `current-password` so password managers work;
    `referrer: no-referrer` so the logout session id never leaks; warning
    banner when the portal is served over plain HTTP.
- **Accessible** — labelled fields, `aria-invalid` + described-by error wiring,
  ARIA tabs with arrow-key support, `prefers-reduced-motion` respected,
  focus-visible rings everywhere.

## Quick start

```sh
git clone https://github.com/felixhaeberle/pfsense-captive-portal
cd pfsense-captive-portal
# 1. edit config.json (brand name, logo, auth methods, terms URLs, …)
node tools/build.mjs
# 2. preview locally against a mock pfSense backend:
node tools/devserver.mjs        # http://localhost:8080 — demo/demo or 1234-5678
```

### Upload to pfSense

1. **Services → Captive Portal → your zone → Configuration**, enable
   *Use custom captive portal page*.
2. Upload `portal.html` as **Portal page contents**, `error.html` as
   **Auth error page contents**, `logout.html` as **Logout page contents**.
   (Leave none of them empty — an empty error page falls back to the stock
   template, not to your portal page.)
3. **File Manager tab**: upload your background image as
   `captiveportal-background.jpg` (the `captiveportal-` prefix is added
   automatically if you omit it; total asset budget is 1 MB per zone).
4. If you use the logout page, enable **Logout popup window** in the zone
   config — pfSense only serves the logout page when it's on. The disconnect
   button works inline; no popup is actually opened.
5. Save. Test from a client on the portal network.

### Strongly recommended zone settings

- **Enable HTTPS login** with a certificate for a real DNS name — otherwise
  credentials cross the Wi-Fi in cleartext (the page shows users a warning
  when that's the case).
- Set **After authentication Redirection URL** if you don't want clients
  redirected to whatever URL they first requested (closes the residual
  open-redirect-by-design in `redirurl`).
- Don't upload `.php` files via File Manager unless you've audited them —
  they execute pre-authentication.

## Configuration

Everything lives in [config.json](config.json). Every key, with defaults:

| Key | Default | Notes |
|---|---|---|
| `brand.name` | `"Acme Hotel"` | Substituted into strings as `$BRAND$` |
| `brand.title` | `"Guest Wi-Fi"` | Browser-tab title prefix |
| `brand.logo` | `src/assets/logo.svg` | SVG is inlined (can use `currentColor`); PNG/JPG referenced by filename — upload it via File Manager |
| `brand.logoWide` | `false` | Wordmark-style logos instead of a square mark |
| `brand.favicon` | `true` | Inline data-URI favicon |
| `theme.default` | `"system"` | `light` \| `dark` \| `system` |
| `theme.allowToggle` | `true` | Show the dark-mode toggle |
| `theme.radius` | `"0.625rem"` | shadcn radius token |
| `theme.primary` / `primaryForeground` | `null` | Brand colour override (any CSS colour) |
| `theme.backgroundImage` | `captiveportal-background.jpg` | `null` for a flat `--background` page |
| `theme.backgroundBlur` | `false` | Blur the photo behind the card |
| `auth.methods` | `["account","voucher"]` | Any of `account`, `account2` (secondary auth server), `voucher`, `guest` (click-through). One method renders without tabs |
| `auth.defaultMethod` | `"account"` | Initially active tab |
| `auth.usernameAutocomplete` | `"username"` | e.g. `email` if usernames are emails |
| `auth.showPasswordToggle` | `true` | Eye icon in the password field |
| `auth.voucherFormat` | `"XXXX-XXXX-XXXX"` | Drives grouping of the auto-formatter |
| `auth.voucherAutoFormat` | `true` | Uppercase + hyphenate as the user types |
| `terms.required` | `true` | Checkbox gate before the submit button |
| `terms.termsUrl` / `privacyUrl` | example.com | **Must be reachable pre-auth** — add the host to the zone's *Allowed Hostnames*, or host the PDF via File Manager and use a relative path |
| `terms.openInNewTab` | `true` | |
| `logout.showSessionDetails` | `true` | User / IP / MAC / remaining time |
| `logout.showDisconnectButton` | `true` | Inline disconnect form (`logout_id` POST) |
| `logout.autoRedirect` | `true` | Countdown, cancelled by any interaction |
| `logout.autoRedirectDelay` | `3` | Seconds |
| `i18n.enabled` | `true` | Off = single language, no switcher |
| `i18n.default` | `"en"` | Also the language baked into the markup |
| `i18n.languages` | `en de fr es it` | Subset/order of `src/i18n.json` |
| `i18n.detect` | `true` | Match `navigator.languages` |
| `security.csp` | `true` | Leave on. Turn off only if you must add your own inline code |
| `security.clientSideValidation` | `true` | Server still validates either way |
| `security.warnOnInsecureTransport` | `true` | HTTP warning banner |
| `footer.text` | help text | Set `""` to hide |

Change something, run `node tools/build.mjs`, re-upload. The build refuses to
emit pages that would break on pfSense (macro in a script block, missing
`accept` field, external asset reference).

## How it holds up against the backend

Facts about the pfSense captive portal these pages are built around (verified
against the pfSense source, CE 2.7.2 ≡ master/2.9-DEV):

- The auth branch triggers only on a non-empty `accept` POST field; the pages
  carry both a named submit button and a hidden fallback so scripted
  submission can't lose it.
- `auth_voucher`, when non-empty, is consumed **before** `auth_user` — the tab
  script blanks and disables inactive panels so a stale voucher can never
  hijack an account login.
- Login/error pages are passed through the PHP interpreter; the build rejects
  stray `<?` sequences in them. Macro substitution happens **after** your page
  runs, and only the `#…#` spellings survive inside PHP output.
- The logout page gets **no macros** — only PHP variables, unescaped, and a
  code path where most of them are undefined. The template escapes and guards
  every one.
- `$PORTAL_MESSAGE$`, `$CLIENT_IP$`, `$CLIENT_MAC$`, `$PORTAL_ZONE$` and
  `$PORTAL_REDIRURL$` are placed exclusively in HTML-escaped-safe sinks.
- Multiple vouchers: pfSense splits `auth_voucher` on whitespace and sums the
  minutes; paste several codes separated by spaces and it works.

## Repository layout

```
config.json          ← the only file most users edit
portal.html          ← generated, upload to pfSense
error.html           ← generated
logout.html          ← generated
src/
  tokens.css         shadcn design tokens (light + dark)
  app.css            components: card, input, button, tabs, alert, …
  app.js             progressive enhancement (theme, i18n, tabs, validation)
  i18n.json          translations
  assets/logo.svg    placeholder logo — replace with yours
tools/
  build.mjs          assembles + audits the three pages (zero deps)
  devserver.mjs      mock pfSense backend for local testing
```

## License

MIT — see [LICENSE](LICENSE).
