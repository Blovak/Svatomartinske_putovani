import { copyFile, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'point-status.css', 'config.js', 'app.js', 'point-style.js', 'help.js']) await copyFile(file, `dist/${file}`);
console.log('Sestavení dokončeno: dist/');
