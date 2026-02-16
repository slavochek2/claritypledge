#!/usr/bin/env node

/**
 * Fix status field for files in /done/ directories
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find all markdown files in /done/ directories
function findDoneFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findDoneFiles(fullPath));
    } else if (item.endsWith('.md') && fullPath.includes('/done/')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Parse and update frontmatter
function fixStatus(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return null; // No frontmatter
  }

  // Check current status
  const statusMatch = match[1].match(/^status:\s*(.+)$/m);
  if (!statusMatch) {
    return null; // No status field
  }

  const currentStatus = statusMatch[1].trim();

  // Only fix if status is not already 'done' or 'rejected'
  if (currentStatus === 'done' || currentStatus === 'rejected') {
    return null; // Already correct
  }

  // Update status to 'done'
  const newFrontmatter = match[0].replace(
    /^status:\s*.+$/m,
    'status: done'
  );

  const newContent = content.replace(match[0], newFrontmatter);
  fs.writeFileSync(filePath, newContent, 'utf-8');

  return { oldStatus: currentStatus, newStatus: 'done' };
}

// Main execution
function main() {
  const featuresDir = path.join(__dirname, '..', 'features');
  const doneFiles = findDoneFiles(featuresDir);

  console.log(`Found ${doneFiles.length} files in /done/ directories`);

  const results = {
    fixed: [],
    alreadyCorrect: 0,
    noFrontmatter: 0
  };

  for (const file of doneFiles) {
    const result = fixStatus(file);

    if (result === null) {
      // Check why
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.match(/^---/)) {
        results.noFrontmatter++;
      } else {
        results.alreadyCorrect++;
      }
    } else {
      results.fixed.push({ file, ...result });
    }
  }

  console.log('\n=== FIX DONE STATUS REPORT ===\n');
  console.log(`Files fixed: ${results.fixed.length}`);
  console.log(`Already correct: ${results.alreadyCorrect}`);
  console.log(`No frontmatter: ${results.noFrontmatter}`);

  if (results.fixed.length > 0) {
    console.log('\n--- Fixed Files ---\n');
    for (const item of results.fixed) {
      console.log(`${item.file}`);
      console.log(`  ${item.oldStatus} → ${item.newStatus}`);
    }
  }
}

main();
