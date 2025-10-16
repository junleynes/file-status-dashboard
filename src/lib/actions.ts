
'use server';

import { revalidatePath } from 'next/cache';
import * as db from './db';
import type { BrandingSettings, CleanupSettings, MonitoredPaths, User, FileStatus, MonitoredPath, SmtpSettings, ProcessingSettings, ChartData } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import nodemailer from 'nodemailer';
import Papa from 'papaparse';
import { format, parseISO, startOfWeek, startOfMonth } from 'date-fns';


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
    await db.deleteAllFileStatuses();
    revalidatePath('/dashboard');
}

export async function exportFileStatusesToCsv(): Promise<{ csv?: string; error?: string }> {
    try {
        const statuses = await db.getFileStatuses();
        if (statuses.length === 0) {
            return { error: "There are no file statuses to export." };
        }
        const csv = Papa.unparse(statuses);
        return { csv };
    } catch (error: any) {
        console.error("Error exporting CSV:", error);
        return { error: "An unexpected error occurred during export." };
    }
}

export async function importFileStatusesFromCsv(csvContent: string): Promise<{ importedCount?: number; error?: string }> {
    try {
        const result = Papa.parse<FileStatus>(csvContent, { header: true, skipEmptyLines: true });

        if (result.errors.length > 0) {
            console.error("CSV Parsing errors:", result.errors);
            return { error: `Error parsing CSV on row ${result.errors[0].row}: ${result.errors[0].message}` };
        }

        const requiredFields = ['id', 'name', 'status', 'source', 'lastUpdated'];
        if (!result.meta.fields || !requiredFields.every(field => result.meta.fields!.includes(field))) {
            return { error: `CSV must contain the following columns: ${requiredFields.join(', ')}` };
        }

        const statusesToImport: FileStatus[] = result.data.map(row => ({
            ...row,
            remarks: row.remarks || '',
        }));

        await db.bulkUpsertFileStatuses(statusesToImport);
        revalidatePath('/dashboard');
        return { importedCount: statusesToImport.length };
    } catch (error: any) {
        console.error("Error importing CSV:", error);
        return { error: `An unexpected error occurred during import: ${error.message}` };
    }
}

export async function generateStatisticsReport(): Promise<{ csv?: string; error?: string }> {
    try {
        const files = await db.getFileStatuses();
        const publishedFiles = files.filter(file => file.status === 'published');
        
        if (publishedFiles.length === 0) {
            return { error: "No published files available to generate a report." };
        }

        // Process data
        const dailyCounts: { [key: string]: number } = {};
        const weeklyCounts: { [key: string]: number } = {};
        const monthlyCounts: { [key: string]: number } = {};

        publishedFiles.forEach(file => {
            const date = parseISO(file.lastUpdated);
            const dailyKey = format(date, "yyyy-MM-dd");
            const weeklyKey = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
            const monthlyKey = format(startOfMonth(date), "yyyy-MM");

            dailyCounts[dailyKey] = (dailyCounts[dailyKey] || 0) + 1;
            weeklyCounts[weeklyKey] = (weeklyCounts[weeklyKey] || 0) + 1;
            monthlyCounts[monthlyKey] = (monthlyCounts[monthlyKey] || 0) + 1;
        });

        // Convert to arrays
        const dailyData = Object.entries(dailyCounts).map(([date, count]) => ({ period: 'Daily', date, count }));
        const weeklyData = Object.entries(weeklyCounts).map(([date, count]) => ({ period: 'Weekly', date: `Week of ${date}`, count }));
        const monthlyData = Object.entries(monthlyCounts).map(([date, count]) => ({ period: 'Monthly', date: format(parseISO(`${date}-01`), 'MMM yyyy'), count }));
        
        const summaryData = [...dailyData, ...weeklyData, ...monthlyData];

        // Format raw data
        const rawData = publishedFiles.map(f => ({
            period: 'Raw Data',
            fileName: f.name,
            publishedDate: f.lastUpdated,
            source: f.source,
        }));

        // Convert to CSV
        const summaryCsv = Papa.unparse(summaryData);
        const rawDataCsv = Papa.unparse(rawData);

        const finalCsv = `STATISTICS SUMMARY\n${summaryCsv}\n\nRAW PUBLISHED DATA\n${rawDataCsv}`;

        return { csv: finalCsv };
    } catch (error: any) {
        console.error("Error generating statistics report:", error);
        return { error: "An unexpected error occurred during report generation." };
    }
}
