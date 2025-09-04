
import chokidar from 'chokidar';
import { readDb } from './db';
import { addFileStatus } from './actions';
import path from 'path';
import fs from 'fs/promises';

let watcher: chokidar.FSWatcher | null = null;

async function initializeWatcher() {
  console.log('[Watcher] Initializing file watcher service...');
  try {
    const db = await readDb();
    const importPath = db.monitoredPaths.import.path;
    const extensions = db.monitoredExtensions.map(ext => `.${ext.toLowerCase()}`);

    if (!importPath) {
      console.warn('[Watcher] Import path is not configured. File watcher will not start.');
      return;
    }

     try {
        await fs.access(importPath);
        console.log(`[Watcher] Successfully accessed import path: ${importPath}`);
    } catch (error) {
        console.error(`[Watcher] ERROR: Could not access import path: ${importPath}. Please check if the path is correct and permissions are set.`, error);
        return; // Stop initialization if path is not accessible
    }

    if (extensions.length > 0) {
        console.log(`[Watcher] Monitoring for extensions: ${extensions.join(', ')}`);
    } else {
        console.log('[Watcher] Monitoring for all file extensions.');
    }

    // Close previous watcher if exists
    if (watcher) {
      console.log('[Watcher] Closing previous watcher instance.');
      await watcher.close();
    }
    
    watcher = chokidar.watch(importPath, {
      persistent: true,
      ignoreInitial: true, // Don't fire 'add' for existing files
      awaitWriteFinish: { // Wait for files to finish writing
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    watcher
      .on('add', async (filePath) => {
          console.log(`[Watcher] Detected new file: ${filePath}`);
          const fileExt = path.extname(filePath).toLowerCase();
          
          if (extensions.length > 0 && !extensions.includes(fileExt)) {
              console.log(`[Watcher] Skipping file with non-monitored extension: ${filePath}`);
              return;
          }
          await addFileStatus(filePath);
      })
      .on('error', (error) => console.error(`[Watcher] Watcher error: ${error}`))
      .on('ready', () => console.log(`[Watcher] Ready. Watching for new files in: ${importPath}`));

  } catch (error) {
      console.error("[Watcher] Failed to initialize watcher:", error);
  }
}

// Start the watcher
console.log('[Watcher] Starting service...');
initializeWatcher().catch(console.error);
