import { readFileSync, writeFileSync } from 'node:fs';

const [id, bucket] = process.argv.slice(2);
if (!id || !/^[0-9a-f-]{36}$/i.test(id) || id === '00000000-0000-0000-0000-000000000000') throw new Error('Indica el UUID real de D1: pnpm configure:production ID_D1 NOMBRE_BUCKET');
if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Indica el nombre del bucket R2 de producción.');
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
config.d1_databases[0].database_id = id;
config.r2_buckets[0].bucket_name = bucket;
config.workers_dev = true;
// Local emulator configuration stays untouched. Production identifiers are isolated.
writeFileSync('wrangler.production.json', JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
console.log('Creado wrangler.production.json. No se ha creado ni publicado ningún recurso remoto.');
