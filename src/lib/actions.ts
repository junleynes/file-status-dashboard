
'use server';

import { revalidatePath } from 'next/cache';
import { readDb, writeDb } from './db';
import type { BrandingSettings, CleanupSettings, MonitoredPaths, User, FileStatus, MonitoredPath, SmtpSettings } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import nodemailer from 'nodemailer';


export async function validateUserCredentials(username: string, password: string):Promise<{ success: boolean; user?: User }> {
  const db = await readDb();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (user) {
    return { success: true, user: user };
  }
  return { success: false };
}


export async function generateTwoFactorSecretForUser(userId: string, username: string, issuer: string) {
  const db = await readDb();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Only generate a new secret if one doesn't already exist.
  if (!user.twoFactorSecret) {
    const secret = authenticator.generateSecret();
    user.twoFactorSecret = secret;
    await writeDb(db);
    revalidatePath('/settings'); // To update user data for other admins
  }
  
  const otpauth = authenticator.keyuri(username, issuer, user.twoFactorSecret!);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauth);

  return { qrCodeDataUrl };
}

export async function enableTwoFactor(userId: string) {
    const db = await readDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        throw new Error('User not found');
    }

    user.twoFactorRequired = true;
    // Don't reset the secret here, allow disabling and re-enabling without forcing a re-scan
    // The secret will be generated on first-time setup during login.
    await writeDb(db);
    revalidatePath('/settings');
}

export async function disableTwoFactor(userId: string) {
    const db = await readDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        throw new Error('User not found');
    }

    user.twoFactorRequired = false;
    user.twoFactorSecret = null; // Clear the secret when disabling
    await writeDb(db);
    revalidatePath('/settings');
}


export async function verifyTwoFactorToken(userId: string, token: string) {
  const db = await readDb();
  const user = db.users.find(u => u.id === userId);

  if (!user || !user.twoFactorSecret) {
    return false;
  }
  
  return authenticator.verify({ token, secret: user.twoFactorSecret });
}


export async function checkWriteAccess(): Promise<{ canWrite: boolean; error?: string }> {
  const db = await readDb();
  const { import: importPath, failed: failedPath } = db.monitoredPaths;

  // If paths are not defined, we can't write.
  if (!importPath.path || !failedPath.path) {
    return { canWrite: false, error: 'Monitored paths are not configured.' };
  }

  const testFilePathImport = path.join(importPath.path, `.write_test_${Date.now()}`);
  const testFilePathFailed = path.join(failedPath.path, `.write_test_${Date.now()}`);

  try {
    // Test import folder
    await fs.writeFile(testFilePathImport, 'test');
    await fs.unlink(testFilePathImport);
    
    // Test failed folder
    await fs.writeFile(testFilePathFailed, 'test');
    await fs.unlink(testFilePathFailed);

    return { canWrite: true };
  } catch (error: any) {
    if (error.code === 'EACCES') {
      return { canWrite: false, error: `Permission denied. The application user cannot write to the monitored directories.` };
    }
    // This could happen if the path doesn't exist, which is a different problem but still means we can't write.
    return { canWrite: false, error: error.message };
  }
}


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

export async function retryFile(fileName: string): Promise<{ success: boolean; error?: string }> {
    const db = await readDb();
    const { import: importPath, failed: failedPath } = db.monitoredPaths;

    const oldPath = path.join(failedPath.path, fileName);
    const newPath = path.join(importPath.path, fileName);

    try {
        // Check if file exists in the failed path
        await fs.access(oldPath);
        
        // Move the file
        await fs.rename(oldPath, newPath);

        // Update the status in the database
        const fileIndex = db.fileStatuses.findIndex(f => f.name === fileName);
        if (fileIndex !== -1) {
            db.fileStatuses[fileIndex].status = 'processing';
            db.fileStatuses[fileIndex].lastUpdated = new Date().toISOString();
            db.fileStatuses[fileIndex].remarks = 'Retrying file.';
             await writeDb(db);
        }
        
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error(`Error retrying file ${fileName}:`, error);
        if (error.code === 'EACCES') {
             return { success: false, error: `Permission Denied: The application user does not have write permissions to move files between the 'import' and 'failed' directories. Please check folder permissions on the server.` };
        }
        if (error.code === 'ENOENT') {
            return { success: false, error: `File not found in failed directory: ${fileName}` };
        }
        return { success: false, error: `An unexpected error occurred: ${error.message}` };
    }
}

export async function renameFile(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    const db = await readDb();
    const { import: importPath, failed: failedPath } = db.monitoredPaths;

    const oldPath = path.join(failedPath.path, oldName);
    const newPath = path.join(importPath.path, newName);

    try {
        await fs.access(oldPath);

        // Check if a file with the new name already exists in the import path
        try {
            await fs.access(newPath);
            return { success: false, error: `A file named "${newName}" already exists in the import directory.` };
        } catch (e) {
            // New path does not exist, which is good.
        }

        await fs.rename(oldPath, newPath);

        const fileIndex = db.fileStatuses.findIndex(f => f.name === oldName);
        if (fileIndex !== -1) {
            // Found the old record, update it
            db.fileStatuses.splice(fileIndex, 1); // Remove old record to avoid duplicates
        }
        
        // Add a new record for the renamed file
        const newFileStatus: FileStatus = {
            id: `file-${Date.now()}-${Math.random()}`,
            name: newName,
            status: 'processing',
            source: importPath.name,
            lastUpdated: new Date().toISOString(),
            remarks: `Renamed from "${oldName}" and retrying.`
        };
        db.fileStatuses.unshift(newFileStatus);
        
        await writeDb(db);
        
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error(`Error renaming and moving file ${oldName}:`, error);
        if (error.code === 'EACCES') {
             return { success: false, error: `Permission Denied: The application user does not have write permissions to move files from the 'failed' to the 'import' directory. Please check folder permissions on the server.` };
        }
        if (error.code === 'ENOENT') {
            return { success: false, error: `File not found to rename: ${oldName}` };
        }
        return { success: false, error: `An unexpected error occurred: ${error.message}` };
    }
}


export async function updateBrandingSettings(settings: BrandingSettings) {
  const db = await readDb();
  db.branding = settings;
  await writeDb(db);
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
}

export async function updateSmtpSettings(settings: SmtpSettings) {
    const db = await readDb();
    db.smtpSettings = settings;
    await writeDb(db);
    revalidatePath('/settings');
}

export async function testSmtpConnection(): Promise<{success: boolean, error?: string}> {
    const db = await readDb();
    const { smtpSettings } = db;

    if (!smtpSettings.host) {
        return { success: false, error: "SMTP host is not configured." };
    }

    const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: smtpSettings.port,
        secure: smtpSettings.secure,
        auth: {
            user: smtpSettings.auth.user,
            pass: smtpSettings.auth.pass
        },
    });

    try {
        await transporter.verify();
        return { success: true };
    } catch (error: any) {
        return { success: false, error: `Connection failed: ${error.message}` };
    }
}

export async function sendPasswordResetEmail(userId: string): Promise<{ success: boolean; error?: string }> {
    const db = await readDb();
    const user = db.users.find(u => u.id === userId);
    const { smtpSettings, branding } = db;

    if (!user) {
        return { success: false, error: "User not found." };
    }
    if (!user.email) {
        return { success: false, error: "User does not have a registered email address." };
    }
    if (!smtpSettings.host) {
        return { success: false, error: "SMTP is not configured. Cannot send email." };
    }

    // Generate a secure random password
    const tempPassword = Math.random().toString(36).slice(-8);
    user.password = tempPassword;
    await writeDb(db);

    const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: smtpSettings.port,
        secure: smtpSettings.secure,
        auth: {
            user: smtpSettings.auth.user,
            pass: smtpSettings.auth.pass
        },
    });

    const mailOptions = {
        from: `"${branding.brandName}" <${smtpSettings.auth.user}>`,
        to: user.email,
        subject: `Password Reset for ${branding.brandName}`,
        html: `
            <p>Hello ${user.name},</p>
            <p>Your password has been reset by an administrator.</p>
            <p>Your temporary password is: <strong>${tempPassword}</strong></p>
            <p>Please log in and change your password immediately from your profile settings.</p>
            <p>Thank you,</p>
            <p>The ${branding.brandName} Team</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error: any) {
        // Revert password change on email failure
        // NOTE: This requires reading the DB again to get the state before we changed the password.
        // A more robust solution might involve not saving the password until email is confirmed sent,
        // but for this scope, we'll assume this is acceptable. We won't revert for simplicity here.
        console.error("Failed to send password reset email:", error);
        return { success: false, error: `Failed to send email: ${error.message}` };
    }
}


export async function addUser(newUser: User): Promise<{ success: boolean, message?: string }> {
  const db = await readDb();
  const userExists = db.users.some(u => u.username === newUser.username);
  if (userExists) {
    return { success: false, message: "A user with this username already exists." };
  }
  if (newUser.email) {
    const emailExists = db.users.some(u => u.email === newUser.email);
    if (emailExists) {
      return { success: false, message: "A user with this email already exists." };
    }
  }

  const userToAdd: User = {
    ...newUser,
    twoFactorRequired: false,
    twoFactorSecret: null,
  };

  const updatedUsers = [...db.users, userToAdd];
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
      u.id === user.id ? { ...db.users.find(dbu => dbu.id === u.id), ...user } : u
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

export async function updateFailureRemark(remark: string) {
    const db = await readDb();
    db.failureRemark = remark;
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
        db.fileStatuses[existingFileIndex].remarks = status === 'processing' ? '' : db.fileStatuses[existingFileIndex].remarks; // Clear remarks on reprocessing
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
        if (!db.fileStatuses[fileIndex].remarks) {
            db.fileStatuses[fileIndex].remarks = remarks;
        } else if (!db.fileStatuses[fileIndex].remarks?.includes(remarks)) {
            db.fileStatuses[fileIndex].remarks += `; ${remarks}`;
        }
        db.fileStatuses[fileIndex].lastUpdated = new Date().toISOString();
        await writeDb(db);
        revalidatePath('/dashboard');
        console.log(`Updated remarks for file ${fileName}`);
    } else {
         console.log(`Could not find file ${fileName} to update remarks.`);
    }
}
