Output scripts/ci/statusline.gif
Set Width 1400
Set Height 500
Set FontSize 14
Set Shell "bash"

# Generate temporary full/compact/minimal fixtures from the committed baseline
# without touching production fixtures. The helper augments status.json with
# compactFrames/minimalFrames when getStatusFrames() emits them.
Hide
Type "bash scripts/ci/vhs-density-fixtures.sh"
Enter
Sleep 2s
Show

Type "clear"
Enter
Sleep 500ms

# Full density: 50 rows gives the six-ish-line art + optional bubble.
Type "COLUMNS=80 BUDDY_STATUSLINE_ROWS=50 bash scripts/ci/vhs-run-statusline.sh 80 scripts/ci/vhs-out/density-fixtures/full"
Enter
Sleep 2s

# Compact density: three art rows + name, no bubble.
Type "COLUMNS=80 BUDDY_STATUSLINE_ROWS=50 bash scripts/ci/vhs-run-statusline.sh 80 scripts/ci/vhs-out/density-fixtures/compact"
Enter
Sleep 2s

# Minimal density: a single sprite/face + name line.
Type "COLUMNS=80 BUDDY_STATUSLINE_ROWS=50 bash scripts/ci/vhs-run-statusline.sh 80 scripts/ci/vhs-out/density-fixtures/minimal"
Enter
Sleep 2s

Screenshot scripts/ci/statusline.png
