#!/usr/bin/env bash

set -euo pipefail

# Run from the repository root.

# Copy the gitignored files listed in .worktreeinclude (env files) from the main checkout into a new worktree.
main_checkout="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
if [[ "$main_checkout" != "$(git rev-parse --show-toplevel)" ]]; then
  while IFS= read -r file || [[ -n "$file" ]]; do
    if [[ -n "$file" && -f "$main_checkout/$file" && ! -e "$file" ]]; then
      cp "$main_checkout/$file" "$file"
    fi
  done < .worktreeinclude
fi

bun install
bun --cwd apps/newframe rebuild:natives
bun --cwd packages/ui styles:generate
bun --cwd apps/newframe styles:generate
bun --cwd apps/newframe-extension styles:generate

cd newframe-contracts
forge soldeer install
forge build
