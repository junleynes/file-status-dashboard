
'use server';

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import type { Database as JsonDatabase, BrandingSettings, CleanupSettings, FileStatus, MonitoredPaths, ProcessingSettings, SmtpSettings, User } from '../types';

const dbPath = path.resolve(process.cwd(), 'src/lib/database.sqlite');
const jsonDbPath = path.resolve(process.cwd(), 'src/lib/database.json');
const jsonDbMigratedPath = path.resolve(process.cwd(), 'src/lib/database.json.migrated');

// Establish a singleton database connection
let dbInstance: Database.Database | null = null;

function initializeDatabase(db: Database.Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT NOT NULL,
            password TEXT,
            avatar TEXT,
            twoFactorRequired INTEGER DEFAULT 0,
            twoFactorSecret TEXT
        );

        CREATE TABLE IF NOT EXISTS file_statuses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            source TEXT NOT NULL,
            lastUpdated TEXT NOT NULL,
            remarks TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_file_statuses_name ON file_statuses(name);
        CREATE INDEX IF NOT EXISTS idx_file_statuses_status ON file_statuses(status);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    
    // Check if migration should be run after ensuring tables exist
    migrateDataFromJson(db);
}

function migrateDataFromJson(db: Database.Database) {
    console.log('[DB] Checking if data migration is needed...');
    if (!fs.existsSync(jsonDbPath)) {
        console.log('[DB] JSON database not found, skipping migration.');
        return;
    }
     if (fs.existsSync(jsonDbMigratedPath)) {
        console.log('[DB] JSON database has already been migrated, skipping.');
        return;
    }

    console.log('[DB] Found database.json, starting one-time migration to SQLite...');
    
    try {
        const jsonString = fs.readFileSync(jsonDbPath, 'utf-8');
        const jsonData: JsonDatabase = JSON.parse(jsonString);

        db.transaction(() => {
            // Users
            const insertUser = db.prepare('INSERT OR REPLACE INTO users (id, username, name, email, role, password, avatar, twoFactorRequired, twoFactorSecret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            jsonData.users.forEach(user => {
                insertUser.run(
                    user.id,
                    user.username,
                    user.name,
                    user.email || null,
                    user.role,
                    user.password || null,
                    user.avatar || null,
                    user.twoFactorRequired ? 1 : 0,
                    user.twoFactorSecret || null
                );
            });
            console.log(`[DB] Migrated ${jsonData.users.length} users.`);

            // Settings (key-value store)
            const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
            insertSetting.run('branding', JSON.stringify(jsonData.branding));
            insertSetting.run('monitoredPaths', JSON.stringify(jsonData.monitoredPaths));
            insertSetting.run('monitoredExtensions', JSON.stringify(jsonData.monitoredExtensions));
            insertSetting.run('cleanupSettings', JSON.stringify(jsonData.cleanupSettings));
            insertSetting.run('processingSettings', JSON.stringify(jsonData.processingSettings));
            insertSetting.run('failureRemark', JSON.stringify(jsonData.failureRemark));
            insertSetting.run('smtpSettings', JSON.stringify(jsonData.smtpSettings));
            console.log('[DB] Migrated application settings.');

            // File Statuses
            const insertStatus = db.prepare('INSERT OR REPLACE INTO file_statuses (id, name, status, source, lastUpdated, remarks) VALUES (?, ?, ?, ?, ?, ?)');
            jsonData.fileStatuses.forEach(status => {
                insertStatus.run(
                    status.id,
                    status.name,
                    status.status,
                    status.source,
                    status.lastUpdated,
                    status.remarks || null
                );
            });
            console.log(`[DB] Migrated ${jsonData.fileStatuses.length} file statuses.`);

        })();

        // Rename the old JSON file to prevent re-migration
        fs.renameSync(jsonDbPath, jsonDbMigratedPath);
        console.log('[DB] Migration successful. Renamed database.json to database.json.migrated.');

    } catch (error) {
        console.error('[DB] CRITICAL: Failed to migrate data from database.json to SQLite.', error);
        // If migration fails, we stop the process to avoid data inconsistency.
        throw new Error('Database migration failed.');
    }
}

const getDb = (): Database.Database => {
    if (!dbInstance) {
        console.log('[DB] Initializing new SQLite singleton connection...');
        dbInstance = new Database(dbPath);
        
        // **CRITICAL FIX**: Apply concurrency settings to the singleton instance
        console.log('[DB] Applying WAL mode and busy timeout to singleton instance...');
        dbInstance.pragma('journal_mode = WAL'); // Recommended for concurrent access
        dbInstance.pragma('busy_timeout = 5000'); // Wait 5 seconds for locks to clear

        initializeDatabase(dbInstance);
    }
    return dbInstance;
};


// --- Generic Setting Helpers ---
async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const db = getDb();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result ? JSON.parse(result.value) : defaultValue;
}

async function updateSetting<T>(key: string, value: T): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, JSON.stringify(value));
}

// --- USERS ---
export async function getUsers(): Promise<User[]> {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM users');
    const rows = stmt.all() as any[];
    return rows.map(row => ({ ...row, twoFactorRequired: !!row.twoFactorRequired })) as User[];
}

export async function getUserById(id: string): Promise<User | null> {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? { ...row, twoFactorRequired: !!row.twoFactorRequired } as User : null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as any;
    return row ? { ...row, twoFactorRequired: !!row.twoFactorRequired } as User : null;
}

export async function addUser(user: User): Promise<{ success: boolean }> {
    const db = getDb();
    try {
        const stmt = db.prepare('INSERT INTO users (id, username, name, email, role, password, avatar, twoFactorRequired, twoFactorSecret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(
            user.id, user.username, user.name, user.email || null, user.role, 
            user.password || null, user.avatar || null, 
            user.twoFactorRequired ? 1 : 0, user.twoFactorSecret || null
        );
        return { success: true };
    } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: false };
        }
        throw error;
    }
}

export async function updateUser(user: User): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('UPDATE users SET username = ?, name = ?, email = ?, role = ?, password = ?, avatar = ?, twoFactorRequired = ?, twoFactorSecret = ? WHERE id = ?');
    stmt.run(
        user.username, user.name, user.email || null, user.role, 
        user.password, user.avatar || null, user.twoFactorRequired ? 1 : 0, 
        user.twoFactorSecret || null, user.id
    );
}

export async function bulkUpsertUsers(users: User[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO users (id, username, name, email, role, avatar, twoFactorRequired, twoFactorSecret) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const transaction = db.transaction((usersToInsert: User[]) => {
        for (const user of usersToInsert) {
             stmt.run(
                user.id, user.username, user.name, user.email || null, user.role, 
                user.avatar || null, user.twoFactorRequired ? 1 : 0, user.twoFactorSecret || null
            );
        }
    });
    transaction(users);
}

export async function bulkUpsertUsersWithPasswords(users: User[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO users (id, username, name, email, role, password, avatar, twoFactorRequired, twoFactorSecret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const transaction = db.transaction((usersToInsert: User[]) => {
        for (const user of usersToInsert) {
             stmt.run(
                user.id, user.username, user.name, user.email || null, user.role, 
                user.password, user.avatar || null, user.twoFactorRequired ? 1 : 0, 
                user.twoFactorSecret || null
            );
        }
    });
    transaction(users);
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    stmt.run(newPassword, userId);
}


export async function removeUser(userId: string): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(userId);
}


// --- FILE STATUSES ---
export async function getFileStatuses(): Promise<FileStatus[]> {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM file_statuses ORDER BY lastUpdated DESC');
    return stmt.all() as FileStatus[];
}

export async function getFileStatusByName(name: string): Promise<FileStatus | null> {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM file_statuses WHERE name = ?');
    return stmt.get(name) as FileStatus || null;
}

export async function upsertFileStatus(file: FileStatus): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO file_statuses (id, name, status, source, lastUpdated, remarks) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(file.id, file.name, file.status, file.source, file.lastUpdated, file.remarks || null);
}

export async function bulkUpsertFileStatuses(files: FileStatus[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO file_statuses (id, name, status, source, lastUpdated, remarks) VALUES (?, ?, ?, ?, ?, ?)');
    const transaction = db.transaction((filesToInsert: FileStatus[]) => {
        for (const file of filesToInsert) {
            stmt.run(file.id, file.name, file.status, file.source, file.lastUpdated, file.remarks || null);
        }
    });
    transaction(files);
}

export async function deleteFileStatus(name: string): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM file_statuses WHERE name = ?');
    stmt.run(name);
}

export async function deleteAllFileStatuses(): Promise<void> {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM file_statuses');
    stmt.run();
}


export async function deleteFileStatusesByAge(maxAgeMs: number): Promise<number> {
    const db = getDb();
    const cutoffDate = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = db.prepare('DELETE FROM file_statuses WHERE lastUpdated <= ?');
    const result = stmt.run(cutoffDate);
    return result.changes;
}

// --- SETTINGS ---
export async function getBranding(): Promise<BrandingSettings> {
    return getSetting<BrandingSettings>('branding', {
        brandName: 'FileStatus Tracker', logo: null, favicon: null, footerText: `© ${new Date().getFullYear()} FileStatus Tracker`
    });
}
export async function updateBranding(settings: BrandingSettings): Promise<void> {
    return updateSetting('branding', settings);
}

export async function getMonitoredPaths(): Promise<MonitoredPaths> {
    return getSetting<MonitoredPaths>('monitoredPaths', {
        import: { id: 'import-path', name: 'Import', path: '' },
        failed: { id: 'failed-path', name: 'Failed', path: '' }
    });
}
export async function updateMonitoredPaths(settings: MonitoredPaths): Promise<void> {
    return updateSetting('monitoredPaths', settings);
}

export async function getMonitoredExtensions(): Promise<string[]> {
    return getSetting<string[]>('monitoredExtensions', []);
}
export async function updateMonitoredExtensions(extensions: string[]): Promise<void> {
    return updateSetting('monitoredExtensions', extensions);
}

export async function getCleanupSettings(): Promise<CleanupSettings> {
    return getSetting<CleanupSettings>('cleanupSettings', {
        status: { enabled: true, value: '7', unit: 'days' },
        files: { enabled: false, value: '30', unit: 'days' },
        timeout: { enabled: true, value: '24', unit: 'hours' }
    });
}
export async function updateCleanupSettings(settings: CleanupSettings): Promise<void> {
    return updateSetting('cleanupSettings', settings);
}

export async function getProcessingSettings(): Promise<ProcessingSettings> {
    return getSetting<ProcessingSettings>('processingSettings', {
        autoTrimInvalidChars: false, autoExpandPrefixes: false
    });
}
export async function updateProcessingSettings(settings: ProcessingSettings): Promise<void> {
    return updateSetting('processingSettings', settings);
}

export async function getFailureRemark(): Promise<string> {
    return getSetting<string>('failureRemark', 'Processing failed.');
}
export async function updateFailureRemark(remark: string): Promise<void> {
    return updateSetting('failureRemark', remark);
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
    return getSetting<SmtpSettings>('smtpSettings', {
        host: '', port: 587, secure: false, auth: { user: '', pass: '' }
    });
}
export async function updateSmtpSettings(settings: SmtpSettings): Promise<void> {
    return updateSetting('smtpSettings', settings);
}

// --- Compatibility layer for old readDb/writeDb calls ---
// This allows us to refactor actions.ts incrementally.
export async function readDb(): Promise<JsonDatabase> {
    const [
        users,
        branding,
        monitoredPaths,
        monitoredExtensions,
        fileStatuses,
        cleanupSettings,
        processingSettings,
        failureRemark,
        smtpSettings,
    ] = await Promise.all([
        getUsers(),
        getBranding(),
        getMonitoredPaths(),
        getMonitoredExtensions(),
        getFileStatuses(),
        getCleanupSettings(),
        getProcessingSettings(),
        getFailureRemark(),
        getSmtpSettings()
    ]);
    return {
        users,
        branding,
        monitoredPaths,
        monitoredExtensions,
        fileStatuses,
        cleanupSettings,
        processingSettings,
        failureRemark,
        smtpSettings
    };
}
