import chokidar from "chokidar";
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
  
  // No validation rules if no extensions are specified
  if (validExts.length > 0 && !validExts.includes(ext)) {
    errors.push(`Invalid extension: ${ext}`);
  }
  
  // This is an example filename pattern rule. You can adjust it.
  // It checks for BV_XXXXXX_...
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

  const watcher = chokidar.watch([importPath, failedPath], {
    persistent: true,
    ignoreInitial: true,
    depth: 1, // only watch top-level files
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 200 },
  });

  const getFileKey = (filePath: string) => path.basename(filePath);

  // --- New file detected ---
  watcher.on("add", async (filePath) => {
    const fileKey = getFileKey(filePath);

    if (filePath.startsWith(importPath)) {
      console.log(`[Watcher] New file in import: ${filePath}`);
      await addFileStatus(filePath, "processing");

      if (timers.has(fileKey)) {
          clearTimeout(timers.get(fileKey)!);
      }

      // start timeout timer
      const t = setTimeout(async () => {
        try {
          await fs.access(filePath); // still exists
          await updateFileStatus(filePath, "timed-out");
          console.log(`[Watcher] Timed out: ${filePath}`);
          timers.delete(fileKey);
        } catch {
          // file removed — handled elsewhere
        }
      }, timeoutMs);

      timers.set(fileKey, t);
    }

    if (filePath.startsWith(failedPath)) {
      console.log(`[Watcher] File detected in failed: ${filePath}`);
      // This is a move, so update existing status, don't add new
      await updateFileStatus(filePath, "failed");

      if (timers.has(fileKey)) {
        clearTimeout(timers.get(fileKey)!);
        timers.delete(fileKey);
      }

      // validate
      const remarks = await validateFilename(filePath);
      if (remarks.length > 0) {
        await updateFileRemarks(filePath, remarks.join("; "));
      }
    }
  });

  // --- Handle removals (moves) ---
  watcher.on("unlink", async (filePath) => {
    console.log(`[Watcher] File removed: ${filePath}`);
    const fileKey = getFileKey(filePath);

    // If a file is removed from the import folder, it's either moved to Failed or Published
    if (filePath.startsWith(importPath)) {
      // We don't clear the timer here. If it appears in 'failed', the 'add' event will clear it.
      // If it doesn't appear in 'failed', it's published, so we clear it then.

      // small delay to allow chokidar to emit the "add" event in the failed folder if it was a move.
      setTimeout(async () => {
        const db = await readDb();
        const file = db.fileStatuses.find(f => f.name === fileKey);

        // If after the delay, the status is still 'processing', it means it wasn't moved to 'failed'.
        // Therefore, it must have been published.
        if (file && file.status === 'processing') {
            console.log(`[Watcher] File published: ${fileKey}`);
            await updateFileStatus(filePath, "published");
            if (timers.has(fileKey)) {
                clearTimeout(timers.get(fileKey)!);
                timers.delete(fileKey);
            }
        }
      }, 1000);
    }
  });

  watcher
    .on("error", (err) => console.error("[Watcher] Error:", err))
    .on("ready", () =>
      console.log(
        `[Watcher] Ready. Watching import: ${importPath}, and failed: ${failedPath}`
      )
    );
}

console.log("[Watcher] Starting service...");
initializeWatcher().catch(console.error);