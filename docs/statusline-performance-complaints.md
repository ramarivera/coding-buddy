# Statusline Performance Complaint Ledger

## 2026-07-26 — Follow-up 4

- Complaint: the deterministic statusline state regressed from the previously verified ~0.91–1.00 seconds to ~2.79–2.95 seconds at `COLUMNS=93`, risking Claude Code killing the statusline and blanking the companion.
- Scope: preserve deterministic width resolution and TTY/non-TTY test parity; do not touch dirty `adapters/` or `core/` work.
- Acceptance: three `COLUMNS=93` timings at or below 1.0 seconds, `bun test` green, and `script -q /dev/null bun test statusline/` green.
- Status: resolved; compressed emoji ranges removed the hot-path regression. Fresh timings were 0.76s, 0.72s, and 0.82s; `bun test` passed 417/417 and the TTY statusline suite passed 17/17.

## 2026-07-26 — Narrow-width sprite slicing

- Complaint: the resize path accepts widths below the sprite's own width, shearing sprite rows and truncating the pet name at `COLUMNS=20` (`Cobalt` becomes `Cob`), which fails the gating golden check.
- Scope: floor usable width at `ART_W`; keep sprite and name intact through narrow-width degradation; preserve the statusline CI, TTY/non-TTY, runtime, and typecheck bars.
- Acceptance: the golden check keeps the full pet name visible, no sprite or name row is sliced mid-character, and all requested verification commands pass.
- Status: in progress.

## 2026-07-26 — PR #158 resize review findings

- Complaint: the resize timer could let a stale harness setter throw out of an uncaught callback, and the hero card silently clipped reactions, hid later achievements, and dropped achievements at narrow widths.
- Scope: swallow/log timer-render errors; restore the prior reaction and achievement capability within the widget line budget, including a narrow-width non-bubble path.
- Acceptance: timer exceptions don't escape; long reactions retain up to eight wrapped lines when space permits; all achievements render when budget permits; narrow cards still show achievement lines without exceeding width.
- Status: in progress.
