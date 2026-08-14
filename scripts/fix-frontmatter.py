#!/usr/bin/env python3
"""
Auto-fix frontmatter in features/p*.md files.

Usage:
  python3 scripts/fix-frontmatter.py          # all features/
  python3 scripts/fix-frontmatter.py <file>   # specific file(s)

Auto-fixes (no judgment needed):
  - status casing/normalization (Week → week, in_progress → in-progress)
  - missing status → backlog
  - missing tags → tags: []
  - missing rank → bottom of ITS status column (never a global max — see get_max_rank_by_column)
  - missing created_date → from git log
  - missing completed_at on done items → most recent git date (or today)
  - duplicate P-numbers → lower-priority file renamed + all references updated
  - header P-number mismatch (filename says p432, header says P429) → header corrected
  - (removed P659: delivery_stage is no longer cleared at qa — skills manage it)

Reports only (needs manual fix):
  - missing type field (story | bug | task | comment)
  - malformed/missing frontmatter
"""

import sys
import re
import subprocess
import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).parent.parent

# Higher index = lower priority = gets renamed when there's a duplicate.
# First match wins.
FOLDER_PRIORITY = [
    'features/bugs_and_debt/',
    'features/',
    'features/drafts/',
    'features/uat/',
    'features/done/',
    'features/archive/',
]


def get_folder_priority(file_path):
    rel = str(file_path.relative_to(PROJECT_ROOT))
    # Check 'features/' only if file is directly in features/ root (no subdir)
    for i, folder in enumerate(FOLDER_PRIORITY):
        if folder == 'features/':
            # Only match if file is directly in features/ (not in a subdirectory)
            if rel.startswith('features/') and '/' not in rel[len('features/'):]:
                return i
        elif rel.startswith(folder):
            return i
    return 99


def get_tracked_files():
    """Return set of absolute path strings tracked by git in features/."""
    try:
        result = subprocess.run(
            ['git', 'ls-files', '--', 'features/'],
            capture_output=True, text=True, cwd=PROJECT_ROOT
        )
        tracked = set()
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if line:
                tracked.add(str((PROJECT_ROOT / line).resolve()))
        return tracked
    except Exception:
        return set()


def get_git_date(file_path):
    try:
        result = subprocess.run(
            ['git', 'log', '--follow', '--format=%as', '--', str(file_path)],
            capture_output=True, text=True
        )
        dates = [d.strip() for d in result.stdout.strip().split('\n') if d.strip()]
        return dates[-1] if dates else None
    except Exception:
        return None


def get_git_recent_date(file_path):
    """Get the most recent git commit date for a file (used for completed_at)."""
    try:
        result = subprocess.run(
            ['git', 'log', '--format=%as', '-1', '--', str(file_path)],
            capture_output=True, text=True
        )
        date = result.stdout.strip()
        return date if date else None
    except Exception:
        return None


def get_max_rank_by_column(all_files):
    """Highest rank per status column: {'backlog': 93.0, 'week': 28.0, ...}.

    Per-column, never global. Rank only orders specs *within* one kanban column,
    so a global maximum ratchets forever — one out-of-scale rank drags every later
    spec above it, and every auto-ranked spec then sorts below every hand-ordered
    one regardless of content. That produced the 2026-08-14 renumber, where 75 of
    122 open specs were stranded in a 1,000,000 band. Keying by status also stops
    closed specs in done/ and archive/ from setting the scale for open ones.
    """
    max_by_col = {}
    for md_file in all_files:
        try:
            content = md_file.read_text()
            rank_m = re.search(r'^rank:\s*([0-9]+(?:\.[0-9]+)?)', content, re.MULTILINE)
            status_m = re.search(r'^status:\s*(\S+)', content, re.MULTILINE)
            if rank_m:
                col = status_m.group(1).strip().lower().replace('_', '-') if status_m else 'backlog'
                max_by_col[col] = max(max_by_col.get(col, 0.0), float(rank_m.group(1)))
        except Exception:
            pass
    return max_by_col


def get_all_p_numbers(all_files):
    nums = set()
    for f in all_files:
        m = re.match(r'p(\d+)', f.name)
        if m:
            nums.add(int(m.group(1)))
    return nums


def next_available_p(all_nums, start=None):
    n = (max(all_nums) + 1) if start is None else start
    while n in all_nums:
        n += 1
    return n


def update_references(old_stem, new_stem, search_root):
    """Replace old filename stem with new in all .md files. Returns updated file list."""
    updated = []
    for md_file in search_root.rglob('*.md'):
        try:
            content = md_file.read_text()
            if old_stem in content:
                md_file.write_text(content.replace(old_stem, new_stem))
                updated.append(md_file)
        except Exception:
            pass
    return updated


def fix_duplicates(all_files):
    """Auto-rename lower-priority duplicate P-number files. Returns rename log."""
    tracked = get_tracked_files()
    seen = {}
    for f in all_files:
        # UAT files share P-numbers by design (uat/p270.md = UAT for P270 feature)
        if '/uat/' in str(f):
            continue
        m = re.match(r'p(\d+)', f.name)
        if m:
            num = int(m.group(1))
            seen.setdefault(num, []).append(f)

    all_nums = get_all_p_numbers(all_files)
    renames = []

    for num, files in seen.items():
        if len(files) <= 1:
            continue
        # Sort: tracked files always beat untracked (primary), then by folder priority (secondary).
        # This ensures phantom untracked files never displace tracked active features.
        def sort_key(f):
            is_untracked = str(f.resolve()) not in tracked
            return (is_untracked, get_folder_priority(f))
        files_sorted = sorted(files, key=sort_key)
        keeper = files_sorted[0]

        for f_to_rename in files_sorted[1:]:
            is_phantom = str(f_to_rename.resolve()) not in tracked

            if is_phantom:
                # Untracked phantom — delete it rather than accumulating another
                # phantom with a new number. Phantoms arise when a previous rename
                # used Path.rename() (filesystem-only) instead of git mv, leaving
                # the original path tracked in git while a new path exists on disk.
                try:
                    f_to_rename.unlink()
                except FileNotFoundError:
                    pass  # already gone — treat as deleted
                renames.append({
                    'kept': keeper,
                    'old': f_to_rename,
                    'new': None,
                    'refs': [],
                })
                continue

            new_num = next_available_p(all_nums)
            all_nums.add(new_num)

            # Build new filename: replace p<old> prefix
            new_name = re.sub(r'^p\d+', f'p{new_num}', f_to_rename.name)
            new_path = f_to_rename.parent / new_name

            # Use git mv so the rename is tracked in git's index.
            # Falling back to Path.rename() would create the divergence (tracked
            # path disappears from disk, new path appears as untracked ??) that
            # causes phantom accumulation across sessions.
            result = subprocess.run(
                ['git', 'mv', str(f_to_rename), str(new_path)],
                capture_output=True, cwd=PROJECT_ROOT
            )
            if result.returncode != 0:
                # Fallback (e.g., outside a git repo)
                f_to_rename.rename(new_path)

            # Update all references across features/ and docs/
            old_stem = f_to_rename.stem
            new_stem = new_path.stem
            updated_refs = update_references(old_stem, new_stem, PROJECT_ROOT / 'features')
            update_references(old_stem, new_stem, PROJECT_ROOT / 'docs')

            renames.append({
                'kept': keeper,
                'old': f_to_rename,
                'new': new_path,
                'refs': updated_refs,
            })

    return renames


def parse_frontmatter(content):
    if not content.startswith('---\n'):
        return None, None
    end = content.find('\n---', 4)
    if end == -1:
        return None, None
    fm_lines = content[4:end].split('\n')
    body = content[end:]
    return fm_lines, body


def has_field(lines, name):
    return any(re.match(rf'^{re.escape(name)}:', line) for line in lines)


def fix_file(file_path, max_rank_by_col):
    """Fix frontmatter in one file. Returns (changes, errors). Writes if changed.

    `max_rank_by_col` is mutated in place as ranks are handed out, so successive
    files in the same column get successive ranks.
    """
    try:
        content = file_path.read_text()
    except Exception as e:
        return [], [f'Cannot read: {e}']

    fm_lines, body = parse_frontmatter(content)
    if fm_lines is None:
        return [], ['No valid frontmatter (missing or unclosed ---)']

    changes = []
    errors = []
    new_lines = list(fm_lines)

    # Fix: header P-number must match filename P-number
    filename_match = re.match(r'p(\d+)', file_path.name)
    if filename_match:
        expected_num = int(filename_match.group(1))
        for i, line in enumerate(body.split('\n')):
            m = re.match(r'^# P(\d+)[:.]?\s', line)
            if m:
                header_num = int(m.group(1))
                if header_num != expected_num:
                    # Replace in body
                    old_header = f'P{header_num}:'
                    new_header = f'P{expected_num}:'
                    body = body.replace(old_header, new_header, 1)
                    changes.append(f'header P{header_num} → P{expected_num} (matches filename)')
                break

    # Fix: status casing + normalize underscores
    for i, line in enumerate(new_lines):
        m = re.match(r'^(status:\s*)(.+)', line)
        if m:
            raw = m.group(2).strip()
            fixed = raw.lower().replace('_', '-')
            if fixed != raw:
                new_lines[i] = f'status: {fixed}'
                changes.append(f"status '{raw}' → '{fixed}'")

    # Fix: missing status
    if not has_field(new_lines, 'status'):
        new_lines.insert(0, 'status: backlog')
        changes.append('added status: backlog')

    # Fix: missing tags
    if not has_field(new_lines, 'tags'):
        new_lines.append('tags: []')
        changes.append('added tags: []')

    # Fix: missing rank — bottom of ITS column, read after the status fixes above
    # so a file that just had `status: backlog` added is ranked in backlog.
    if not has_field(new_lines, 'rank'):
        col = 'backlog'
        for line in new_lines:
            m = re.match(r'^status:\s*(\S+)', line)
            if m:
                col = m.group(1).strip().lower().replace('_', '-')
                break
        next_rank = max_rank_by_col.get(col, 0.0) + 1.0
        max_rank_by_col[col] = next_rank
        new_lines.append(f'rank: {next_rank:.1f}')
        changes.append(f'added rank: {next_rank:.1f} (bottom of {col})')

    # Fix: missing created_date
    if not has_field(new_lines, 'created_date'):
        date = get_git_date(file_path)
        if date:
            new_lines.append(f'created_date: {date}')
            changes.append(f'added created_date: {date}')

    # P659: delivery_stage is now skill-managed — do not auto-clear at any status

    # Fix: missing completed_at on done items
    if not has_field(new_lines, 'completed_at'):
        status_line = next((l for l in new_lines if re.match(r'^status:', l)), None)
        if status_line and status_line.split(':', 1)[1].strip() == 'done':
            date = get_git_recent_date(file_path) or datetime.date.today().isoformat()
            new_lines.append(f"completed_at: '{date}'")
            changes.append(f'added completed_at: {date}')

    # Report: missing type
    if not has_field(new_lines, 'type'):
        errors.append('missing type: add story | bug | task | comment')

    new_content = f'---\n{chr(10).join(new_lines)}{body}'
    if new_content != content:
        file_path.write_text(new_content)

    return changes, errors


def main():
    single_file_mode = len(sys.argv) > 1
    if single_file_mode:
        files = [Path(f) for f in sys.argv[1:]]
    else:
        files = sorted(f for f in (PROJECT_ROOT / 'features').rglob('p[0-9]*.md') if '/uat/' not in str(f))

    if not files:
        print('No feature files found')
        sys.exit(0)

    # Step 1: Auto-rename duplicates (full scan only — skip in single-file/hook mode
    # to avoid staging git mv operations on every hook invocation).
    all_files = sorted(f for f in (PROJECT_ROOT / 'features').rglob('p[0-9]*.md') if '/uat/' not in str(f))
    renames = [] if single_file_mode else fix_duplicates(all_files)
    for r in renames:
        if r['new'] is None:
            print(f'✓ Deleted phantom: {r["old"].name}')
            print(f'  (kept {r["kept"].name} as canonical)')
        else:
            print(f'✓ Renamed duplicate: {r["old"].name} → {r["new"].name}')
            print(f'  (kept {r["kept"].name} as canonical)')
            if r['refs']:
                print(f'  updated {len(r["refs"])} reference(s):')
                for ref in r['refs']:
                    print(f'    → {ref}')

    # Re-derive file list after renames (paths may have changed)
    if single_file_mode:
        # Remap original paths to new paths if renamed
        rename_map = {r['old']: r['new'] for r in renames}
        files = [rename_map.get(f, f) for f in files]
        files = [f for f in files if f is not None and f.exists()]

    # Step 2: Fix frontmatter fields
    # Rank scale comes from the OPEN BOARD only — features/*.md plus
    # bugs_and_debt/. A file in done/ or archive/ that still carries an open
    # status is a status bug (13 such files existed on 2026-08-14, one at
    # in-progress); letting it set the scale is how a stale 1,000,000-band rank
    # in done/ reinfects every new backlog spec. Report those, don't rank from them.
    board_files = [
        f for f in all_files
        if f.parent.name == 'features' or f.parent.name == 'bugs_and_debt'
    ]
    max_rank_by_col = get_max_rank_by_column(board_files)
    fixed_count = 0
    manual_count = 0
    fixed_files = []

    for file_path in files:
        changes, errors = fix_file(file_path, max_rank_by_col)

        if changes:
            print(f'✓ Fixed {file_path.name}:')
            for c in changes:
                print(f'    → {c}')
            fixed_count += 1
            fixed_files.append(str(file_path))

        if errors:
            print(f'⚠ {file_path.name}: {" | ".join(errors)}')
            manual_count += 1

    # Machine-readable line for pre-commit to re-stage fixed files
    all_fixed = fixed_files + [str(r['new']) for r in renames if r['new'] is not None]
    if all_fixed:
        print('FIXED_FILES:' + ':'.join(all_fixed))

    print()
    total_auto = fixed_count + len(renames)
    if manual_count > 0 and total_auto > 0:
        print(f'✗ {manual_count} issue(s) need manual fixes | ✓ {total_auto} auto-fixed')
        sys.exit(1)
    elif manual_count > 0:
        print(f'✗ {manual_count} issue(s) need manual fixes')
        sys.exit(1)
    elif total_auto > 0:
        print(f'✓ {total_auto} auto-fixed')
        sys.exit(0)
    else:
        print('✓ All frontmatter valid')
        sys.exit(0)


if __name__ == '__main__':
    main()
