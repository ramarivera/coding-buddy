#!/usr/bin/env bash
# Shared cached sub-status renderer for the buddy statusline scripts.
#
# The command is intentionally launched from a detached process. Claude Code
# kills a statusline process when the next one starts, so running the command
# inline would make slow commands disappear before they can finish.

_substatus_mtime() {
    local path="$1"
    local value
    value=$(stat -f %m "$path" 2>/dev/null)
    case "$value" in
        ''|*[!0-9]*) value=$(stat -c %Y "$path" 2>/dev/null) ;;
    esac
    case "$value" in
        ''|*[!0-9]*) echo 0 ;;
        *) echo "$value" ;;
    esac
}

append_substatus() {
    local state_dir="$BUDDY_STATE_DIR"
    local sid="${BUDDY_SID:-default}"
    local config_file="$state_dir/config.json"
    local cache_file="$state_dir/.substatus.$sid"
    local lock_dir="$state_dir/.substatus.$sid.lock"
    local command=""
    local now cache_age lock_age refresh_seconds configured_refresh_seconds line sweep_lock sweep_lock_age

    # Cleanup is intentionally detached: stale temp files are housekeeping and
    # must not make the statusline wait on a filesystem walk. The lock keeps
    # concurrent statusline ticks from launching duplicate sweeps.
    sweep_lock="$state_dir/.substatus-sweep.$sid.lock"
    if [ -d "$sweep_lock" ]; then
        sweep_lock_age=$(( $(date +%s) - $(_substatus_mtime "$sweep_lock") ))
        if [ "$sweep_lock_age" -gt 300 ]; then
            rmdir "$sweep_lock" 2>/dev/null || rm -rf "$sweep_lock" 2>/dev/null
        fi
    fi
    if mkdir "$sweep_lock" 2>/dev/null; then
        (
            trap 'rmdir "$sweep_lock" 2>/dev/null' EXIT
            find "$state_dir" -type f -name ".substatus.$sid.*" -mmin +60 -exec rm -f {} + 2>/dev/null
        ) >/dev/null 2>&1 &
    fi

    [ -f "$config_file" ] || return 0
    command=$(jq -r '.subStatusCommand // ""' "$config_file" 2>/dev/null)
    [ -n "$command" ] || return 0

    refresh_seconds=15
    configured_refresh_seconds=$(jq -r '.subStatusRefreshSeconds // empty' "$config_file" 2>/dev/null)
    case "$configured_refresh_seconds" in
        ''|*[!0-9]*) ;;
        *) [ "$configured_refresh_seconds" -gt 0 ] && refresh_seconds="$configured_refresh_seconds" ;;
    esac

    # The main statusline supplies ANSI-aware output when it has a width
    # budget. Keep this helper standalone for callers that don't.
    _substatus_print_line() {
        local line="$1"
        if [ "$(type -t statusline_output_line 2>/dev/null)" = "function" ]; then
            statusline_output_line "$line"
        else
            printf '%s\n' "$line"
        fi
    }
    if [ -f "$cache_file" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            _substatus_print_line "$line"
        done < "$cache_file"
    fi
    now=$(date +%s)
    cache_age=999999
    if [ -f "$cache_file" ]; then
        cache_age=$(( now - $(_substatus_mtime "$cache_file") ))
        [ "$cache_age" -lt 0 ] && cache_age=0
    fi
    [ "$cache_age" -lt "$refresh_seconds" ] && return 0

    # mkdir is the portable atomic lock primitive. Only remove locks that are
    # over a minute old, so a slow but healthy command is never duplicated.
    if [ -d "$lock_dir" ]; then
        lock_age=$(( now - $(_substatus_mtime "$lock_dir") ))
        # A refresh killed alongside its parent leaves this lock behind. The
        # window must be short enough that a fresh session recovers within a
        # few ticks instead of rendering no sub-status at all, but longer than
        # a healthy slow command's runtime so it is never duplicated.
        if [ "$lock_age" -gt 20 ]; then
            rmdir "$lock_dir" 2>/dev/null || rm -rf "$lock_dir" 2>/dev/null
        fi
    fi

    mkdir "$lock_dir" 2>/dev/null || return 0

    # Keep the parent statusline fast even when the command takes minutes.
    # The explicit /dev/null stdin makes this process independent of Claude's
    # killed statusline process; the captured payload is piped to the command.
    (
        tmp_file="$state_dir/.substatus.$sid.tmp"
        cleanup_substatus_refresh() {
            rm -f "$tmp_file" 2>/dev/null
            rmdir "$lock_dir" 2>/dev/null || rm -rf "$lock_dir" 2>/dev/null
        }
        trap cleanup_substatus_refresh EXIT
        trap 'exit 1' HUP INT TERM

        if printf '%s' "${BUDDY_STATUSLINE_INPUT:-}" | sh -c "$command" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$cache_file" 2>/dev/null || exit 1
        else
            exit 1
        fi
    ) </dev/null > /dev/null 2>/dev/null &
}

# Claude Code kills the statusline process when the next render starts, and a
# plain `&` child stays in that process group — so the refresh was being killed
# mid-write, leaving a held lock and a 0-byte temp file behind. A session that
# lost the race that way never rendered a sub-status at all.
#
# setsid detaches into a new session so the refresh survives; it is Linux-only,
# so fall back to nohup (which at least survives SIGHUP) on macOS.
_substatus_detach() {
    if command -v setsid >/dev/null 2>&1; then
        setsid "$@" </dev/null >/dev/null 2>&1 &
    else
        nohup "$@" </dev/null >/dev/null 2>&1 &
    fi
}
