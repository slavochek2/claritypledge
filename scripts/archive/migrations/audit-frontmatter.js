#!/usr/bin/env node

/**
 * Audit and fix frontmatter for all feature files
 * Ensures kanban visibility by validating required fields
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Valid enum values
const VALID_STATUS = ['backlog', 'week', 'today', 'in-progress', 'blocked', 'done', 'draft', 'rejected'];
const VALID_TYPE = ['story', 'bug', 'task', 'comment'];
const VALID_WORKSTREAM = ['C1', 'C2', 'R1', 'E1', 'X1', 'foundation'];
const VALID_SEVERITY = ['low', 'medium', 'high', 'critical'];

// Track changes
const report = {
  totalFiles: 0,
  modifiedFiles: [],
  needsManualReview: [],
  errors: []
};

// Find all markdown files recursively
function findMarkdownFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Parse frontmatter from file content
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    // Parse arrays
    if (value === '[]') {
      frontmatter[key] = [];
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value.slice(1, -1).split(',').map(v => v.trim());
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, fullMatch: match[0] };
}

// Serialize frontmatter back to YAML
function serializeFrontmatter(fm) {
  const lines = ['---'];

  // Always include status first
  if (fm.status) lines.push(`status: ${fm.status}`);

  // Then type
  if (fm.type) lines.push(`type: ${fm.type}`);

  // Then rank
  if (fm.rank !== undefined) lines.push(`rank: ${fm.rank}`);

  // Then workstream
  if (fm.workstream) lines.push(`workstream: ${fm.workstream}`);

  // Bug-specific fields
  if (fm.type === 'bug') {
    if (fm.severity) lines.push(`severity: ${fm.severity}`);
    if (fm.date_reported) lines.push(`date_reported: ${fm.date_reported}`);
    if (fm.date_resolved) lines.push(`date_resolved: ${fm.date_resolved}`);
    if (fm.root_cause) lines.push(`root_cause: ${fm.root_cause}`);
  }

  // Tags always last
  if (fm.tags !== undefined) {
    lines.push(Array.isArray(fm.tags) && fm.tags.length > 0
      ? `tags: [${fm.tags.join(', ')}]`
      : 'tags: []');
  }

  lines.push('---');
  return lines.join('\n');
}

// Infer workstream from file path or content
function inferWorkstream(filePath, content) {
  const fileName = path.basename(filePath);
  const fileContent = content.toLowerCase();

  // Check file location
  if (filePath.includes('/archive/')) return 'foundation';
  if (filePath.includes('/done/')) return 'foundation';
  if (filePath.includes('/drafts/')) return 'foundation';

  // Pattern matching in filename and content
  if (fileName.includes('consent') || fileContent.includes('consent')) return 'C1';
  if (fileName.includes('event') || fileContent.includes('event')) return 'C2';
  if (fileName.includes('recognition') || fileName.includes('badge')) return 'R1';
  if (fileName.includes('expansion') || fileName.includes('growth')) return 'E1';
  if (fileName.includes('experiment') || fileName.includes('prototype')) return 'X1';

  return 'foundation'; // Default fallback
}

// Get file creation date
function getFileCreationDate(filePath) {
  const stats = fs.statSync(filePath);
  const date = stats.birthtime || stats.mtime;
  return date.toISOString().split('T')[0];
}

// Find max rank across all files
function findMaxRank(featuresDir) {
  const files = findMarkdownFiles(featuresDir);
  let maxRank = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const parsed = parseFrontmatter(content);

    if (parsed && parsed.frontmatter.rank) {
      const rank = parseFloat(parsed.frontmatter.rank);
      if (!isNaN(rank) && rank > maxRank) {
        maxRank = rank;
      }
    }
  }

  return maxRank;
}

// Audit and fix a single file
function auditFile(filePath, maxRank) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    report.needsManualReview.push({
      file: filePath,
      reason: 'No frontmatter found'
    });
    return;
  }

  const { frontmatter: fm, fullMatch } = parsed;
  const changes = [];
  let modified = false;

  // Check required fields
  if (!fm.status || !VALID_STATUS.includes(fm.status)) {
    const oldStatus = fm.status;
    // Infer from path
    if (filePath.includes('/done/')) fm.status = 'done';
    else if (filePath.includes('/drafts/')) fm.status = 'draft';
    else if (filePath.includes('/archive/')) fm.status = 'rejected';
    else fm.status = 'backlog';
    changes.push(`status: ${oldStatus || 'missing'} → ${fm.status}`);
    modified = true;
  }

  if (!fm.type || !VALID_TYPE.includes(fm.type)) {
    const oldType = fm.type;
    // Infer from filename
    if (path.basename(filePath).startsWith('b')) fm.type = 'bug';
    else if (path.basename(filePath).startsWith('p')) fm.type = 'story';
    else fm.type = 'task';
    changes.push(`type: ${oldType || 'missing'} → ${fm.type}`);
    modified = true;
  }

  if (fm.rank === undefined || fm.rank === null || fm.rank === '') {
    maxRank += 1.0;
    fm.rank = maxRank;
    changes.push(`rank: missing → ${fm.rank}`);
    modified = true;
  } else {
    const rankNum = parseFloat(fm.rank);
    if (isNaN(rankNum)) {
      maxRank += 1.0;
      fm.rank = maxRank;
      changes.push(`rank: invalid → ${fm.rank}`);
      modified = true;
    }
  }

  if (!fm.workstream || !VALID_WORKSTREAM.includes(fm.workstream)) {
    const oldWorkstream = fm.workstream;
    fm.workstream = inferWorkstream(filePath, content);
    changes.push(`workstream: ${oldWorkstream || 'missing'} → ${fm.workstream}`);
    modified = true;
  }

  if (fm.tags === undefined) {
    fm.tags = [];
    changes.push('tags: missing → []');
    modified = true;
  }

  // Bug-specific validation
  if (fm.type === 'bug') {
    if (!fm.severity || !VALID_SEVERITY.includes(fm.severity)) {
      const oldSeverity = fm.severity;
      fm.severity = 'medium'; // Default
      changes.push(`severity: ${oldSeverity || 'missing'} → ${fm.severity}`);
      modified = true;
    }

    if (!fm.date_reported) {
      fm.date_reported = getFileCreationDate(filePath);
      changes.push(`date_reported: missing → ${fm.date_reported}`);
      modified = true;
    }

    if (fm.status === 'done' && !fm.date_resolved) {
      fm.date_resolved = ''; // User should fill this
      changes.push('date_resolved: missing (needs manual entry)');
      modified = true;
    }
  }

  // Write back if modified
  if (modified) {
    const newFrontmatter = serializeFrontmatter(fm);
    const newContent = content.replace(fullMatch, newFrontmatter);
    fs.writeFileSync(filePath, newContent, 'utf-8');

    report.modifiedFiles.push({
      file: filePath,
      changes
    });
  }

  return maxRank;
}

// Main execution
function main() {
  const featuresDir = path.join(__dirname, '..', 'features');

  console.log('Scanning features directory...');
  const files = findMarkdownFiles(featuresDir);
  report.totalFiles = files.length;

  console.log(`Found ${files.length} markdown files`);
  console.log('Finding max rank...');
  let maxRank = findMaxRank(featuresDir);
  console.log(`Current max rank: ${maxRank}`);

  console.log('Auditing files...');
  for (const file of files) {
    try {
      const newMaxRank = auditFile(file, maxRank);
      if (newMaxRank) maxRank = newMaxRank;
    } catch (err) {
      report.errors.push({
        file,
        error: err.message
      });
    }
  }

  // Print report
  console.log('\n=== FRONTMATTER AUDIT REPORT ===\n');
  console.log(`Total files scanned: ${report.totalFiles}`);
  console.log(`Files modified: ${report.modifiedFiles.length}`);
  console.log(`Files needing manual review: ${report.needsManualReview.length}`);
  console.log(`Errors: ${report.errors.length}`);

  if (report.modifiedFiles.length > 0) {
    console.log('\n--- Modified Files ---\n');
    for (const item of report.modifiedFiles) {
      console.log(`${item.file}`);
      for (const change of item.changes) {
        console.log(`  - ${change}`);
      }
      console.log();
    }
  }

  if (report.needsManualReview.length > 0) {
    console.log('\n--- Needs Manual Review ---\n');
    for (const item of report.needsManualReview) {
      console.log(`${item.file}: ${item.reason}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('\n--- Errors ---\n');
    for (const item of report.errors) {
      console.log(`${item.file}: ${item.error}`);
    }
  }

  // Write detailed report to file
  const reportPath = path.join(__dirname, '..', 'frontmatter-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

main();
