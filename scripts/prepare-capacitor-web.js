const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'www');
const iconOutDir = path.join(outDir, 'icons');

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

cleanDir(outDir);

[
  'index.html',
  'manifest.json',
  'service-worker.js'
].forEach((file) => copyFile(path.join(root, file), path.join(outDir, file)));

if (fs.existsSync(path.join(root, 'icons'))) {
  fs.mkdirSync(iconOutDir, { recursive: true });
  fs.readdirSync(path.join(root, 'icons'))
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .forEach((file) => copyFile(path.join(root, 'icons', file), path.join(iconOutDir, file)));
}

console.log('AnualPrint web build listo en www/');
