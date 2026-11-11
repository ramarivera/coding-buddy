# Contributing to coding-buddy

Thanks for wanting to help bring buddies back to life!

New to open source? Don't worry — this guide walks you through everything
you need: setup, DCO sign-off, tests, and what happens when you open a PR.

## Quick Setup

```bash
git clone https://github.com/ramarivera/coding-buddy.git coding-buddy
cd coding-buddy
bun install
bun run install-buddy
```

Restart Claude Code and type `/buddy` to verify everything works.

## Project Structure

| Directory | What it does |
|-----------|-------------|
| `server/` | MCP server -- buddy engine, tools, state, reactions |
| `skills/` | `/buddy` slash command (SKILL.md) |
| `hooks/` | Shell scripts for error detection + comment extraction |
| `statusline/` | Animated buddy display (Claude Code status line) |
| `cli/` | Install, uninstall, show, hunt, verify commands |

## Before opening a PR — quick checklist

- [ ] `bun install` ran clean
- [ ] `bun test` is green locally (all tests pass)
- [ ] Every commit is signed off with DCO (`git commit -s`)
- [ ] Commit messages are in English and prefixed (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`, `test:`)
- [ ] Branch pushed to your fork, PR opened against `main`
- [ ] CI is green on the PR
- [ ] If you added new `/buddy` subcommands or CLI commands, update the **Commands Reference** section in `README.md`

If any of these feel unclear, the sections below explain them step by step.

## How to Contribute

### Bug Fixes
1. Open an issue describing the bug
2. Fork the repo and create a branch (`fix/description`)
3. Fix it, test it locally
4. Open a PR

### New Features
1. Open an issue first to discuss the idea
2. Fork and branch (`feat/description`)
3. Keep it simple — this is an MVP, small PRs are better than big ones
4. Open a PR

### New Species Art

Species art lives in two files that must be kept in sync:
- `server/art.ts` — TypeScript source of truth
- `statusline/buddy-status.sh` — bash copy for the status line

#### Art Format Specification

Each species requires **3 animation frames**, each **exactly 5 lines** tall and **max 14 characters** wide.

```
Frame 0 (idle A) — 5 lines
Frame 1 (idle B) — 5 lines
Frame 2 (idle C) — 5 lines
```

Use `{E}` as the eye character placeholder — it is replaced at render time with the buddy's actual eye (`·`, `✦`, `×`, `◉`, `@`, `°`).

**Rules:**
- No ANSI escape codes (no `\x1b[`, no `\033[`)
- Each line must be ≤ 14 display characters wide
- At least one `{E}` placeholder per frame (recommended on line 2)
- ASCII art only — no emoji in the art itself (emoji in reactions is fine)
- Keep it readable at 14 chars wide — test with `bun run show`

**Example (cat species, simplified):**
```typescript
cat: [
  // Frame 0
  ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", "  (\")_(\")   "],
  // Frame 1
  ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", "  (\")_(\")~  "],
  // Frame 2
  ["            ", "   /\\-/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", "  (\")_(\")   "],
],
```

The bash status line (`statusline/buddy-status.sh`) uses a different format — 4 lines per frame with a separate face line. When adding a new species, both files must be updated.

#### Validating Your Art

Before submitting a PR, validate your art format:

```bash
# Validate a species JSON file
bun run cli/validate-species.ts ./my-species.json

# Or validate inline — import validateSpeciesFile() in your test
```

The validator checks:
- Exactly 3 frames × 5 lines
- No ANSI escape codes
- Display width ≤ 14 chars per line
- `{E}` eye placeholder present

#### Submission Process

1. Fork the repo and create a branch (`feat/species-<name>`)
2. Add the species to `SPECIES` array in `server/engine.ts`
3. Add art to `SPECIES_ART` in `server/art.ts`
4. Add bash art to the `case "$SPECIES" in` block in `statusline/buddy-status.sh`
5. Add species-specific reactions to `SPECIES_REACTIONS` in `server/reactions.ts` (optional)
6. Run `bun run cli/validate-species.ts` on your art
7. Run `bun test` to ensure all tests pass
8. Open a PR with the species name and art preview

The PR description should include:
- Species name and one-line description
- Why this species fits the buddy universe
- A text preview of the 3 animation frames

#### Community Species Registry (Future)

Longer term, community species may be stored in `~/.claude-buddy/species/` as JSON files, loaded at runtime. This would allow species to be shared without a code PR. This is planned for a future release.

> **Note on tests:** Adding a new species changes the deterministic generation output (golden snapshot tests will fail because the species array length affects modulo distribution). Don't worry about fixing these yourself — the maintainers will update the golden snapshots when merging. This will be automated in a future update.

### New Reactions
Reaction templates are in `server/reactions.ts`. Species-specific reactions go in `SPECIES_REACTIONS`, general ones in `REACTIONS`.

## DCO (Developer Certificate of Origin)

Every commit to this repo must be **signed off** with the Developer
Certificate of Origin. This is a lightweight affirmation that you wrote
the code, or have the right to contribute it. It's a single line appended
to each commit message — no GPG keys, no certificates.

If any commit on your PR is missing the sign-off, the **DCO check** goes
red and the PR cannot be merged.

### How to sign off

Pass the `-s` flag to `git commit`:

```bash
git commit -s -m "feat: add sparkle particles to shiny buddies"
```

That appends a line like this to the commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

The name and email come from your local `git config user.name` and
`git config user.email`.

### Make sign-off automatic (recommended)

So you never forget, set up a short git alias once:

```bash
git config --global alias.ci "commit -s"
```

From now on, use `git ci -m "..."` instead of `git commit -m "..."` and
every commit will be signed off automatically.

Alternatively, if you only want sign-off to apply inside this repo (not
globally), drop the `--global` flag and run the command from the repo
directory.

### I forgot to sign off — how do I fix it?

**If it's only the last commit:**

```bash
git commit --amend --no-edit -s
git push --force-with-lease
```

`--force-with-lease` is the safe variant of `--force`: it refuses to
overwrite remote changes you haven't seen yet.

**If it's several commits:**

```bash
git rebase --signoff HEAD~N     # replace N with how many commits back
git push --force-with-lease
```

For example, `git rebase --signoff HEAD~3` re-signs the last three
commits.

## Automated tests

Run the full test suite with:

```bash
bun test
```

All tests must pass before a PR can be merged — this is enforced by CI.
Run it locally before pushing to catch failures early.

For a full breakdown of what's covered, what isn't, and why, see
[TESTING.md](./TESTING.md).

### Where the tests live

Tests live next to the code they cover:

- `server/engine.test.ts` — pure-function tests for the companion
  generator (`generateBones`, `hashString`, `mulberry32`, `renderFace`,
  `renderCompact`)
- `server/state.test.ts` — pure helper tests (`slugify`)
- `server/reactions.test.ts` — reactions, fallback names, and personality
  prompt (`getReaction`, `generateFallbackName`, `generatePersonalityPrompt`)

### Adding new tests

If you add new pure logic, please add a test for it. File-I/O, MCP
protocol handling, and shell-script code don't need tests in this repo
for now — those are exercised manually and via the CLI commands below.

Use the built-in [`bun:test`](https://bun.sh/docs/cli/test) runner
(Jest-compatible `describe` / `test` / `expect`), no extra dependencies
needed:

```ts
import { describe, test, expect } from "bun:test";
import { mulberry32 } from "./engine.ts";

describe("mulberry32", () => {
  test("is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
  });
});
```

## What happens when you open a PR

When you push a branch and open a PR against `main`, two checks run
automatically:

| Check | What it verifies |
|-------|------------------|
| **Test (Bun latest)** | Runs `bun test` on Ubuntu with the latest Bun. Must be green. |
| **DCO** | Verifies every commit has a `Signed-off-by:` line. |

Both are **required** — branch protection blocks the merge button until
they are green.

If a check fails:

1. Click the check name on the PR to open the full log.
2. Fix the issue locally.
3. Commit and push again — CI re-runs automatically. No need to close or
   reopen the PR.

## Manual testing

These are the sanity checks to run by hand while developing:

```bash
# Verify buddy generation
bun run cli/verify.ts

# Show current buddy
bun run show

# Test MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | bun server/index.ts

# Test status line
echo '{}' | ./statusline/buddy-status.sh
```

## Code Style

- TypeScript for server/CLI code
- Bash for hooks and status line (keep it POSIX-friendly where possible)
- No unnecessary dependencies
- If it can be simple, keep it simple

### Commit messages

- Written in **English**
- Short subject line (50-72 characters), prefixed with the change type:
  - `feat:` — a new user-visible feature
  - `fix:` — a bug fix
  - `chore:` — housekeeping (deps, repo config, no behavior change)
  - `docs:` — documentation only
  - `refactor:` — code restructure without behavior change
  - `test:` — adding or updating tests
  - `ci:` — CI / workflow changes
- Body (optional) explains the **why**, not the *what* — the diff already
  shows the *what*
- Always signed off (see the DCO section above)

Example:

```
feat: add sparkle particles to shiny buddies

Shiny buddies are rare enough that they deserve a bit of visual flair.
This adds a three-frame sparkle animation that renders next to the
buddy face in the status line.

Signed-off-by: Your Name <your.email@example.com>
```

## Questions?

Open an issue. No question is too small.
