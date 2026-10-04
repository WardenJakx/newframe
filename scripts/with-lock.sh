#!/bin/sh
# Usage: with-lock.sh <lock file> <command...>
# Runs the command while holding an exclusive lock: lockf on macOS, flock on Linux.
lock=$1
shift
if command -v lockf >/dev/null 2>&1; then
  exec lockf -k "$lock" "$@"
fi
exec flock "$lock" "$@"
