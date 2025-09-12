
'use server';

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from '@/types';

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
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}
