#!/usr/bin/env node

/**
 * Migration Script: Convert priority/sort_order to rank field
 *
 * This script migrates all active features from the dual ordering system
 * (priority + sort_order) to the unified rank system.
 *
 * Usage:
 *   node scripts/archive/migrate-to-rank.cjs --dry-run    # Preview changes
 *   node scripts/archive/migrate-to-rank.cjs              # Execute migration
 *   node scripts/archive/migrate-to-rank.cjs --verbose    # Show detailed output
 *
 * Safety features:
 *   - Dry-run mode (no file writes)
 *   - Skips already-migrated features
 *   - Skips done/archive/drafts folders
 *   - Preserves all other frontmatter fields
 *   - Atomic file writes (write to temp, then rename)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Parse command-line flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || DRY_RUN;

// Directories to scan
const FEATURE_DIRS = [
  path.join(__dirname, '..', 'features'),
  path.join(__dirname, '..', 'features', 'bugs_and_debt')
];

// Directories to skip
const SKIP_DIRS = ['done', 'archive', 'drafts'];

// Status ordering (for sorting)
const STATUS_ORDER = {
  'today': 1,
  'week': 2,
  'in-progress': 3,
  'blocked': 4,
  'backlog': 5,
  'draft': 6,
  'rejected': 7
};

/**
 * Find all feature markdown files
 */
function findFeatureFiles() {
  const files = [];

  for (const dir of FEATURE_DIRS) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip directories in SKIP_DIRS
      if (entry.isDirectory() && SKIP_DIRS.includes(entry.name)) {
        continue;
      }

      // Only process .md files directly in the directory
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  return files;
}

/**
 * Parse frontmatter from markdown file
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('No frontmatter found');
  }

  const frontmatterText = match[1];
  const frontmatter = yaml.load(frontmatterText);
  const bodyStart = match[0].length;
  const body = content.substring(bodyStart);

  return { frontmatter, body, frontmatterText };
}

/**
 * Serialize frontmatter back to YAML
 */
function serializeFrontmatter(frontmatter) {
  return yaml.dump(frontmatter, {
    lineWidth: -1,  // No line wrapping
    noRefs: true,   // No references
    sortKeys: false // Preserve field order
  }).trim();
}

/**
 * Extract feature data for sorting
 */
function extractFeatureData(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter } = parseFrontmatter(content);

  // Extract ID from filename (e.g., p141 from p141_unified_rank_system.md)
  const filename = path.basename(filePath);
  const idMatch = filename.match(/^(p\d+)/);
  const id = idMatch ? idMatch[1] : filename;

  return {
    filePath,
    filename,
    id,
    priority: frontmatter.priority,
    sort_order: frontmatter.sort_order,
    status: frontmatter.status,
    rank: frontmatter.rank,
    frontmatter
  };
}

/**
 * Sort features using kanban's current logic
 */
function sortFeatures(features) {
  return features.sort((a, b) => {
    // Primary: sort_order (use 1000000 as fallback)
    const orderA = a.sort_order ?? 1000000;
    const orderB = b.sort_order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;

    // Secondary: status
    const statusA = STATUS_ORDER[a.status] ?? 99;
    const statusB = STATUS_ORDER[b.status] ?? 99;
    if (statusA !== statusB) return statusA - statusB;

    // Tertiary: priority (p0=0, p1=1, p2=2, p3=3, null=99)
    const priorityA = a.priority ? parseInt(a.priority.substring(1)) : 99;
    const priorityB = b.priority ? parseInt(b.priority.substring(1)) : 99;
    if (priorityA !== priorityB) return priorityA - priorityB;

    // Quaternary: id (alphabetical)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Migrate a single feature file
 */
function migrateFeature(featureData, newRank) {
  const { filePath, frontmatter, filename } = featureData;

  // Skip if already has rank field
  if (frontmatter.rank !== undefined) {
    if (VERBOSE) {
      console.log(`⏭️  ${filename}: Already has rank (${frontmatter.rank}) - skipping`);
    }
    return { skipped: true, reason: 'already-migrated' };
  }

  // Read original content
  const content = fs.readFileSync(filePath, 'utf8');
  const { body } = parseFrontmatter(content);

  // Create new frontmatter object
  const newFrontmatter = { ...frontmatter };

  // Add rank field
  newFrontmatter.rank = parseFloat(newRank.toFixed(1));

  // Remove old fields
  delete newFrontmatter.priority;
  delete newFrontmatter.sort_order;

  // Serialize new frontmatter
  const newFrontmatterText = serializeFrontmatter(newFrontmatter);
  const newContent = `---\n${newFrontmatterText}\n---${body}`;

  // Log changes
  if (VERBOSE) {
    const oldPriority = frontmatter.priority || 'none';
    const oldSortOrder = frontmatter.sort_order || 'none';
    console.log(`✏️  ${filename}:`);
    console.log(`    priority: ${oldPriority}, sort_order: ${oldSortOrder} → rank: ${newRank.toFixed(1)}`);
  }

  // Write to file (unless dry-run)
  if (!DRY_RUN) {
    // Atomic write: write to temp file, then rename
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, newContent, 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  return { skipped: false };
}

/**
 * Main migration function
 */
function main() {
  console.log('🔄 P141 Migration: priority/sort_order → rank');
  console.log('==============================================');

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN MODE: No files will be modified\n');
  }

  const startTime = Date.now();

  // Step 1: Find all feature files
  console.log('📁 Scanning feature directories...');
  const filePaths = findFeatureFiles();
  console.log(`   Found ${filePaths.length} feature files\n`);

  if (filePaths.length === 0) {
    console.error('❌ No feature files found. Exiting.');
    process.exit(1);
  }

  // Step 2: Extract feature data
  console.log('📊 Parsing feature frontmatter...');
  const features = [];
  const parseErrors = [];

  for (const filePath of filePaths) {
    try {
      features.push(extractFeatureData(filePath));
    } catch (error) {
      parseErrors.push({ filePath, error: error.message });
      console.error(`❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }

  console.log(`   Parsed ${features.length} features successfully`);
  if (parseErrors.length > 0) {
    console.log(`   ⚠️  ${parseErrors.length} parse errors (see above)\n`);
  } else {
    console.log('');
  }

  // Step 3: Sort features
  console.log('🔢 Sorting features by (sort_order, status, priority, id)...');
  const sortedFeatures = sortFeatures(features);

  if (VERBOSE) {
    console.log('\n   Sorted order (first 10):');
    sortedFeatures.slice(0, 10).forEach((f, idx) => {
      const priority = f.priority || 'none';
      const sortOrder = f.sort_order || 'none';
      console.log(`   ${idx + 1}. ${f.filename} (p=${priority}, so=${sortOrder}, s=${f.status})`);
    });
    console.log('');
  }

  // Step 4: Assign ranks and migrate
  console.log('✨ Assigning ranks and migrating features...\n');

  let nextRank = 1.0;
  let migrated = 0;
  let skipped = 0;
  const skipReasons = {};

  for (const feature of sortedFeatures) {
    const result = migrateFeature(feature, nextRank);

    if (result.skipped) {
      skipped++;
      skipReasons[result.reason] = (skipReasons[result.reason] || 0) + 1;
    } else {
      migrated++;
      nextRank += 1.0;
    }
  }

  // Step 5: Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n📈 Migration Summary');
  console.log('===================');
  console.log(`✅ Migrated: ${migrated} features`);
  console.log(`⏭️  Skipped: ${skipped} features`);

  if (skipped > 0) {
    Object.entries(skipReasons).forEach(([reason, count]) => {
      console.log(`   - ${reason}: ${count}`);
    });
  }

  console.log(`⏱️  Duration: ${duration}s`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN: No files were modified');
    console.log('   Run without --dry-run to execute migration');
  } else {
    console.log('\n✅ Migration complete!');
    console.log('   Next steps:');
    console.log('   1. Run validation: ./scripts/archive/migrations/20260212-post-migration-validation.sh');
    console.log('   2. Verify in kanban: npm run kanban');
    console.log('   3. Commit changes: git add features/ && git commit');
  }

  // Exit with error code if parse errors
  if (parseErrors.length > 0) {
    console.error(`\n⚠️  Warning: ${parseErrors.length} files had parse errors`);
    process.exit(1);
  }
}

// Run migration
main();
