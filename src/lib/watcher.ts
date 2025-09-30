
'use server';

import { readDb, writeDb } from './db';
import {
  addFileStatus,
  updateFileStatus,
  updateFileRemarks,
} from './actions';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Database, FileStatus } from '../types';

const POLLING_INTERVAL = 5000; // 5 seconds
let isPolling = false;

async function getFailureRemark(): Promise<string> {
  const db = await readDb();
  return db.failureRemark || "File processing failed.";
}

async function pollDirectories() {
  if (isPolling) {
    console.log('[Polling] Previous poll still running. Skipping.');
    return;
  }
  isPolling = true;
  console.log('[Polling] Starting directory scan...');

  try {
    const db = await readDb();
    const importPath = path.resolve(db.monitoredPaths.import.path);
    const failedPath = path.resolve(db.monitoredPaths.failed.path);
    const monitoredExtensions = new Set(db.monitoredExtensions.map(ext => `.${ext}`));

    const filesInDb = new Map(db.fileStatuses.map(f => [f.name, f]));

    // --- Step 1: Scan the Failed directory ---
    // This runs first, so if a file is moved from import to failed between polls,
    // we'll mark it as failed correctly.
    const filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    for (const fileName of filesInFailed) {
      const fileRecord = filesInDb.get(fileName);
      if (!fileRecord || fileRecord.status !== 'failed') {
        console.log(`[Polling] Detected file in failed: ${fileName}. Updating status.`);
        const failureRemark = await getFailureRemark();
        // This will either add or update the file status.
        await addFileStatus(path.join(failedPath, fileName), 'failed');
        await updateFileRemarks(path.join(failedPath, fileName), failureRemark);
      }
    }
    const filesInFailedSet = new Set(filesInFailed);

    // --- Step 2: Scan the Import directory ---
    const filesInImport = await fs.readdir(importPath).catch(() => [] as string[]);
    for (const fileName of filesInImport) {
        // Ignore files that don't match monitored extensions, if any are specified
        if (monitoredExtensions.size > 0 && !monitoredExtensions.has(path.extname(fileName).toLowerCase())) {
            continue;
        }
      const fileRecord = filesInDb.get(fileName);
      if (!fileRecord) {
        console.log(`[Polling] Detected new file in import: ${fileName}. Setting to processing.`);
        await addFileStatus(path.join(importPath, fileName), 'processing');
      }
    }
    const filesInImportSet = new Set(filesInImport);
    
    // --- Step 3: Check for Published or Timed-out files ---
    // Re-read DB after potential updates
    const updatedDb = await readDb(); 
    for (const file of updatedDb.fileStatuses) {
        if (file.status === 'processing') {
            const fileIsInImport = filesInImportSet.has(file.name);
            const fileIsInFailed = filesInFailedSet.has(file.name);

            if (!fileIsInImport && !fileIsInFailed) {
                // If it was processing but is now in neither directory, it must have been published.
                console.log(`[Polling] File ${file.name} no longer in import/failed. Marking as published.`);
                await updateFileStatus(path.join(importPath, file.name), 'published');
            }
        }
    }

  } catch (error) {
    console.error('[Polling] An error occurred during the poll:', error);
  } finally {
    isPolling = false;
    console.log('[Polling] Directory scan finished.');
  }
}

// --- Service Initialization ---
async function initializePollingService() {
  console.log('[Polling] Initializing polling service...');
  const db = await readDb();
  const importPath = db.monitoredPaths.import.path;
  const failedPath = db.monitoredPaths.failed.path;

  if (!importPath || !failedPath) {
    console.error("[Polling] Import or Failed paths are not configured. Polling service cannot start.");
    return;
  }
  
  try {
      await fs.access(importPath);
      await fs.access(failedPath);
      console.log(`[Polling] Watching Import: ${importPath}`);
      console.log(`[Polling] Watching Failed: ${failedPath}`);
      setInterval(pollDirectories, POLLING_INTERVAL);
      console.log(`[Polling] Service started. Polling every ${POLLING_INTERVAL / 1000} seconds.`);
  } catch(error: any) {
       console.error(`[Polling] A monitored directory is not accessible. Please check paths in settings. Error: ${error.message}`);
  }
}

// Start the service
(async () => {
    try {
        await initializePollingService();
    } catch (error) {
        console.error("[Polling] Failed to start polling service:", error);
    }
})();
