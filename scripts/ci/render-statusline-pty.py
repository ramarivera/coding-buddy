#!/usr/bin/env python3
"""Render buddy-status.sh under a fixed PTY winsize.

buddy-status.sh probes the parent TTY via stty, so COLUMNS alone is not
enough when CI (or a wide agent terminal) already has a PTY. This helper
forks a PTY, sets TIOCSWINSZ to the requested cols, and prints the raw
statusline bytes to stdout.

Elapsed wall time for the child (statusline) is printed on stderr as:
  STATUSLINE_ELAPSED_MS=<int>
so the golden harness can budget Claude's ~1s kill without counting
Python/import overhead outside the child.
"""

from __future__ import annotations

import fcntl
import os
import pty
import select
import struct
import sys
import termios
import time


def _positive_int(env_name: str, default: int) -> int:
    value = os.environ.get(env_name, "")
    if value and value.isdigit():
        parsed = int(value)
        if parsed > 0:
            return parsed
    return default

def main() -> int:
    if len(sys.argv) != 5:
        print(
            "usage: render-statusline-pty.py <cols> <root> <config_dir> <script>",
            file=sys.stderr,
        )
        return 2

    cols = int(sys.argv[1])
    root = sys.argv[2]
    config_dir = sys.argv[3]
    script = sys.argv[4]
    rows = _positive_int("BUDDY_STATUSLINE_ROWS", 30)
    payload = os.environ.get(
        "STATUSLINE_PAYLOAD",
        '{"session_id":"ci","model":{"display_name":"CI"},"workspace":{"current_dir":"."}}',
    )

    # Build a tiny pipeline so buddy-status.sh can `cat` its JSON stdin.
    cmd = (
        "printf %s "
        + repr(payload)
        + " | "
        + f"COLUMNS={cols} BUDDY_FAKE_NOW=0 BUDDY_STATUSLINE_ROWS={rows} "
        + f"CLAUDE_CONFIG_DIR={config_dir!r} "
        + "CLAUDE_CODE_SESSION_ID= TMUX_PANE= BUDDY_SHELL= "
        + f"bash {script!r}"
    )

    t0 = time.perf_counter()
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(root)
        os.execvp("bash", ["bash", "-c", cmd])

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    out = bytearray()
    deadline = time.time() + 15.0
    while time.time() < deadline:
        readable, _, _ = select.select([fd], [], [], 0.1)
        if fd in readable:
            try:
                chunk = os.read(fd, 8192)
            except OSError:
                break
            if not chunk:
                break
            out.extend(chunk)
            continue

        waited = os.waitpid(pid, os.WNOHANG)
        if waited[0] == pid:
            while True:
                readable, _, _ = select.select([fd], [], [], 0.05)
                if fd not in readable:
                    break
                try:
                    chunk = os.read(fd, 8192)
                except OSError:
                    chunk = b""
                if not chunk:
                    break
                out.extend(chunk)
            break

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    print(f"STATUSLINE_ELAPSED_MS={elapsed_ms}", file=sys.stderr)
    sys.stdout.buffer.write(bytes(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
