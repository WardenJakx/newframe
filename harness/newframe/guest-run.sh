#!/usr/bin/env bash
set -euo pipefail

shared="$(cd "$(dirname "$0")" && pwd)"
trap 'printf "%s\n" "$?" > "$shared/exit-code"' EXIT
repo="$HOME/newframe-monorepo"
user_data="$HOME/Library/Application Support/Newframe dev"

export PATH="$HOME/bin:$HOME/node-v26.5.0-darwin-arm64/bin:$PATH"
export NEWFRAME_HARNESS_OUTPUT_DIR="$shared/artifacts"
export NEWFRAME_HARNESS_OPEN_SCREENSHOTS=0

mkdir -p "$repo" "$user_data"
rsync -a "$shared/repo/" "$repo/"
cp "$shared/profile/config.json" "$shared/profile/vault.json" "$user_data/"
if [[ -d "$shared/profile/signers" ]]; then
  cp -R "$shared/profile/signers" "$user_data/"
fi
chmod -R go-rwx "$user_data"

cd "$repo"
clang -framework CoreGraphics -framework CoreFoundation -o "$HOME/newframe-set-display" harness/newframe/set-vm-display.c
"$HOME/newframe-set-display"
bun install --frozen-lockfile
bun run flash:build
bun exec 'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types harness/newframe/visual-harness.ts'
