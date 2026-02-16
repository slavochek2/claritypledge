#!/usr/bin/env node

/**
 * Add frontmatter to files that don't have any
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the audit report
const reportPath = path.join(__dirname, '..', 'frontmatter-audit-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

const VALID_WORKSTREAM = ['C1', 'C2', 'R1', 'E1', 'X1', 'foundation'];

// Infer workstream from file path or content
function inferWorkstream(filePath, content) {
  const fileName = path.basename(filePath);
  const fileContent = content.toLowerCase();

  // Check file location first
  if (filePath.includes('/archive/')) return 'foundation';
  if (filePath.includes('/done/')) return 'foundation';
  if (filePath.includes('/drafts/')) return 'foundation';
  if (filePath.includes('/research/')) return 'foundation';
  if (filePath.includes('/uat/')) return 'C2';

  // Pattern matching in filename and content
  if (fileName.includes('consent') || fileContent.includes('consent')) return 'C1';
  if (fileName.includes('event') || fileName.includes('live') || fileContent.includes('event') || fileContent.includes('/live')) return 'C2';
  if (fileName.includes('recognition') || fileName.includes('badge') || fileContent.includes('recognition')) return 'R1';
  if (fileName.includes('expansion') || fileName.includes('growth') || fileContent.includes('expansion')) return 'E1';
  if (fileName.includes('experiment') || fileName.includes('prototype') || fileContent.includes('experiment')) return 'X1';

  return 'foundation'; // Default fallback
}

// Infer type from filename
function inferType(filePath, content) {
  const fileName = path.basename(filePath);

  if (fileName.startsWith('b') && fileName.match(/^b\d+/)) return 'bug';
  if (fileName.startsWith('p') && fileName.match(/^p\d+/)) return 'story';
  if (fileName.includes('DECISION') || fileName.includes('decision')) return 'comment';

  // Check content for decision/comment markers
  if (content.toLowerCase().includes('decision:') || content.toLowerCase().includes('# decision')) return 'comment';

  return 'task'; // Default
}

// Get file creation date
function getFileCreationDate(filePath) {
  const stats = fs.statSync(filePath);
  const date = stats.birthtime || stats.mtime;
  return date.toISOString().split('T')[0];
}

// Find max rank
function findMaxRank() {
  const featuresDir = path.join(__dirname, '..', 'features');
  const files = findMarkdownFiles(featuresDir);
  let maxRank = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);

    if (match) {
      const rankMatch = match[1].match(/^rank:\s*(.+)$/m);
      if (rankMatch) {
        const rank = parseFloat(rankMatch[1]);
        if (!isNaN(rank) && rank > maxRank) {
          maxRank = rank;
        }
      }
    }
  }

  return maxRank;
}

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

// Create frontmatter
function createFrontmatter(filePath, content, rank) {
  const type = inferType(filePath, content);
  const workstream = inferWorkstream(filePath, content);

  // Infer status from path
  let status = 'backlog';
  if (filePath.includes('/done/')) status = 'done';
  else if (filePath.includes('/drafts/')) status = 'draft';
  else if (filePath.includes('/archive/')) status = 'rejected';
  else if (filePath.includes('/research/')) status = 'done';
  else if (filePath.includes('/uat/')) status = 'done';

  const fm = {
    status,
    type,
    rank,
    workstream,
    tags: []
  };

  // Bug-specific fields
  if (type === 'bug') {
    fm.severity = 'medium';
    fm.date_reported = getFileCreationDate(filePath);
    if (status === 'done') {
      fm.date_resolved = '';
    }
  }

  // Serialize
  const lines = ['---'];
  lines.push(`status: ${fm.status}`);
  lines.push(`type: ${fm.type}`);
  lines.push(`rank: ${fm.rank}`);
  lines.push(`workstream: ${fm.workstream}`);

  if (type === 'bug') {
    lines.push(`severity: ${fm.severity}`);
    lines.push(`date_reported: ${fm.date_reported}`);
    if (fm.date_resolved !== undefined) {
      lines.push(`date_resolved: ${fm.date_resolved}`);
    }
  }

  lines.push('tags: []');
  lines.push('---');

  return lines.join('\n');
}

// Main execution
function main() {
  const filesNeedingFrontmatter = report.needsManualReview.filter(
    item => item.reason === 'No frontmatter found'
  );

  console.log(`Processing ${filesNeedingFrontmatter.length} files without frontmatter...`);

  let maxRank = findMaxRank();
  console.log(`Starting max rank: ${maxRank}`);

  const results = {
    processed: [],
    errors: []
  };

  for (const item of filesNeedingFrontmatter) {
    try {
      const filePath = item.file;
      const content = fs.readFileSync(filePath, 'utf-8');

      maxRank += 1.0;
      const frontmatter = createFrontmatter(filePath, content, maxRank);

      // Add frontmatter at the beginning
      const newContent = frontmatter + '\n\n' + content;
      fs.writeFileSync(filePath, newContent, 'utf-8');

      results.processed.push({
        file: filePath,
        rank: maxRank,
        status: content.includes('/done/') ? 'done' :
                content.includes('/drafts/') ? 'draft' :
                content.includes('/archive/') ? 'rejected' : 'backlog',
        type: inferType(filePath, content),
        workstream: inferWorkstream(filePath, content)
      });
    } catch (err) {
      results.errors.push({
        file: item.file,
        error: err.message
      });
    }
  }

  console.log('\n=== ADD FRONTMATTER REPORT ===\n');
  console.log(`Files processed: ${results.processed.length}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.processed.length > 0) {
    console.log('\n--- Processed Files ---\n');
    for (const item of results.processed) {
      console.log(`${item.file}`);
      console.log(`  rank: ${item.rank}, status: ${item.status}, type: ${item.type}, workstream: ${item.workstream}`);
    }
  }

  if (results.errors.length > 0) {
    console.log('\n--- Errors ---\n');
    for (const item of results.errors) {
      console.log(`${item.file}: ${item.error}`);
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '..', 'add-frontmatter-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
}

main();
