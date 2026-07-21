#!/bin/sh
# Regenerate the README screenshots against the local mock backend.
# Requires Google Chrome and a running devserver on :8080.
#
#   node tools/devserver.mjs &   # if not already running
#   sh tools/screenshots.sh
#
# Screenshots are forced to English (i18n.detect off) so they match the
# English README; the config is restored afterwards.

set -e
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="http://localhost:8080"
OUT="screens"
mkdir -p "$OUT"

cfg() { node -e "
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('config.json', 'utf8'));
$1
fs.writeFileSync('config.json', JSON.stringify(c, null, 2) + '\n');
"; }

shoot() { # $1 outfile  $2 url  $3 WxH
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="$3" \
    --screenshot="$OUT/$1" "$2" 2>/dev/null
  echo "  $OUT/$1"
}

echo "screenshots (English, light) …"
# Force both language AND scheme — headless Chrome inherits the OS appearance,
# so "system" would silently produce dark shots on a dark-mode machine.
cfg "c.i18n.detect = false; c.theme.default = 'light';"
node tools/build.mjs >/dev/null

shoot portal-light.png   "$BASE/"                        1280,800
shoot portal-code.png    "$BASE/?noaccounts"             1280,800
shoot portal-guest.png   "$BASE/?noaccounts&novouchers"  1280,800
shoot portal-mobile.png  "$BASE/"                        390,760
shoot connected.png      "$BASE/logout"                  1280,800

echo "screenshots (dark) …"
cfg "c.theme.default = 'dark';"
node tools/build.mjs >/dev/null
shoot portal-dark.png    "$BASE/"                        1280,800

echo "restoring config …"
cfg "c.theme.default = 'system'; c.i18n.detect = true;"
node tools/build.mjs >/dev/null
echo "done"
