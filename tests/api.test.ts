import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';
import sharp from 'sharp';
import { addProfileSql, addRestaurantSql, renameDishSql } from '../scripts/maintenance-sql';
import { normalizeName, MAX_PHOTO_BYTES } from '../shared/domain';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;
let dish: string;
async function request(path: string, init?: RequestInit) {
  // Serialize native Node FormData before crossing Miniflare's Fetch classes.
  const input = new Request(`http://localhost${path}`, init);
  return mf.dispatchFetch(input.url, { method: input.method, headers: Object.fromEntries(input.headers),
    body: input.body ? await input.arrayBuffer() : undefined });
}
async function create(name: string, profile = 'alexandre') {
  return request('/api/platos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name, perfil_id: profile }) });
}
async function detail(id = dish): Promise<any> { return (await request(`/api/platos/${id}`)).json(); }
function form(profile: string, rating: string | null, bytes?: Buffer, type = 'image/jpeg', comment = '') {
  const data = new FormData(); data.set('perfil_id', profile); data.set('solicitud_id', crypto.randomUUID());
  if (rating !== null) data.set('valoracion', rating);
  data.set('comentario', comment);
  if (bytes) data.set('foto', new File([new Uint8Array(bytes)], 'photo', { type }));
  return data;
}
async function save(profile: string, rating: string | null, bytes?: Buffer, fault?: string, type = 'image/jpeg', comment = '', id = dish) {
  const own = (await detail(id)).opiniones.find((o: any) => o.perfil_id === profile);
  return request(`/api/platos/${id}/opiniones${own ? `/${own.id}` : ''}`, { method: own ? 'PUT' : 'POST', body: form(profile, rating, bytes, type, comment), headers: fault ? { 'x-test-fault': fault } : {} });
}
async function photo(key: string, thumb = false) {
  const response = await request(`/media/${key}/${thumb ? 'thumb' : 'full'}.jpg`);
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

before(async () => {
  const bundle = await build({ entryPoints: ['tests/test-worker.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-07-30',
    d1Databases: ['DB'], r2Buckets: ['PHOTOS'], images: { binding: 'IMAGES' }, bindings: { RESTAURANT_ID: 'el-volante' }, log: new Log(LogLevel.ERROR) });
  db = await mf.getD1Database('DB');
  // Use prepared multi-statement exec through the same SQLite engine as D1.
  const migrations = (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort();
  const seed = await readFile('scripts/seed.sql', 'utf8');
  for (const file of migrations) await db.exec((await readFile(`migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').replaceAll('\n', ' '));
  await db.exec(seed.replace(/--[^\n]*/g, '').replaceAll('\n', ' '));
  jpeg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#bb7744' } }).withExif({ IFD0: { Artist: 'PRIVATE METADATA', ImageDescription: 'GPS should not survive' } }).jpeg().toBuffer();
  png = await sharp({ create: { width: 900, height: 600, channels: 4, background: '#668844' } }).png().toBuffer();
  webp = await sharp(png).webp().toBuffer();
});
after(async () => { await mf?.dispose(); });

test('CA-01 / CA-06: seed, empty catalog and unrated dish', async () => {
  const config: any = await (await request('/api/config')).json();
  assert.deepEqual(config.perfiles.map((p: any) => p.nombre_visible), ['Alexandre', 'Manoel', 'Jorge', 'Gabriel']);
  assert.equal(config.restaurante.nombre, 'Restaurante El Volante');
  assert.deepEqual(config.restaurantes, [config.restaurante]);
  assert.deepEqual(await (await request('/api/restaurantes')).json(), { restaurantes: [{ ...config.restaurante, total_platos: 0, foto_clave: null }] });
  assert.deepEqual(await (await request('/api/platos')).json(), { platos: [] });
  const response = await create('Croquetas de jamón'); assert.equal(response.status, 201);
  dish = (await response.json() as any).plato.id;
  const empty = await detail(); assert.equal(empty.plato.media, null); assert.equal(empty.plato.total, 0); assert.deepEqual(empty.opiniones, []);
});

test('First milestone / CA-04: two profiles, two photos persist and summary is 70', async () => {
  const first = await save('alexandre', '60', jpeg, undefined, 'image/jpeg', 'Buen punto.'); assert.equal(first.status, 200, await first.text());
  const second = await save('manoel', '80', png, undefined, 'image/png'); assert.equal(second.status, 200, await second.text());
  const reopened = await detail();
  assert.equal(reopened.plato.media, 70); assert.equal(reopened.plato.total, 2);
  assert.deepEqual(reopened.opiniones.map((o: any) => o.nombre_visible), ['Manoel', 'Alexandre']);
  assert.equal(reopened.opiniones[0].comentario, null);
  assert.notEqual(reopened.opiniones[0].foto_clave, reopened.opiniones[1].foto_clave);
  assert.equal(reopened.plato.foto_clave, reopened.opiniones[0].foto_clave);
  for (const opinion of reopened.opiniones) {
    const bytes = await photo(opinion.foto_clave);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined); assert.equal(metadata.icc, undefined);
    assert.ok(Math.max(metadata.width!, metadata.height!) <= 1600);
    const thumb = await sharp(await photo(opinion.foto_clave, true)).metadata();
    assert.ok(Math.max(thumb.width!, thumb.height!) <= 400);
  }
});

test('CA-05: edit retains author, photo, original publication order and thumbnail', async () => {
  const old = await detail();
  const response = await save('alexandre', '90'); assert.equal(response.status, 200);
  const updated = await detail();
  assert.equal(updated.plato.total, 2); assert.equal(updated.plato.media, 85);
  assert.equal(updated.plato.foto_clave, old.plato.foto_clave);
  assert.deepEqual(updated.opiniones.map((o: any) => [o.id, o.perfil_id, o.foto_clave, o.creada_en]), old.opiniones.map((o: any) => [o.id, o.perfil_id, o.foto_clave, o.creada_en]));
  assert.equal(updated.opiniones[1].valoracion, 90);
  assert.ok(updated.opiniones[1].actualizada_en >= old.opiniones[1].actualizada_en);
  assert.equal((await save('manoel', '80')).status, 200);
});

test('CA-02 / CA-03: same normalization, suggestions, unique race and ñ retained', async () => {
  const duplicate = await create(' CROQUETAS  DE JAMON '); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json() as any).plato.id, dish);
  const search: any = await (await request('/api/platos?q=jamon')).json(); assert.equal(search.platos[0].id, dish);
  assert.equal((await (await request('/api/platos?q=CROQUETAS')).json() as any).platos.length, 1);
  const races = await Promise.all([create('Croquetas de boletus'), create(' CROQUETAS DE BÓLETUS ')]);
  assert.deepEqual(races.map(r => r.status).sort(), [201, 409]);
  const bodies: any[] = await Promise.all(races.map(r => r.json())); assert.equal(bodies[0].plato.id, bodies[1].plato.id);
  assert.equal(normalizeName('  PIÑA  con  limón '), 'piña con limon');
  assert.notEqual(normalizeName('pina'), normalizeName('piña'));
  assert.equal(normalizeName('pin\u0303a'), 'piña');
  assert.equal((await create('   ')).status, 400); assert.equal((await create('x'.repeat(81))).status, 400);
});

test('CA-08: required score/photo, ranges, real image validation, body limits and group membership', async () => {
  for (const rating of [null, '0', '101', '60.1', 'NaN', '-1', '1e2', '']) assert.equal((await save('jorge', rating, jpeg)).status, 400);
  assert.equal((await save('jorge', '75')).status, 400);
  assert.equal((await save('jorge', '75', Buffer.from('<svg/>'))).status, 400);
  assert.equal((await save('jorge', '75', jpeg, undefined, 'image/png')).status, 400);
  const corrupt = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]);
  assert.equal((await save('jorge', '75', corrupt)).status, 422);
  assert.equal((await save('jorge', '75', Buffer.alloc(MAX_PHOTO_BYTES + 1))).status, 400);
  assert.equal((await save('jorge', '75', Buffer.alloc(MAX_PHOTO_BYTES + 70000))).status, 413);
  assert.equal((await save('jorge', '75', jpeg, undefined, 'image/jpeg', 'x'.repeat(501))).status, 400);
  await db.exec("INSERT INTO grupos VALUES ('other', 'Otro'); INSERT INTO perfiles VALUES ('other', 'other', 'Otra persona');");
  assert.equal((await save('other', '75', jpeg)).status, 400); assert.equal((await create('Otro plato', 'other')).status, 400);
  await assert.rejects(db.prepare('INSERT INTO opiniones(plato_id, perfil_id, foto_clave, valoracion) VALUES (?, ?, ?, ?)').bind(dish, 'gabriel', 'fake', 101).run());

  const webpDish = (await (await create('Prueba WebP')).json() as any).plato.id;
  assert.equal((await save('jorge', '1', webp, undefined, 'image/webp', '', webpDish)).status, 200);
  assert.equal((await save('jorge', '100', undefined, undefined, 'image/jpeg', '', webpDish)).status, 200);
});

test('CA-07: R2 and D1 failures leave old image and opinion; retry is one row', async () => {
  for (const fault of ['upload', 'upload-second', 'db-before']) {
    const old = await detail();
    const response = await save('alexandre', '42', png, fault, 'image/png', 'Se conserva al reintentar');
    assert.equal(response.status, 503);
    const failed = await detail();
    assert.deepEqual(failed, old);
    for (const opinion of old.opiniones) await photo(opinion.foto_clave);
    assert.equal((await save('alexandre', '42', png, undefined, 'image/png', 'Se conserva al reintentar')).status, 200);
    const retried = await detail(); assert.equal(retried.plato.total, 2); assert.equal(retried.plato.media, 61);
    assert.equal(retried.opiniones.find((o: any) => o.perfil_id === 'alexandre').comentario, 'Se conserva al reintentar');
  }
  const fresh = (await (await create('Fallo de primera opinión')).json() as any).plato.id;
  for (const fault of ['upload', 'db-before']) {
    assert.equal((await save('gabriel', '55', jpeg, fault, 'image/jpeg', '', fresh)).status, 503);
    assert.equal((await detail(fresh)).plato.total, 0);
  }
  assert.equal((await save('gabriel', '55', jpeg, undefined, 'image/jpeg', '', fresh)).status, 200);
  // A lost response after commit is safe as well; retry cannot duplicate rows.
  assert.equal((await save('alexandre', '44', jpeg, 'db-after')).status, 503);
  const ambiguous = await detail(); await photo(ambiguous.opiniones[1].foto_clave);
  assert.equal((await save('alexandre', '44', jpeg)).status, 200);
  assert.equal((await detail()).plato.total, 2);
});

test('CA-09: alphabetical/rating ordering, ties and unreviewed last, including active filter', async () => {
  for (const [name, rating] of [['Orden Zeta', '80'], ['Orden Alfa', '80'], ['Orden Beta', '90'], ['Orden Cero', '']]) {
    const id = (await (await create(name)).json() as any).plato.id;
    if (rating) assert.equal((await save('gabriel', rating, jpeg, undefined, 'image/jpeg', '', id)).status, 200);
  }
  const alphabetical: any = await (await request('/api/platos?q=orden')).json();
  assert.deepEqual(alphabetical.platos.map((d: any) => d.nombre), ['Orden Alfa', 'Orden Beta', 'Orden Cero', 'Orden Zeta']);
  const ratings: any = await (await request('/api/platos?q=orden&sort=rating')).json();
  assert.deepEqual(ratings.platos.map((d: any) => d.nombre), ['Orden Beta', 'Orden Alfa', 'Orden Zeta', 'Orden Cero']);
  const all: any = await (await request('/api/platos?sort=rating')).json();
  const firstNull = all.platos.findIndex((d: any) => d.media === null);
  assert.ok(all.platos.slice(firstNull).every((d: any) => d.media === null));
  assert.deepEqual(await (await request('/api/platos?q=inexistente')).json(), { platos: [] });
});

test('CA-10: maintenance adds profile and renames rated dish without losing reviews', async () => {
  const old = await detail();
  await db.exec(addProfileSql("Ana O'Connor", 'ana').replaceAll('\n', ' '));
  const config: any = await (await request('/api/config')).json(); assert.equal(config.perfiles.at(-1).nombre_visible, "Ana O'Connor");
  await db.exec(renameDishSql(dish, ' Croquetas   caseras de jamón ').replaceAll('\n', ' '));
  const updated = await detail(); assert.equal(updated.plato.nombre, 'Croquetas caseras de jamón'); assert.deepEqual(updated.opiniones, old.opiniones);
  assert.equal(updated.plato.nombre_normalizado, 'croquetas caseras de jamon');
  assert.equal((await (await request('/api/platos?q=CASERAS')).json() as any).platos[0].id, dish);
  await assert.rejects(db.exec(renameDishSql(dish, 'Croquetas de boletus').replaceAll('\n', ' ')));
});

test('Route boundaries and cross-origin writes', async () => {
  assert.equal((await request('/api/platos/missing')).status, 404);
  assert.equal((await request('/api/nothing')).status, 404);
  assert.equal((await request('/media/no')).status, 404);
  assert.equal((await request('/api/platos', { method: 'POST', headers: { origin: 'https://another.example' } })).status, 403);
  assert.equal((await request('/api/platos', { method: 'POST', body: '{wrong' })).status, 400);
});


test('Multiple opinions: same profile can publish many; retries and simultaneous identical requests stay unique', async () => {
  const id = (await (await create('Varias visitas')).json() as any).plato.id;
  const publish = async (rating: string, token: string, fault?: string) => {
    const data = form('alexandre', rating, jpeg); data.set('solicitud_id', token);
    return request(`/api/platos/${id}/opiniones`, { method: 'POST', body: data, headers: fault ? { 'x-test-fault': fault } : {} });
  };
  const firstToken = crypto.randomUUID();
  const first = await publish('60', firstToken); assert.equal(first.status, 200);
  const firstOpinion: any = (await first.json() as any).opinion;
  assert.equal((await publish('60', firstToken)).status, 200);
  const secondToken = crypto.randomUUID();
  assert.equal((await publish('80', secondToken, 'db-after')).status, 503);
  assert.equal((await publish('80', secondToken)).status, 200);
  let current = await detail(id); assert.equal(current.plato.total, 2); assert.equal(current.plato.media, 70);
  assert.ok(current.opiniones.every((o: any) => o.perfil_id === 'alexandre'));
  assert.notEqual(current.opiniones[0].foto_clave, current.opiniones[1].foto_clave);
  const latestPhoto = current.plato.foto_clave;
  const edit = form('alexandre', '95');
  assert.equal((await request(`/api/platos/${id}/opiniones/${firstOpinion.id}`, { method: 'PUT', body: edit })).status, 200);
  current = await detail(id); assert.equal(current.plato.total, 2); assert.equal(current.plato.media, 87.5);
  assert.equal(current.plato.foto_clave, latestPhoto);
  assert.equal(current.opiniones[1].foto_clave, firstOpinion.foto_clave);
  const otherProfile = form('manoel', '1', jpeg);
  assert.equal((await request(`/api/platos/${id}/opiniones/${firstOpinion.id}`, { method: 'PUT', body: otherProfile })).status, 404);
  const otherDish = (await (await create('Otro plato de visitas')).json() as any).plato.id;
  assert.equal((await request(`/api/platos/${otherDish}/opiniones/${firstOpinion.id}`, { method: 'PUT', body: form('alexandre', '1', jpeg) })).status, 404);
  const token = crypto.randomUUID();
  const concurrent = await Promise.all([publish('95', token), publish('95', token)]);
  assert.ok(concurrent.every(r => r.status === 200));
  current = await detail(id); assert.equal(current.plato.total, 3);
  const byScore: any = await (await request(`/api/platos/${id}?sort=rating`)).json();
  assert.deepEqual(byScore.opiniones.map((o: any) => o.valoracion), [95, 95, 80]);
  assert.ok(byScore.opiniones[0].id > byScore.opiniones[1].id);
  assert.deepEqual(current.opiniones.map((o: any) => o.valoracion), [95, 80, 95]);
  assert.equal(byScore.plato.foto_clave, current.plato.foto_clave);
  assert.equal((await publish('60', firstToken)).status, 200);
  assert.equal((await detail(id)).opiniones.find((o: any) => o.id === firstOpinion.id).valoracion, 95);
});

test('Migration preserves existing IDs, photos, dates and scores while removing the per-profile uniqueness', async () => {
  const isolated = new Miniflare({ modules: true, script: 'export default { fetch(){ return new Response("ok"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  try {
    const oldDB = await isolated.getD1Database('DB');
    const execFile = async (path: string) => oldDB.exec((await readFile(path, 'utf8')).replace(/--[^\n]*/g, '').replaceAll('\n', ' '));
    await execFile('migrations/0001_initial.sql'); await execFile('scripts/seed.sql');
    await oldDB.exec("INSERT INTO platos(id, restaurante_id, nombre, nombre_normalizado, creado_por) VALUES ('legacy', 'el-volante', 'Anterior', 'anterior', 'alexandre'); INSERT INTO opiniones(plato_id,perfil_id,foto_clave,valoracion,comentario) VALUES ('legacy','alexandre','foto-anterior',60,'Comentario anterior');");
    const old: any = await oldDB.prepare('SELECT * FROM opiniones').first();
    await execFile('migrations/0002_multiple_opinions.sql');
    const migrated: any = await oldDB.prepare('SELECT * FROM opiniones').first();
    for (const key of Object.keys(old)) assert.equal(migrated[key], old[key]);
    await oldDB.exec("INSERT INTO opiniones(plato_id,perfil_id,foto_clave,valoracion,solicitud_id) VALUES ('legacy','alexandre','otra-foto',80,'segunda');");
    assert.equal((await oldDB.prepare('SELECT COUNT(*) total FROM opiniones').first() as any).total, 2);
    await assert.rejects(oldDB.exec("INSERT INTO opiniones(plato_id,perfil_id,foto_clave,valoracion,solicitud_id) VALUES ('legacy','alexandre','foto',80,'segunda');"));
    await assert.rejects(oldDB.exec("INSERT INTO opiniones(plato_id,perfil_id,foto_clave,valoracion,solicitud_id) VALUES ('legacy','alexandre','foto',101,'invalida');"));
  } finally { await isolated.dispose(); }
});

test('Multiple restaurants: scoped catalogs, duplicates, opinions and retries preserve every existing El Volante row', async () => {
  const beforeDishes = await db.prepare("SELECT * FROM platos WHERE restaurante_id = 'el-volante' ORDER BY id").all();
  const beforeOpinions = await db.prepare("SELECT o.* FROM opiniones o JOIN platos d ON d.id = o.plato_id WHERE d.restaurante_id = 'el-volante' ORDER BY o.id").all();
  const beforeCatalog = await (await request('/api/platos')).json();
  await db.exec(addRestaurantSql("Local de prueba O'Connor", 'second-test').replaceAll('\n', ' '));
  assert.deepEqual(await (await request('/api/restaurantes/second-test/platos')).json(), { platos: [] });
  const createSecond = () => request('/api/restaurantes/second-test/platos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Croquetas caseras de jamón', perfil_id: 'alexandre' }) });
  const added = await createSecond(); assert.equal(added.status, 201);
  const secondDish = (await added.json() as any).plato;
  assert.equal(secondDish.restaurante_id, 'second-test'); assert.notEqual(secondDish.id, dish);
  const duplicate = await createSecond(); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json() as any).plato.id, secondDish.id);
  const firstForm = form('alexandre', '90', jpeg);
  const first = await request(`/api/platos/${secondDish.id}/opiniones`, { method: 'POST', body: firstForm }); assert.equal(first.status, 200);
  const firstOpinion = (await first.json() as any).opinion;
  assert.equal((await request(`/api/platos/${secondDish.id}/opiniones`, { method: 'POST', body: firstForm })).status, 200);
  assert.equal((await request(`/api/platos/${dish}/opiniones`, { method: 'POST', body: firstForm })).status, 409);
  assert.equal((await request(`/api/platos/${secondDish.id}/opiniones`, { method: 'POST', body: form('alexandre', '100', png, 'image/png') })).status, 200);
  const current = await detail(secondDish.id);
  assert.equal(current.restaurante.id, 'second-test'); assert.equal(current.plato.total, 2); assert.equal(current.plato.media, 95);
  const latestPhoto = current.plato.foto_clave;
  assert.equal((await request(`/api/platos/${secondDish.id}/opiniones/${firstOpinion.id}`, { method: 'PUT', body: form('alexandre', '80') })).status, 200);
  assert.equal((await detail(secondDish.id)).plato.foto_clave, latestPhoto);
  assert.equal((await request(`/api/platos/${dish}/opiniones/${firstOpinion.id}`, { method: 'PUT', body: form('alexandre', '80') })).status, 404);
  const summaries: any = await (await request('/api/restaurantes')).json();
  const second = summaries.restaurantes.find((r: any) => r.id === 'second-test');
  assert.equal(second.total_platos, 1); assert.equal(second.foto_clave, latestPhoto);
  assert.deepEqual((await (await request('/api/restaurantes/second-test/platos')).json() as any).platos.map((d: any) => d.id), [secondDish.id]);
  assert.deepEqual(await (await request('/api/restaurantes/el-volante/platos')).json(), beforeCatalog);
  assert.deepEqual(await (await request('/api/platos')).json(), beforeCatalog);
  assert.deepEqual((await db.prepare("SELECT * FROM platos WHERE restaurante_id = 'el-volante' ORDER BY id").all()).results, beforeDishes.results);
  assert.deepEqual((await db.prepare("SELECT o.* FROM opiniones o JOIN platos d ON d.id = o.plato_id WHERE d.restaurante_id = 'el-volante' ORDER BY o.id").all()).results, beforeOpinions.results);
  for (const o of beforeOpinions.results) await photo(o.foto_clave as string);
  await db.exec(renameDishSql(secondDish.id, 'Otro nombre del segundo local').replaceAll('\n', ' '));
  assert.equal((await detail(secondDish.id)).plato.nombre, 'Otro nombre del segundo local');
});

test('Restaurant boundaries: unknown IDs and restaurants outside the configured group cannot be read or written', async () => {
  await db.exec("INSERT INTO restaurantes(id, grupo_id, nombre) VALUES ('other-restaurant', 'other', 'Otro grupo'); INSERT INTO platos(id, restaurante_id, nombre, nombre_normalizado, creado_por) VALUES ('other-dish', 'other-restaurant', 'Ajeno', 'ajeno', 'other');");
  const config: any = await (await request('/api/config')).json();
  assert.ok(config.restaurantes.some((r: any) => r.id === 'second-test'));
  assert.ok(config.restaurantes.every((r: any) => r.id !== 'other-restaurant'));
  const restaurants: any = await (await request('/api/restaurantes')).json();
  assert.ok(restaurants.restaurantes.every((r: any) => r.id !== 'other-restaurant'));
  for (const id of ['missing', 'other-restaurant']) {
    assert.equal((await request(`/api/restaurantes/${id}`)).status, 404);
    assert.equal((await request(`/api/restaurantes/${id}/platos`)).status, 404);
    assert.equal((await request(`/api/restaurantes/${id}/platos`, { method: 'POST', body: JSON.stringify({ nombre: 'No crear', perfil_id: 'alexandre' }) })).status, 404);
  }
  assert.equal((await request('/api/platos/other-dish')).status, 404);
  assert.equal((await request('/api/platos/other-dish/opiniones', { method: 'POST', body: form('other', '90', jpeg) })).status, 404);
  assert.equal((await request('/api/platos/other-dish/opiniones/1', { method: 'PUT', body: form('other', '90') })).status, 404);
  assert.equal((await request('/api/restaurantes/second-test/platos', { method: 'POST', body: JSON.stringify({ nombre: 'No crear', perfil_id: 'other' }) })).status, 400);
});
