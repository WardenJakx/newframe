#!/usr/bin/env bash
set -euo pipefail

dmg_path="${1:?Usage: verify-macos-release.sh DMG VERSION APPLE_TEAM_ID}"
expected_version="${2:?Missing release version}"
expected_team="${3:?Missing Apple Team ID}"

verify_signature() {
  local artifact="$1"
  local require_runtime="${2:-false}"
  local signature
  codesign --verify --deep --strict --verbose=2 "$artifact"
  signature="$(codesign --display --verbose=4 "$artifact" 2>&1)"
  if ! grep -q '^Authority=Developer ID Application:' <<< "$signature" ||
     ! grep -Fxq "TeamIdentifier=$expected_team" <<< "$signature" ||
     ! grep -q '^Timestamp=' <<< "$signature"; then
    echo "::error::Expected a timestamped Developer ID Application signature from team $expected_team: $artifact" >&2
    exit 1
  fi
  if [[ "$require_runtime" == true ]] && ! grep -Eq 'flags=.*runtime' <<< "$signature"; then
    echo "::error::Expected the hardened runtime enabled: $artifact" >&2
    exit 1
  fi
}

verify_signature "$dmg_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg_path"

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/newframe-release.XXXXXX")"
mounted=false
tor_files=''
cleanup() {
  if [[ -n "$tor_files" ]]; then
    rm -f "$tor_files"
  fi
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
verify_signature "$app_path" true
signature="$(codesign --display --verbose=4 "$app_path" 2>&1)"
if ! grep -Fxq 'Identifier=sh.newframe.app' <<< "$signature"; then
  echo "::error::Expected sh.newframe.app." >&2
  exit 1
fi

# Resources are sealed by the app signature, but that alone does not prove each
# nested Mach-O replaced its preparation-time ad hoc signature with Developer ID.
tor_path="$app_path/Contents/Resources/tor"
test -f "$tor_path/tor/tor"
tor_files="$(mktemp "${TMPDIR:-/tmp}/newframe-tor-files.XXXXXX")"
find "$tor_path" -type f -print0 > "$tor_files"
while IFS= read -r -d '' binary; do
  file_type="$(file --brief "$binary")"
  if [[ "$file_type" == *Mach-O* ]]; then
    verify_signature "$binary" true
  fi
done < "$tor_files"

xcrun stapler validate "$app_path"
spctl --assess --type execute --verbose=2 "$app_path"
