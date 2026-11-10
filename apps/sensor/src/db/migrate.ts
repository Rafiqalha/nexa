// CLI: pnpm db:migrate — menerapkan migrasi Drizzle ke DATABASE_PATH.
import { findRepoRoot, loadRootEnv, resolveFromRoot } from '../paths';
import { openDb, runMigrations } from './client';

const root = findRepoRoot();
loadRootEnv(root);

const path = resolveFromRoot(process.env.DATABASE_PATH?.trim() || './data/nexa.db', root);
const handle = openDb(path);
runMigrations(handle.db);
handle.close();
console.log(
  JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'migrations applied', path }),
);
