#!/usr/bin/env node

/**
 * Validation Script: Check bidirectional frontmatter link consistency
 *
 * This script validates that frontmatter references in the information
 * architecture are bidirectional and consistent.
 *
 * Validates:
 *   - Track → Hypothesis: tests: [h-stories] ↔ track: C1
 *   - Hypothesis → Experiment: tested_by: [e-pilot] ↔ tests: [h-stories]
 *   - Experiment → Outcome: measures: [o-usage] ↔ measured_by: [e-pilot]
 *   - Track → Features: builds: [p126] (one-way, just checks existence)
 *
 * Usage:
 *   ./scripts/validate-doc-links.cjs              # Run validation
 *   ./scripts/validate-doc-links.cjs --verbose    # Show all links
 *   ./scripts/validate-doc-links.cjs --help       # Show usage
 *
 * Exit codes:
 *   0 - All links valid (or no links found yet)
 *   1 - Broken links found
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Parse command-line flags
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const SHOW_HELP = args.includes('--help') || args.includes('-h');

// Colors
const RED = '\033[0;31m';
const GREEN = '\033[0;32m';
const YELLOW = '\033[1;33m';
const BLUE = '\033[0;34m';
const NC = '\033[0m'; // No Color

// Directory paths
const DIRS = {
  tracks: path.join(__dirname, '..', 'docs', 'milestones'),
  hypotheses: path.join(__dirname, '..', 'docs', 'milestones'),
  experiments: path.join(__dirname, '..', 'docs', 'milestones'),
  outcomes: path.join(__dirname, '..', 'docs', 'milestones'),
  features: path.join(__dirname, '..', 'features'),
  featuresDone: path.join(__dirname, '..', 'features', 'done')
};

// Future tracks that haven't been implemented yet (expected placeholders)
// These will generate warnings instead of errors
const FUTURE_TRACKS = new Set([
  'c2', 'c3',           // Coaching track phases 2-3
  'e1', 'e2',           // Enhancement track phases 1-2
  'r2', 'r3',           // Recognition track phases 2-3
  'x1', 'x2', 'x3'      // Exploratory tracks
]);

// Show help
if (SHOW_HELP) {
  console.log(`
${BLUE}Validate Doc Links${NC} - Check bidirectional frontmatter link consistency

${YELLOW}Usage:${NC}
  ./scripts/validate-doc-links.cjs              Run validation
  ./scripts/validate-doc-links.cjs --verbose    Show all links (valid + broken)
  ./scripts/validate-doc-links.cjs --help       Show this message

${YELLOW}What it checks:${NC}
  Track → Hypothesis:    tests: [h-stories] ↔ track: C1
  Hypothesis → Experiment: tested_by: [e-pilot] ↔ tests: [h-stories]
  Experiment → Outcome:  measures: [o-usage] ↔ measured_by: [e-pilot]
  Track → Features:      builds: [p126] (one-way, checks existence only)

${YELLOW}Exit codes:${NC}
  0 - All links valid (or no links found yet)
  1 - Broken links found
`);
  process.exit(0);
}

/**
 * Parse frontmatter from markdown file
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  try {
    const frontmatterText = match[1];
    const frontmatter = yaml.load(frontmatterText);
    return frontmatter;
  } catch (error) {
    return null;
  }
}

/**
 * Get all markdown files in a directory
 */
function getMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .map(file => path.join(dir, file));
}

/**
 * Extract ID from filename
 * Examples:
 *   c1-stories-live-events.md → c1
 *   h-stories.md → h-stories
 *   e-pilot.md → e-pilot
 *   p126_create_story.md → p126
 */
function extractId(filename) {
  const base = path.basename(filename, '.md');

  // For features: extract p-number
  if (base.match(/^p\d+/)) {
    const match = base.match(/^(p\d+)/);
    return match ? match[1] : base;
  }

  // For tracks: extract track code (c1, r1, etc)
  if (base.match(/^[a-z]\d+-/)) {
    const match = base.match(/^([a-z]\d+)-/);
    return match ? match[1].toUpperCase() : base;
  }

  // For hypotheses/experiments/outcomes: use full name
  return base;
}

/**
 * Read and parse a document
 */
function readDoc(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const id = extractId(filePath);
    const filename = path.basename(filePath);

    return {
      filePath,
      filename,
      id,
      frontmatter: frontmatter || {}
    };
  } catch (error) {
    return null;
  }
}

/**
 * Find a document by ID in a directory
 */
function findDocById(id, dir) {
  const files = getMarkdownFiles(dir);

  for (const file of files) {
    const docId = extractId(file);
    if (docId.toLowerCase() === id.toLowerCase()) {
      return readDoc(file);
    }
  }

  return null;
}

/**
 * Ensure value is array (handle single values)
 */
function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/**
 * Check if file exists in features directories
 */
function featureExists(pNumber) {
  const featuresDir = DIRS.features;
  const doneDir = DIRS.featuresDone;

  // Check features/
  if (fs.existsSync(featuresDir)) {
    const files = fs.readdirSync(featuresDir);
    if (files.some(f => f.startsWith(pNumber) && f.endsWith('.md'))) {
      return true;
    }
  }

  // Check features/done/
  if (fs.existsSync(doneDir)) {
    const files = fs.readdirSync(doneDir);
    if (files.some(f => f.startsWith(pNumber) && f.endsWith('.md'))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a missing reference is for a future track (expected placeholder)
 */
function isFutureTrack(id) {
  // Check if the ID starts with a future track prefix
  const normalizedId = id.toLowerCase();

  // For track IDs (c2, e1, etc.)
  if (FUTURE_TRACKS.has(normalizedId)) {
    return true;
  }

  // For hypothesis/experiment/outcome IDs that reference future tracks
  // e.g., h-workshops-solve-pricing (C2), e-pricing-test (E1)
  // We check if any part of the ID suggests it's for a future track
  for (const futureTrack of FUTURE_TRACKS) {
    if (normalizedId.includes(futureTrack)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate links and collect results
 */
function validateLinks() {
  const results = {
    valid: [],
    broken: [],
    futureTrackWarnings: [],
    warnings: []
  };

  // Check if new structure exists
  const hasNewStructure = fs.existsSync(DIRS.tracks) ||
                          fs.existsSync(DIRS.hypotheses) ||
                          fs.existsSync(DIRS.experiments) ||
                          fs.existsSync(DIRS.outcomes);

  if (!hasNewStructure) {
    results.warnings.push('No new structure found (tracks/hypotheses/experiments/outcomes)');
    results.warnings.push('This is expected before P142 migration.');
    return results;
  }

  // Load all documents
  const tracks = getMarkdownFiles(DIRS.tracks).map(readDoc).filter(Boolean);
  const hypotheses = getMarkdownFiles(DIRS.hypotheses).map(readDoc).filter(Boolean);
  const experiments = getMarkdownFiles(DIRS.experiments).map(readDoc).filter(Boolean);
  const outcomes = getMarkdownFiles(DIRS.outcomes).map(readDoc).filter(Boolean);

  // Build lookup maps
  const hypothesisMap = new Map(hypotheses.map(h => [h.id.toLowerCase(), h]));
  const experimentMap = new Map(experiments.map(e => [e.id.toLowerCase(), e]));
  const outcomeMap = new Map(outcomes.map(o => [o.id.toLowerCase(), o]));
  const trackMap = new Map(tracks.map(t => [t.id.toLowerCase(), t]));

  // Validate Track → Hypothesis (tests field)
  for (const track of tracks) {
    const testsArray = ensureArray(track.frontmatter.tests);

    for (const hypId of testsArray) {
      const hypothesis = hypothesisMap.get(hypId.toLowerCase());

      if (!hypothesis) {
        const brokenLink = {
          source: track.filename,
          field: 'tests',
          target: hypId,
          reason: `${hypId}.md doesn't exist in hypotheses/`
        };

        // Check if this is a future track placeholder
        if (isFutureTrack(hypId) || isFutureTrack(track.id)) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        // Check backlink
        const hypTrack = hypothesis.frontmatter.track;
        if (!hypTrack || hypTrack.toLowerCase() !== track.id.toLowerCase()) {
          results.broken.push({
            source: track.filename,
            field: 'tests',
            target: hypId,
            reason: `${hypothesis.filename} has track: ${hypTrack || '(none)'}, expected: ${track.id}`
          });
        } else {
          results.valid.push({
            source: track.filename,
            field: 'tests',
            target: hypId,
            status: 'valid'
          });
        }
      }
    }

    // Validate Track → Features (builds field)
    const buildsArray = ensureArray(track.frontmatter.builds);

    for (const pNumber of buildsArray) {
      if (!featureExists(pNumber)) {
        const brokenLink = {
          source: track.filename,
          field: 'builds',
          target: pNumber,
          reason: `${pNumber}*.md doesn't exist in features/`
        };

        // Check if this is a future track
        if (isFutureTrack(track.id)) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        results.valid.push({
          source: track.filename,
          field: 'builds',
          target: pNumber,
          status: 'valid (one-way)'
        });
      }
    }

    // Validate Track → Outcomes (measures field)
    const measuresArray = ensureArray(track.frontmatter.measures);

    for (const outcomeId of measuresArray) {
      const outcome = outcomeMap.get(outcomeId.toLowerCase());

      if (!outcome) {
        const brokenLink = {
          source: track.filename,
          field: 'measures',
          target: outcomeId,
          reason: `${outcomeId}.md doesn't exist in outcomes/`
        };

        // Check if this is a future track
        if (isFutureTrack(outcomeId) || isFutureTrack(track.id)) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        // Check backlink
        const outcomeTrack = outcome.frontmatter.track;
        if (!outcomeTrack || outcomeTrack.toLowerCase() !== track.id.toLowerCase()) {
          results.broken.push({
            source: track.filename,
            field: 'measures',
            target: outcomeId,
            reason: `${outcome.filename} has track: ${outcomeTrack || '(none)'}, expected: ${track.id}`
          });
        } else {
          results.valid.push({
            source: track.filename,
            field: 'measures',
            target: outcomeId,
            status: 'valid'
          });
        }
      }
    }
  }

  // Validate Hypothesis → Experiment (tested_by field)
  for (const hypothesis of hypotheses) {
    const testedByArray = ensureArray(hypothesis.frontmatter.tested_by);

    for (const expId of testedByArray) {
      const experiment = experimentMap.get(expId.toLowerCase());

      if (!experiment) {
        const brokenLink = {
          source: hypothesis.filename,
          field: 'tested_by',
          target: expId,
          reason: `${expId}.md doesn't exist in experiments/`
        };

        // Check if this is a future track
        const hypTrack = hypothesis.frontmatter.track;
        if (isFutureTrack(expId) || (hypTrack && isFutureTrack(hypTrack))) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        // Check backlink
        const expTests = ensureArray(experiment.frontmatter.tests);
        if (!expTests.some(h => h.toLowerCase() === hypothesis.id.toLowerCase())) {
          results.broken.push({
            source: hypothesis.filename,
            field: 'tested_by',
            target: expId,
            reason: `${experiment.filename} doesn't list ${hypothesis.id} in tests: []`
          });
        } else {
          results.valid.push({
            source: hypothesis.filename,
            field: 'tested_by',
            target: expId,
            status: 'valid'
          });
        }
      }
    }

    // Validate Hypothesis → Outcomes (supports field)
    const supportsArray = ensureArray(hypothesis.frontmatter.supports);

    for (const outcomeId of supportsArray) {
      const outcome = outcomeMap.get(outcomeId.toLowerCase());

      if (!outcome) {
        const brokenLink = {
          source: hypothesis.filename,
          field: 'supports',
          target: outcomeId,
          reason: `${outcomeId}.md doesn't exist in outcomes/`
        };

        // Check if this is a future track
        const hypTrack = hypothesis.frontmatter.track;
        if (isFutureTrack(outcomeId) || (hypTrack && isFutureTrack(hypTrack))) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        // Note: we don't check backlink from outcome to hypothesis (not in schema)
        results.valid.push({
          source: hypothesis.filename,
          field: 'supports',
          target: outcomeId,
          status: 'valid (one-way)'
        });
      }
    }
  }

  // Validate Experiment → Outcome (measures field)
  for (const experiment of experiments) {
    const measuresArray = ensureArray(experiment.frontmatter.measures);

    for (const outcomeId of measuresArray) {
      const outcome = outcomeMap.get(outcomeId.toLowerCase());

      if (!outcome) {
        const brokenLink = {
          source: experiment.filename,
          field: 'measures',
          target: outcomeId,
          reason: `${outcomeId}.md doesn't exist in outcomes/`
        };

        // Check if this is a future track
        const expTests = ensureArray(experiment.frontmatter.tests);
        const belongsToFutureTrack = expTests.some(hypId => {
          const hyp = hypotheses.find(h => h.id.toLowerCase() === hypId.toLowerCase());
          return hyp && hyp.frontmatter.track && isFutureTrack(hyp.frontmatter.track);
        });

        if (isFutureTrack(outcomeId) || belongsToFutureTrack) {
          results.futureTrackWarnings.push(brokenLink);
        } else {
          results.broken.push(brokenLink);
        }
      } else {
        // Check backlink
        const measuredByArray = ensureArray(outcome.frontmatter.measured_by);
        if (!measuredByArray.some(e => e.toLowerCase() === experiment.id.toLowerCase())) {
          results.broken.push({
            source: experiment.filename,
            field: 'measures',
            target: outcomeId,
            reason: `${outcome.filename} doesn't list ${experiment.id} in measured_by: []`
          });
        } else {
          results.valid.push({
            source: experiment.filename,
            field: 'measures',
            target: outcomeId,
            status: 'valid'
          });
        }
      }
    }
  }

  return results;
}

/**
 * Main validation function
 */
function main() {
  console.log(`${BLUE}=== Validating Doc Links ===${NC}\n`);

  const startTime = Date.now();
  const results = validateLinks();

  // Show warnings
  if (results.warnings.length > 0) {
    console.log(`${YELLOW}⚠ ${results.warnings[0]}${NC}`);
    if (results.warnings.length > 1) {
      results.warnings.slice(1).forEach(w => console.log(`  ${w}`));
    }
    console.log('');
    console.log(`${GREEN}✓ No validation errors (structure not migrated yet)${NC}`);
    process.exit(0);
  }

  // Show valid links (if verbose)
  if (VERBOSE && results.valid.length > 0) {
    console.log(`${GREEN}Valid Links:${NC}\n`);

    // Group by source
    const bySource = {};
    results.valid.forEach(link => {
      if (!bySource[link.source]) {
        bySource[link.source] = [];
      }
      bySource[link.source].push(link);
    });

    Object.entries(bySource).forEach(([source, links]) => {
      console.log(`${GREEN}✓${NC} ${source}`);
      links.forEach(link => {
        console.log(`  → ${link.field}: [${link.target}] ${GREEN}✓${NC} (${link.status})`);
      });
      console.log('');
    });
  }

  // Show future track warnings (expected placeholders)
  if (results.futureTrackWarnings.length > 0) {
    console.log(`${YELLOW}Future Track Placeholders (Expected):${NC}\n`);

    // Group by source
    const bySource = {};
    results.futureTrackWarnings.forEach(link => {
      if (!bySource[link.source]) {
        bySource[link.source] = [];
      }
      bySource[link.source].push(link);
    });

    Object.entries(bySource).forEach(([source, links]) => {
      console.log(`${YELLOW}⚠${NC} ${source}`);
      links.forEach(link => {
        console.log(`  → ${link.field}: [${link.target}] ${YELLOW}⚠${NC} (${link.reason})`);
      });
      console.log('');
    });
  }

  // Show broken links (actual errors)
  if (results.broken.length > 0) {
    console.log(`${RED}Broken Links (Errors):${NC}\n`);

    // Group by source
    const bySource = {};
    results.broken.forEach(link => {
      if (!bySource[link.source]) {
        bySource[link.source] = [];
      }
      bySource[link.source].push(link);
    });

    Object.entries(bySource).forEach(([source, links]) => {
      console.log(`${RED}✗${NC} ${source}`);
      links.forEach(link => {
        console.log(`  → ${link.field}: [${link.target}] ${RED}✗${NC} (${link.reason})`);
      });
      console.log('');
    });
  }

  // Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`${BLUE}=== Summary ===${NC}`);
  console.log(`${GREEN}✓ Valid links: ${results.valid.length}${NC}`);

  if (results.futureTrackWarnings.length > 0) {
    console.log(`${YELLOW}⚠ Future track placeholders: ${results.futureTrackWarnings.length}${NC} (expected)`);
  }

  if (results.broken.length > 0) {
    console.log(`${RED}✗ Broken links: ${results.broken.length}${NC}`);
  } else {
    console.log(`${GREEN}✓ Broken links: 0${NC}`);
  }

  console.log(`⏱️  Duration: ${duration}s`);
  console.log('');

  // Exit with error if broken links (future track warnings are OK)
  if (results.broken.length > 0) {
    console.log(`${RED}✗ Validation failed - fix broken links above${NC}`);
    console.log(`${YELLOW}Note: Future track placeholders are expected and don't cause failure${NC}`);
    process.exit(1);
  } else if (results.valid.length === 0 && results.futureTrackWarnings.length === 0) {
    console.log(`${YELLOW}⚠ No bidirectional links found yet${NC}`);
    console.log('  This is expected if P142 migration hasn\'t started.');
    process.exit(0);
  } else {
    console.log(`${GREEN}✓ All active track links valid!${NC}`);
    if (results.futureTrackWarnings.length > 0) {
      console.log(`${YELLOW}⚠ ${results.futureTrackWarnings.length} future track placeholder(s) - create these tracks when ready${NC}`);
    }
    process.exit(0);
  }
}

// Run validation
main();
