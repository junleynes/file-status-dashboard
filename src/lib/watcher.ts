
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

// Helper function to extract user from remarks
const extractUserFromRemarks = (remarks: string | undefined): string | null => {
  if (!remarks) return null;
  const match = remarks.match(/\[user: (.*?)\]/);
  return match ? `[user: ${match[1]}]` : null;
};

const isExpandable = (fileName: string): boolean => {
    const name = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const parts = name.split('_');
    if (parts.length !== 4) return false;
    const prefixPairs = parts[0];
    if (prefixPairs.length < 4 || prefixPairs.length % 2 !== 0) return false;

    let validPrefixCount = 0;
    for (let i = 0; i < prefixPairs.length; i += 2) {
      if (['P', 'B', 'C'].includes(prefixPairs[i].toUpperCase())) {
        validPrefixCount++;
      }
    }
    return validPrefixCount > 1;
};

const expandFile = async (fileName: string): Promise<{ success: boolean; count?: number; error?: string }> => {
    const { import: importPath, failed: failedPath } = await db.getMonitoredPaths();
    const originalFilePath = path.join(failedPath.path, fileName);
    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);

    try {
        await fs.access(originalFilePath);
    } catch {
        return { success: false, error: `File not found: ${fileName}` };
    }

    const parts = baseName.split('_');
    const prefixPairsStr = parts[0];
    const validPairs: string[] = [];
    if (prefixPairsStr.length > 0 && prefixPairsStr.length % 2 === 0) {
        for (let i = 0; i < prefixPairsStr.length; i += 2) {
            if (['P', 'B', 'C'].includes(prefixPairsStr[i].toUpperCase())) {
                validPairs.push(prefixPairsStr.substring(i, i + 2));
            }
        }
    }

    const newFilesToUpsert: FileStatus[] = [];
    for (const pair of validPairs) {
        const newFileName = `${pair}_${parts[1]}_${parts[2]}_${parts[3]}${fileExt}`;
        const newFilePath = path.join(importPath.path, newFileName);
        try {
            await fs.copyFile(originalFilePath, newFilePath);
            newFilesToUpsert.push({
                id: `file-${Date.now()}-${Math.random()}`,
                name: newFileName,
                status: 'processing',
                source: importPath.name,
                lastUpdated: new Date().toISOString(),
                remarks: `Auto-expanded from ${fileName}.`
            });
        } catch (copyError) {
            console.error(`[Watcher] ERROR: Failed to create copy for expansion "${newFileName}":`, copyError);
            // Cleanup created files on failure
            for (const fileToClean of newFilesToUpsert) {
                try { await fs.unlink(path.join(importPath.path, fileToClean.name)); } catch {}
            }
            return { success: false, error: `Failed to create copy: ${newFileName}.` };
        }
    }

    try {
        await fs.unlink(originalFilePath);
        await db.deleteFileStatus(fileName);
        await db.bulkUpsertFileStatuses(newFilesToUpsert);
        return { success: true, count: validPairs.length };
    } catch (deleteError) {
        console.error(`[Watcher] ERROR: Failed to delete original auto-expanded file "${fileName}":`, deleteError);
        return { success: false, error: `Failed to delete original file after expansion.` };
    }
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
        console.error('[Watcher] Monitored paths are not configured. Skipping poll cycle.');
        isPolling = false;
        return;
    }
    
    let dbWrites: Promise<any>[] = [];
    let filesToUpsert: FileStatus[] = [];
    let filesToDeleteFromDb: string[] = [];

    // --- Files on Disk ---
    let filesInFailed = await fs.readdir(failedPath).catch(() => [] as string[]);
    
    // --- Pass 1: Handle automated workflows for files in Rejected folder ---
    const filesToProcessInFailed = [...filesInFailed];
    for (const originalFileName of filesToProcessInFailed) {
      let wasProcessed = false;

      // Workflow: Auto-expand prefixes
      if (autoExpandPrefixes && isExpandable(originalFileName)) {
          const expansionResult = await expandFile(originalFileName);
          if (expansionResult.success) {
            console.log(`[Watcher] Auto-expanded "${originalFileName}" into ${expansionResult.count} new files.`);
            filesInFailed = filesInFailed.filter(f => f !== originalFileName);
            wasProcessed = true;
          } else {
            console.error(`[Watcher] ERROR: Auto-expansion failed for "${originalFileName}":`, expansionResult.error);
          }
      }
      
      // Workflow: Auto-fix invalid characters (only if not expanded)
      if (!wasProcessed && autoTrimInvalidChars) {
        const cleanedFileName = cleanFileName(originalFileName);
        if (originalFileName !== cleanedFileName) {
            const oldPath = path.join(failedPath, originalFileName);
            const newPath = path.join(importPath, cleanedFileName);
            
            try {
                await fs.access(newPath); // Check if a file with the cleaned name already exists
            } catch (e) {
                try { // File does not exist, proceed with rename/move
                    await fs.rename(oldPath, newPath);
                    filesToDeleteFromDb.push(originalFileName);
                    filesToUpsert.push({
                        id: `file-${Date.now()}-${Math.random()}`, name: cleanedFileName, status: 'processing',
                        source: monitoredPaths.import.name, lastUpdated: new Date().toISOString(),
                        remarks: `Auto-renamed from "${originalFileName}" and retried.`
                    });
                    filesInFailed = filesInFailed.filter(f => f !== originalFileName);
                    wasProcessed = true;
                } catch (renameError) {
                    console.error(`[Watcher] ERROR: Failed to auto-fix and retry "${originalFileName}":`, renameError);
                }
            }
        }
      }
    }


    // Refresh file lists after automated moves/deletes
    const filesInImport = await fs.readdir(importPath).catch(() => [] as string[]);
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
        const userRemark = extractUserFromRemarks(file.remarks);
        file.status = 'published';
        file.remarks = `File processed successfully. ${userRemark || ''}`.trim();
        file.lastUpdated = new Date().toISOString();
        filesToUpsert.push(file);
      } else if (inFailed && file.status !== 'failed') {
        file.status = 'failed';
        file.remarks = failureRemark;
        file.lastUpdated = new Date().toISOString();
        filesToUpsert.push(file);
      } else if (inImport && ['published', 'failed', 'timed-out'].includes(file.status)) {
        const userRemark = extractUserFromRemarks(file.remarks);
        file.status = 'processing';
        file.remarks = file.remarks?.includes('Auto-') ? file.remarks : `Retrying file. ${userRemark || ''}`.trim();
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
    if (filesToDeleteFromDb.length > 0) {
      filesToDeleteFromDb.forEach(name => dbWrites.push(db.deleteFileStatus(name)));
    }
    
    if (dbWrites.length > 0) {
      await Promise.all(dbWrites);
    }

  } catch (error) {
    console.error('[Watcher] An error occurred during the poll cycle:', error);
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
async function initializeWatcherService() {
  console.log('[Watcher] Initializing file watcher service...');
  try {
    // Ensure DB is warm
    await db.getUsers(); 
    
    const monitoredPaths = await db.getMonitoredPaths();
    if (!monitoredPaths.import.path || !monitoredPaths.failed.path) {
        console.log('[Watcher] Monitored paths are not configured. Watcher will not start.');
        return;
    }

    await fs.access(monitoredPaths.import.path);
    await fs.access(monitoredPaths.failed.path);
    
    console.log(`[Watcher] Import directory: ${monitoredPaths.import.path}`);
    console.log(`[Watcher] Failed directory: ${monitoredPaths.failed.path}`);
    
    setInterval(pollDirectories, POLLING_INTERVAL);
    setInterval(cleanupJob, CLEANUP_INTERVAL);
    
    console.log(`[Watcher] Service started successfully. Polling every ${POLLING_INTERVAL / 1000} seconds.`);
  } catch(error: any) {
       console.error(`[Watcher] CRITICAL: A monitored directory is not accessible. Please verify paths in settings. Error: ${error.message}`);
       console.error('[Watcher] Service will not start due to inaccessible directories.');
  }
}

// Start the service. A delay is added to prevent race conditions during app startup.
console.log('[Watcher] Staging watcher service startup...');
setTimeout(initializeWatcherService, 2000);
