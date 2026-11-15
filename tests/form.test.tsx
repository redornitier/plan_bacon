import 'fake-indexeddb/auto';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Dish, Opinion } from '../shared/domain';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, sessionStorage: dom.window.sessionStorage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { default: App, ReviewForm } = await import('../src/App');
const { RatingSlider } = await import('../src/RatingSlider');
const { ratingRepertoires } = await import('../src/ratingCopy');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; sessionStorage.clear(); dom.window.history.replaceState(null, '', '/'); });
const dish: Dish = { id: 'dish', nombre: 'Croquetas', nombre_normalizado: 'croquetas', restaurante_id: 'el-volante', media: null, total: 0, foto_clave: null };
const profile = { id: 'alexandre', nombre_visible: 'Alexandre' };
const file = new File([new Uint8Array([1, 2, 3])], 'fixture.jpg', { type: 'image/jpeg' });

test('CA-08 UI: photo and explicit score are required; displayed midpoint is not a score', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  const view = render(<ReviewForm dish={dish} profile={profile} onCancel={() => {}} onSaved={() => {}}/>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Guardar como Alexandre' })));
  fireEvent.click(view.getByRole('button', { name: 'Guardar como Alexandre' }));
  assert.ok(view.getByText('Añade una foto de tu ración.'));
  assert.ok(view.getByText('Elige una puntuación entre 1 y 100.'));
  assert.equal(calls, 0);
  fireEvent.change(view.getByLabelText('Elegir de galería'), { target: { files: [file] } });
  fireEvent.click(view.getByRole('button', { name: 'Guardar como Alexandre' }));
  assert.equal(calls, 0);
  // Explicit selection of the initial midpoint is valid too.
  fireEvent.pointerUp(view.getByRole('slider'));
  fireEvent.click(view.getByRole('button', { name: 'Guardar como Alexandre' }));
  await waitFor(() => assert.equal(calls, 1));
});

for (const editing of [false, true]) test(`CA-07 UI: ${editing ? 'replacement' : 'new opinion'} retains file, score and comment across upload/save failures`, async () => {
  let attempts = 0;
  let saved = 0;
  const payloads: FormData[] = [];
  const urls: string[] = [];
  const methods: string[] = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(init!.body as FormData); urls.push(String(_url)); methods.push(init!.method!);
    attempts++;
    if (attempts < 3) return Response.json({ error: attempts === 1 ? 'No se pudo subir la foto.' : 'No se pudo confirmar el guardado.' }, { status: 503 });
    return Response.json({ opinion: { id: 1 } });
  };
  const previous: Opinion | undefined = editing ? { id: 1, plato_id: 'dish', perfil_id: 'alexandre', nombre_visible: 'Alexandre', foto_clave: 'old-photo', valoracion: 60, comentario: 'Anterior', creada_en: '2026-11-10T10:00:00Z', actualizada_en: '2026-11-10T10:00:00Z' } : undefined;
  const view = render(<ReviewForm dish={dish} profile={profile} previous={previous} onCancel={() => {}} onSaved={() => { saved++; }}/>);
  await waitFor(() => assert.ok(view.getByRole('slider')));
  if (editing) assert.ok(view.getByText('Conservamos tu foto actual'));
  fireEvent.change(view.getByLabelText('Elegir de galería'), { target: { files: [file] } });
  fireEvent.change(view.getByRole('slider'), { target: { value: '73' } });
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Comentario que no debe perderse.' } });
  for (let attempt = 0; attempt < 2; attempt++) {
    fireEvent.click(view.getByRole('button', { name: /Guardar como Alexandre/ }));
    await waitFor(() => assert.ok(view.getByRole('alert')));
    assert.equal((view.getByRole('slider') as HTMLInputElement).value, '73');
    assert.equal((view.getByRole('textbox') as HTMLTextAreaElement).value, 'Comentario que no debe perderse.');
    assert.ok(view.getByText('Nueva foto seleccionada'));
    assert.equal(saved, 0);
  }
  fireEvent.click(view.getByRole('button', { name: /Guardar como Alexandre/ }));
  await waitFor(() => assert.equal(saved, 1));
  assert.equal(attempts, 3);
  assert.ok(urls.every(u => u === `/api/platos/dish/opiniones${editing ? '/1' : ''}`));
  assert.ok(methods.every(m => m === (editing ? 'PUT' : 'POST')));
  if (!editing) assert.equal(new Set(payloads.map(p => p.get('solicitud_id'))).size, 1);
  for (const payload of payloads) {
    assert.equal(payload.get('valoracion'), '73'); assert.equal(payload.get('comentario'), 'Comentario que no debe perderse.');
    assert.equal(payload.get('perfil_id'), 'alexandre'); assert.equal((payload.get('foto') as File).name, 'fixture.jpg');
  }
});


test('Dish UI: add another opinion, edit either own opinion and order by date or score', async () => {
  const opinions = [
    { id: 3, perfil_id: 'manoel', nombre_visible: 'Manoel', valoracion: 70, creada_en: '2026-11-12T12:00:00Z' },
    { id: 2, perfil_id: 'alexandre', nombre_visible: 'Alexandre', valoracion: 60, creada_en: '2026-11-11T12:00:00Z' },
    { id: 1, perfil_id: 'alexandre', nombre_visible: 'Alexandre', valoracion: 90, creada_en: '2026-11-10T12:00:00Z' },
  ].map(o => ({ ...o, plato_id: dish.id, foto_clave: 'foto', comentario: null, actualizada_en: o.creada_en }));
  globalThis.fetch = async url => url === '/api/config' ? Response.json({ restaurante: { id: 'el-volante', nombre: 'El Volante' }, perfiles: [profile] }) : Response.json({ restaurante: { id: 'el-volante', nombre: 'Restaurante El Volante' }, plato: { ...dish, total: 3, media: 73.333 }, opiniones: opinions });
  dom.window.scrollTo = () => {};
  sessionStorage.setItem('plan-bacon-profile', profile.id);
  dom.window.history.replaceState(null, '', '/#/platos/dish');
  const view = render(<App/>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  const values = () => Array.from(view.container.querySelectorAll('article .rating-number')).map(n => n.textContent);
  assert.deepEqual(values(), ['70/100', '60/100', '90/100']);
  fireEvent.change(view.getByLabelText('Ordenar valoraciones'), { target: { value: 'rating' } });
  assert.deepEqual(values(), ['90/100', '70/100', '60/100']);
  assert.equal(view.getAllByRole('button', { name: /Editar mi valoración/ }).length, 2);
  fireEvent.click(view.getByRole('button', { name: /Editar mi valoración de 90 puntos/ }));
  await waitFor(() => assert.equal((view.getByRole('slider') as HTMLInputElement).value, '90'));
  fireEvent.click(view.getByRole('button', { name: 'Volver al plato' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  fireEvent.click(view.getByRole('button', { name: /Editar mi valoración de 60 puntos/ }));
  await waitFor(() => assert.equal((view.getByRole('slider') as HTMLInputElement).value, '60'));
  fireEvent.click(view.getByRole('button', { name: 'Volver al plato' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  fireEvent.click(view.getByRole('button', { name: 'Añadir valoración' }));
  await waitFor(() => assert.equal(view.getByRole('slider').getAttribute('aria-valuetext')?.startsWith('Sin elegir'), true));
  assert.equal(view.queryByText('Conservamos tu foto actual'), null);
});

test('Rating slider: each gesture gets a different coherent repertoire without choosing a score on touch-down', () => {
  const chosen: number[] = [];
  const props = { dishName: 'Croquetas', value: 80, onChange: (value: number) => chosen.push(value), invalid: false, disabled: false };
  const view = render(<RatingSlider {...props}/>);
  const slider = view.getByRole('slider');
  const phrase = () => view.container.querySelector('.bacon-phrase')!.textContent;
  let previous = phrase();
  for (let gesture = 0; gesture < 12; gesture++) {
    fireEvent.pointerDown(slider);
    const current = phrase();
    assert.notEqual(current, previous);
    const repertoire = ratingRepertoires.find(set => set[4] === current)!;
    view.rerender(<RatingSlider {...props} value={95}/>);
    assert.equal(phrase(), repertoire[5]);
    view.rerender(<RatingSlider {...props}/>);
    assert.equal(phrase(), current);
    previous = current;
  }
  assert.deepEqual(chosen, []);
  fireEvent.pointerUp(slider);
  assert.deepEqual(chosen, [80]);
});

test('Rating slider: keyboard can explicitly choose the midpoint and disabled controls do not change it', () => {
  const chosen: number[] = [];
  const props = { dishName: 'Croquetas', value: null, onChange: (value: number) => chosen.push(value), invalid: true, disabled: false };
  const view = render(<RatingSlider {...props}/>);
  const slider = view.getByRole('slider');
  assert.equal(slider.getAttribute('aria-invalid'), 'true');
  assert.match(slider.getAttribute('aria-valuetext')!, /^Sin elegir/);
  assert.equal(view.container.querySelector('output')!.textContent, '—');
  fireEvent.keyDown(slider, { key: 'Enter' });
  assert.deepEqual(chosen, [50]);
  view.rerender(<RatingSlider {...props} disabled/>);
  fireEvent.keyDown(slider, { key: ' ' });
  fireEvent.pointerUp(slider);
  assert.deepEqual(chosen, [50]);
});
