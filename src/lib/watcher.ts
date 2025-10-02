

'use server';

import { readDb, writeDb } from './db';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Database, FileStatus } from '../types';

const POLLING_INTERVAL = 5000; // 5 seconds
const CLEANUP_INTERVAL = 60000; // 1 minute
let isPolling = false;
let isCleaning = false;

// Helper function to clean filenames
const cleanFileName = (fileName: string): string => {
    // 1. Replace multiple spaces with a single space
    // 2. Trim leading/trailing spaces
    return fileName.replace(/\s+/g, ' ').trim();
};


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
    const { autoTrimInvalidChars, autoExpandPrefixes } = db.processingSettings || { autoTrimInvalidChars: false, autoExpandPrefixes: false };

    if (!importPath || !failedPath) {
        console.error('[Polling] Monitored paths are not configured. Skipping poll.');
        isPolling = false;
        return;
    }
    
    let hasDbChanged = false;

    // --- Files on Disk ---
    let filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    
    // --- Pass 1: Handle automated workflows for files in Rejected folder ---
    const processedByAutomation = new Set<string>();

    for (const originalFileName of filesInFailed) {
      if (processedByAutomation.has(originalFileName)) continue;

      const fileExt = path.extname(originalFileName).toLowerCase();

      // Workflow 1: Auto Expand Prefixes
      if (autoExpandPrefixes && (monitoredExtensions.size === 0 || monitoredExtensions.has(fileExt.substring(1)))) {
          const parts = path.basename(originalFileName, fileExt).split('_');
          if (parts.length === 4 && parts[1].length === 6 && parts[2].length === 6 && parts[3].length === 5) {
              const prefixPairsStr = parts[0];
              if (prefixPairsStr.length > 0 && prefixPairsStr.length % 2 === 0) {
                  const validPairs = [];
                  for (let i = 0; i < prefixPairsStr.length; i += 2) {
                      const pair = prefixPairsStr.substring(i, i + 2);
                      if (['P', 'B', 'C'].includes(pair[0].toUpperCase())) {
                          validPairs.push(pair);
                      }
                  }

                  if (validPairs.length > 0) {
                      console.log(`[${new Date().toISOString()}] LOG: Prefix expansion triggered for "${originalFileName}". Valid pairs: ${validPairs.join(', ')}.`);
                      const originalFilePath = path.join(failedPath, originalFileName);
                      let allCopiesSucceeded = true;

                      for (const pair of validPairs) {
                          const newFileName = `${pair}_${parts[1]}_${parts[2]}_${parts[3]}${fileExt}`;
                          const newFilePath = path.join(importPath, newFileName);
                          try {
                              await fs.copyFile(originalFilePath, newFilePath);
                              console.log(`[${new Date().toISOString()}] LOG: Created copy "${newFileName}" in import folder.`);
                              
                              const newFile: FileStatus = {
                                id: `file-${Date.now()}-${Math.random()}`,
                                name: newFileName,
                                status: 'processing',
                                source: db.monitoredPaths.import.name,
                                lastUpdated: new Date().toISOString(),
                                remarks: `Auto-expanded from ${originalFileName}`
                              };
                              db.fileStatuses.unshift(newFile);
                              hasDbChanged = true;

                          } catch (copyError) {
                              console.error(`[${new Date().toISOString()}] ERROR: Failed to create copy "${newFileName}":`, copyError);
                              allCopiesSucceeded = false;
                              break; 
                          }
                      }

                      if (allCopiesSucceeded) {
                          try {
                              await fs.unlink(originalFilePath);
                              console.log(`[${new Date().toISOString()}] LOG: Deleted original file "${originalFileName}" after expansion.`);
                              processedByAutomation.add(originalFileName);
                          } catch (deleteError) {
                              console.error(`[${new Date().toISOString()}] ERROR: Failed to delete original file "${originalFileName}" after copy:`, deleteError);
                          }
                      }
                      continue; // Move to the next file in the loop
                  }
              }
          }
      }

      // Workflow 2: Auto-fix invalid characters (only if not handled by prefix expansion)
      if (autoTrimInvalidChars) {
        const cleanedFileName = cleanFileName(originalFileName);
        if (originalFileName !== cleanedFileName) {
            const oldPath = path.join(failedPath, originalFileName);
            const newPath = path.join(importPath, cleanedFileName);
            
            try {
                await fs.access(newPath);
                console.log(`[${new Date().toISOString()}] LOG: Auto-fix and retry skipped for "${originalFileName}" because "${cleanedFileName}" already exists in the import folder.`);
            } catch (e) {
                try {
                    await fs.rename(oldPath, newPath);
                    console.log(`[${new Date().toISOString()}] LOG: Auto-fixed and retrying "${originalFileName}" as "${cleanedFileName}".`);
                    
                    const oldIndex = db.fileStatuses.findIndex(f => f.name === originalFileName);
                    if (oldIndex > -1) {
                        db.fileStatuses.splice(oldIndex, 1);
                    }

                    const newFile: FileStatus = {
                        id: `file-${Date.now()}-${Math.random()}`,
                        name: cleanedFileName,
                        status: 'processing',
                        source: db.monitoredPaths.import.name,
                        lastUpdated: new Date().toISOString(),
                        remarks: `Auto-renamed from "${originalFileName}" and retried.`
                    };
                    db.fileStatuses.unshift(newFile);
                    hasDbChanged = true;
                    processedByAutomation.add(originalFileName);
                } catch (renameError) {
                    console.error(`[${new Date().toISOString()}] ERROR: Failed to auto-fix and retry "${originalFileName}":`, renameError);
                }
            }
        }
      }
    }

    // Refresh file lists after automated moves/deletes
    const filesInImport = await fs.readdir(importPath).catch(() => [] as string[]);
    filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    const filesInImportSet = new Set(filesInImport);
    const filesInFailedSet = new Set(filesInFailed);
    const failureRemark = db.failureRemark || "File processing failed.";


    // --- Pass 2: Handle failed files (that were not auto-fixed) ---
    for (const fileName of filesInFailed) {
      if (monitoredExtensions.size > 0 && !monitoredExtensions.has(path.extname(fileName).toLowerCase())) {
        continue; // Skip files that are not monitored
      }
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

    // --- Pass 3: Handle new and re-processed files in Import ---
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
      } else if (fileInDb.status === 'published' || fileInDb.status === 'failed' || fileInDb.status === 'timed-out') {
        // This case handles a file being manually moved back to import
        fileInDb.status = 'processing';
        fileInDb.lastUpdated = new Date().toISOString();
        // Clear remarks unless it was just auto-renamed/expanded
        if (!fileInDb.remarks?.includes('Auto-')) {
            fileInDb.remarks = 'Retrying file manually.';
        }
        console.log(`[${new Date().toISOString()}] LOG: Status Change - "${fileName}" marked as processing (re-imported).`);
        hasDbChanged = true;
      }
    }
    
    // --- Pass 4: Check for published files ---
    for (const file of db.fileStatuses) {
        if (file.status === 'processing') {
            if (!filesInImportSet.has(file.name) && !filesInFailedSet.has(file.name)) {
                file.status = 'published';
                 const successRemark = 'File processed successfully.';
                file.remarks = file.remarks ? `${file.remarks}; ${successRemark}` : successRemark;
                file.lastUpdated = new Date().toISOString();
                console.log(`[${new Date().toISOString()}] LOG: Status Change - "${file.name}" marked as published.`);
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

    
    