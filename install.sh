#!/bin/sh
set -e

REPO="Siroopfles/Deckify"
CURRENT_USER="${USER:-$(id -u -n 2>/dev/null || whoami)}"
CURRENT_GROUP="$(id -g -n 2>/dev/null || echo "$CURRENT_USER")"
PLUGIN_DIR="$HOME/homebrew/plugins"
INSTALL_DIR="$PLUGIN_DIR/Deckify"

# Check Decky Loader
if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Error: Decky Loader not found ($PLUGIN_DIR does not exist)"
  echo "Install Decky Loader first: https://decky.xyz"
  exit 1
fi

# Get latest release download URL
echo "Fetching latest release..."
DOWNLOAD_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url":\s*"[^"]*Deckify\.tar\.gz"' \
  | head -1 \
  | sed 's/"browser_download_url":\s*"//;s/"$//')

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Error: could not find Deckify.tar.gz in latest release"
  exit 1
fi

# Download to temp dir
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
echo "Downloading $DOWNLOAD_URL ..."
curl -fSL -o "$TMPDIR/Deckify.tar.gz" "$DOWNLOAD_URL"

# Stop services and running processes before overwriting to prevent 'text file busy'
echo "Stopping plugin_loader and librespot..."
sudo systemctl stop plugin_loader 2>/dev/null || true
sudo killall -9 librespot 2>/dev/null || true

# Install
sudo rm -rf "$INSTALL_DIR"
sudo tar -xzf "$TMPDIR/Deckify.tar.gz" -C "$PLUGIN_DIR"
sudo chown -R "$CURRENT_USER:$CURRENT_GROUP" "$INSTALL_DIR"
if [ -f "$INSTALL_DIR/bin/librespot" ]; then
  sudo chmod +x "$INSTALL_DIR/bin/librespot"
fi

# Start plugin loader
echo "Restarting Decky plugin loader..."
sudo systemctl restart plugin_loader 2>/dev/null || sudo systemctl start plugin_loader 2>/dev/null || true

echo "Deckify installed successfully!"
