
'use server';

import * as chokidar from "chokidar";
import { readDb } from "./db";
import {
  addFileStatus,
  updateFileStatus,
  updateFileRemarks,
} from "./actions";
import * as path from "path";
import * as fs from "fs/promises";
import type { Database, FileStatus } from "../types";

const timers: Map<string, NodeJS.Timeout> = new Map();
const CLEANUP_INTERVAL = 15000; // 15 seconds

// --- Event-Specific Handlers ---

async function handleFileAdd(filePath: string, db: Database) {
    const importPath = path.resolve(db.monitoredPaths.import.path);
    const failedPath = path.resolve(db.monitoredPaths.failed.path);
    const dir = path.dirname(filePath);

    if (dir === importPath) {
        console.log(`[Handler] New file in import: ${filePath}`);
        await addFileStatus(filePath, "processing");
        startTimeout(filePath, db);
    } else if (dir === failedPath) {
        console.log(`[Handler] File detected in failed: ${filePath}`);
        clearTimeoutForFile(filePath);
        await updateFileStatus(filePath, "failed");
        const remarks = await getFailureRemark();
        if (remarks) {
            await updateFileRemarks(filePath, remarks);
        }
    }
}

// --- Cleanup & Utility Functions ---

async function cleanupJob() {
    console.log('[Cleanup] Running cleanup job...');
    const db = await readDb();
    const importPath = path.resolve(db.monitoredPaths.import.path);
    
    // Find files that are still 'processing'.
    const processingFiles = db.fileStatuses.filter(f => f.status === 'processing');

    if (processingFiles.length === 0) {
        console.log('[Cleanup] No files in processing state. Job complete.');
        return;
    }

    console.log(`[Cleanup] Found ${processingFiles.length} file(s) in processing state to verify.`);

    for (const file of processingFiles) {
        const filePathInImport = path.join(importPath, file.name);
        try {
            // Check if the file still exists in the import directory.
            await fs.access(filePathInImport);
            // If it exists, it's still legitimately processing. Do nothing.
            console.log(`[Cleanup] File "${file.name}" is still in import folder. Status is correct.`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // The file does NOT exist in the import folder anymore.
                // We can now safely assume it has been processed and mark it as 'published'.
                // This catches cases where the 'unlink' event was missed.
                console.log(`[Cleanup] File "${file.name}" no longer in import. Updating status to 'published'.`);
                await updateFileStatus(filePathInImport, "published");
            }
        }
    }
     console.log('[Cleanup] Cleanup job finished.');
}


function startTimeout(filePath: string, db: Database) {
    const fileKey = path.basename(filePath);
    clearTimeoutForFile(filePath); // Clear existing timer just in case

    const timeoutMs = getTimeoutMs(db);
    if (timeoutMs > 0) {
        const t = setTimeout(async () => {
            try {
                await fs.access(filePath);
                console.log(`[Timeout] File still exists, marking as timed-out: ${filePath}`);
                await updateFileStatus(filePath, "timed-out");
                timers.delete(fileKey);
            } catch {
                console.log(`[Timeout] File no longer exists, timeout for ${fileKey} cancelled.`);
            }
        }, timeoutMs);
        timers.set(fileKey, t);
        console.log(`[Timeout] Set for ${fileKey} in ${timeoutMs}ms.`);
    }
}

function clearTimeoutForFile(filePath: string) {
    const fileKey = path.basename(filePath);
    if (timers.has(fileKey)) {
        clearTimeout(timers.get(fileKey)!);
        timers.delete(fileKey);
        console.log(`[Timeout] Cleared for ${fileKey}.`);
    }
}

async function getFailureRemark(): Promise<string> {
  const db = await readDb();
  return db.failureRemark || "File processing failed.";
}

function getTimeoutMs(db: Database): number {
    if (db.cleanupSettings.timeout.enabled) {
        const value = parseInt(db.cleanupSettings.timeout.value, 10);
        const unit = db.cleanupSettings.timeout.unit;
        const multiplier = unit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        return value * multiplier;
    }
    return 0;
}


// --- Watcher Initialization ---

async function initializeWatcher() {
  console.log("[Watcher] Initializing file watcher service...");
  const db = await readDb();
  const importPath = db.monitoredPaths.import.path;
  const failedPath = db.monitoredPaths.failed.path;
  
  if (!importPath || !failedPath) {
    console.error("[Watcher] Import or Failed paths are not configured. Watcher cannot start.");
    return;
  }
  
  const resolvedImportPath = path.resolve(importPath);
  const resolvedFailedPath = path.resolve(failedPath);
  
  if (resolvedImportPath === resolvedFailedPath) {
      console.error("[Watcher] Import and Failed paths cannot be the same. Watcher cannot start.");
      return;
  }

  const pathsToWatch = [resolvedImportPath, resolvedFailedPath];

  const watcherOptions: chokidar.WatchOptions = {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 100 },
    usePolling: true,
    interval: 1000,
    depth: 0, // Only watch the immediate directory, not subfolders
  };
  
  const watcher = chokidar.watch(pathsToWatch, watcherOptions);
  
  console.log(`[Watcher] Now watching paths: ${pathsToWatch.join(', ')}`);

  watcher
    .on("add", async (filePath) => {
        const db = await readDb();
        if (db.monitoredExtensions.length > 0 && !db.monitoredExtensions.some(ext => filePath.endsWith(`.${ext}`))) {
            return; // Ignore files that don't match the monitored extensions
        }
        await handleFileAdd(filePath, db);
    })
    .on("error", (err) => console.error("[Watcher] Watcher Error:", err))
    .on("ready", () => {
        console.log(`[Watcher] Watcher is ready.`);
        // Start the periodic cleanup job once the watcher is ready.
        setInterval(cleanupJob, CLEANUP_INTERVAL);
        console.log(`[Cleanup] Periodic cleanup job scheduled to run every ${CLEANUP_INTERVAL / 1000} seconds.`);
    });
}

// Start the service
(async () => {
    try {
        console.log("[Watcher] Starting service...");
        await initializeWatcher();
    } catch (error) {
        console.error("[Watcher] Failed to start watcher service:", error);
    }
})();

