/**
 * Generate PWA icons from SVG favicon
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Read the SVG
const svgPath = join(projectRoot, 'public/clarity-favicon.svg');
const svgBuffer = readFileSync(svgPath);

// Ensure icons directory exists
const iconsDir = join(projectRoot, 'public/icons');
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// Icon configurations
const icons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  // Maskable icons need extra padding (safe zone is 80% of icon)
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

// Also generate the social sharing icon
const rootIcons = [
  { name: 'clarity-pledge-icon.png', size: 512 },
];

async function generateIcon({ name, size, maskable = false }, outputDir) {
  const outputPath = join(outputDir, name);

  if (maskable) {
    // Maskable icons: render SVG smaller and center it on white background
    // Safe zone is 80% of the icon, so we render at 80% and pad
    const innerSize = Math.round(size * 0.8);
    const padding = Math.round((size - innerSize) / 2);

    const svgResized = await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: '#3b82f6' // Blue background for maskable
      }
    })
      .composite([{ input: svgResized, left: padding, top: padding }])
      .png()
      .toFile(outputPath);
  } else {
    // Regular icons: just resize the SVG
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
  }

  console.log(`Generated: ${outputPath}`);
}

async function main() {
  console.log('Generating PWA icons from:', svgPath);

  // Generate icons in /public/icons/
  for (const icon of icons) {
    await generateIcon(icon, iconsDir);
  }

  // Generate icons in /public/
  for (const icon of rootIcons) {
    await generateIcon(icon, join(projectRoot, 'public'));
  }

  console.log('\nAll icons generated successfully!');
}

main().catch(console.error);
