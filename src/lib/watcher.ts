
import chokidar from 'chokidar';
import { readDb, writeDb } from './db';
import { addFileStatus } from './actions';
import path from 'path';
import fs from 'fs/promises';
import type { FileStatus } from '@/types';

let watcher: chokidar.FSWatcher | null = null;
const CLEANUP_INTERVAL = 1000 * 60 * 60; // 1 hour

async function runCleanup() {
    console.log('Running cleanup tasks...');
    const db = await readDb();
    const { cleanupSettings, fileStatuses, monitoredPaths } = db;
    const now = new Date().getTime();
    let changed = false;

    const allPaths = Object.values(monitoredPaths).map(p => ({name: p.name, path: p.path})).filter(p => p.path);

    // 1. Handle Timeouts
    if (cleanupSettings.timeout.enabled) {
        const timeoutValue = parseInt(cleanupSettings.timeout.value, 10);
        const timeoutUnit = cleanupSettings.timeout.unit;
        const timeoutMs = timeoutUnit === 'hours' 
            ? timeoutValue * 60 * 60 * 1000
            : timeoutValue * 24 * 60 * 60 * 1000;

        for (const file of fileStatuses) {
            if (file.status === 'processing') {
                const lastUpdated = new Date(file.lastUpdated).getTime();
                if (now - lastUpdated > timeoutMs) {
                    console.log(`File ${file.name} has timed out. Updating status.`);
                    file.status = 'timed-out';
                    file.lastUpdated = new Date().toISOString();
                    changed = true;
                }
            }
        }
    }

    // Prepare for file deletion and status cleanup
    let statusesToKeep: FileStatus[] = [...fileStatuses];
    let filesToDelete: {filePath: string, statusId: string}[] = [];

    const statusCleanupEnabled = cleanupSettings.status.enabled;
    const statusCleanupValue = parseInt(cleanupSettings.status.value, 10);
    const statusCleanupUnit = cleanupSettings.status.unit;
    const statusCleanupMs = statusCleanupUnit === 'hours'
        ? statusCleanupValue * 60 * 60 * 1000
        : statusCleanupValue * 24 * 60 * 60 * 1000;

    const fileCleanupEnabled = cleanupSettings.files.enabled;
    const fileCleanupValue = parseInt(cleanupSettings.files.value, 10);
    const fileCleanupUnit = cleanupSettings.files.unit;
    const fileCleanupMs = fileCleanupUnit === 'hours'
        ? fileCleanupValue * 60 * 60 * 1000
        : fileCleanupValue * 24 * 60 * 60 * 1000;


    for (const file of fileStatuses) {
        const lastUpdated = new Date(file.lastUpdated).getTime();
        let shouldRemoveStatus = false;
        
        // 2. Check for status cleanup
        if (statusCleanupEnabled && (now - lastUpdated > statusCleanupMs)) {
            console.log(`Scheduling removal of old status for file: ${file.name}`);
            shouldRemoveStatus = true;
        }
        
        // 3. Check for file cleanup
        if (fileCleanupEnabled && (now - lastUpdated > fileCleanupMs)) {
            const folderInfo = allPaths.find(p => p.name === file.source);
            if (folderInfo) {
                const fullPath = path.join(folderInfo.path, file.name);
                filesToDelete.push({filePath: fullPath, statusId: file.id});
                console.log(`Scheduling deletion of old file: ${fullPath}`);
                shouldRemoveStatus = true; // Also remove status if file is being deleted
            }
        }
        
        if (shouldRemoveStatus) {
             statusesToKeep = statusesToKeep.filter(s => s.id !== file.id);
             changed = true;
        }
    }

    // Perform file deletions
    if (filesToDelete.length > 0) {
        console.log(`Deleting ${filesToDelete.length} old files.`);
        for (const { filePath, statusId } of filesToDelete) {
            try {
                await fs.unlink(filePath);
                console.log(`Successfully deleted file: ${filePath}`);
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                     console.warn(`File not found for deletion, likely already deleted: ${filePath}`);
                } else {
                    console.error(`Failed to delete file ${filePath}:`, error);
                }
            }
            // Ensure status is removed even if other checks didn't catch it
            if (statusesToKeep.some(s => s.id === statusId)) {
                statusesToKeep = statusesToKeep.filter(s => s.id !== statusId);
                changed = true;
            }
        }
    }

    // If any change occurred, write to DB
    if (changed) {
        console.log('DB changed due to cleanup, writing updates.');
        db.fileStatuses = statusesToKeep;
        await writeDb(db);
    } else {
        console.log('No cleanup changes were necessary.');
    }
}


async function initializeWatcher() {
  console.log('Initializing file watcher...');
  try {
    const db = await readDb();
    const importPath = db.monitoredPaths.import.path;
    const extensions = db.monitoredExtensions.map(ext => `.${ext.toLowerCase()}`);

    if (!importPath) {
      console.warn('Import path is not configured. File watcher not started.');
      return;
    }

    console.log(`Watching path: ${importPath}`);
    if (extensions.length > 0) {
        console.log(`For extensions: ${extensions.join(', ')}`);
    } else {
        console.log('For all file extensions.');
    }


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
          
          if (extensions.length > 0 && !extensions.includes(fileExt)) {
              console.log(`Skipping file with non-monitored extension: ${filePath}`);
              return;
          }

          console.log(`File ${filePath} has been added`);
          await addFileStatus(filePath);
      })
      .on('error', (error) => console.error(`Watcher error: ${error}`))
      .on('ready', () => console.log('Initial scan complete. Ready for changes'));
      
      // Set up periodic cleanup
      setInterval(runCleanup, CLEANUP_INTERVAL);
      console.log(`Cleanup tasks scheduled to run every ${CLEANUP_INTERVAL / (1000 * 60)} minutes.`);
      runCleanup(); // Run once on startup

  } catch (error) {
      console.error("Failed to initialize watcher:", error);
  }
}

// Start the watcher
initializeWatcher().catch(console.error);

console.log('Watcher script loaded.');
