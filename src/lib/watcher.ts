
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
      if (event.eventType === 'add') {
        await handleFileAdd(event.filePath);
      } else if (event.eventType === 'unlink') {
        await handleFileUnlink(event.filePath);
      }
    } catch (error) {
      console.error(`[Queue] Error processing event for ${event.filePath}:`, error);
    }
  }

  isProcessing = false;
  // Immediately check for the next item
  process.nextTick(processQueue);
}

function enqueueEvent(eventType: 'add' | 'unlink', filePath: string) {
    // Prevent duplicate events
    if (!eventQueue.some(e => e.filePath === filePath && e.eventType === eventType)) {
        console.log(`[Queue] Enqueueing event: ${eventType} for ${filePath}`);
        eventQueue.push({ eventType, filePath });
        process.nextTick(processQueue);
    } else {
        console.log(`[Queue] Duplicate event ignored: ${eventType} for ${filePath}`);
    }
}


// --- Event-Specific Handlers ---

async function handleFileAdd(filePath: string) {
  const db = await readDb();
  const failedPath = db.monitoredPaths.failed.path;

  // Determine if the file was added to the 'import' or 'failed' directory
  if (path.dirname(filePath) === failedPath) {
    // --- File added to FAILED folder ---
    console.log(`[Handler] File detected in failed: ${filePath}`);
    const fileKey = path.basename(filePath);

    // Clear any timeout timer
    if (timers.has(fileKey)) {
      clearTimeout(timers.get(fileKey)!);
      timers.delete(fileKey);
      console.log(`[Handler] Cleared timeout for ${fileKey}.`);
    }

    await updateFileStatus(filePath, "failed");
    const remarks = await validateFilename(filePath);
    if (remarks.length > 0) {
      await updateFileRemarks(filePath, remarks.join("; "));
    }

  } else {
    // --- New file detected in IMPORT ---
    console.log(`[Handler] New file in import: ${filePath}`);
    const fileKey = path.basename(filePath);
    await addFileStatus(filePath, "processing");

    // Clear any existing timer for this file key just in case
    if (timers.has(fileKey)) {
      clearTimeout(timers.get(fileKey)!);
    }
    
    // Set a timeout for the file to be marked as 'timed-out'
    const timeoutMs = getTimeoutMs(db);
    if (timeoutMs > 0) {
      const t = setTimeout(async () => {
        try {
          await fs.access(filePath); // Check if file still exists in import
          console.log(`[Handler] Timed out: ${filePath}`);
          await updateFileStatus(filePath, "timed-out");
          timers.delete(fileKey);
        } catch {
          // File doesn't exist, likely moved. Do nothing.
        }
      }, timeoutMs);
      timers.set(fileKey, t);
      console.log(`[Handler] Timeout set for ${fileKey} in ${timeoutMs}ms.`);
    }
  }
}

async function handleFileUnlink(filePath: string) {
  console.log(`[Handler] File removed from import: ${filePath}`);
  const fileKey = path.basename(filePath);

  // We need to check if the file was moved to 'failed' or if it was 'published'
  // We'll give it a moment for the 'add' event on the failed folder to be processed
  setTimeout(async () => {
    const currentDb = await readDb();
    const file = currentDb.fileStatuses.find(f => f.name === fileKey);

    // If after the delay, the status is still 'processing', it means it wasn't moved to 'failed'
    if (file && file.status === 'processing') {
      console.log(`[Handler] File determined to be published: ${fileKey}`);
      await updateFileStatus(filePath, "published");
      if (timers.has(fileKey)) {
        clearTimeout(timers.get(fileKey)!);
        timers.delete(fileKey);
      }
    } else {
        console.log(`[Handler] Unlink for ${fileKey} ignored, status is now '${file?.status}'.`);
    }
  }, 1500); // 1.5 second delay to allow other events to be processed
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

  const filenamePattern = /^BV_[A-Z0-9]{6}_[A-Z0-9]+.*$/;

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
  
  // Ensure paths are resolved
  const resolvedImportPath = path.resolve(importPath);
  const resolvedFailedPath = path.resolve(failedPath);
  
  if (resolvedImportPath === resolvedFailedPath) {
      console.error("[Watcher] Import and Failed paths cannot be the same. Watcher cannot start.");
      return;
  }

  const watcherOptions = {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 100 },
    usePolling: true,
    interval: 1000,
  };
  
  // Watcher for BOTH import and failed paths. We will distinguish them in the handler.
  const mainWatcher = chokidar.watch([resolvedImportPath, resolvedFailedPath], {
    ...watcherOptions,
    depth: 0, 
  });
  
  mainWatcher
    .on("add", (filePath) => enqueueEvent('add', filePath))
    .on("unlink", (filePath) => {
        // Only trigger unlink for the import path
        if (path.dirname(filePath) === resolvedImportPath) {
            enqueueEvent('unlink', filePath);
        }
    })
    .on("error", (err) => console.error("[Watcher] Main Watcher Error:", err))
    .on("ready", () =>
      console.log(`[Watcher] Watcher ready. Watching: ${resolvedImportPath} and ${resolvedFailedPath}`)
    );
}

console.log("[Watcher] Starting service...");
initializeWatcher().catch(console.error);
