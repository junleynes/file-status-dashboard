'use server';

import { revalidatePath } from 'next/cache';
import { readDb, writeDb } from './db';
import type { BrandingSettings, CleanupSettings, MonitoredPaths, User, FileStatus, MonitoredPath } from '@/types';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function testPath(path: string): Promise<{ success: boolean; error?: string }> {
    try {
        await fs.access(path);
        return { success: true };
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return { success: false, error: `Path does not exist: ${path}` };
        }
        if (error.code === 'EACCES') {
            return { success: false, error: `Permission denied: ${path}` };
        }
        return { success: false, error: `An unexpected error occurred: ${error.message}` };
    }
}

export async function updateBrandingSettings(settings: BrandingSettings) {
  const db = await readDb();
  db.branding = settings;
  await writeDb(db);
  revalidatePath('/settings');
  revalidatePath('/layout', 'layout');
}

export async function addUser(newUser: User): Promise<{ success: boolean, message?: string }> {
  const db = await readDb();
  const userExists = db.users.some(u => u.email === newUser.email);
  if (userExists) {
    return { success: false, message: "A user with this email already exists." };
  }
  const updatedUsers = [...db.users, newUser];
  await writeDb({ ...db, users: updatedUsers });
  revalidatePath('/settings');
  return { success: true };
}

export async function removeUser(userId: string) {
    const db = await readDb();
    const updatedUsers = db.users.filter(u => u.id !== userId);
    await writeDb({ ...db, users: updatedUsers });
    revalidatePath('/settings');
}

export async function updateUserPassword(userId: string, newPassword: string) {
    const db = await readDb();
    const updatedUsers = db.users.map(u => 
      u.id === userId ? { ...u, password: newPassword } : u
    );
    await writeDb({ ...db, users: updatedUsers });
    revalidatePath('/settings');
}

export async function updateUser(user: User) {
    const db = await readDb();
    const updatedUsers = db.users.map(u => 
      u.id === user.id ? { ...u, ...user } : u
    );
    await writeDb({ ...db, users: updatedUsers });
    revalidatePath('/settings');
}


export async function updateMonitoredPaths(paths: MonitoredPaths) {
  const db = await readDb();
  db.monitoredPaths = paths;
  await writeDb(db);
  revalidatePath('/settings');
}

export async function addMonitoredExtension(extension: string) {
    const db = await readDb();
    if (!db.monitoredExtensions.includes(extension)) {
        db.monitoredExtensions.push(extension);
        await writeDb(db);
        revalidatePath('/settings');
    }
}

export async function removeMonitoredExtension(extension: string) {
    const db = await readDb();
    db.monitoredExtensions = db.monitoredExtensions.filter(e => e !== extension);
    await writeDb(db);
    revalidatePath('/settings');
}

export async function updateCleanupSettings(settings: CleanupSettings) {
    const db = await readDb();
    db.cleanupSettings = settings;
    await writeDb(db);
    revalidatePath('/settings');
}

export async function clearAllFileStatuses() {
    const db = await readDb();
    db.fileStatuses = [];
    await writeDb(db);
    revalidatePath('/dashboard');
}

export async function addFileStatus(filePath: string, status: FileStatus['status']) {
    const db = await readDb();
    const fileName = path.basename(filePath);
    const sourceDir = path.dirname(filePath);

    // Prevent duplicates from the same source directory
    const sourceName = (Object.values(db.monitoredPaths) as MonitoredPath[]).find(p => p.path === sourceDir)?.name || path.basename(sourceDir);
    
    // Check if a record for this file already exists
    const existingFileIndex = db.fileStatuses.findIndex(f => f.name === fileName);
    
    if (existingFileIndex !== -1) {
        // Update existing record
        db.fileStatuses[existingFileIndex].status = status;
        db.fileStatuses[existingFileIndex].source = sourceName;
        db.fileStatuses[existingFileIndex].lastUpdated = new Date().toISOString();
        console.log(`Updated existing file status: ${fileName} to ${status}`);
    } else {
        // Add new record
        const newFileStatus: FileStatus = {
            id: `file-${Date.now()}-${Math.random()}`,
            name: fileName,
            status: status,
            source: sourceName,
            lastUpdated: new Date().toISOString(),
        };
        db.fileStatuses.unshift(newFileStatus); // Add to the top of the list
        console.log(`Added new file to track: ${fileName}`);
    }

    await writeDb(db);
    revalidatePath('/dashboard');
}


export async function updateFileStatus(filePath: string, newStatus: FileStatus['status']) {
    const db = await readDb();
    const fileName = path.basename(filePath);
    const fileIndex = db.fileStatuses.findIndex(f => f.name === fileName);

    if (fileIndex > -1) {
        db.fileStatuses[fileIndex].status = newStatus;
        db.fileStatuses[fileIndex].lastUpdated = new Date().toISOString();
        await writeDb(db);
        revalidatePath('/dashboard');
        console.log(`Updated status for file ${fileName} to ${newStatus}`);
    } else {
        // If file doesn't exist, create it. This can happen if a file is moved to 'failed' before being seen in 'import'
        console.log(`Could not find file ${fileName} to update. Adding it instead.`);
        await addFileStatus(filePath, newStatus);
    }
}

export async function updateFileRemarks(filePath: string, remarks: string) {
    const db = await readDb();
    const fileName = path.basename(filePath);
    const fileIndex = db.fileStatuses.findIndex(f => f.name === fileName);

    if (fileIndex > -1) {
        db.fileStatuses[fileIndex].remarks = remarks;
        db.fileStatuses[fileIndex].lastUpdated = new Date().toISOString();
        await writeDb(db);
        revalidatePath('/dashboard');
        console.log(`Updated remarks for file ${fileName}`);
    } else {
         console.log(`Could not find file ${fileName} to update remarks.`);
    }
}