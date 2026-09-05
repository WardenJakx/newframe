#!/usr/bin/env bash

set -euo pipefail

# Run from the repository root.
bun install
bun --cwd packages/ui styles:generate
bun --cwd apps/newframe styles:generate
bun --cwd apps/newframe-extension styles:generate

cd newframe-contracts
forge soldeer install
forge build
