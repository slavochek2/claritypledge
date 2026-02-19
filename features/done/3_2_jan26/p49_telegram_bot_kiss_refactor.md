---
status: all-done
type: task
tags: []
rank: 125439.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P49: Telegram Bot KISS Refactor

## Problem

The telegram command handler has accumulated several bugs from its monolithic if-elif chain structure:
- `d7ecd61`: Status `startswith("s")` intercepted "stop" command
- `a0a829e`: Confirmation prompt didn't block unrecognized input
- `375da40`: Commit command assumed success without checking errors
- **Current**: Confirmation "yes" handler falls through if action isn't "stop_all"

Root cause: 900-line `handle_command()` function with scattered control flow that's hard to reason about.

## Solution

Replace if-elif chain with **command dispatch table** pattern:

```python
COMMANDS = {
    "status": {"aliases": ["/status", "s", "/s"], "handler": cmd_status},
    "logs": {"aliases": ["/logs", "l", "/l"], "handler": cmd_logs},
    "stop": {"aliases": ["/stop"], "handler": cmd_stop},
    # ...
}

def handle_command(text):
    # 1. Check confirmation state first (separate concern)
    if pending_confirmation():
        return handle_confirmation(text)

    # 2. Parse and dispatch
    cmd, args = parse_command(text)
    if cmd in COMMANDS:
        return COMMANDS[cmd]["handler"](args)

    # 3. Default: forward to agents
    return forward_to_agents(text)
```

## Benefits

1. **No fall-through bugs** - Each handler returns explicitly
2. **Testable** - Can unit test individual handlers
3. **Readable** - Command list is self-documenting
4. **Extensible** - Add commands without touching dispatch logic

## Implementation

1. Extract confirmation handling to `handle_confirmation(text)`
2. Extract each command to `cmd_status()`, `cmd_logs()`, etc.
3. Build dispatch table with aliases
4. Simplify `handle_command()` to just parse + dispatch

## Files Changed

- `scripts/telegram-command-handler.py` - Refactor only, no new features

## Success Criteria

- [ ] All existing commands work identically
- [ ] Confirmation flow works for stop_all
- [ ] No fall-through possible in any code path
- [ ] Each handler is a pure function that returns a string
