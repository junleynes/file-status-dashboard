
import * as chokidar from "chokidar";
import { readDb } from "./db";
import {
  addFileStatus,
  updateFileStatus,
  updateFileRemarks,
} from "./actions";
import * as path from "path";
import * as fs from "fs/promises";

const timers: Map<string, NodeJS.Timeout> = new Map();

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

async function initializeWatcher() {
  console.log("[Watcher] Initializing file watcher service...");
  const db = await readDb();
  const importPath = db.monitoredPaths.import.path;
  const failedPath = db.monitoredPaths.failed.path;
  
  let timeoutValue = 24; // Default timeout
  if(db.cleanupSettings.timeout.enabled) {
    const value = parseInt(db.cleanupSettings.timeout.value, 10);
    const unit = db.cleanupSettings.timeout.unit;
    timeoutValue = unit === 'days' ? value * 24 : value;
  }
  const timeoutMs = timeoutValue * 60 * 60 * 1000;


  if (!importPath || !failedPath) {
      console.error("[Watcher] Import or Failed paths are not configured. Watcher cannot start.");
      return;
  }

  const watcherOptions = {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 200 },
    usePolling: true,
    interval: 1000,
  };

  const importWatcher = chokidar.watch(importPath, {
    ...watcherOptions,
    depth: 0, 
    ignored: (p: string) => path.resolve(p) === path.resolve(failedPath),
  });

  const failedWatcher = chokidar.watch(failedPath, {
    ...watcherOptions,
    depth: 0,
  });

  const getFileKey = (filePath: string) => path.basename(filePath);

  // --- New file detected in IMPORT ---
  importWatcher.on("add", async (filePath) => {
    const fileKey = getFileKey(filePath);
    console.log(`[Watcher] New file in import: ${filePath}`);
    await addFileStatus(filePath, "processing");

    if (timers.has(fileKey)) {
        clearTimeout(timers.get(fileKey)!);
    }

    if (timeoutMs > 0) {
        const t = setTimeout(async () => {
        try {
            await fs.access(filePath); 
            await updateFileStatus(filePath, "timed-out");
            console.log(`[Watcher] Timed out: ${filePath}`);
            timers.delete(fileKey);
        } catch {
        }
        }, timeoutMs);

        timers.set(fileKey, t);
    }
  });

  // --- Handle removals from IMPORT (moves) ---
  importWatcher.on("unlink", async (filePath) => {
    console.log(`[Watcher] File removed from import: ${filePath}`);
    const fileKey = getFileKey(filePath);

    setTimeout(async () => {
      const currentDb = await readDb();
      const file = currentDb.fileStatuses.find(f => f.name === fileKey);

      if (file && file.status === 'processing') {
          console.log(`[Watcher] File published: ${fileKey}`);
          await updateFileStatus(filePath, "published");
          if (timers.has(fileKey)) {
              clearTimeout(timers.get(fileKey)!);
              timers.delete(fileKey);
          }
      }
    }, 1500); 
  });

  // --- File added to FAILED folder ---
  failedWatcher.on("add", async (filePath) => {
      const fileKey = getFileKey(filePath);
      console.log(`[Watcher] File detected in failed: ${filePath}`);
      await updateFileStatus(filePath, "failed");

      if (timers.has(fileKey)) {
        clearTimeout(timers.get(fileKey)!);
        timers.delete(fileKey);
      }

      const remarks = await validateFilename(filePath);
      if (remarks.length > 0) {
        await updateFileRemarks(filePath, remarks.join("; "));
      }
  });

  importWatcher
    .on("error", (err) => console.error("[Watcher] Import Watcher Error:", err))
    .on("ready", () =>
      console.log(
        `[Watcher] Import watcher ready. Watching: ${importPath}, Ignoring: ${failedPath}`
      )
    );
  
  failedWatcher
    .on("error", (err) => console.error("[Watcher] Failed Watcher Error:", err))
    .on("ready", () =>
      console.log(
        `[Watcher] Failed watcher ready. Watching: ${failedPath}`
      )
    );
}

console.log("[Watcher] Starting service...");
initializeWatcher().catch(console.error);
