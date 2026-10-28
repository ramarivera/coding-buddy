import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBones, type Companion } from "../core/engine.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function companion(name: string): Companion {
  return { bones: generateBones(`dismiss-${name}`), name, personality: "calm", hatchedAt: 1, userId: `dismiss-${name}` };
}

// Active slot "main" plus an unrelated saved slot literally named "buddy".
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-dismiss-"));
  roots.push(root);
  writeFileSync(join(root, "settings.json"), "{}");
  mkdirSync(join(root, "buddy-state"));
  writeFileSync(join(root, "buddy-state", "menagerie.json"), JSON.stringify({
    active: "main",
    companions: { main: companion("Main"), buddy: companion("Buddy") },
  }));
  return root;
}

async function connect(root: string): Promise<Client> {
  const env = Object.fromEntries(Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined,
  ));
  const client = new Client({ name: "dismiss-test", version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [new URL("./index.ts", import.meta.url).pathname],
    env: { ...env, CLAUDE_CONFIG_DIR: root, CODING_BUDDY_USER_ID: "", CODING_BUDDY_STATE_DIR: "", CLAUDE_CODE_SESSION_ID: "", TMUX_PANE: "" },
    stderr: "pipe",
  }));
  return client;
}

function slots(root: string): string[] {
  const m = JSON.parse(readFileSync(join(root, "buddy-state", "menagerie.json"), "utf8"));
  return Object.keys(m.companions).sort();
}

test("dismiss rejects slots with no letters or digits instead of hitting the 'buddy' fallback", async () => {
  const root = sandbox();
  const client = await connect(root);
  try {
    for (const slot of ["---", "!!!", "🐢"]) {
      const res = await client.callTool({ name: "buddy_dismiss", arguments: { slot } });
      expect((res.content as Array<{ text: string }>)[0].text).toContain("Invalid slot");
    }
    expect(slots(root)).toEqual(["buddy", "main"]);

    // A slot really named "buddy" can still be dismissed by name.
    await client.callTool({ name: "buddy_dismiss", arguments: { slot: "buddy" } });
    expect(slots(root)).toEqual(["main"]);
  } finally {
    await client.close();
  }
}, 20000);
