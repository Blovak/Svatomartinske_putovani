import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'geo.js', 'config.js']) await copyFile(file, `dist/${file}`);
console.log('Sestavení dokončeno: dist/');
