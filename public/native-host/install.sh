#!/bin/bash
# Engawa が Mac の Spotify アプリから再生中の曲を読むための橋を入れる（macOS 用）。
#
#   bash install.sh              入れる
#   bash install.sh --uninstall  外す
#
# やること:
#   - 橋のスクリプトを ~/Library/Application Support/Engawa/ に置く
#   - この Mac に入っている Chromium 系ブラウザ（Vivaldi、Chrome など）それぞれに、
#     「Engawa はこの橋を使ってよい」という登録ファイルを置く
# 入れたあとはブラウザを再起動する。
set -euo pipefail

NAME="com.engawa.spotify"
EXTENSION_ID="lmjcicaaeilbjpcbimnclhafocijlifc"
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support"
DEST_DIR="$SUPPORT/Engawa"
DEST="$DEST_DIR/engawa-spotify-host.py"
BROWSERS=(
  "Vivaldi"
  "Google/Chrome"
  "Google/Chrome Beta"
  "Chromium"
  "BraveSoftware/Brave-Browser"
  "Microsoft Edge"
  "Arc/User Data"
)

if [ "$(uname)" != "Darwin" ]; then
  echo "This helper is for macOS only." >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  for b in "${BROWSERS[@]}"; do
    f="$SUPPORT/$b/NativeMessagingHosts/$NAME.json"
    if [ -f "$f" ]; then
      rm "$f"
      echo "Removed: $f"
    fi
  done
  if [ -f "$DEST" ]; then
    rm "$DEST"
    echo "Removed: $DEST"
  fi
  echo "Done. Restart the browser."
  exit 0
fi

if ! /usr/bin/python3 -c 'pass' 2>/dev/null; then
  echo "/usr/bin/python3 is not available. Install the Xcode Command Line Tools first: xcode-select --install" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$HERE/engawa-spotify-host.py" "$DEST"
chmod 755 "$DEST"
echo "Installed: $DEST"

count=0
for b in "${BROWSERS[@]}"; do
  [ -d "$SUPPORT/$b" ] || continue
  dir="$SUPPORT/$b/NativeMessagingHosts"
  mkdir -p "$dir"
  cat > "$dir/$NAME.json" <<JSON
{
  "name": "$NAME",
  "description": "Engawa: reads the track playing in the Spotify app",
  "path": "$DEST",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
JSON
  echo "Registered: $dir/$NAME.json"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "No supported browser was found under $SUPPORT." >&2
  exit 1
fi
echo "Done. Restart the browser, then choose \"Spotify app on this Mac\" in Engawa's settings."
