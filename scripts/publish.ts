import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let config: any;
try { config = JSON.parse(readFileSync('wrangler.production.json', 'utf8')); }
catch { throw new Error('Falta wrangler.production.json. Sigue la fase de publicación del README; el entorno local no se publica.'); }
if (!config.d1_databases?.[0]?.database_id || config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000') throw new Error('Configura un identificador D1 real antes de publicar.');
function run(args: string[], env = process.env) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', shell: false, env });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
run(['build'], { ...process.env, PLAN_BACON_CONFIG: 'wrangler.production.json' });
const workerDir = String(config.name).replaceAll('-', '_');
run(['exec', 'wrangler', 'deploy', '--config', `dist/${workerDir}/wrangler.json`, ...(process.argv.includes('--dry-run') ? ['--dry-run'] : [])]);
