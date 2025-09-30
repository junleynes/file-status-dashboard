
'use server';

import { readDb, writeDb } from './db';
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
    const importPath = db.monitoredPaths.import.path;
    const failedPath = db.monitoredPaths.failed.path;
    const monitoredExtensions = new Set(db.monitoredExtensions.map(ext => `.${ext}`));

    if (!importPath || !failedPath) {
        console.error('[Polling] Monitored paths are not configured. Skipping poll.');
        isPolling = false;
        return;
    }
    
    const dbFileMap = new Map(db.fileStatuses.map(f => [f.name, f]));
    let hasDbChanged = false;

    // --- Pass 1: Handle failed files ---
    const filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    const failureRemark = await getFailureRemark();
    for (const fileName of filesInFailed) {
      const fileInDb = dbFileMap.get(fileName);
      if (fileInDb && fileInDb.status !== 'failed') {
        console.log(`[Polling] Updating status to 'failed' for: ${fileName}`);
        fileInDb.status = 'failed';
        fileInDb.remarks = failureRemark;
        fileInDb.lastUpdated = new Date().toISOString();
        hasDbChanged = true;
      }
    }

    // --- Pass 2: Handle new and processing files ---
    const filesInImport = await fs.readdir(importPath).catch(() => [] as string[]);
    for (const fileName of filesInImport) {
       if (monitoredExtensions.size > 0 && !monitoredExtensions.has(path.extname(fileName).toLowerCase())) {
            continue;
        }
      if (!dbFileMap.has(fileName)) {
        console.log(`[Polling] Detected new file: ${fileName}. Setting to processing.`);
        const newFile: FileStatus = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: fileName,
          status: 'processing',
          source: db.monitoredPaths.import.name,
          lastUpdated: new Date().toISOString(),
        };
        db.fileStatuses.unshift(newFile);
        dbFileMap.set(fileName, newFile); // Keep map in sync
        hasDbChanged = true;
      }
    }
    
    // --- Pass 3: Check for published files ---
    const filesInImportSet = new Set(filesInImport);
    for (const file of db.fileStatuses) {
        // Only check files that are "processing"
        if (file.status === 'processing') {
            // If it's not in the import folder anymore... it must be published.
            // We already handled the 'failed' case in Pass 1.
            if (!filesInImportSet.has(file.name)) {
                console.log(`[Polling] File ${file.name} is no longer in import. Marking as published.`);
                file.status = 'published';
                file.lastUpdated = new Date().toISOString();
                hasDbChanged = true;
            }
        }
    }

    if (hasDbChanged) {
        // Sort by date before writing
        db.fileStatuses.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        await writeDb(db);
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
