#!/usr/bin/env python3
"""
Validate and auto-fix frontmatter in .claude/commands/slava/**/*.md skill files.

Usage:
  python3 scripts/fix-skill-frontmatter.py              # dry-run (default)
  python3 scripts/fix-skill-frontmatter.py --apply       # write fixes
  python3 scripts/fix-skill-frontmatter.py <file>        # check specific file(s)
  python3 scripts/fix-skill-frontmatter.py --apply <file>

Auto-fixes (safe):
  - Missing name → derived from filename or parent dir
  - Missing version → 1.0.0

Flags only (needs human):
  - Missing or empty description
  - Missing when_to_use (warning, not error)
  - No frontmatter at all (won't insert — too risky without review)
  - Name collisions across files

Skips:
  - PRINCIPLES.md, shortcuts.md (reference docs)
  - agent.md, synthesizer.md (sub-agent files)
  - sifter-definitions.md (shared definitions)
  - build/finish/criteria/ (prompt fragments inlined by /finish)
  - archive/ files (only need archived_reason)
"""

import sys
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).parent.parent
SKILLS_DIR = PROJECT_ROOT / '.claude' / 'commands' / 'slava'

# Files that are NOT independently routable skills
SKIP_FILENAMES = {
    'PRINCIPLES.md',
    'shortcuts.md',
    'sifter-definitions.md',
}

# Sub-agent filenames (spawned by parent skills, not routable)
SUBAGENT_FILENAMES = {
    'agent.md',
    'synthesizer.md',
}

# Directories of prompt fragments inlined into subagent prompts by a parent
# skill. Skipped by PATH, not by filename — the names inside are generic
# (code.md, docs.md) and a filename-based skip would silently exempt a real
# skill that later takes one of those names.
SKIP_DIR_PREFIXES = (
    'build/finish/criteria/',
)


def is_skip_file(path):
    """Should this file be skipped entirely?"""
    name = path.name
    if name in SKIP_FILENAMES or name in SUBAGENT_FILENAMES:
        return True
    # Archive files only need archived_reason — skip from active validation
    rel = str(path.relative_to(SKILLS_DIR))
    if rel.startswith('archive/'):
        return True
    if rel.startswith(SKIP_DIR_PREFIXES):
        return True
    return False


def parse_frontmatter(content):
    """Extract frontmatter lines and body. Returns (lines, body) or (None, None)."""
    if not content.startswith('---\n'):
        return None, None
    end = content.find('\n---', 4)
    if end == -1:
        return None, None
    fm_lines = content[4:end].split('\n')
    body = content[end:]
    return fm_lines, body


def has_field(lines, name):
    """Check if a frontmatter field exists."""
    return any(re.match(rf'^{re.escape(name)}:', line) for line in lines)


def get_field(lines, name):
    """Get value of a frontmatter field."""
    for line in lines:
        m = re.match(rf'^{re.escape(name)}:\s*(.*)', line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    return None


def derive_name(path):
    """Derive skill name from filename or parent dir."""
    if path.name == 'SKILL.md' or path.name == 'index.md':
        return path.parent.name
    return path.stem


def check_file(file_path):
    """Check one skill file. Returns (fixes, warnings, errors, name_value)."""
    try:
        content = file_path.read_text()
    except Exception as e:
        return [], [], [f'Cannot read: {e}'], None

    fm_lines, body = parse_frontmatter(content)

    # No frontmatter at all — flag, don't auto-fix
    if fm_lines is None:
        return [], [], ['No frontmatter (starts without ---)'], None

    fixes = []   # auto-fixable
    warnings = []  # human should address
    errors = []  # blocking issues

    # Check name
    name_val = get_field(fm_lines, 'name')
    if not name_val:
        derived = derive_name(file_path)
        fixes.append(('name', derived))
        name_val = derived

    # Check version
    if not has_field(fm_lines, 'version'):
        fixes.append(('version', '1.0.0'))

    # Check description
    desc = get_field(fm_lines, 'description')
    if not desc:
        if has_field(fm_lines, 'description'):
            warnings.append('description is empty')
        else:
            warnings.append('missing description')

    # Check when_to_use (optional but recommended)
    if not has_field(fm_lines, 'when_to_use'):
        warnings.append('missing when_to_use (recommended)')

    return fixes, warnings, errors, name_val


def apply_fixes(file_path, fixes):
    """Apply auto-fixes to a file. Returns True if file was modified."""
    content = file_path.read_text()
    fm_lines, body = parse_frontmatter(content)
    if fm_lines is None:
        return False

    new_lines = list(fm_lines)
    for field, value in fixes:
        if not has_field(new_lines, field):
            new_lines.append(f'{field}: {value}')
        else:
            # Replace existing empty field
            for i, line in enumerate(new_lines):
                if re.match(rf'^{re.escape(field)}:\s*$', line):
                    new_lines[i] = f'{field}: {value}'
                    break

    new_content = f'---\n{chr(10).join(new_lines)}{body}'
    if new_content != content:
        file_path.write_text(new_content)
        return True
    return False


def main():
    apply_mode = '--apply' in sys.argv
    file_args = [a for a in sys.argv[1:] if a != '--apply']

    if file_args:
        files = [Path(f).resolve() for f in file_args]
    else:
        files = sorted(SKILLS_DIR.rglob('*.md'))

    # Filter skippable
    active_files = [f for f in files if not is_skip_file(f)]

    if not active_files:
        print('No skill files to check')
        sys.exit(0)

    total_fixes = 0
    total_warnings = 0
    total_errors = 0
    total_no_frontmatter = 0
    names_seen = {}  # name -> [paths]
    fixed_files = []

    for f in active_files:
        fixes, warnings, errors, name_val = check_file(f)
        rel = str(f.relative_to(PROJECT_ROOT))

        # Track names for collision detection
        if name_val:
            names_seen.setdefault(name_val, []).append(rel)

        has_issues = fixes or warnings or errors

        if errors:
            for e in errors:
                if 'No frontmatter' in e:
                    total_no_frontmatter += 1
                    print(f'  ⚠ {rel}: {e}')
                else:
                    print(f'  ✗ {rel}: {e}')
            total_errors += len(errors)

        if fixes:
            if apply_mode:
                if apply_fixes(f, fixes):
                    fix_desc = ', '.join(f'{field}={val}' for field, val in fixes)
                    print(f'  ✓ {rel}: auto-fixed {fix_desc}')
                    fixed_files.append(str(f))
            else:
                fix_desc = ', '.join(f'{field}={val}' for field, val in fixes)
                print(f'  → {rel}: would fix {fix_desc}')
            total_fixes += len(fixes)

        if warnings:
            for w in warnings:
                print(f'  ⚠ {rel}: {w}')
            total_warnings += len(warnings)

    # Name collision report
    collisions = {n: paths for n, paths in names_seen.items() if len(paths) > 1}
    if collisions:
        print()
        print('Name collisions:')
        for name, paths in collisions.items():
            print(f'  ✗ "{name}" used by:')
            for p in paths:
                print(f'      {p}')
        total_errors += len(collisions)

    # Machine-readable line for pre-commit
    if fixed_files:
        print('FIXED_FILES:' + ':'.join(fixed_files))

    # Summary
    print()
    mode_label = 'APPLIED' if apply_mode else 'DRY RUN'
    parts = []
    if total_no_frontmatter:
        parts.append(f'{total_no_frontmatter} missing frontmatter')
    if total_fixes:
        verb = 'fixed' if apply_mode else 'fixable'
        parts.append(f'{total_fixes} auto-{verb}')
    if total_warnings:
        parts.append(f'{total_warnings} warnings')
    if total_errors:
        parts.append(f'{total_errors} errors')

    if not parts:
        print(f'✓ All skill frontmatter valid ({mode_label})')
        sys.exit(0)
    else:
        print(f'[{mode_label}] {" | ".join(parts)}')
        sys.exit(1 if total_errors else 0)


if __name__ == '__main__':
    main()
