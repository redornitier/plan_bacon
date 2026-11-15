import { charLength, cleanName, filterAndSort, MAX_PHOTO_BYTES, normalizeName, sortOpinions } from '../shared/domain';
import type { Config, Dish, Opinion, Profile, Restaurant, RestaurantSummary } from '../shared/domain';
import type { Env } from './env';
import { HttpError } from './errors';
import { processPhoto } from './photos';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });

const summary = `SELECT d.*,
  (SELECT AVG(o.valoracion) FROM opiniones o WHERE o.plato_id = d.id) media,
  (SELECT COUNT(*) FROM opiniones o WHERE o.plato_id = d.id) total,
  (SELECT o.foto_clave FROM opiniones o WHERE o.plato_id = d.id ORDER BY o.creada_en DESC, o.id DESC LIMIT 1) foto_clave
  FROM platos d`;

// The existing restaurant anchors the group, and remains the legacy API default.
// No rows need moving: dishes already belong to a restaurant in the schema.
const groupScope = '(SELECT grupo_id FROM restaurantes WHERE id = ?)';
async function getRestaurant(env: Env, id: string) {
  const restaurant = await env.DB.prepare(`SELECT id, nombre FROM restaurantes WHERE id = ? AND grupo_id = ${groupScope}`)
    .bind(id, env.RESTAURANT_ID).first<Restaurant>();
  if (!restaurant) throw new HttpError(404, 'No encontramos este restaurante. Vuelve a la lista.');
  return restaurant;
}
async function getDish(env: Env, id: string) {
  const dish = await env.DB.prepare(`${summary} WHERE d.id = ? AND d.restaurante_id IN
    (SELECT id FROM restaurantes WHERE grupo_id = ${groupScope})`).bind(id, env.RESTAURANT_ID).first<Dish>();
  if (!dish) throw new HttpError(404, 'No encontramos este plato. Vuelve a la lista.');
  return dish;
}
async function requireProfile(env: Env, profile: unknown, restaurantId: string) {
  if (typeof profile !== 'string' || !await env.DB.prepare(`SELECT p.id FROM perfiles p
    JOIN restaurantes r ON r.grupo_id = p.grupo_id WHERE p.id = ? AND r.id = ?`)
    .bind(profile, restaurantId).first()) throw new HttpError(400, 'Elige un perfil del grupo para continuar.');
  return profile;
}

/** Limit the actual stream too, including when Content-Length is absent or false. */
async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'El archivo es demasiado grande. El máximo es 10 MB.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new HttpError(413, 'El archivo es demasiado grande. El máximo es 10 MB.'); }
      chunks.push(value);
    }
  }
  return new Response(new Blob(chunks.map(chunk => new Uint8Array(chunk))), { headers: request.headers });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Abre Plan Bacon para guardar cambios.');
  }
  if (path === '/api/config' && request.method === 'GET') {
    const restaurante = await env.DB.prepare('SELECT id, nombre FROM restaurantes WHERE id = ?').bind(env.RESTAURANT_ID).first<Restaurant>();
    if (!restaurante) throw new HttpError(503, 'Falta preparar el restaurante. Ejecuta la carga inicial.');
    const { results: perfiles } = await env.DB.prepare(`SELECT p.id, p.nombre_visible FROM perfiles p
      JOIN restaurantes r ON p.grupo_id = r.grupo_id WHERE r.id = ? ORDER BY p.rowid`).bind(env.RESTAURANT_ID).all<Profile>();
    const { results: restaurantes } = await env.DB.prepare(`SELECT id, nombre FROM restaurantes WHERE grupo_id = ${groupScope}`)
      .bind(env.RESTAURANT_ID).all<Restaurant>();
    restaurantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return json({ restaurante, restaurantes, perfiles } satisfies Config);
  }
  if (path === '/api/restaurantes' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT r.id, r.nombre,
      (SELECT COUNT(*) FROM platos d WHERE d.restaurante_id = r.id) total_platos,
      (SELECT o.foto_clave FROM opiniones o JOIN platos d ON d.id = o.plato_id
        WHERE d.restaurante_id = r.id ORDER BY o.creada_en DESC, o.id DESC LIMIT 1) foto_clave
      FROM restaurantes r WHERE r.grupo_id = ${groupScope}`).bind(env.RESTAURANT_ID).all<RestaurantSummary>();
    results.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return json({ restaurantes: results });
  }
  const restaurantMatch = path.match(/^\/api\/restaurantes\/([\w-]+)$/);
  if (restaurantMatch && request.method === 'GET') return json({ restaurante: await getRestaurant(env, restaurantMatch[1]) });
  const catalogMatch = path.match(/^\/api\/restaurantes\/([\w-]+)\/platos$/);
  const catalogPath = path === '/api/platos' || !!catalogMatch;
  const restaurantId = catalogMatch?.[1] ?? env.RESTAURANT_ID;
  if (catalogPath && request.method === 'GET') {
    await getRestaurant(env, restaurantId);
    const { results } = await env.DB.prepare(`${summary} WHERE d.restaurante_id = ?`).bind(restaurantId).all<Dish>();
    return json({ platos: filterAndSort(results, url.searchParams.get('q') ?? '', url.searchParams.get('sort') ?? 'name') });
  }
  if (catalogPath && request.method === 'POST') {
    await getRestaurant(env, restaurantId);
    let body: { nombre?: unknown; perfil_id?: unknown };
    try { body = await (await boundedBody(request, 4096)).json(); }
    catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'Datos de plato no válidos.'); }
    if (!body || typeof body.nombre !== 'string') throw new HttpError(400, 'Escribe el nombre del plato.');
    const nombre = cleanName(body.nombre);
    if (charLength(nombre) < 1 || charLength(nombre) > 80) throw new HttpError(400, 'El nombre debe tener entre 1 y 80 caracteres.');
    const profile = await requireProfile(env, body.perfil_id, restaurantId);
    const normalized = normalizeName(nombre);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare('INSERT INTO platos(id, restaurante_id, nombre, nombre_normalizado, creado_por) VALUES (?, ?, ?, ?, ?)')
        .bind(id, restaurantId, nombre, normalized, profile).run();
    } catch (e) {
      const existing = await env.DB.prepare('SELECT id, nombre FROM platos WHERE restaurante_id = ? AND nombre_normalizado = ?')
        .bind(restaurantId, normalized).first();
      if (existing) throw new HttpError(409, 'Este plato ya está en nuestra mesa.', { plato: existing });
      throw e;
    }
    return json({ plato: await getDish(env, id) }, 201);
  }
  const detailMatch = path.match(/^\/api\/platos\/([\w-]+)$/);
  if (detailMatch && request.method === 'GET') {
    const plato = await getDish(env, detailMatch[1]);
    const { results: opiniones } = await env.DB.prepare(`SELECT o.*, p.nombre_visible FROM opiniones o
      JOIN perfiles p ON p.id = o.perfil_id WHERE o.plato_id = ? ORDER BY o.creada_en DESC, o.id DESC`)
      .bind(plato.id).all<Opinion>();
    return json({ restaurante: await getRestaurant(env, plato.restaurante_id), plato, opiniones: sortOpinions(opiniones, url.searchParams.get('sort') ?? 'date') });
  }
  const reviewMatch = path.match(/^\/api\/platos\/([\w-]+)\/opiniones(?:\/([1-9]\d*))?$/);
  if (reviewMatch && ((request.method === 'POST' && !reviewMatch[2]) || (request.method === 'PUT' && reviewMatch[2]))) {
    const dish = await getDish(env, reviewMatch[1]);
    let form: FormData;
    try { form = await (await boundedBody(request, MAX_PHOTO_BYTES + 64 * 1024)).formData(); }
    catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'No se pudo leer el formulario.'); }
    const profile = await requireProfile(env, form.get('perfil_id'), dish.restaurante_id);
    const rating = form.get('valoracion');
    if (typeof rating !== 'string' || !/^\d{1,3}$/.test(rating) || +rating < 1 || +rating > 100)
      throw new HttpError(400, 'Elige una puntuación entera entre 1 y 100.');
    const comment = form.get('comentario') ?? '';
    if (typeof comment !== 'string' || charLength(comment) > 500) throw new HttpError(400, 'El comentario admite hasta 500 caracteres.');
    const opinionId = reviewMatch[2];
    const previous = opinionId ? await env.DB.prepare('SELECT * FROM opiniones WHERE id = ? AND plato_id = ? AND perfil_id = ?')
      .bind(opinionId, dish.id, profile).first<Opinion>() : null;
    if (opinionId && !previous) throw new HttpError(404, 'Esta valoración no pertenece al perfil activo o no existe.');
    const token = form.get('solicitud_id');
    if (!opinionId) {
      if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
        throw new HttpError(400, 'Vuelve a abrir el formulario para añadir una valoración.');
      const existing = await env.DB.prepare('SELECT * FROM opiniones WHERE solicitud_id = ?').bind(token).first<Opinion>();
      if (existing) {
        if (existing.plato_id !== dish.id || existing.perfil_id !== profile) throw new HttpError(409, 'Esta solicitud ya corresponde a otra valoración.');
        return json({ opinion: existing });
      }
    }
    const file = form.get('foto');
    if (file !== null && !(file instanceof File)) throw new HttpError(400, 'Añade una foto válida de tu ración.');
    if (!file && !previous) throw new HttpError(400, 'Añade una foto de tu ración.');
    const newKey = file instanceof File ? await processPhoto(file, env) : null;
    // No R2 deletes here, even on errors: a D1 write might have committed before
    // a transport failure. Offline GC removes aged, unreferenced objects safely.
    try {
      let saved;
      if (previous) {
        saved = await env.DB.prepare(`UPDATE opiniones SET foto_clave = COALESCE(?, foto_clave),
          valoracion = ?, comentario = ?, actualizada_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND plato_id = ? AND perfil_id = ? RETURNING *`)
          .bind(newKey, +rating, comment.trim() || null, previous.id, dish.id, profile).first();
      } else {
        saved = await env.DB.prepare(`INSERT INTO opiniones(plato_id, perfil_id, foto_clave, valoracion, comentario, solicitud_id)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(solicitud_id) DO NOTHING RETURNING *`)
          .bind(dish.id, profile, newKey!, +rating, comment.trim() || null, token).first<Opinion>();
        if (!saved) {
          saved = await env.DB.prepare('SELECT * FROM opiniones WHERE solicitud_id = ? AND plato_id = ? AND perfil_id = ?')
            .bind(token, dish.id, profile).first<Opinion>();
          if (!saved) throw new HttpError(409, 'Esta solicitud ya corresponde a otra valoración.');
        }
      }
      return json({ opinion: saved });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('opinion_save_failed', String(error));
      throw new HttpError(503, 'No se pudo confirmar el guardado. Tu puntuación y comentario siguen aquí. Reintenta para confirmarlo.');
    }
  }
  const media = path.match(/^\/media\/([0-9a-f-]{36})\/(full|thumb)\.jpg$/);
  if (media && ['GET', 'HEAD'].includes(request.method)) {
    const object = await env.PHOTOS.get(`${media[1]}/${media[2]}.jpg`);
    if (!object) throw new HttpError(404, 'No encontramos la foto.');
    const headers = new Headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': object.httpEtag, 'X-Content-Type-Options': 'nosniff' });
    if (request.headers.get('if-none-match') === object.httpEtag) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  }
  if (path.startsWith('/api/') || path.startsWith('/media/')) throw new HttpError(404, 'No encontramos esta página.');
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await route(request, env); }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
      console.error('request_failed', String(error));
      return json({ error: 'No se pudo completar la operación. Vuelve a intentarlo.' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
