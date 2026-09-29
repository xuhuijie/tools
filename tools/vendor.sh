#!/usr/bin/env bash
# 重新拉取 docs/lib 下的离线库（版本号写死，保证可复现）。
# 平时不需要跑，只有升级库版本时才用；页面的 <script src> 引用本地文件，不联网。
set -euo pipefail
cd "$(dirname "$0")/../docs/lib"
get() { curl -sSL --fail -o "$2" "$1"; echo "wrote $2"; }
get https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js        qrcode-generator.js
get https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js                jsqr.js
get https://cdn.jsdelivr.net/npm/bwip-js@4.5.1/dist/bwip-js-min.js      bwip-js.js
get https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js     forge.js
get https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js     dompurify.js
get https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js            marked.js
