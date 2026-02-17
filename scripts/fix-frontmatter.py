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
  - missing rank → max_rank + 1.0
  - missing created_date → from git log
  - duplicate P-numbers → lower-priority file renamed + all references updated

Reports only (needs manual fix):
  - missing type field (story | bug | task | comment)
  - malformed/missing frontmatter
"""

import sys
import re
import subprocess
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


def get_max_rank(all_files):
    max_rank = 0.0
    for md_file in all_files:
        try:
            content = md_file.read_text()
            m = re.search(r'^rank:\s*([0-9]+(?:\.[0-9]+)?)', content, re.MULTILINE)
            if m:
                max_rank = max(max_rank, float(m.group(1)))
        except Exception:
            pass
    return max_rank


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
    seen = {}
    for f in all_files:
        m = re.match(r'p(\d+)', f.name)
        if m:
            num = int(m.group(1))
            seen.setdefault(num, []).append(f)

    all_nums = get_all_p_numbers(all_files)
    renames = []

    for num, files in seen.items():
        if len(files) <= 1:
            continue
        # Sort: lowest priority index = highest priority = keep its P-number
        files_sorted = sorted(files, key=get_folder_priority)
        keeper = files_sorted[0]

        for f_to_rename in files_sorted[1:]:
            new_num = next_available_p(all_nums)
            all_nums.add(new_num)

            # Build new filename: replace p<old> prefix
            new_name = re.sub(r'^p\d+', f'p{new_num}', f_to_rename.name)
            new_path = f_to_rename.parent / new_name

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


def fix_file(file_path, next_rank):
    """Fix frontmatter in one file. Returns (changes, errors). Writes if changed."""
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

    # Fix: missing rank
    if not has_field(new_lines, 'rank'):
        new_lines.append(f'rank: {next_rank:.1f}')
        changes.append(f'added rank: {next_rank:.1f}')

    # Fix: missing created_date
    if not has_field(new_lines, 'created_date'):
        date = get_git_date(file_path)
        if date:
            new_lines.append(f'created_date: {date}')
            changes.append(f'added created_date: {date}')

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
        files = sorted((PROJECT_ROOT / 'features').rglob('p[0-9]*.md'))

    if not files:
        print('No feature files found')
        sys.exit(0)

    # Step 1: Auto-rename duplicates (full scan always, even in single-file mode)
    all_files = sorted((PROJECT_ROOT / 'features').rglob('p[0-9]*.md'))
    renames = fix_duplicates(all_files)
    for r in renames:
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
        files = [f for f in files if f.exists()]

    # Step 2: Fix frontmatter fields
    next_rank = get_max_rank(all_files) + 1.0
    fixed_count = 0
    manual_count = 0
    fixed_files = []

    for file_path in files:
        changes, errors = fix_file(file_path, next_rank)

        if changes:
            print(f'✓ Fixed {file_path.name}:')
            for c in changes:
                print(f'    → {c}')
            fixed_count += 1
            fixed_files.append(str(file_path))
            next_rank += 1.0

        if errors:
            print(f'⚠ {file_path.name}: {" | ".join(errors)}')
            manual_count += 1

    # Machine-readable line for pre-commit to re-stage fixed files
    all_fixed = fixed_files + [str(r['new']) for r in renames]
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
