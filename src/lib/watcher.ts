
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

// --- State and Configuration ---

const timers: Map<string, NodeJS.Timeout> = new Map();

interface FileEvent {
  eventType: 'add' | 'unlink';
  filePath: string;
}

let eventQueue: FileEvent[] = [];
let isProcessing = false;

// --- Core Event Processor ---

async function processQueue() {
  if (isProcessing || eventQueue.length === 0) {
    return;
  }
  isProcessing = true;
  const event = eventQueue.shift();

  if (event) {
    try {
      console.log(`[Queue] Processing event: ${event.eventType} for ${event.filePath}`);
      const db = await readDb();
      const importPath = db.monitoredPaths.import.path;
      const failedPath = db.monitoredPaths.failed.path;

      if (event.eventType === 'add') {
        if (path.dirname(event.filePath) === failedPath) {
          await handleFailedAdd(event.filePath);
        } else if (path.dirname(event.filePath) === importPath) {
          await handleImportAdd(event.filePath);
        }
      } else if (event.eventType === 'unlink') {
        if (path.dirname(event.filePath) === importPath) {
          await handleImportUnlink(event.filePath);
        }
      }
    } catch (error) {
      console.error(`[Queue] Error processing event for ${event.filePath}:`, error);
    }
  }

  isProcessing = false;
  // Immediately check for the next item
  process.nextTick(processQueue);
}

function enqueueEvent(eventType: 'add' | 'unlink', filePath: string, delay: number = 0) {
    const execute = () => {
        // Prevent duplicate events from being added to the queue
        if (!eventQueue.some(e => e.filePath === filePath && e.eventType === eventType)) {
            console.log(`[Queue] Enqueueing event: ${eventType} for ${filePath}`);
            eventQueue.push({ eventType, filePath });
            // Start processing if not already started
            if (!isProcessing) {
                process.nextTick(processQueue);
            }
        } else {
            console.log(`[Queue] Duplicate event for ${filePath} (${eventType}) ignored.`);
        }
    };

    if (delay > 0) {
        setTimeout(execute, delay);
    } else {
        execute();
    }
}


// --- Event-Specific Handlers ---

async function handleImportAdd(filePath: string) {
  console.log(`[Handler] New file in import: ${filePath}`);
  await addFileStatus(filePath, "processing");
  
  const fileKey = path.basename(filePath);
  // Clear any existing timer for this file, just in case
  if (timers.has(fileKey)) {
    clearTimeout(timers.get(fileKey)!);
  }
  
  const db = await readDb();
  const timeoutMs = getTimeoutMs(db);
  if (timeoutMs > 0) {
    const t = setTimeout(async () => {
      try {
        // Check if the file still exists in the import path before timing out
        await fs.access(filePath); 
        console.log(`[Handler] Timed out: ${filePath}`);
        await updateFileStatus(filePath, "timed-out");
        timers.delete(fileKey);
      } catch {
        // File no longer exists, so don't mark as timed-out. It was likely processed.
        console.log(`[Handler] Timeout for ${fileKey} cancelled, file no longer exists.`);
      }
    }, timeoutMs);
    timers.set(fileKey, t);
    console.log(`[Handler] Timeout set for ${fileKey} in ${timeoutMs}ms.`);
  }
}

async function handleFailedAdd(filePath: string) {
  console.log(`[Handler] File detected in failed: ${filePath}`);
  const fileKey = path.basename(filePath);

  // Clear any timeout timer, as the file has reached a final (failed) state
  if (timers.has(fileKey)) {
    clearTimeout(timers.get(fileKey)!);
    timers.delete(fileKey);
    console.log(`[Handler] Cleared timeout for ${fileKey} as it has failed.`);
  }

  await updateFileStatus(filePath, "failed");
  const remarks = await validateFilename(filePath);
  if (remarks.length > 0) {
    await updateFileRemarks(filePath, remarks.join("; "));
  }
}


async function handleImportUnlink(filePath: string) {
  console.log(`[Handler] File removed from import: ${filePath}`);
  const fileKey = path.basename(filePath);

  // We are relying on the `add` to `failed` being processed first.
  // This unlink handler's job is to catch the "success" case.
  const currentDb = await readDb();
  const file = currentDb.fileStatuses.find(f => f.name === fileKey);

  // Only if the status is still 'processing' can we assume it was published successfully.
  // If it had been moved to 'failed', its status would have been updated by `handleFailedAdd` first.
  if (file && file.status === 'processing') {
    console.log(`[Handler] File determined to be published: ${fileKey}`);
    await updateFileStatus(filePath, "published");
    
    // Clean up the timeout timer as the file has been processed successfully
    if (timers.has(fileKey)) {
      clearTimeout(timers.get(fileKey)!);
      timers.delete(fileKey);
    }
  } else {
      console.log(`[Handler] Unlink for ${fileKey} ignored, status is already '${file?.status}'.`);
  }
}


// --- Utility Functions ---

async function validateFilename(filePath: string): Promise<string[]> {
  const db = await readDb();
  const errors: string[] = [];
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  const validExts = db.monitoredExtensions.map(e => `.${e}`);

  if (validExts.length > 0 && !validExts.includes(ext)) {
    errors.push(`Invalid extension: ${ext}`);
  }

  // Example pattern, adjust as needed
  const filenamePattern = /.*/; // Accepting any filename for now

  if (!filenamePattern.test(filename.replace(ext, ""))) {
    errors.push(`Invalid filename format.`);
  }
  return errors;
}

function getTimeoutMs(db: any): number {
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

  const watcherOptions: chokidar.WatchOptions = {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 100 },
    usePolling: true,
    interval: 1000,
    ignored: (p: string) => p.includes(resolvedFailedPath),
  };
  
  const mainWatcher = chokidar.watch(resolvedImportPath, watcherOptions);
  
  mainWatcher
    .on("add", (filePath) => enqueueEvent('add', filePath))
    .on("unlink", (filePath) => enqueueEvent('unlink', filePath, 1500)) // Delay unlink to ensure 'add' to failed is processed first
    .on("error", (err) => console.error("[Watcher] Main Watcher Error:", err))
    .on("ready", () => console.log(`[Watcher] Import Watcher ready. Watching: ${resolvedImportPath}`));

  const failedWatcher = chokidar.watch(resolvedFailedPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
    usePolling: true,
    interval: 1000,
    depth: 0,
  });

  failedWatcher
    .on("add", (filePath) => enqueueEvent('add', filePath)) // Enqueue instantly
    .on("error", (err) => console.error("[Watcher] Failed Watcher Error:", err))
    .on("ready", () => console.log(`[Watcher] Failed Watcher ready. Watching: ${resolvedFailedPath}`));
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

    