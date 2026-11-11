# Testing coding-buddy

This document lists exactly what the test suite covers. For a walk-through of
the contribution workflow (DCO, CI, commit style), see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Running tests

```bash
bun test           # run the suite
bun run typecheck  # run tsc --noEmit
```

Both are run on every PR by `.github/workflows/ci.yml` and must be green
before merge (enforced by branch protection).

## Where tests live

Tests are co-located next to the source files they cover:

```
server/
  engine.ts     ↔ engine.test.ts
  state.ts      ↔ state.test.ts
  reactions.ts  ↔ reactions.test.ts
```

Current totals: **56 tests** across **3 files**, ~4,200 `expect()` calls,
~65 ms local runtime.

---

## `server/engine.test.ts` — 30 tests

Covers the deterministic companion-generation engine. Every test in this file
exercises a pure function — no I/O, no mocks.

### `hashString` — 3 tests

- Deterministic: same input always produces the same hash.
- Return value is a 32-bit unsigned integer (`0 ≤ h ≤ 0xFFFFFFFF`).
- Basic collision sanity: 7 different inputs produce 7 different hashes.

### `mulberry32` — 3 tests

- Deterministic: same seed yields identical output sequences (first 20 values).
- Output range: all values are in `[0, 1)` (100 samples).
- Divergence: two different seeds disagree within 10 draws.

### `generateBones` — 17 tests

This is the core contract of the project: same `userId` must always
produce the same companion.

**Invariants, checked against 5 sample user IDs:**

- Same `userId` yields identical bones (determinism).
- Custom salt yields a different but still deterministic result.
- `rarity` is always one of `RARITIES`.
- `species` is always one of `SPECIES`.
- `eye` is always one of `EYES`.
- `hat` is always one of `HATS`.
- `common` rarity always has `hat === "none"` (checked by brute-forcing user
  IDs until at least 5 commons are found).
- `peak !== dump`.
- All stats are integers.
- Peak stat respects `min(100, floor + 50..79)`.
- Dump stat respects `max(1, floor - 10..4)`.
- Neutral stats fall within `[floor, floor + 39]`.
- 20 different user IDs produce more than one distinct signature
  (sanity check against a stuck RNG).

**Golden snapshots — the most important tests in the suite:**

These pin the exact bones output for three fixed user IDs. If any of these
fail, the generation algorithm has changed in a way that would give every
existing user a different buddy — which is the one thing coding-buddy
promises never to do. Stop and ask "did I mean to do that?" before
updating the snapshots.

| User ID | Rarity | Species |
|---------|--------|---------|
| `golden-user-alpha` | common | ghost |
| `golden-user-beta` | common | rabbit |
| `legendary-seed-1` | uncommon | axolotl |

Plus: a custom-salt variant of `golden-user-alpha` is checked for both
stability (same custom salt → same bones) and isolation (custom salt ≠
default salt).

### `renderFace` — 3 tests

- Substitutes `{E}` with the eye glyph (2 concrete examples).
- Picks the right template per species (3 examples).
- Never leaks a literal `{E}` for any species × eye combination
  (18 species × 6 eyes = 108 combos).

### `renderCompact` — 4 tests

- Output contains the buddy name and face.
- Appends the reaction bubble when `reaction` is provided.
- No bubble when `reaction` is omitted.
- Shows sparkles (`✨`) for shiny buddies; no sparkles otherwise.

---

## `server/state.test.ts` — 8 tests

Covers the pure string helper `slugify`. File-I/O parts of `state.ts`
(manifest, config, reactions) are not tested here — see
"What is NOT tested" below.

- Lowercases input.
- Replaces invalid characters with `-`.
- Collapses consecutive dashes.
- Trims leading and trailing dashes.
- Truncates to 14 characters.
- Falls back to `"buddy"` for empty or all-invalid input.
- Preserves digits and internal dashes.
- Unicode / emoji input falls back to `"buddy"`.

---

## `server/reactions.test.ts` — 18 tests

Covers the three exports of `reactions.ts`. These functions use `Math.random()`,
so tests assert **invariants** run over many iterations, not deterministic
equality.

### `getReaction` — 6 tests

- Returns a non-empty string for every `(reason × species × rarity)` combination
  (7 × 18 × 5 = **630 combinations** in a single test).
- `{line}` placeholder in `error` reactions is substituted when
  `context.line` is provided (500 iterations to guarantee template is picked).
- `{count}` placeholder in `test-fail` reactions is substituted when
  `context.count` is provided (500 iterations).
- `{lines}` placeholder in `large-diff` reactions is substituted when
  `context.lines` is provided (500 iterations).
- Works without a `context` argument (50 iterations, no crash).
- Species with no custom pool (`chonk`) still returns valid general reactions
  for every reason.

Unresolved placeholders (`{line}`, `{count}`, `{lines}`) are asserted to
**never leak** through the return value when the corresponding context field
is provided.

### `generateFallbackName` — 3 tests

- Returns a non-empty string.
- Names match `/^[A-Z][a-z]+$/` and are 3–12 characters long (100 iterations).
- 200 draws produce more than one distinct name.

### `generatePersonalityPrompt` — 9 tests

- Contains `Species: <species>` and `Rarity: <RARITY_UPPERCASE>`.
- Contains every stat name and value in `STAT_NAME:VALUE` form.
- Contains the `SHINY` marker when `shiny === true`, not when `false`.
- Contains the JSON output instruction (mentions `"name"` and `"personality"`).
- Contains exactly 4 inspiration vibe words (20 iterations), each matching
  `/^[a-z]+$/`.
- Line order is stable: `Stats:` line comes before `Inspiration words:` line,
  the header line is present.
- Does not crash for any of the 18 species × 5 rarities = 90 combinations.
- Accepts arbitrary stat keys beyond the 5 canonical ones.
- All 5 canonical `STAT_NAMES` flow through unchanged in the output.

---

## What is NOT tested (and why)

The following are intentionally excluded from the current suite:

- **File I/O in `state.ts`** — `loadManifest`, `saveManifest`, `loadReaction`,
  `saveReaction`, `migrateIfNeeded`, `resolveUserId`, status-line state, config.
  These need a temp-directory integration harness.
- **`searchBuddy` in `engine.ts`** — brute-force search, CPU-heavy, hard to
  assert on without fixing a seed for `crypto.randomBytes`.
- **MCP protocol handlers in `server/index.ts`** — the tool and resource
  handlers. Integration territory; would need an MCP client mock.
- **CLI scripts under `cli/`** — I/O and subprocess heavy; best covered by
  end-to-end tests against a real install.
- **Shell scripts** in `hooks/`, `statusline/`, and `popup/` — bash, not run
  under `bun test`. Currently verified by manual checks listed in
  `CONTRIBUTING.md` under "Manual testing".

Contributions that add tests for any of these are welcome.

---

## Test framework

Tests use [`bun:test`](https://bun.sh/docs/cli/test), Bun's built-in
Jest-compatible runner. No extra dependencies. File pattern: `*.test.ts`.

Published npm tarballs exclude test files via the `"!**/*.test.ts"` glob in
the `"files"` array of `package.json` — contributors see them, users don't.
