#!/usr/bin/env python3
"""PreToolUse hook (Bash matcher): refuse the git commands banned by .claude/rules/git.md.

WHY THIS EXISTS (P1116): that rules file spends ~190 always-on lines describing commands
that must never run. Exactly one of them (branch-guard.sh) was enforced, and via
pre-commit rather than at the point of use. Advisory text loses -- measured: a CLAUDE.md
routing line fired 0/30 over 91 days; 12 wrong absence claims in 28 days against two
always-on rules forbidding them. This is the mechanical layer for the banned-commands
table, in the same spirit as block-pw-tail-pipe.sh.

MATCH THE RUN, NOT THE WORD. The single hardest requirement, and the one that has already
drawn blood twice: while P1116's own spec was being written, the existing push-guard
refused the Write because the spec's PROSE quoted a forbidden command -- and then refused
the first write of THIS file for the same reason. So this hook does not regex the command
string. It tokenizes it with a real quote/heredoc-aware scanner and only inspects the
FIRST token of each simple command. Consequences, all covered by the canary:
  - `git commit -m "never git add ."`   -> the mention is one quoted TOKEN, never a command
  - a heredoc that writes a doc quoting a banned command -> bodies are skipped entirely
  - `echo git add . >> notes.md`        -> first token is `echo`, not `git`
  - `git add "."`                       -> still BLOCKED; quoting an argument is not a mention

NO AGENT-USABLE OVERRIDE, ON PURPOSE. git.md says these must never run "without explicit
user instruction". An env-var or flag escape hatch would be authorization the agent can
forge (the same objection that governs the human-controlled push flag), so there is none.
Every refusal names the sanctioned alternative, and where the honest answer is "the human
runs it", the message says to ask the user to run it themselves with the `!` prefix. That
keeps a wrong refusal from stranding a session without handing the agent a bypass.

SAFETY INVARIANTS:
  1. NEVER exit non-zero and NEVER print anything on an unexpected error. A crashing
     PreToolUse hook would break every Bash call in the project. Everything is wrapped.
  2. Refuse only what the table names. Widening this file is how a guard turns into a
     tax on legitimate work. Known residuals are listed at the bottom rather than
     silently covered.

Rollback: remove the entry from .claude/settings.json (or delete this file). Behaviour
returns to today's advisory state; no data, no migration.
Canary: scripts/test-block-banned-git.py -- run it after ANY edit here.
"""

import json
import os
import subprocess
import sys

# ---------------------------------------------------------------------------
# Tokenizer: bash-ish enough to tell a command from a string that mentions one.
# ---------------------------------------------------------------------------

# Anything here starts a new simple command when seen unquoted.
_SEPARATORS = (";;", "&&", "||", ";", "|&", "|", "&", "\n", "(", ")", "{", "}")
# Words that introduce a command rather than being one.
_KEYWORDS = {"then", "do", "else", "elif", "if", "while", "until", "for", "!", "time"}
# Wrappers to skip past to find the real executable.
_WRAPPERS = {"sudo", "command", "nice", "nohup", "builtin", "exec", "time"}
_REDIR_START = set("<>")


class Token:
    __slots__ = ("value", "quoted")

    def __init__(self, value, quoted):
        self.value = value
        self.quoted = quoted


def _read_heredoc_delim(s, i):
    """At s[i] == start of the word after `<<`/`<<-`. Return (delim, quoted, next_i)."""
    while i < len(s) and s[i] in " \t":
        i += 1
    if i < len(s) and s[i] in "'\"":
        q = s[i]
        j = s.find(q, i + 1)
        if j == -1:
            return None, False, i
        return s[i + 1:j], True, j + 1
    j = i
    while j < len(s) and (s[j].isalnum() or s[j] in "_-."):
        j += 1
    return (s[i:j], False, j) if j > i else (None, False, i)


def split_commands(s):
    """Split a shell string into simple commands, each a list of Tokens.

    Quoted spans stay inside the token that contains them, which is precisely what makes
    a mention un-runnable: a banned command inside a quoted argument can never be
    token[0]. Heredoc bodies and redirection targets are dropped -- they are data, not
    arguments.
    """
    cmds, tokens = [], []
    buf, buf_quoted, has_buf = [], False, False
    pending_heredocs = []
    drop_next_word = False
    i, n = 0, len(s)

    def flush():
        nonlocal buf, buf_quoted, has_buf, drop_next_word
        if has_buf:
            if drop_next_word:
                drop_next_word = False
            else:
                tokens.append(Token("".join(buf), buf_quoted))
        buf, buf_quoted, has_buf = [], False, False

    def end_cmd():
        flush()
        if tokens:
            cmds.append(list(tokens))
        tokens.clear()

    while i < n:
        c = s[i]

        # --- heredoc start: `<<WORD` / `<<-WORD` / quoted delimiter (but not `<<<`)
        if c == "<" and s.startswith("<<", i) and not s.startswith("<<<", i):
            j = i + 2
            if j < n and s[j] == "-":
                j += 1
            delim, _, j2 = _read_heredoc_delim(s, j)
            if delim:
                pending_heredocs.append(delim)
                flush()
                i = j2
                continue

        # --- redirection: drop the operator and its target
        if c in _REDIR_START or (c.isdigit() and i + 1 < n and s[i + 1] in _REDIR_START):
            flush()
            while i < n and (s[i] in _REDIR_START or s[i].isdigit() or s[i] == "&"):
                i += 1
            while i < n and s[i] in " \t":
                i += 1
            drop_next_word = True
            continue

        # --- escapes
        if c == "\\" and i + 1 < n:
            if s[i + 1] == "\n":       # line continuation
                i += 2
                continue
            buf.append(s[i + 1])
            has_buf = True
            i += 2
            continue

        # --- single quotes: fully literal
        if c == "'":
            j = s.find("'", i + 1)
            if j == -1:
                j = n
            buf.append(s[i + 1:j])
            buf_quoted, has_buf = True, True
            i = j + 1
            continue

        # --- double quotes: honour backslash escapes
        if c == '"':
            i += 1
            while i < n and s[i] != '"':
                if s[i] == "\\" and i + 1 < n:
                    buf.append(s[i + 1])
                    i += 2
                    continue
                buf.append(s[i])
                i += 1
            buf_quoted, has_buf = True, True
            i += 1
            continue

        # --- command substitution opens a fresh command context
        if s.startswith("$(", i) or c == "`":
            end_cmd()
            i += 2 if c == "$" else 1
            continue

        # --- newline: consume any pending heredoc bodies as data
        if c == "\n":
            end_cmd()
            i += 1
            while pending_heredocs:
                delim = pending_heredocs.pop(0)
                closed = False
                while i < n:
                    eol = s.find("\n", i)
                    if eol == -1:
                        eol = n
                    if s[i:eol].strip() == delim:
                        i = min(eol + 1, n)
                        closed = True
                        break
                    i = eol + 1
                if not closed:
                    break
            continue

        # --- separators
        matched = None
        for sep in _SEPARATORS:
            if s.startswith(sep, i):
                matched = sep
                break
        if matched:
            end_cmd()
            i += len(matched)
            continue

        if c in " \t":
            flush()
            i += 1
            continue

        buf.append(c)
        has_buf = True
        i += 1

    end_cmd()
    return cmds


def git_args(tokens):
    """If this simple command invokes git, return its args (globals stripped). Else None."""
    idx = 0
    while idx < len(tokens):
        v = tokens[idx].value
        head = v.split("=", 1)[0]
        if "=" in v and head and not v.startswith("=") and head.replace("_", "a").isalnum():
            idx += 1          # leading VAR=value assignment
            continue
        if v in _KEYWORDS or v in _WRAPPERS:
            idx += 1
            continue
        break
    if idx >= len(tokens):
        return None
    exe = tokens[idx].value
    if exe != "git" and not exe.endswith("/git"):
        return None

    idx += 1
    # git's own global options sit before the subcommand.
    while idx < len(tokens):
        v = tokens[idx].value
        if v in ("-C", "-c", "--namespace", "--work-tree", "--git-dir", "--exec-path"):
            idx += 2
            continue
        if v.startswith("--") and "=" in v:
            idx += 1
            continue
        if v in ("--no-pager", "--paginate", "--no-replace-objects", "--bare",
                 "--literal-pathspecs"):
            idx += 1
            continue
        break
    return tokens[idx:]


# ---------------------------------------------------------------------------
# Rules -- one per row of the .claude/rules/git.md banned-commands table.
# ---------------------------------------------------------------------------

def _vals(args):
    return [t.value for t in args]


def _is_short_cluster(v):
    """A short-option cluster: -A, -nm, -fp. Never a quoted VALUE that starts with a dash.

    The whitespace guard is load-bearing, not defensive: without it a commit message like
    `-m "-n means no-verify"` reads as a cluster carrying `n` and the commit is refused.
    Caught by an adversarial probe after the canary was already green -- over-blocking is
    the failure mode that looks like the hook working.
    """
    return (len(v) > 1 and v[0] == "-" and v[1] != "-"
            and not any(c.isspace() for c in v))


def _has_short(args, letter):
    """True if a short-option cluster carries `letter` (e.g. -A in `git add -An`)."""
    for t in args:
        v = t.value
        if v == "--":
            return False
        if _is_short_cluster(v) and letter in v[1:]:
            return True
    return False


def _paths_after_dashdash(args):
    vals = _vals(args)
    return vals[vals.index("--") + 1:] if "--" in vals else []


def _positional(args):
    """Non-flag args before any `--`."""
    out = []
    for t in args:
        if t.value == "--":
            break
        if t.value.startswith("--") or _is_short_cluster(t.value):
            continue
        out.append(t.value)
    return out


def _repo_root():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def _git_path(name):
    try:
        root = _repo_root()
        p = subprocess.run(["git", "rev-parse", "--git-path", name], cwd=root,
                           capture_output=True, text=True, timeout=3)
        if p.returncode != 0:
            return None
        path = p.stdout.strip()
        return path if os.path.isabs(path) else os.path.join(root, path)
    except Exception:
        return None


def _current_branch():
    try:
        p = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=_repo_root(),
                           capture_output=True, text=True, timeout=3)
        return p.stdout.strip() if p.returncode == 0 else None
    except Exception:
        return None


PROTECTED = ("main", "master")
ADD_EVERYTHING = (".", "..", "./", ":/", "*", ":/.", ":(top)")


def check(args):
    """Return a refusal message, or None to allow."""
    if not args:
        return None
    sub = args[0].value
    rest = args[1:]
    vals = _vals(rest)

    # R1 -- stashing: hides uncommitted work silently.
    if sub == "stash":
        nxt = vals[0] if vals and not vals[0].startswith("-") else ""
        if nxt in ("", "push", "save", "create", "store"):
            return ("`git stash` is banned (.claude/rules/git.md) -- it hides uncommitted work "
                    "silently and the founder loses visibility into what moved. "
                    'Use instead: git add <explicit paths>, then git commit -m "wip: <description>" '
                    "(no path args on the commit itself -- that form re-reads the working tree, "
                    "not the index, for the paths listed), then "
                    "`git log -1` to confirm HEAD is YOUR wip commit and `git reset <absolute-sha>` "
                    "to undo it later (never HEAD~1 -- the main checkout's HEAD is shared). "
                    "`git stash list/show/pop/apply` are not blocked.")
        return None

    if sub == "add":
        # R2 -- add-everything: can stage secrets, ignored files, other sessions' work.
        if "-A" in vals or "--all" in vals or _has_short(rest, "A"):
            return ("`git add -A` / `--all` is banned (.claude/rules/git.md) -- it stages every "
                    "modified file, including co-tenant sessions' work and files you did not "
                    "touch. Use instead: git add <explicit paths you changed this session>. "
                    "Derive the list from `git diff --name-only`, then verify with "
                    "`git diff --cached --name-only` before committing.")
        for p in _positional(rest) + _paths_after_dashdash(rest):
            if p in ADD_EVERYTHING:
                return ("`git add %s` is banned (.claude/rules/git.md) -- an add-everything "
                        "pathspec can stage secrets, ignored files, and other sessions' work. "
                        "Use instead: git add <explicit paths you changed this session>, then "
                        "`git diff --cached --name-only` to confirm every staged file is yours. "
                        "(Specific paths that merely start with a dot -- `.claude/settings.json`, "
                        "`./scripts/x.sh` -- are fine and not blocked.)" % p)
        # R3 -- forced add: overrides .gitignore.
        if "-f" in vals or "--force" in vals or _has_short(rest, "f"):
            return ("`git add -f/--force` is banned (.claude/rules/git.md) -- it overrides "
                    ".gitignore, which is what keeps .env.local, .mcp.json and .private/ out of a "
                    "PUBLIC repo. Use instead: if the file is ignored and genuinely belongs in "
                    "git, change .gitignore in its own commit so the exception is reviewable, "
                    "then add the file by name with no force flag.")
        return None

    # R4 -- argument-less index reset. `git reset <absolute-sha>` (the sanctioned wip-undo)
    # and `git reset HEAD -- <paths>` (scoped unstage) both stay allowed.
    if sub == "reset":
        if "--" in vals or _paths_after_dashdash(rest):
            return None
        pos = _positional(rest)
        if not pos or (len(pos) == 1 and pos[0] == "HEAD"):
            return ("`git reset HEAD` with no pathspec is banned (.claude/rules/git.md) -- it "
                    "resets the ENTIRE index, including files staged by concurrent sessions "
                    "sharing this checkout. "
                    "Use instead: git reset HEAD -- <the specific files to unstage>. "
                    "To undo a wip commit, pass the ABSOLUTE sha: git reset <sha> (never HEAD~1).")
        return None

    # R5 -- revert-to-HEAD. The one git loss with NO recovery: the content never entered
    # the object database, so there is no reflog entry and no dangling blob to find.
    if sub in ("checkout", "restore"):
        if sub == "restore":
            staged = "--staged" in vals or _has_short(rest, "S")
            worktree = "--worktree" in vals or _has_short(rest, "W")
            if staged and not worktree:
                return None       # == `git reset HEAD -- file`, sanctioned
            return ("`git restore` is banned (.claude/rules/git.md) -- it discards uncommitted "
                    "edits in EVERY file listed, permanently. Unlike a bad `git reset`, the "
                    "content was never committed, so there is no reflog entry and no dangling "
                    "blob. Do this instead: (1) `git diff --name-only` to see what actually "
                    "carries uncommitted changes -- build the list from that output, never from "
                    'memory; (2) `git commit -m "wip: ..."` anything not certainly disposable; '
                    "(3) if the revert is genuinely wanted, ask the user to run it themselves "
                    "with the `!` prefix. To unstage without touching the working tree: "
                    "git restore --staged <paths>.")
        if _paths_after_dashdash(rest) or set(_positional(rest)) & {".", "*"}:
            return ("`git checkout` of file paths is banned (.claude/rules/git.md) -- it destroys "
                    "working-tree edits in every path listed, with no reflog recovery (the content "
                    "never entered the object database). The 2026-08-03 P1024 incident lost an "
                    "edit this exact way: one file was backed up, two were named on the revert "
                    "line. Do this instead: (1) `git diff --name-only` and build the file list "
                    'from THAT, not from memory; (2) `git commit -m "wip: ..."` first -- that is '
                    "recoverable; (3) to undo an edit YOU made this session, use the Edit tool's "
                    "inverse instead. If the revert is genuinely wanted, ask the user to run it "
                    "with the `!` prefix. Branch switches (`git checkout main`, `git checkout -b "
                    "...`) are not blocked.")
        return None

    if sub == "push":
        # R6 -- force-push to a protected branch.
        refs = _positional(rest)
        # A leading `+` on a refspec IS a force push -- `git push origin +main` needs no
        # --force flag at all. Missing this was the canary's first real catch.
        plus_forced = [r for r in refs if r.startswith("+")]
        forced = ("--force" in vals or _has_short(rest, "f") or bool(plus_forced)
                  or any(v.startswith("--force-with-lease") or v.startswith("--force-if-includes")
                         for v in vals))
        if forced:
            # Only a PROTECTED target is banned -- forcing a feature branch (by --force or
            # by a `+feature/x` refspec) is legitimate and stays allowed.
            named = [r for r in refs
                     if r.split(":")[-1].lstrip("+").rsplit("/", 1)[-1] in PROTECTED]
            if named:
                return ("Force-pushing '%s' is banned (.claude/rules/git.md) -- it rewrites shared "
                        "history and can destroy commits other sessions and CI already built on. "
                        "The privacy scan on main is a REQUIRED server-side check (P919); "
                        "rewriting history is how commits get around it. Use instead: land the "
                        "change as a normal commit on a feature branch and ship it. If rewriting "
                        "main is genuinely intended, the user must run it themselves -- ask them "
                        "to type it with the `!` prefix." % named[0])
            if not refs:
                br = _current_branch()
                if br is None or br in PROTECTED:
                    where = ("the current branch, which is '%s'" % br if br
                             else "an undetermined branch (could not read HEAD)")
                    return ("A forced push with no explicit refspec is refused "
                            "(.claude/rules/git.md): the target resolves to %s. Name the branch "
                            "explicitly if you mean a feature branch -- forcing a feature branch "
                            "by name is not blocked. Rewriting main/master requires the user to "
                            "run it themselves with the `!` prefix." % where)
        # R7a -- --no-verify bypasses the privacy firewall. (`-n` here is --dry-run, which
        # is harmless and deliberately NOT matched -- the near-miss that proves the rule.)
        if "--no-verify" in vals:
            return ("`--no-verify` on a push is banned (.claude/rules/git.md) -- it silently skips "
                    "the pre-push privacy firewall (scripts/pre-push-checks.sh + "
                    "audit-privacy.sh) on a PUBLIC repo. Use instead: fix what the gate names. If "
                    "it is blocking something legitimate, the override instructions are in the "
                    "script's own header -- read them, do not infer a bypass. Report the block to "
                    "the user rather than routing around it.")
        return None

    # R7b -- commit --no-verify / -n.
    if sub == "commit":
        if "--no-verify" in vals or _has_short(rest, "n"):
            return ("`git commit --no-verify` is banned (.claude/rules/git.md) -- it silently "
                    "bypasses pre-commit-checks.sh AND audit-privacy.sh. A blocked commit is a "
                    "finding to report, not an obstacle to route around. Use instead: run "
                    "`./scripts/pre-commit-checks.sh`, fix what it names (lint -> "
                    "`npx eslint --fix`, frontmatter -> `python3 scripts/fix-frontmatter.py`), "
                    "and tell the user if it still blocks.")
        return None

    # R8 -- cherry-pick --abort/--quit, but only MID-SEQUENCE, which is the dangerous case.
    if sub == "cherry-pick" and ("--abort" in vals or "--quit" in vals):
        seq = _git_path("sequencer")
        if seq and os.path.isdir(seq):
            if "--abort" in vals:
                return ("`git cherry-pick --abort` mid-sequence is banned (.claude/rules/git.md) "
                        "-- it reverts ALL prior commits in the sequence, not just the conflicting "
                        "one. Use instead: `git cherry-pick --skip` to drop only the offending "
                        "commit, or resolve the conflict and `git cherry-pick --continue`. "
                        "Inspect `.git/sequencer/todo` and `git log` first to see what already "
                        "landed.")
            return ("`git cherry-pick --quit` mid-sequence is banned (.claude/rules/git.md) -- it "
                    "clears .git/sequencer/ WITHOUT reverting commits already applied, so a "
                    "re-attempt silently duplicates them. Use instead: inspect "
                    "`.git/sequencer/todo` and `git log` first, then either `--skip` the offending "
                    "commit or resolve and `--continue`.")
        return None

    return None


def main():
    raw = sys.stdin.read()
    try:
        cmd = (json.loads(raw) or {}).get("tool_input", {}).get("command") or ""
    except Exception:
        return
    if not cmd or "git" not in cmd:
        return
    for tokens in split_commands(cmd):
        args = git_args(tokens)
        if args is None:
            continue
        reason = check(args)
        if reason:
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "BLOCKED: " + reason,
            }}))
            return


# KNOWN RESIDUALS -- named, not silently covered. Each is either outside the banned table
# or not decidable from the command string, and the prose layer still owns it:
#   - `git commit` issued from inside a SUBAGENT (table row): a subagent's Bash call is
#     indistinguishable from the main session's at this layer.
#   - `git reset HEAD~1` (git.md prose, 2026-06-06 incident): banned in prose but not a
#     table row, and HEAD~1 is legitimate outside a shared checkout.
#   - `git reset --hard`, `git clean -fd`, `git stash drop/clear`: destructive, but not
#     rows in the table this hook mechanizes. Widening belongs in a spec, not here.
#   - A literal invocation inside `bash -c '...'` or `eval` is one quoted token, so it
#     reads as a mention and passes. Same acknowledged residual as block-pw-tail-pipe.sh,
#     inverted: that hook over-blocks quoted text, this one under-blocks it.
if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass          # INVARIANT 1: never break every Bash call in the project.
    sys.exit(0)
