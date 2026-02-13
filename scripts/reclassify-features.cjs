#!/usr/bin/env node

/**
 * Reclassify Features: Update milestone frontmatter from old naming to new track structure
 *
 * Old → New mapping:
 * M1 → C1, M2 → C2, M3 → C3
 * M6/MA → R1, MB → R2, MC → R3
 * M4/M5 → E1, E2
 * M7-M12 → X1, X2, X3
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Mapping table (old milestone → new track)
const MAPPING = {
  // Coaching track
  'M1': 'C1',
  'M2': 'C2',
  'M3': 'C3',

  // Recognition track
  'M6': 'R1',
  'MA': 'R1',  // MA was essay writing
  'MB': 'R2',
  'MC': 'R3',

  // Enhancement track
  'M4': 'E1',
  'M5': 'E2',

  // Exploratory track
  'M7': 'X1',
  'M8': 'X1',  // Merged into X1
  'M9': 'X1',  // Merged into X1
  'M10': 'X2',
  'M11': 'X3',
  'M12': 'X3',  // Merged into X3
};

function updateFeatureFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    console.log(`⚠️  No frontmatter found: ${filePath}`);
    return { updated: false };
  }

  const frontmatter = frontmatterMatch[1];
  const milestoneMatch = frontmatter.match(/^milestone:\s*(.+)$/m);

  if (!milestoneMatch) {
    console.log(`⚠️  No milestone field: ${filePath}`);
    return { updated: false };
  }

  const oldMilestone = milestoneMatch[1].trim();
  const newMilestone = MAPPING[oldMilestone];

  if (!newMilestone) {
    // Already correct format (C1, R1, etc.) or foundation
    if (oldMilestone.match(/^[CREXV]\d+$/) || oldMilestone === 'foundation') {
      return { updated: false, alreadyCorrect: true };
    }
    console.log(`⚠️  No mapping for: ${oldMilestone} in ${filePath}`);
    return { updated: false, unmapped: oldMilestone };
  }

  // Replace milestone value
  const updatedContent = content.replace(
    new RegExp(`^milestone:\\s*${oldMilestone}$`, 'm'),
    `milestone: ${newMilestone}`
  );

  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`✅ ${oldMilestone} → ${newMilestone}: ${path.basename(filePath)}`);

  return { updated: true, old: oldMilestone, new: newMilestone };
}

function main() {
  const featureFiles = glob.sync('features/**/*.md', {
    ignore: ['**/node_modules/**']
  });

  const stats = {
    updated: 0,
    alreadyCorrect: 0,
    noFrontmatter: 0,
    noMilestone: 0,
    unmapped: []
  };

  console.log(`\n🔍 Found ${featureFiles.length} feature files\n`);

  featureFiles.forEach(file => {
    const result = updateFeatureFrontmatter(file);

    if (result.updated) {
      stats.updated++;
    } else if (result.alreadyCorrect) {
      stats.alreadyCorrect++;
    } else if (result.unmapped) {
      stats.unmapped.push({ file, value: result.unmapped });
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Already correct: ${stats.alreadyCorrect}`);
  console.log(`   Unmapped values: ${stats.unmapped.length}`);

  if (stats.unmapped.length > 0) {
    console.log(`\n⚠️  Unmapped milestone values:`);
    stats.unmapped.forEach(({ file, value }) => {
      console.log(`   ${value} in ${path.basename(file)}`);
    });
  }

  console.log(`\n✅ Reclassification complete!\n`);
}

main();
