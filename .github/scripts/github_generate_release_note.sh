#!/bin/bash
set -euo pipefail
previous=$(git describe --tags --abbrev=0 2>/dev/null || true)
{
  printf '# Arcium preview\n\n'
  if [ -n "$previous" ]; then
    git log --format='- %s' "$previous..HEAD"
  else
    printf 'First public source snapshot. See docs/preview-release.md and SOURCE.json.\n'
  fi
} > github_release_note.md
