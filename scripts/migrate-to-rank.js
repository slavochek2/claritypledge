#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Sorting constants (match kanban logic)
const STATUS_ORDER = {
  'in-progress': 0,
  'today': 1,
  'blocked': 2,
  'week': 3,
  'backlog': 4,
  'done': 5,
  'rejected': 6,
  'draft': 7,
};

const PRIORITY_ORDER = {
  'p0': 0,
  'p1': 1,
  'p2': 2,
  'p3': 3,
};

// Parse command-line arguments
const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

// Directories to migrate (active features only, per Q1 decision)
const INCLUDE_DIRS = [
  'features',
];

// Directories to skip (historical data)
const EXCLUDE_PATTERNS = [
  'features/done',
  'features/archive',
  'features/drafts',
  'features/research',
  'features/uat',
  'features/bugs_and_debt',
];

function log(msg, level = 'info') {
  const prefix = dryRun ? '[DRY-RUN] ' : '';
  if (level === 'verbose' && !verbose) return;
  console.log(`${prefix}${msg}`);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
  if (!match) return null;

  const [_, frontmatterText, body] = match;
  try {
    const frontmatter = yaml.load(frontmatterText);
    return { frontmatter, body };
  } catch (err) {
    console.error(`YAML parse error: ${err.message}`);
    return null;
  }
}

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function loadFeatures(dirs) {
  const features = [];

  for (const dir of dirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      log(`SKIP: Directory not found: ${dir}`, 'verbose');
      continue;
    }

    const files = fs.readdirSync(fullPath)
      .filter(f => f.endsWith('.md') && f.match(/\bp\d+/))
      .map(f => path.join(fullPath, f));

    for (const file of files) {
      if (shouldExclude(file)) {
        log(`SKIP: Excluded: ${path.relative(process.cwd(), file)}`, 'verbose');
        continue;
      }

      const content = fs.readFileSync(file, 'utf8');
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        log(`SKIP: No frontmatter: ${path.relative(process.cwd(), file)}`);
        continue;
      }

      const { frontmatter, body } = parsed;
      const id = path.basename(file, '.md');

      features.push({
        file: file,
        relPath: path.relative(process.cwd(), file),
        id: id,
        frontmatter: frontmatter,
        body: body,
        sort_order: frontmatter.sort_order ?? null,
        priority: frontmatter.priority ?? null,
        status: frontmatter.status ?? 'backlog',
      });
    }
  }

  return features;
}

function sortFeatures(features) {
  return [...features].sort((a, b) => {
    // Primary: sort_order
    const orderA = a.sort_order ?? 1000000;
    const orderB = b.sort_order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;

    // Secondary: status
    const statusA = STATUS_ORDER[a.status] ?? 99;
    const statusB = STATUS_ORDER[b.status] ?? 99;
    if (statusA !== statusB) return statusA - statusB;

    // Tertiary: priority
    const aPri = a.priority ? PRIORITY_ORDER[a.priority] : 99;
    const bPri = b.priority ? PRIORITY_ORDER[b.priority] : 99;
    if (aPri !== bPri) return aPri - bPri;

    // Final: id
    return a.id.localeCompare(b.id);
  });
}

function assignRanks(features) {
  const sorted = sortFeatures(features);

  sorted.forEach((feature, index) => {
    // Sequential starting at 1.0 (Q2 decision)
    feature.rank = (index + 1) * 1.0;
  });

  return sorted;
}

function truncateRank(rank) {
  // Truncate to 3 decimals (Q3 decision)
  return Math.floor(rank * 1000) / 1000;
}

function writeFeature(feature) {
  // Update frontmatter
  const newFrontmatter = { ...feature.frontmatter };

  // Add rank (truncated to 3 decimals)
  newFrontmatter.rank = truncateRank(feature.rank);

  // Remove old fields
  delete newFrontmatter.priority;
  delete newFrontmatter.sort_order;

  // Serialize
  const frontmatterText = yaml.dump(newFrontmatter, {
    lineWidth: -1, // No wrapping
    noRefs: true,  // No YAML references
  });

  const newContent = `---\n${frontmatterText}---\n${feature.body}`;

  if (!dryRun) {
    fs.writeFileSync(feature.file, newContent, 'utf8');
  }

  log(`${feature.relPath}: rank=${newFrontmatter.rank} (was: priority=${feature.priority}, sort_order=${feature.sort_order})`, 'verbose');
}

function main() {
  log('=== P141 Migration: priority + sort_order → rank ===\n');

  // Check dependency
  try {
    require.resolve('js-yaml');
  } catch (e) {
    console.error('ERROR: js-yaml not installed. Run: npm install js-yaml');
    process.exit(1);
  }

  // Load features
  log('Loading features...');
  const features = loadFeatures(INCLUDE_DIRS);
  log(`Loaded ${features.length} features\n`);

  if (features.length === 0) {
    log('No features found. Exiting.');
    return;
  }

  // Assign ranks
  log('Sorting and assigning ranks...');
  const rankedFeatures = assignRanks(features);

  // Write back
  log(`\n${dryRun ? 'Would migrate' : 'Migrating'} ${rankedFeatures.length} features:\n`);

  let migrated = 0;
  let skipped = 0;
  const stats = {
    byStatus: {},
    byPriority: {},
    noSortOrder: 0,
    noPriority: 0,
    neither: 0,
  };

  for (const feature of rankedFeatures) {
    // Skip if already migrated
    if (feature.frontmatter.rank !== undefined && !feature.frontmatter.priority && !feature.frontmatter.sort_order) {
      log(`SKIP: ${feature.relPath} (already migrated)`, 'verbose');
      skipped++;
      continue;
    }

    // Track stats
    stats.byStatus[feature.status] = (stats.byStatus[feature.status] || 0) + 1;
    if (feature.priority) {
      stats.byPriority[feature.priority] = (stats.byPriority[feature.priority] || 0) + 1;
    } else {
      stats.byPriority['(none)'] = (stats.byPriority['(none)'] || 0) + 1;
    }

    if (!feature.sort_order) stats.noSortOrder++;
    if (!feature.priority) stats.noPriority++;
    if (!feature.sort_order && !feature.priority) stats.neither++;

    writeFeature(feature);
    migrated++;
  }

  // Summary
  log(`\n=== Migration ${dryRun ? 'Preview' : 'Complete'} ===`);
  log(`Total: ${features.length} features`);
  log(`Migrated: ${migrated} features`);
  log(`Skipped: ${skipped} features (already migrated)`);

  log(`\nBreakdown by status:`);
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    log(`  ${status}: ${count} features`);
  });

  log(`\nBreakdown by priority (before):`);
  Object.entries(stats.byPriority).forEach(([priority, count]) => {
    log(`  ${priority}: ${count} features`);
  });

  log(`\nEdge cases:`);
  log(`  No sort_order: ${stats.noSortOrder} features`);
  log(`  No priority: ${stats.noPriority} features`);
  log(`  Neither field: ${stats.neither} features`);

  if (dryRun) {
    log('\n✓ Dry-run complete. Run without --dry-run to apply changes.');
  } else {
    log('\n✓ Migration complete! Run post-migration validation to verify.');
  }
}

// Run
try {
  main();
} catch (err) {
  console.error('FATAL ERROR:', err);
  process.exit(1);
}
