

'use server';

import { readDb, writeDb } from './db';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Database, FileStatus } from '../types';

const POLLING_INTERVAL = 5000; // 5 seconds
const CLEANUP_INTERVAL = 60000; // 1 minute
let isPolling = false;
let isCleaning = false;

async function pollDirectories() {
  if (isPolling) {
    return;
  }
  isPolling = true;

  try {
    const db = await readDb();
    const importPath = db.monitoredPaths.import.path;
    const failedPath = db.monitoredPaths.failed.path;
    const monitoredExtensions = new Set(db.monitoredExtensions.map(ext => `.${ext.toLowerCase()}`));

    if (!importPath || !failedPath) {
        console.error('[Polling] Monitored paths are not configured. Skipping poll.');
        isPolling = false;
        return;
    }
    
    let hasDbChanged = false;

    // --- Files on Disk ---
    const filesInImport = await fs.readdir(importPath).catch(() => [] as string[]);
    const filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    const filesInImportSet = new Set(filesInImport);
    const filesInFailedSet = new Set(filesInFailed);

    const failureRemark = db.failureRemark || "File processing failed.";

    // --- Pass 1: Handle failed files (Highest Priority) ---
    for (const fileName of filesInFailed) {
      let fileInDb = db.fileStatuses.find(f => f.name === fileName);
      if (!fileInDb) {
         fileInDb = {
            id: `file-${Date.now()}-${Math.random()}`,
            name: fileName,
            status: 'failed',
            source: db.monitoredPaths.failed.name,
            lastUpdated: new Date().toISOString(),
            remarks: failureRemark
         };
         db.fileStatuses.unshift(fileInDb);
         console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" marked as failed (detected in rejected folder).`);
         hasDbChanged = true;
      } else if (fileInDb.status !== 'failed') {
        fileInDb.status = 'failed';
        fileInDb.remarks = failureRemark;
        fileInDb.lastUpdated = new Date().toISOString();
        console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" updated to failed.`);
        hasDbChanged = true;
      }
    }

    // --- Pass 2: Handle new and re-processed files in Import ---
    for (const fileName of filesInImport) {
       if (monitoredExtensions.size > 0 && !monitoredExtensions.has(path.extname(fileName).toLowerCase())) {
            continue; // Skip files that are not monitored
       }
        
      const fileInDb = db.fileStatuses.find(f => f.name === fileName);
      if (!fileInDb) {
        const newFile: FileStatus = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: fileName,
          status: 'processing',
          source: db.monitoredPaths.import.name,
          lastUpdated: new Date().toISOString(),
          remarks: ''
        };
        db.fileStatuses.unshift(newFile);
        console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" marked as processing (newly detected).`);
        hasDbChanged = true;
      } else if (fileInDb.status === 'published' || fileInDb.status === 'failed') {
        fileInDb.status = 'processing';
        fileInDb.lastUpdated = new Date().toISOString();
        fileInDb.remarks = ''; // Clear old remarks
        console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" marked as processing (re-imported).`);
        hasDbChanged = true;
      }
    }
    
    // --- Pass 3: Check for published files ---
    for (const file of db.fileStatuses) {
        if (file.status === 'processing') {
            if (!filesInImportSet.has(file.name) && !filesInFailedSet.has(file.name)) {
                file.status = 'published';
                file.remarks = 'File processed successfully.';
                file.lastUpdated = new Date().toISOString();
                console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" marked as published.`);
                hasDbChanged = true;
            }
        }
    }

    if (hasDbChanged) {
        db.fileStatuses.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        await writeDb(db);
    }

  } catch (error) {
    console.error('[Polling] An error occurred during the poll:', error);
  } finally {
    isPolling = false;
  }
}

async function cleanupJob() {
  if (isCleaning) {
    return;
  }
  isCleaning = true;

  try {
    const db = await readDb();
    const { cleanupSettings, fileStatuses, monitoredPaths } = db;
    const now = new Date();
    let hasDbChanged = false;

    const getMilliseconds = (value: string, unit: 'hours' | 'days') => {
        const numValue = parseInt(value, 10);
        if (isNaN(numValue)) return 0;
        if (unit === 'hours') return numValue * 60 * 60 * 1000;
        if (unit === 'days') return numValue * 24 * 60 * 60 * 1000;
        return 0;
    };
    
    const originalFileCount = fileStatuses.length;

    // 1. Flag timed-out files
    if (cleanupSettings.timeout.enabled) {
      const timeoutMs = getMilliseconds(cleanupSettings.timeout.value, cleanupSettings.timeout.unit);
      if (timeoutMs > 0) {
        for (const file of fileStatuses) {
          if (file.status === 'processing') {
            const lastUpdated = new Date(file.lastUpdated);
            if (now.getTime() - lastUpdated.getTime() > timeoutMs) {
              file.status = 'timed-out';
              file.lastUpdated = now.toISOString();
              console.log(`[${new Date().toISOString()}] LOG: Status Change - "${file.name}" marked as timed-out.`);
              hasDbChanged = true;
            }
          }
        }
      }
    }

    // 2. Clear old status entries from dashboard
    if (cleanupSettings.status.enabled) {
      const statusMaxAgeMs = getMilliseconds(cleanupSettings.status.value, cleanupSettings.status.unit);
      if (statusMaxAgeMs > 0) {
        const newFileStatuses = fileStatuses.filter(file => {
            const lastUpdated = new Date(file.lastUpdated);
            const shouldKeep = now.getTime() - lastUpdated.getTime() <= statusMaxAgeMs;
            if (!shouldKeep) {
                 console.log(`[${new Date().toISOString()}] LOG: Removing old status entry from dashboard: ${file.name}`);
            }
            return shouldKeep;
        });
        if (newFileStatuses.length !== fileStatuses.length) {
            db.fileStatuses = newFileStatuses;
            hasDbChanged = true;
        }
      }
    }
    
    // 3. Clear old physical files from the 'failed' directory
    if (cleanupSettings.files.enabled) {
        const fileMaxAgeMs = getMilliseconds(cleanupSettings.files.value, cleanupSettings.files.unit);
        const failedPath = monitoredPaths.failed.path;

        if (fileMaxAgeMs > 0 && failedPath) {
            try {
                const filesInFailed = await fs.readdir(failedPath);
                for (const fileName of filesInFailed) {
                    const filePath = path.join(failedPath, fileName);
                    try {
                        const stats = await fs.stat(filePath);
                        const fileCreationTime = stats.birthtime; // Use creation time
                        if (now.getTime() - fileCreationTime.getTime() > fileMaxAgeMs) {
                            await fs.unlink(filePath);
                            console.log(`[${new Date().toISOString()}] LOG: File Deletion - Deleted old file from failed directory: ${fileName}`);
                        }
                    } catch (statError: any) {
                         if (statError.code !== 'ENOENT') {
                           console.error(`[Cleanup] Error getting stats for file ${filePath}:`, statError.message);
                         }
                    }
                }
            } catch (readDirError: any) {
                 if (readDirError.code !== 'ENOENT') {
                    console.error(`[Cleanup] Error reading failed directory ${failedPath}:`, readDirError.message);
                 }
            }
        }
    }


    if (hasDbChanged || db.fileStatuses.length !== originalFileCount) {
      await writeDb(db);
    }

  } catch (error) {
    console.error('[Cleanup] An error occurred during the cleanup job:', error);
  } finally {
    isCleaning = false;
  }
}


// --- Service Initialization ---
async function initializePollingService() {
  console.log('[Service] Initializing polling and cleanup services...');
  const db = await readDb();
  const importPath = db.monitoredPaths.import.path;
  const failedPath = db.monitoredPaths.failed.path;

  if (!importPath || !failedPath) {
    console.error("[Service] Import or Failed paths are not configured. Services cannot start.");
    return;
  }
  
  try {
      await fs.access(importPath);
      await fs.access(failedPath);
      console.log(`[Service] Watching Import: ${importPath}`);
      console.log(`[Service] Watching Failed: ${failedPath}`);
      setInterval(pollDirectories, POLLING_INTERVAL);
      setInterval(cleanupJob, CLEANUP_INTERVAL);
      console.log(`[Service] Polling started. Polling every ${POLLING_INTERVAL / 1000} seconds.`);
      console.log(`[Service] Cleanup job started. Running every ${CLEANUP_INTERVAL / 1000} seconds.`);
  } catch(error: any) {
       console.error(`[Service] A monitored directory is not accessible. Please check paths in settings. Error: ${error.message}`);
  }
}

// Start the service
(async () => {
    try {
        await initializePollingService();
    } catch (error) {
        console.error("[Service] Failed to start services:", error);
    }
})();



