const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const packageDir = path.resolve(__dirname, '..');
const manifestPath = path.join(packageDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    console.error('manifest.json not found');
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const packageId = manifest.id || 'package';
const outFileName = `${packageId}.gdpkg`;
const outPath = path.join(packageDir, outFileName);

const zip = new AdmZip();
zip.addLocalFile(manifestPath);

const distPath = path.join(packageDir, 'dist');
if (fs.existsSync(distPath)) {
    zip.addLocalFolder(distPath, 'dist');
} else {
    console.warn('Warning: dist/ directory not found. Run build first.');
}

zip.writeZip(outPath);
console.log(`Successfully built ${outFileName}`);
