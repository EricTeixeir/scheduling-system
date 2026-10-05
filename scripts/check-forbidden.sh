#!/usr/bin/env sh
# Blocks commits that contain forbidden references.
#
# The patterns live in .git/forbidden-patterns, a local file that is never
# versioned, so this script stays generic and the repository never contains
# the terms it is guarding against.
#
# Usage:
#   check-forbidden.sh staged          checks staged file names and added lines
#   check-forbidden.sh msg <file>      checks a commit message file
set -eu

mode="${1:-}"
patterns_file="$(git rev-parse --git-dir)/forbidden-patterns"

# Fail closed: without the patterns file we cannot prove the commit is clean.
if [ ! -f "$patterns_file" ]; then
  echo "check-forbidden: missing $patterns_file (one literal pattern per line)." >&2
  exit 1
fi

patterns="$(mktemp)"
trap 'rm -f "$patterns"' EXIT
# Strip CR (file edited on Windows) and drop comments/blank lines: a trailing
# CR would make a pattern never match, and an empty line would match everything.
tr -d '\r' < "$patterns_file" | grep -Ev '^[[:space:]]*(#|$)' > "$patterns" || true

if [ ! -s "$patterns" ]; then
  echo "check-forbidden: $patterns_file has no patterns." >&2
  exit 1
fi

# Reads text on stdin; prints offending lines and fails if any pattern matches.
check() {
  label="$1"
  if hits="$(grep -inF -f "$patterns")"; then
    echo "check-forbidden: forbidden reference found in $label:" >&2
    echo "$hits" >&2
    exit 1
  fi
}

case "$mode" in
  staged)
    git diff --cached --name-only --diff-filter=ACMR | check "staged file names"
    # Only added lines matter: removing a forbidden term must be allowed.
    git diff --cached -U0 --no-color --diff-filter=ACMR \
      | grep '^+' | grep -v '^+++' \
      | check "staged changes"
    ;;
  msg)
    msg_file="${2:?usage: check-forbidden.sh msg <file>}"
    # Lines starting with '#' are stripped by git before saving the message.
    grep -v '^#' "$msg_file" | check "commit message"
    ;;
  *)
    echo "usage: check-forbidden.sh staged | msg <file>" >&2
    exit 2
    ;;
esac
