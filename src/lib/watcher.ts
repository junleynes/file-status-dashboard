
'use server';

import * as path from 'path';
import * as fs from 'fs/promises';
import * as db from './db';
import type { FileStatus } from '../types';

const POLLING_INTERVAL = 5000; // 5 seconds
const CLEANUP_INTERVAL = 60000; // 1 minute
let isPolling = false;
let isCleaning = false;

// Helper function to clean filenames
const cleanFileName = (fileName: string): string => {
    const invalidCharsAndSpaces = /[*"\/\\<>:|\?\s]/g;
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const cleanedBase = baseName.replace(invalidCharsAndSpaces, '');
    return cleanedBase + extension;
};


async function pollDirectories() {
  if (isPolling) return;
  isPolling = true;

  try {
    const monitoredPaths = await db.getMonitoredPaths();
    const monitoredExtensionsArray = await db.getMonitoredExtensions();
    const processingSettings = await db.getProcessingSettings();
    
    const importPath = monitoredPaths.import.path;
    const failedPath = monitoredPaths.failed.path;
    const monitoredExtensions = new Set(monitoredExtensionsArray.map(ext => ext.toLowerCase()));
    const { autoTrimInvalidChars, autoExpandPrefixes } = processingSettings;

    if (!importPath || !failedPath) {
        console.error('[Polling] Monitored paths are not configured. Skipping poll.');
        isPolling = false;
        return;
    }
    
    let dbWrites: Promise<any>[] = [];
    let filesToUpsert: FileStatus[] = [];
    let filesToDelete: string[] = [];

    // --- Files on Disk ---
    let filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    
    // --- Pass 1: Handle automated workflows for files in Rejected folder ---
    const processedByAutomation = new Set<string>();

    for (const originalFileName of filesInFailed) {
      if (processedByAutomation.has(originalFileName)) continue;

      const fileExt = path.extname(originalFileName).toLowerCase();
      const extWithoutDot = fileExt.substring(1);
      
      const shouldMonitor = monitoredExtensions.size === 0 || monitoredExtensions.has(extWithoutDot);
      if (!shouldMonitor) continue;

      if (autoExpandPrefixes) {
          const parts = path.basename(originalFileName, fileExt).split('_');
          if (parts.length === 4 && parts[1].length === 6 && parts[2].length === 6 && parts[3].length === 5) {
              const prefixPairsStr = parts[0];
              if (prefixPairsStr.length > 0 && prefixPairsStr.length % 2 === 0) {
                  const validPairs = [];
                  for (let i = 0; i < prefixPairsStr.length; i += 2) {
                      if (['P', 'B', 'C'].includes(prefixPairsStr[i].toUpperCase())) validPairs.push(prefixPairsStr.substring(i, i + 2));
                  }

                  if (validPairs.length > 1) {
                      console.log(`[LOG] Prefix expansion for "${originalFileName}". Pairs: ${validPairs.join(', ')}.`);
                      const originalFilePath = path.join(failedPath, originalFileName);
                      let allCopiesSucceeded = true;

                      for (const pair of validPairs) {
                          const newFileName = `${pair}_${parts[1]}_${parts[2]}_${parts[3]}${fileExt}`;
                          const newFilePath = path.join(importPath, newFileName);
                          try {
                              await fs.copyFile(originalFilePath, newFilePath);
                              filesToUpsert.push({
                                id: `file-${Date.now()}-${Math.random()}`, name: newFileName, status: 'processing',
                                source: monitoredPaths.import.name, lastUpdated: new Date().toISOString(), remarks: `Auto-expanded from ${originalFileName}`
                              });
                          } catch (copyError) {
                              console.error(`[ERROR] Failed to create copy "${newFileName}":`, copyError);
                              allCopiesSucceeded = false; break;
                          }
                      }

                      if (allCopiesSucceeded) {
                          try {
                              await fs.unlink(originalFilePath);
                              processedByAutomation.add(originalFileName);
                              filesToDelete.push(originalFileName);
                          } catch (deleteError) {
                              console.error(`[ERROR] Failed to delete original expanded file "${originalFileName}":`, deleteError);
                          }
                      }
                      continue; 
                  }
              }
          }
      }

      if (autoTrimInvalidChars) {
        const cleanedFileName = cleanFileName(originalFileName);
        if (originalFileName !== cleanedFileName) {
            const oldPath = path.join(failedPath, originalFileName);
            const newPath = path.join(importPath, cleanedFileName);
            
            try {
                await fs.access(newPath);
            } catch (e) {
                try {
                    await fs.rename(oldPath, newPath);
                    filesToDelete.push(originalFileName);
                    filesToUpsert.push({
                        id: `file-${Date.now()}-${Math.random()}`, name: cleanedFileName, status: 'processing',
                        source: monitoredPaths.import.name, lastUpdated: new Date().toISOString(),
                        remarks: `Auto-renamed from "${originalFileName}" and retried.`
                    });
                    processedByAutomation.add(originalFileName);
                } catch (renameError) {
                    console.error(`[ERROR] Failed to auto-fix and retry "${originalFileName}":`, renameError);
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
    const failureRemark = await db.getFailureRemark();
    
    const currentFileStatuses = await db.getFileStatuses();
    const currentFileStatusesMap = new Map(currentFileStatuses.map(f => [f.name, f]));

    // --- Pass 2: Update statuses based on current file locations ---
    for (const [fileName, file] of currentFileStatusesMap.entries()) {
      const isMonitored = monitoredExtensions.size === 0 || monitoredExtensions.has(path.extname(fileName).toLowerCase().substring(1));
      if (!isMonitored) continue;
      
      const inImport = filesInImportSet.has(fileName);
      const inFailed = filesInFailedSet.has(fileName);

      if (file.status === 'processing' && !inImport && !inFailed) {
        file.status = 'published';
        file.remarks = 'File processed successfully.';
        file.lastUpdated = new Date().toISOString();
        filesToUpsert.push(file);
      } else if (inFailed && file.status !== 'failed') {
        file.status = 'failed';
        file.remarks = failureRemark;
        file.lastUpdated = new Date().toISOString();
        filesToUpsert.push(file);
      } else if (inImport && ['published', 'failed', 'timed-out'].includes(file.status)) {
        file.status = 'processing';
        file.remarks = file.remarks?.includes('Auto-') ? file.remarks : 'Retrying file manually.';
        file.lastUpdated = new Date().toISOString();
        filesToUpsert.push(file);
      }
    }

    // --- Pass 3: Detect new files ---
    const allKnownFiles = new Set(currentFileStatusesMap.keys());
    const newImportFiles = filesInImport.filter(f => !allKnownFiles.has(f));
    const newFailedFiles = filesInFailed.filter(f => !allKnownFiles.has(f));

    for (const fileName of newImportFiles) {
       const isMonitored = monitoredExtensions.size === 0 || monitoredExtensions.has(path.extname(fileName).toLowerCase().substring(1));
       if (isMonitored) {
         filesToUpsert.push({
           id: `file-${Date.now()}-${Math.random()}`, name: fileName, status: 'processing',
           source: monitoredPaths.import.name, lastUpdated: new Date().toISOString(), remarks: ''
         });
       }
    }
    for (const fileName of newFailedFiles) {
      const isMonitored = monitoredExtensions.size === 0 || monitoredExtensions.has(path.extname(fileName).toLowerCase().substring(1));
      if (isMonitored) {
         filesToUpsert.push({
           id: `file-${Date.now()}-${Math.random()}`, name: fileName, status: 'failed',
           source: monitoredPaths.failed.name, lastUpdated: new Date().toISOString(), remarks: failureRemark
         });
      }
    }

    // --- Commit all DB changes at once ---
    if (filesToUpsert.length > 0) {
      dbWrites.push(db.bulkUpsertFileStatuses(filesToUpsert));
    }
    if (filesToDelete.length > 0) {
      filesToDelete.forEach(name => dbWrites.push(db.deleteFileStatus(name)));
    }
    
    if (dbWrites.length > 0) {
      await Promise.all(dbWrites);
    }

  } catch (error) {
    console.error('[Polling] An error occurred during the poll:', error);
  } finally {
    isPolling = false;
  }
}

async function cleanupJob() {
  if (isCleaning) return;
  isCleaning = true;

  try {
    const cleanupSettings = await db.getCleanupSettings();
    const monitoredPaths = await db.getMonitoredPaths();
    const now = new Date();
    let dbChanged = false;

    const getMilliseconds = (value: string, unit: 'hours' | 'days') => {
        const numValue = parseInt(value, 10);
        if (isNaN(numValue)) return 0;
        if (unit === 'hours') return numValue * 60 * 60 * 1000;
        return numValue * 24 * 60 * 60 * 1000;
    };
    
    // 1. Flag timed-out files
    if (cleanupSettings.timeout.enabled) {
      const timeoutMs = getMilliseconds(cleanupSettings.timeout.value, cleanupSettings.timeout.unit);
      if (timeoutMs > 0) {
        const filesToCheck = (await db.getFileStatuses()).filter(f => f.status === 'processing');
        const filesToUpdate: FileStatus[] = [];
        for (const file of filesToCheck) {
            if (now.getTime() - new Date(file.lastUpdated).getTime() > timeoutMs) {
              file.status = 'timed-out';
              file.lastUpdated = now.toISOString();
              filesToUpdate.push(file);
              dbChanged = true;
            }
        }
        if (filesToUpdate.length > 0) {
          await db.bulkUpsertFileStatuses(filesToUpdate);
        }
      }
    }

    // 2. Clear old status entries from dashboard
    if (cleanupSettings.status.enabled) {
      const statusMaxAgeMs = getMilliseconds(cleanupSettings.status.value, cleanupSettings.status.unit);
      if (statusMaxAgeMs > 0) {
        const changes = await db.deleteFileStatusesByAge(statusMaxAgeMs);
        if (changes > 0) dbChanged = true;
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
                        if (now.getTime() - stats.birthtime.getTime() > fileMaxAgeMs) {
                            await fs.unlink(filePath);
                            console.log(`[Cleanup] Deleted old file: ${fileName}`);
                        }
                    } catch (statError: any) {
                         if (statError.code !== 'ENOENT') console.error(`[Cleanup] Error getting stats for ${filePath}:`, statError);
                    }
                }
            } catch (readDirError: any) {
                 if (readDirError.code !== 'ENOENT') console.error(`[Cleanup] Error reading failed directory ${failedPath}:`, readDirError);
            }
        }
    }

  } catch (error) {
    console.error('[Cleanup] An error occurred:', error);
  } finally {
    isCleaning = false;
  }
}

// --- Service Initialization ---
async function initializePollingService() {
  console.log('[Service] Initializing polling and cleanup services...');
  try {
    const monitoredPaths = await db.getMonitoredPaths();
    await fs.access(monitoredPaths.import.path);
    await fs.access(monitoredPaths.failed.path);
    console.log(`[Service] Watching Import: ${monitoredPaths.import.path}`);
    console.log(`[Service] Watching Failed: ${monitoredPaths.failed.path}`);
    setInterval(pollDirectories, POLLING_INTERVAL);
    setInterval(cleanupJob, CLEANUP_INTERVAL);
    console.log(`[Service] Polling started every ${POLLING_INTERVAL / 1000}s.`);
    console.log(`[Service] Cleanup job runs every ${CLEANUP_INTERVAL / 1000}s.`);
  } catch(error: any) {
       console.error(`[Service] A monitored directory is not accessible. Please check paths in settings. Error: ${error.message}`);
  }
}

// Start the service
(async () => {
    try {
        // The db module initializes itself on first import
        console.log("[Service] Waiting for DB to initialize...");
        await new Promise(resolve => setTimeout(resolve, 1000)); // Short delay to ensure db is ready
        await initializePollingService();
    } catch (error) {
        console.error("[Service] Failed to start services:", error);
    }
})();
