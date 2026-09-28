#!/usr/bin/env bash
set -euo pipefail
umask 077

root="$(cd "$(dirname "$0")/../.." && pwd)"
profile="${NEWFRAME_DEV_PROFILE:-$HOME/Library/Application Support/Newframe dev}"
network_interface="${NEWFRAME_HARNESS_VM_NETWORK_INTERFACE:-en0}"

for command in tart rsync git lockf; do
  command -v "$command" >/dev/null || { echo "Missing $command" >&2; exit 1; }
done
[[ -d "$profile" ]] || {
  echo "Missing Newframe dev profile" >&2
  exit 1
}

if [[ -z "${NEWFRAME_HARNESS_VM_SLOT:-}" ]]; then
  for attempt in {1..900}; do
    for slot in 1 2; do
      if lockf -k -s -t 0 "/private/tmp/newframe-harness-vm-slot-${slot}.lock" \
        env NEWFRAME_HARNESS_VM_SLOT="$slot" bash "$root/harness/newframe/run-macos-vm.sh"; then
        exit 0
      else
        status=$?
        # lockf uses 75 when the slot is busy; other statuses came from the harness.
        if (( status != 75 )); then
          exit "$status"
        fi
      fi
    done
    if (( attempt == 1 )); then
      echo "Both warm macOS VM slots are busy; waiting for one" >&2
    fi
    sleep 1
  done
  echo "Timed out waiting for a warm macOS VM slot" >&2
  exit 1
fi

case "$NEWFRAME_HARNESS_VM_SLOT" in
  1|2) base="newframe-harness-warm-base-${NEWFRAME_HARNESS_VM_SLOT}" ;;
  *) echo "Invalid warm macOS VM slot" >&2; exit 1 ;;
esac
echo "Using warm macOS VM slot $NEWFRAME_HARNESS_VM_SLOT"

output="${NEWFRAME_HARNESS_VM_OUTPUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/newframe-visual-vm.XXXXXX")}"
shared="$output/shared"
vm="newframe-visual-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-12)"

mkdir -p "$shared/repo" "$shared/profile" "$shared/artifacts"
chmod 700 "$output" "$shared"
rsync -a \
  --exclude=.git --exclude=node_modules --exclude=.DS_Store \
  --exclude=apps/newframe/compiled --exclude=apps/newframe/bundle \
  --exclude=apps/newframe/generated/styled-system \
  --exclude=packages/ui/dist --exclude=packages/ui/src/styled-system \
  --exclude=newframe-contracts/out --exclude=newframe-contracts/cache \
  "$root/" "$shared/repo/"
git -C "$shared/repo" init -q -b main
cp "$profile/config.json" "$profile/vault.json" "$shared/profile/"
if [[ -d "$profile/signers" ]]; then
  cp -R "$profile/signers" "$shared/profile/"
fi
cp "$root/harness/newframe/guest-run.sh" "$shared/guest-run.sh"

vm_pid=''
cleanup() {
  if [[ -n "$vm_pid" ]]; then
    tart stop "$vm" >/dev/null 2>&1 || true
    wait "$vm_pid" 2>/dev/null || true
  fi
  if [[ "${NEWFRAME_HARNESS_VM_KEEP:-0}" != 1 ]]; then
    tart delete "$vm" >/dev/null 2>&1 || true
  fi
  rm -rf "$shared/repo" "$shared/profile"
}
trap cleanup EXIT

tart clone "$base" "$vm"
tart set "$vm" --display 1440x900pt --no-display-refit
tart run --suspendable --no-graphics --vnc-experimental --no-audio --no-clipboard \
  --net-bridged="$network_interface" --dir="$shared" "$vm" >"$output/vm.log" 2>&1 &
vm_pid=$!

for attempt in {1..60}; do
  if tart exec "$vm" /usr/bin/true >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$vm_pid" 2>/dev/null; then
    cat "$output/vm.log" >&2
    exit 1
  fi
  if (( attempt == 60 )); then
    echo "Warm guest did not resume; see $output/vm.log" >&2
    exit 1
  fi
  sleep 1
done

echo "Running Newframe visual harness in $vm; artifacts: $shared/artifacts"
tart exec "$vm" /bin/bash -c \
  'nohup /bin/bash "/Volumes/My Shared Files/guest-run.sh" > "/Volumes/My Shared Files/harness.log" 2>&1 </dev/null &'

for _ in {1..900}; do
  [[ -f "$shared/exit-code" ]] && break
  sleep 2
done
[[ -f "$shared/exit-code" ]] || { echo "Guest harness timed out; see $shared/harness.log" >&2; exit 1; }
cp "$shared/harness.log" "$output/harness.log"
status="$(cat "$shared/exit-code")"
echo "Newframe visual harness artifacts: $shared/artifacts"
echo "Harness exit code: $status"
exit "$status"
