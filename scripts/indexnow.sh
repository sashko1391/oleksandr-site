#!/usr/bin/env bash
# IndexNow submit — ping Bing/Yandex with all sitemap URLs (or pass URLs as args).
# Usage: scripts/indexnow.sh                # submit all sitemap URLs
#        scripts/indexnow.sh /blog/foo/ ... # submit specific paths
set -euo pipefail
HOST="www.parkinsandr.tech"
KEY="c071fa731a816005cd57bd3395c0dac6"
KEY_LOCATION="https://${HOST}/${KEY}.txt"
SITEMAP="https://${HOST}/sitemap.xml"

if [ "$#" -gt 0 ]; then
  URLS=(); for p in "$@"; do case "$p" in http*) URLS+=("$p");; *) URLS+=("https://${HOST}${p}");; esac; done
else
  mapfile -t URLS < <(curl -s "$SITEMAP" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g')
fi

echo "Submitting ${#URLS[@]} URLs to IndexNow..."
BODY=$(python3 -c "
import json,sys
print(json.dumps({'host':'${HOST}','key':'${KEY}','keyLocation':'${KEY_LOCATION}','urlList':sys.argv[1:]}))
" "${URLS[@]}")
curl -s -o /dev/null -w "IndexNow -> %{http_code}\n" \
  -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data "$BODY"
