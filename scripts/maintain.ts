import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addProfileSql, inspectDishSql, renameDishSql } from './maintenance-sql';

const args = process.argv.slice(2).filter(a => a !== '--');
const remote = args.includes('--remote');
const local = args.includes('--local');
const flags = args.filter(a => !['--remote', '--local'].includes(a));
const [command, first, second] = flags;
if (remote === local) throw new Error('Indica exactamente --local o --remote.');
let sql: string;
if (command === 'add-profile' && first && !second) sql = addProfileSql(first);
else if (command === 'rename-dish' && first && second) sql = renameDishSql(first, second);
else if (command === 'inspect-dish' && first && !second) sql = inspectDishSql(first);
else throw new Error('Uso: pnpm maintain --local|--remote add-profile "Nombre" | rename-dish ID "Nombre" | inspect-dish ID');

const dir = mkdtempSync(join(tmpdir(), 'plan-bacon-maintenance-'));
try {
  const file = join(dir, 'maintenance.sql');
  writeFileSync(file, sql);
  const commandArgs = ['exec', 'wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', file];
  if (remote) commandArgs.push('--config', 'wrangler.production.json');
  const result = spawnSync('pnpm', commandArgs, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
