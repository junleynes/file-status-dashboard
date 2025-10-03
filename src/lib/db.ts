
'use server';

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from '../types';

const dbPath = path.resolve(process.cwd(), 'src/lib/database.json');

export async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // If the file doesn't exist, you might want to return a default structure
      // For now, we'll rethrow as this indicates a setup problem
      console.error('Database file not found!');
      throw new Error('Database file not found!');
    }
    throw error;
  }
}

export async function writeDb(data: Database): Promise<void> {
  const tempPath = dbPath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, dbPath);
  } catch (error) {
    console.error("Error during atomic write of database:", error);
    // Attempt to clean up the temporary file if it exists
    try {
      await fs.unlink(tempPath);
    } catch (cleanupError: any) {
      if (cleanupError.code !== 'ENOENT') {
        console.error("Error cleaning up temporary database file:", cleanupError);
      }
    }
    throw error; // Re-throw the original error
  }
}
