
import chokidar from 'chokidar';
import { readDb, writeDb } from './db';
import { addFileStatus, updateFileStatus } from './actions';
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

    const allPaths = [monitoredPaths.import.path, monitoredPaths.failed.path].filter(Boolean);

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
                    changed = true;
                }
            }
        }
    }

    // Prepare for file deletion and status cleanup
    let statusesToKeep: FileStatus[] = [];
    let filesToDelete: {filePath: string, statusId: string}[] = [];

    const statusCleanupEnabled = cleanupSettings.status.enabled;
    const statusCleanupValue = parseInt(cleanupSettings.status.value, 10);
    const statusCleanupUnit = cleanupSettings.status.unit;
    const statusCleanupMs = statusCleanupUnit === 'hours'
        ? statusCleanupValue * 60 * 60 * 1000
        : statusCleanupValue * 24 * 60 * 60 * 1000;

    for (const file of fileStatuses) {
        const lastUpdated = new Date(file.lastUpdated).getTime();
        let shouldKeep = true;

        // 2. Check for status cleanup
        if (statusCleanupEnabled && (now - lastUpdated > statusCleanupMs)) {
            console.log(`Removing old status for file: ${file.name}`);
            shouldKeep = false;
            changed = true;
        }
        
        // 3. Check for file cleanup
        if (cleanupSettings.files.enabled) {
            const fileCleanupValue = parseInt(cleanupSettings.files.value, 10);
            const fileCleanupUnit = cleanupSettings.files.unit;
            const fileCleanupMs = fileCleanupUnit === 'hours'
                ? fileCleanupValue * 60 * 60 * 1000
                : fileCleanupValue * 24 * 60 * 60 * 1000;
            
            if (now - lastUpdated > fileCleanupMs) {
                // Find full path and add to deletion queue
                const folderPath = allPaths.find(p => p.includes(file.source)) ?? file.source;
                const fullPath = path.join(folderPath, file.name);
                filesToDelete.push({filePath: fullPath, statusId: file.id});
                
                // If we're deleting the file, we should also remove its status
                shouldKeep = false;
                changed = true;
            }
        }
        
        if (shouldKeep) {
            statusesToKeep.push(file);
        }
    }

    // Perform file deletions
    if (filesToDelete.length > 0) {
        console.log(`Deleting ${filesToDelete.length} old files.`);
        for (const { filePath, statusId } of filesToDelete) {
            try {
                await fs.unlink(filePath);
                console.log(`Successfully deleted file: ${filePath}`);
                // Ensure status is removed even if it wasn't caught by status cleanup rule
                statusesToKeep = statusesToKeep.filter(s => s.id !== statusId);
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                     console.warn(`File not found for deletion, likely already deleted: ${filePath}`);
                     statusesToKeep = statusesToKeep.filter(s => s.id !== statusId);
                } else {
                    console.error(`Failed to delete file ${filePath}:`, error);
                }
            }
        }
    }

    // If any change occurred, write to DB
    if (changed) {
        console.log('DB changed, writing updates.');
        db.fileStatuses = statusesToKeep;
        await writeDb(db);
    } else {
        console.log('No cleanup changes were necessary.');
    }
}


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
    
    // Set up periodic cleanup
    setInterval(runCleanup, CLEANUP_INTERVAL);
    console.log(`Cleanup tasks scheduled to run every ${CLEANUP_INTERVAL / (1000 * 60)} minutes.`);
    runCleanup(); // Run once on startup
}

// Start the watcher
initializeWatcher().catch(console.error);

// We can add logic here to re-initialize the watcher if settings change,
// but for now this simple setup will start it on server boot.

console.log('Watcher script loaded.');
