import 'fake-indexeddb/auto';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { draftKey, listDrafts, readDraft, removeDraft, saveDraft } from '../src/reviewDrafts';
import type { ReviewDraft } from '../src/reviewDrafts';
import type { Dish, Opinion } from '../shared/domain';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, sessionStorage: dom.window.sessionStorage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.scrollTo = () => {};
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { default: App, ReviewForm } = await import('../src/App');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; sessionStorage.clear(); dom.window.history.replaceState(null, '', '/'); });
const profile = { id: 'alexandre', nombre_visible: 'Alexandre' };
const photo = new File([new Uint8Array([255, 216, 255, 42, 17])], 'comida.jpg', { type: 'image/jpeg', lastModified: 12345678 });
const dish = (id: string): Dish => ({ id, nombre: 'Judías', nombre_normalizado: 'judias', restaurante_id: 'el-volante', media: null, total: 0, foto_clave: null });
function snapshot(dishId: string, profileId = 'alexandre', opinionId?: number): ReviewDraft {
  return { key: draftKey(dishId, profileId, opinionId), dishId, profileId, opinionId: opinionId ?? null, requestId: crypto.randomUUID(), rating: 87, comment: 'Buena salsa.', photo: photo.slice(0, photo.size, photo.type), photoId: crypto.randomUUID(), photoName: photo.name, photoLastModified: photo.lastModified, updatedAt: Date.now() };
}

 test('Draft storage: photo bytes, MIME, filename and submission key survive committed storage; keys isolate profiles, dishes and edits', async () => {
  const rows = [snapshot('storage'), snapshot('storage', 'manoel'), snapshot('other-dish'), snapshot('storage', 'alexandre', 11), snapshot('storage', 'alexandre', 12)];
  await Promise.all(rows.map(saveDraft));
  for (const row of rows) {
    const { draft, persisted } = await readDraft(row.key);
    assert.equal(persisted, true); assert.ok(draft);
    assert.equal(draft.requestId, row.requestId); assert.equal(draft.photoName, photo.name);
    assert.equal(draft.photo!.type, photo.type); assert.equal(draft.photoLastModified, photo.lastModified);
    assert.deepEqual(await draft.photo!.arrayBuffer(), await photo.arrayBuffer());
  }
  assert.equal((await listDrafts('storage', 'alexandre')).length, 3);
  await removeDraft(rows[3].key, rows[3].requestId);
  assert.equal((await readDraft(rows[3].key)).draft, null);
  assert.ok((await readDraft(rows[4].key)).draft);
});

test('Draft storage: rapid edits and deletion cannot resurrect a draft; completion does not erase a newer request', async () => {
  const initial = snapshot('rapid');
  const tasks = Array.from({ length: 15 }, (_, i) => saveDraft({ ...initial, rating: i + 1, comment: String(i) }));
  await Promise.all(tasks);
  assert.equal((await readDraft(initial.key)).draft!.rating, 15);
  assert.deepEqual(await (await readDraft(initial.key)).draft!.photo!.arrayBuffer(), await photo.arrayBuffer());
  const last = saveDraft({ ...initial, rating: 100 });
  const discard = removeDraft(initial.key, initial.requestId);
  await Promise.all([last, discard]);
  assert.equal((await readDraft(initial.key)).draft, null);
  const newer = { ...initial, requestId: crypto.randomUUID() };
  await saveDraft(newer); await removeDraft(initial.key, initial.requestId);
  assert.equal((await readDraft(initial.key)).draft!.requestId, newer.requestId);
  await saveDraft({ ...newer, photo: null, photoId: null, photoName: '' });
  assert.equal((await readDraft(initial.key)).draft!.photo, null);
});

test('Review form: unmount and recovery retain photo and retry token; success clears only this draft', async () => {
  const target = dish('recover');
  let saved = 0;
  const payloads: FormData[] = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(init!.body as FormData);
    return payloads.length === 1 ? Response.json({ error: 'Respuesta perdida.' }, { status: 503 }) : Response.json({ opinion: { id: 99 } });
  };
  let view = render(<ReviewForm dish={target} profile={profile} onCancel={() => {}} onSaved={() => saved++}/>);
  await waitFor(() => assert.ok(view.getByRole('slider')));
  fireEvent.change(view.getByRole('slider'), { target: { value: '79' } });
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Se conserva al cerrar.' } });
  fireEvent.change(view.getByLabelText('Elegir de galería'), { target: { files: [photo] } });
  await waitFor(() => assert.ok(view.getByText('Borrador y foto guardados en este dispositivo')));
  const firstPreview = view.getByAltText('Foto de tu ración').getAttribute('src');
  fireEvent.click(view.getByRole('button', { name: 'Guardar como Alexandre' }));
  await waitFor(() => assert.ok(view.getByText('Respuesta perdida.')));
  view.unmount();
  const other = snapshot(target.id, 'manoel'); await saveDraft(other);
  view = render(<ReviewForm dish={target} profile={profile} onCancel={() => {}} onSaved={() => saved++}/>);
  await waitFor(() => assert.ok(view.getByText('Seguimos donde lo dejaste.')));
  assert.equal((view.getByRole('slider') as HTMLInputElement).value, '79');
  assert.equal((view.getByRole('textbox') as HTMLTextAreaElement).value, 'Se conserva al cerrar.');
  await waitFor(() => assert.notEqual(view.getByAltText('Foto de tu ración').getAttribute('src'), firstPreview));
  fireEvent.click(view.getByRole('button', { name: 'Guardar como Alexandre' }));
  await waitFor(() => assert.equal(saved, 1));
  assert.equal(payloads[0].get('solicitud_id'), payloads[1].get('solicitud_id'));
  const recovered = payloads[1].get('foto') as File;
  assert.equal(recovered.name, photo.name); assert.equal(recovered.type, photo.type);
  assert.deepEqual(await recovered.arrayBuffer(), await photo.arrayBuffer());
  assert.equal((await readDraft(draftKey(target.id, profile.id))).draft, null);
  assert.ok((await readDraft(other.key)).draft);
});

test('Review navigation: dedicated route, browser back, resume, confirmation and discard; no automatic publication', async () => {
  const target = dish('navigation');
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method) writes++;
    if (url === '/api/config') return Response.json({ restaurante: { id: 'el-volante', nombre: 'El Volante' }, perfiles: [profile] });
    return Response.json({ restaurante: { id: 'el-volante', nombre: 'El Volante' }, plato: target, opiniones: [] });
  };
  sessionStorage.setItem('plan-bacon-profile', profile.id);
  dom.window.history.replaceState(null, '', '/#/platos/navigation');
  const view = render(<App/>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  fireEvent.click(view.getByRole('button', { name: 'Añadir valoración' }));
  await waitFor(() => assert.ok(view.getByRole('slider')));
  assert.equal(dom.window.location.hash, '#/platos/navigation/valorar');
  assert.equal(view.queryByText('Las opiniones de la mesa'), null);
  fireEvent.change(view.getByRole('slider'), { target: { value: '90' } });
  fireEvent.change(view.getByLabelText('Hacer foto'), { target: { files: [photo] } });
  dom.window.history.back();
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Continuar mi valoración' })));
  assert.ok(view.getByText('Tu nota: 90 · Foto guardada'));
  fireEvent.click(view.getByRole('button', { name: 'Continuar mi valoración' }));
  await waitFor(() => assert.ok(view.getByAltText('Foto de tu ración')));
  fireEvent.click(view.getByRole('button', { name: 'Volver al plato' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Descartar borrador' })));
  fireEvent.click(view.getByRole('button', { name: 'Descartar borrador' }));
  assert.ok((await readDraft(draftKey(target.id, profile.id))).draft);
  fireEvent.click(view.getByRole('button', { name: 'Conservar' }));
  assert.equal(view.queryByRole('button', { name: 'Sí, descartar' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Descartar borrador' }));
  fireEvent.click(view.getByRole('button', { name: 'Sí, descartar' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  assert.equal((await readDraft(draftKey(target.id, profile.id))).draft, null);
  assert.equal(writes, 0);
});

test('Editing: replacement photo survives recovery; reverting it preserves the published photo', async () => {
  const target = dish('editing');
  const previous: Opinion = { id: 7, plato_id: target.id, perfil_id: profile.id, nombre_visible: profile.nombre_visible, foto_clave: 'published', valoracion: 70, comentario: 'Antes', creada_en: '2026-11-10T10:00:00Z', actualizada_en: '2026-11-10T10:00:00Z' };
  let view = render(<ReviewForm dish={target} profile={profile} previous={previous} onCancel={() => {}} onSaved={() => {}}/>);
  await waitFor(() => assert.ok(view.getByRole('slider')));
  fireEvent.change(view.getByLabelText('Elegir de galería'), { target: { files: [photo] } });
  await waitFor(() => assert.ok(view.getByText('Borrador y foto guardados en este dispositivo')));
  view.unmount();
  view = render(<ReviewForm dish={target} profile={profile} previous={previous} onCancel={() => {}} onSaved={() => {}}/>);
  await waitFor(() => assert.ok(view.getByText('Nueva foto seleccionada')));
  fireEvent.click(view.getByRole('button', { name: 'Usar la foto publicada' }));
  await waitFor(() => assert.ok(view.getByText('Conservamos tu foto actual')));
  await waitFor(async () => assert.equal((await readDraft(draftKey(target.id, profile.id, 7))).draft!.photo, null));
  assert.equal(view.getByAltText('Foto de tu ración').getAttribute('src'), '/media/published/full.jpg');
});

test('Storage unavailable: no false saved status; retry preserves the current photo and comment', async () => {
  const target = dish('unavailable');
  const view = render(<ReviewForm dish={target} profile={profile} onCancel={() => {}} onSaved={() => {}}/>);
  await waitFor(() => assert.ok(view.getByRole('slider')));
  const factory = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { throw new Error('QuotaExceededError'); } } });
  try {
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'No perder.' } });
    fireEvent.change(view.getByLabelText('Elegir de galería'), { target: { files: [photo] } });
    await waitFor(() => assert.ok(view.getByText('No se pudo guardar el borrador en este dispositivo. No cierres la página.')));
    assert.equal(view.queryByText('Borrador y foto guardados en este dispositivo'), null);
    fireEvent.click(view.getByRole('button', { name: 'Volver al plato' }));
    await waitFor(() => assert.ok(view.getByRole('button', { name: 'Salir sin guardar el borrador' })));
  } finally { Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory }); }
  fireEvent.click(view.getByRole('button', { name: 'Reintentar guardado del borrador' }));
  await waitFor(() => assert.ok(view.getByText('Borrador y foto guardados en este dispositivo')));
  const restored = (await readDraft(draftKey(target.id, profile.id))).draft!;
  assert.equal(restored.comment, 'No perder.'); assert.deepEqual(await restored.photo!.arrayBuffer(), await photo.arrayBuffer());
});
