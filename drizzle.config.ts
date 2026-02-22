import { defineConfig } from 'drizzle-kit';
import path from 'path';
import os from 'os';

const dbPath = process.env.RELAY_DB_PATH || path.join(os.homedir(), '.relay', 'ledger.db');

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: dbPath,
    },
});
