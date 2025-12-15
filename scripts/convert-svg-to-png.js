import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, '../public/clarity-favicon.svg');
const pngPath = path.join(__dirname, '../public/clarity-pledge-icon.png');

// Read SVG file
const svgBuffer = fs.readFileSync(svgPath);

// Convert SVG to PNG at 1024x1024 resolution
sharp(svgBuffer)
  .resize(1024, 1024)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('✓ Successfully created clarity-pledge-icon.png (1024x1024)');
    console.log(`  Location: ${pngPath}`);
    console.log('  Accessible at: /clarity-pledge-icon.png');
  })
  .catch(err => {
    console.error('Error converting SVG to PNG:', err);
    process.exit(1);
  });
