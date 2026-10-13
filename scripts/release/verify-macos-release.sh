#!/usr/bin/env bash
set -euo pipefail

dmg_path="${1:?Usage: verify-macos-release.sh DMG VERSION APPLE_TEAM_ID}"
expected_version="${2:?Missing release version}"
expected_team="${3:?Missing Apple Team ID}"

verify_signature() {
  local artifact="$1"
  local signature
  codesign --verify --deep --strict --verbose=2 "$artifact"
  signature="$(codesign --display --verbose=4 "$artifact" 2>&1)"
  if ! grep -q '^Authority=Developer ID Application:' <<< "$signature" ||
     ! grep -Fxq "TeamIdentifier=$expected_team" <<< "$signature" ||
     ! grep -q '^Timestamp=' <<< "$signature"; then
    echo "::error::Expected a timestamped Developer ID Application signature from team $expected_team: $artifact" >&2
    exit 1
  fi
}

verify_signature "$dmg_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg_path"

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/newframe-release.XXXXXX")"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" >/dev/null
  fi
  rmdir "$mount_dir"
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$dmg_path" >/dev/null
mounted=true

app_path="$mount_dir/Newframe.app"
test -d "$app_path"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$app_path/Contents/Info.plist")" = "$expected_version"
test "$(lipo -archs "$app_path/Contents/MacOS/Newframe")" = arm64
verify_signature "$app_path"
signature="$(codesign --display --verbose=4 "$app_path" 2>&1)"
if ! grep -Fxq 'Identifier=sh.newframe.app' <<< "$signature" ||
   ! grep -Eq 'flags=.*runtime' <<< "$signature"; then
  echo "::error::Expected sh.newframe.app with the hardened runtime enabled." >&2
  exit 1
fi
xcrun stapler validate "$app_path"
spctl --assess --type execute --verbose=2 "$app_path"
