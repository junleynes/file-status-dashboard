'use server';

import { revalidatePath } from 'next/cache';
import { readDb, writeDb } from './db';
import type { CleanupSettings, MonitoredPath, FileStatus, User } from '@/types';

export async function updateBrandingSettings({
  brandName,
  logo,
}: {
  brandName: string;
  logo: string | null;
}) {
  const db = await readDb();
  db.branding = { brandName, logo };
  await writeDb(db);
  revalidatePath('/settings');
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


export async function addMonitoredPath(path: MonitoredPath) {
  const db = await readDb();
  db.monitoredPaths.push(path);
  await writeDb(db);
  revalidatePath('/settings');
}

export async function removeMonitoredPath(id: string) {
  const db = await readDb();
  db.monitoredPaths = db.monitoredPaths.filter((p) => p.id !== id);
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
    const db = await readDb();
    
    const processingFiles = db.fileStatuses.filter(f => f.status === 'processing');
    
    if (processingFiles.length > 0 && Math.random() > 0.3) {
        const fileToProcessIndex = db.fileStatuses.findIndex(f => f.id === processingFiles[0].id);
        if (fileToProcessIndex !== -1) {
            const outcome = Math.random();
            if (outcome < 0.2) { // 20% chance of failure
                db.fileStatuses[fileToProcessIndex] = {
                    ...db.fileStatuses[fileToProcessIndex],
                    status: 'failed',
                    source: 'Failed Folder',
                    lastUpdated: new Date().toISOString()
                };
            } else { // 80% chance of success
                db.fileStatuses[fileToProcessIndex] = {
                    ...db.fileStatuses[fileToProcessIndex],
                    status: 'published',
                    lastUpdated: new Date().toISOString()
                };
            }
        }
    } else {
        const newFile: FileStatus = {
          id: crypto.randomUUID(),
          name: `New_Ingest_${Math.floor(Math.random() * 1000)}.mxf`,
          status: 'processing',
          source: 'Main Import',
          lastUpdated: new Date().toISOString(),
        };
        db.fileStatuses.push(newFile);
    }
    
    db.fileStatuses.sort((a,b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    
    await writeDb(db);
    revalidatePath('/dashboard');
}
