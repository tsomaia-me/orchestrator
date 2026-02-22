import { defineConfig } from 'drizzle-kit';
import path from 'path';
import os from 'os';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: path.join(os.homedir(), '.relay', 'ledger.db'),
    },
});
