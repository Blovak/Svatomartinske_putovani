import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'point-status.css', 'config.js', 'app.js', 'geo.js', 'point-style.js']) await copyFile(file, `dist/${file}`);
console.log('Sestavení dokončeno: dist/');
