# Custom skins

Runtime-loadable drawings for **your own** companion — no code edit, no change
to the deterministic species roll, and no effect on anyone else's buddy.

## Why these are separate from `core/art-data.ts`

Built-in species (`SPECIES` in `core/engine.ts`) are a fixed pool the generator
picks from by index; adding one would re-roll every existing buddy. A skin is an
opt-in overlay instead: it is never part of the roll pool and never replaces a
built-in species' art globally.

## Format

```json
{
  "name": "fox-cat",
  "species": "cat",
  "art": [ /* 3 frames, each exactly 5 lines, {E} = eye placeholder */ ],
  "face": "({E}v{E})"
}
```

Rules (enforced by the loader in `core/custom-art.ts`; files that break any
rule are skipped):

- `name`: lowercase `[a-z0-9_-]`, 1-32 chars, and **must not be a built-in
  species name** (so a skin can never shadow `cat`, `duck`, ...)
- `species`: the built-in species this drawing is for. The skin only renders
  for a companion of that species that has opted in.
- `art`: exactly **3 frames** of exactly **5 lines**
- each line no wider than the widest built-in art line (12 columns, `{E}`
  counted as one); `face` no wider than the widest built-in face
- **no ANSI escape sequences or other control characters**
- `face` (optional) must contain `{E}`

## Install a skin

```bash
bun run skin check custom-art/fox-cat.json        # validate
mkdir -p ~/.claude-buddy/custom-art                # see "Skin directory" below
cp custom-art/fox-cat.json ~/.claude-buddy/custom-art/
bun run skin                                       # list skins that fit your active buddy
bun run skin fox-cat                               # wear it (active buddy only)
bun run skin --clear                               # back to built-in art
```

### Skin directory

Skins are read from `<state-dir>/custom-art/`, where `<state-dir>` is the first
that applies:

1. `CODING_BUDDY_USER_ID` set (shared state): `$CODING_BUDDY_STATE_DIR`, or
   `~/.coding-buddy/shared` when that is unset
2. `CLAUDE_CONFIG_DIR` set: `$CLAUDE_CONFIG_DIR/buddy-state`
3. otherwise: `~/.claude-buddy`

`bun run skin` prints the exact directory it searched.

The running MCP server picks up added, edited or removed skin files on the
next render (cache is invalidated by file mtime/size) — no restart needed.
Only the drawing/face change; species, stats, rarity and personality do not.
