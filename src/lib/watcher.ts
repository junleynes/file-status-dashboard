
import chokidar from 'chokidar';
import { readDb } from './db';
import { addFileStatus } from './actions';
import path from 'path';

let watcher: chokidar.FSWatcher | null = null;

async function initializeWatcher() {
  console.log('Initializing file watcher...');
  const db = await readDb();
  const importPath = db.monitoredPaths.import.path;
  const extensions = db.monitoredExtensions.map(ext => `.${ext}`);

  if (!importPath) {
    console.warn('Import path is not configured. File watcher not started.');
    return;
  }

  console.log(`Watching path: ${importPath}`);
  console.log(`For extensions: ${extensions.join(', ')}`);

  // Close previous watcher if exists
  if (watcher) {
    console.log('Closing previous watcher instance.');
    await watcher.close();
  }
  
  // Initialize watcher.
  watcher = chokidar.watch(importPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger 'add' events on existing files
    depth: 0, // only watch top-level files in the directory
  });

  // Add event listeners.
  watcher
    .on('add', async (filePath) => {
        const fileExt = path.extname(filePath).toLowerCase();
        
        // If extensions are specified, only process files with matching extensions.
        // If no extensions are specified, process all files.
        if (extensions.length > 0 && !extensions.includes(fileExt)) {
            console.log(`Skipping file with non-monitored extension: ${filePath}`);
            return;
        }

        console.log(`File ${filePath} has been added`);
        await addFileStatus(filePath);
    })
    .on('error', (error) => console.error(`Watcher error: ${error}`))
    .on('ready', () => console.log('Initial scan complete. Ready for changes'));

}

// Start the watcher
initializeWatcher().catch(console.error);

// We can add logic here to re-initialize the watcher if settings change,
// but for now this simple setup will start it on server boot.

console.log('Watcher script loaded.');
