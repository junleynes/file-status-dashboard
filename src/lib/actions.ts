
'use server';

import { revalidatePath } from 'next/cache';
import * as db from './db';
import type { BrandingSettings, CleanupSettings, MonitoredPaths, User, FileStatus, MonitoredPath, SmtpSettings, ProcessingSettings } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import nodemailer from 'nodemailer';


export async function validateUserCredentials(username: string, password: string):Promise<{ success: boolean; user?: User }> {
  const user = await db.getUserByUsername(username);
  if (user && user.password === password) {
    return { success: true, user: user };
  }
  return { success: false };
}


export async function generateTwoFactorSecretForUser(userId: string, username: string, issuer: string) {
  let user = await db.getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Only generate a new secret if one doesn't already exist.
  if (!user.twoFactorSecret) {
    const secret = authenticator.generateSecret();
    user.twoFactorSecret = secret;
    await db.updateUser(user);
    revalidatePath('/settings'); // To update user data for other admins
  }
  
  const otpauth = authenticator.keyuri(username, issuer, user.twoFactorSecret!);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauth);

  return { qrCodeDataUrl };
}

export async function enableTwoFactor(userId: string) {
    let user = await db.getUserById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    user.twoFactorRequired = true;
    await db.updateUser(user);
    revalidatePath('/settings');
}

export async function disableTwoFactor(userId: string) {
    let user = await db.getUserById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    user.twoFactorRequired = false;
    user.twoFactorSecret = null; // Clear the secret when disabling
    await db.updateUser(user);
    revalidatePath('/settings');
}


export async function verifyTwoFactorToken(userId: string, token: string) {
  const user = await db.getUserById(userId);
  if (!user || !user.twoFactorSecret) {
    return false;
  }
  return authenticator.verify({ token, secret: user.twoFactorSecret });
}


export async function checkWriteAccess(): Promise<{ canWrite: boolean; error?: string }> {
  const { import: importPath, failed: failedPath } = await db.getMonitoredPaths();

  if (!importPath.path || !failedPath.path) {
    return { canWrite: false, error: 'Monitored paths are not configured.' };
  }

  const testFilePathImport = path.join(importPath.path, `.write_test_${Date.now()}`);
  const testFilePathFailed = path.join(failedPath.path, `.write_test_${Date.now()}`);

  try {
    await fs.writeFile(testFilePathImport, 'test');
    await fs.unlink(testFilePathImport);
    await fs.writeFile(testFilePathFailed, 'test');
    await fs.unlink(testFilePathFailed);
    return { canWrite: true };
  } catch (error: any) {
    if (error.code === 'EACCES') {
      return { canWrite: false, error: `Permission denied. The application user cannot write to the monitored directories.` };
    }
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
    const { import: importPath, failed: failedPath } = await db.getMonitoredPaths();
    const oldPath = path.join(failedPath.path, fileName);
    const newPath = path.join(importPath.path, fileName);

    try {
        await fs.access(oldPath);
        await fs.rename(oldPath, newPath);

        let fileStatus = await db.getFileStatusByName(fileName);
        if (fileStatus) {
            fileStatus.status = 'processing';
            fileStatus.lastUpdated = new Date().toISOString();
            fileStatus.remarks = 'Retrying file.';
            await db.upsertFileStatus(fileStatus);
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
    const { import: importPath, failed: failedPath } = await db.getMonitoredPaths();
    const oldPath = path.join(failedPath.path, oldName);
    const newPath = path.join(importPath.path, newName);

    try {
        await fs.access(oldPath);
        try {
            await fs.access(newPath);
            return { success: false, error: `A file named "${newName}" already exists in the import directory.` };
        } catch (e) {}

        await fs.rename(oldPath, newPath);
        await db.deleteFileStatus(oldName);
        
        const newFileStatus: FileStatus = {
            id: `file-${Date.now()}-${Math.random()}`,
            name: newName,
            status: 'processing',
            source: importPath.name,
            lastUpdated: new Date().toISOString(),
            remarks: `Renamed from "${oldName}" and retrying.`
        };
        await db.upsertFileStatus(newFileStatus);
        
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

export async function deleteFailedFile(fileName: string): Promise<{ success: boolean; error?: string }> {
    const { failed: failedPath } = await db.getMonitoredPaths();
    const filePath = path.join(failedPath.path, fileName);
    
    try {
        await fs.unlink(filePath);
        await db.deleteFileStatus(fileName);
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error(`Error deleting file ${fileName}:`, error);
        if (error.code === 'ENOENT') {
            await db.deleteFileStatus(fileName);
            revalidatePath('/dashboard');
            return { success: true, error: 'File was not found on disk, but its status entry was removed.' };
        }
         if (error.code === 'EACCES') {
             return { success: false, error: `Permission Denied: The application user does not have write permissions to delete files from the 'failed' directory.` };
        }
        return { success: false, error: `An unexpected error occurred: ${error.message}` };
    }
}

export async function updateBrandingSettings(settings: BrandingSettings) {
  await db.updateBranding(settings);
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
}

export async function updateSmtpSettings(settings: SmtpSettings) {
    await db.updateSmtpSettings(settings);
    revalidatePath('/settings');
}

export async function testSmtpConnection(): Promise<{success: boolean, error?: string}> {
    const smtpSettings = await db.getSmtpSettings();

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
    const user = await db.getUserById(userId);
    const smtpSettings = await db.getSmtpSettings();
    const branding = await db.getBranding();

    if (!user) return { success: false, error: "User not found." };
    if (!user.email) return { success: false, error: "User does not have a registered email address." };
    if (!smtpSettings.host) return { success: false, error: "SMTP is not configured. Cannot send email." };

    const tempPassword = Math.random().toString(36).slice(-8);
    user.password = tempPassword;
    await db.updateUser(user);

    const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: smtpSettings.port,
        secure: smtpSettings.secure,
        auth: smtpSettings.auth,
    });

    const mailOptions = {
        from: `"${branding.brandName}" <${smtpSettings.auth.user}>`,
        to: user.email,
        subject: `Password Reset for ${branding.brandName}`,
        html: `<p>Hello ${user.name},</p><p>Your password has been reset by an administrator.</p><p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please log in and change your password immediately from your profile settings.</p><p>Thank you,</p><p>The ${branding.brandName} Team</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to send password reset email:", error);
        return { success: false, error: `Failed to send email: ${error.message}` };
    }
}


export async function addUser(newUser: User): Promise<{ success: boolean, message?: string }> {
  const result = await db.addUser(newUser);
  if (result.success) {
    revalidatePath('/settings');
    return { success: true };
  }
  return { success: false, message: "A user with this username or email already exists." };
}

export async function removeUser(userId: string) {
    await db.removeUser(userId);
    revalidatePath('/settings');
}

export async function updateUser(user: User) {
    await db.updateUser(user);
    revalidatePath('/settings');
}

export async function updateMonitoredPaths(paths: MonitoredPaths) {
  await db.updateMonitoredPaths(paths);
  revalidatePath('/settings');
}

export async function addMonitoredExtension(extension: string) {
    const extensions = await db.getMonitoredExtensions();
    if (!extensions.includes(extension)) {
        extensions.push(extension);
        await db.updateMonitoredExtensions(extensions);
        revalidatePath('/settings');
    }
}

export async function removeMonitoredExtension(extension: string) {
    let extensions = await db.getMonitoredExtensions();
    extensions = extensions.filter(e => e !== extension);
    await db.updateMonitoredExtensions(extensions);
    revalidatePath('/settings');
}

export async function updateFailureRemark(remark: string) {
    await db.updateFailureRemark(remark);
    revalidatePath('/settings');
}

export async function updateCleanupSettings(settings: CleanupSettings) {
    await db.updateCleanupSettings(settings);
    revalidatePath('/settings');
}

export async function updateProcessingSettings(settings: ProcessingSettings) {
    await db.updateProcessingSettings(settings);
    revalidatePath('/settings');
}

export async function clearAllFileStatuses() {
    const statuses = await db.getFileStatuses();
    const deletePromises = statuses.map(s => db.deleteFileStatus(s.name));
    await Promise.all(deletePromises);
    revalidatePath('/dashboard');
}
