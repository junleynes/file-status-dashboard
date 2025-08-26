
'use server';

import { revalidatePath } from 'next/cache';
import { readDb, writeDb } from './db';
import type { BrandingSettings, CleanupSettings, MonitoredPath, MonitoredPaths, User } from '@/types';
import fs from 'fs/promises';

async function testLocalPath(path: string): Promise<{ success: boolean; error?: string }> {
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

async function testNetworkPath(pathData: MonitoredPath): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Network path testing is not yet implemented.' };
}


export async function testPath(pathData: MonitoredPath): Promise<{ success: boolean; error?: string }> {
    if (pathData.type === 'local') {
        return testLocalPath(pathData.path);
    } else {
        return testNetworkPath(pathData);
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

export async function simulateFileProcessing() {
    // This function is now disabled to prevent creating fake files.
    // In a real application, this is where you would implement logic
    // to check the monitored folders for actual file changes.
}
