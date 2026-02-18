#!/bin/bash
# archive-run.sh — Archive a TestSprite test run into the runs/ directory
# Usage: ./archive-run.sh "short-description"
# Example: ./archive-run.sh "phase4d-item-types"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNS_DIR="$SCRIPT_DIR/runs"
TMP_DIR="$SCRIPT_DIR/tmp"
REGISTRY="$SCRIPT_DIR/TEST_REGISTRY.md"

# Check for TC files in root (handle spaces in path)
TC_FILES=()
while IFS= read -r -d '' f; do
  TC_FILES+=("$f")
done < <(find "$SCRIPT_DIR" -maxdepth 1 -name 'TC*.py' -print0 2>/dev/null)

if [ ${#TC_FILES[@]} -eq 0 ]; then
  echo "No TC*.py files found in $SCRIPT_DIR — nothing to archive."
  exit 0
fi

# Get description from argument or prompt
DESC="${1:-}"
if [ -z "$DESC" ]; then
  echo "Found ${#TC_FILES[@]} test file(s) to archive."
  read -p "Enter a short description for this run (e.g. phase4d-kitting): " DESC
fi

if [ -z "$DESC" ]; then
  echo "Description required. Aborting."
  exit 1
fi

# Determine next run number
LAST_RUN=$(ls -1 "$RUNS_DIR" 2>/dev/null | sort | tail -1 | grep -oE '^[0-9]+' || echo "0")
NEXT_NUM=$(printf "%03d" $((10#$LAST_RUN + 1)))

# Create run directory
TODAY=$(date +%Y-%m-%d)
RUN_NAME="${NEXT_NUM}_${TODAY}_${DESC}"
RUN_DIR="$RUNS_DIR/$RUN_NAME"
mkdir -p "$RUN_DIR"

# Move TC files
for f in "${TC_FILES[@]}"; do
  mv "$f" "$RUN_DIR/"
done

# Copy report files if they exist
[ -f "$TMP_DIR/raw_report.md" ] && cp "$TMP_DIR/raw_report.md" "$RUN_DIR/"
[ -f "$TMP_DIR/test_results.json" ] && cp "$TMP_DIR/test_results.json" "$RUN_DIR/"
[ -f "$SCRIPT_DIR/testsprite-mcp-test-report.md" ] && cp "$SCRIPT_DIR/testsprite-mcp-test-report.md" "$RUN_DIR/report.md"

# Count pass/fail from test_results.json if available
PASSED="—"
FAILED="—"
if [ -f "$RUN_DIR/test_results.json" ]; then
  PASSED=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
results = data if isinstance(data, list) else data.get('results', data.get('tests', []))
print(sum(1 for r in results if (r.get('status') or r.get('testStatus') or '').lower() in ('passed','pass','success')))
" "$RUN_DIR/test_results.json" 2>/dev/null || echo "—")
  FAILED=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
results = data if isinstance(data, list) else data.get('results', data.get('tests', []))
print(sum(1 for r in results if (r.get('status') or r.get('testStatus') or '').lower() in ('failed','fail','error')))
" "$RUN_DIR/test_results.json" 2>/dev/null || echo "—")
fi

# Append to registry
TOTAL=${#TC_FILES[@]}
REGISTRY_ROW="| $NEXT_NUM | $TODAY | — | — | $TOTAL | $PASSED | $FAILED | $DESC | |"

# Insert row before the coverage summary section
if grep -q "^## Coverage Summary" "$REGISTRY"; then
  python3 -c "
import sys
registry_path = sys.argv[1]
new_row = sys.argv[2]

with open(registry_path, 'r') as f:
    content = f.read()

parts = content.split('## Coverage Summary')
table_section = parts[0]

lines = table_section.rstrip().split('\n')
insert_idx = len(lines)
for i in range(len(lines)-1, -1, -1):
    if lines[i].startswith('|') and not lines[i].startswith('| Run') and not lines[i].startswith('|--'):
        insert_idx = i + 1
        break

lines.insert(insert_idx, new_row)
parts[0] = '\n'.join(lines) + '\n\n'
with open(registry_path, 'w') as f:
    f.write('## Coverage Summary'.join(parts))
" "$REGISTRY" "$REGISTRY_ROW"
fi

echo ""
echo "Archived ${#TC_FILES[@]} test files to: runs/$RUN_NAME"
echo "  Passed: $PASSED  Failed: $FAILED"
echo "  Registry updated: $REGISTRY"
