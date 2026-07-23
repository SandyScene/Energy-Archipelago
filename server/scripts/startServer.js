// Render's free plan has no persistent disk, so the SQLite database is wiped
// on every redeploy or restart. This re-imports the checked-in master dataset
// whenever the database comes up empty, then starts the API normally.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { count } = db.prepare('SELECT COUNT(*) AS count FROM projects').get();

if (count === 0) {
  const datasetPath = path.join(__dirname, '..', 'database', 'Master_Community_Energy_Dataset.xlsx');
  console.log('No projects found in the database — importing master dataset...');
  execFileSync('node', [path.join(__dirname, 'importSpreadsheet.js'), datasetPath], { stdio: 'inherit' });
} else {
  console.log(`Database already has ${count} projects — skipping auto-import.`);
}

await import('../src/index.js');
