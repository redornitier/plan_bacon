import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Dish, Restaurant } from '../shared/domain';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, sessionStorage: dom.window.sessionStorage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.scrollTo = () => {};
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { default: App, NewDish } = await import('../src/App');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; sessionStorage.clear(); dom.window.history.replaceState(null, '', '/'); });
const restaurants: Restaurant[] = [{ id: 'el-volante', nombre: 'Restaurante El Volante' }, { id: 'second-test', nombre: 'Otro local de prueba' }];
const profiles = [{ id: 'alexandre', nombre_visible: 'Alexandre' }, { id: 'manoel', nombre_visible: 'Manoel' }];
const dishes: Dish[] = restaurants.map((r, i) => ({ id: `dish-${i}`, nombre: 'Croquetas', nombre_normalizado: 'croquetas', restaurante_id: r.id, total: 1, media: 90 - i * 10, foto_clave: `photo-${i}` }));
function mockApp() {
  globalThis.fetch = async (url) => {
    if (url === '/api/config') return Response.json({ restaurante: restaurants[0], restaurantes: restaurants, perfiles: profiles });
    if (url === '/api/restaurantes') return Response.json({ restaurantes: restaurants.map((r, i) => ({ ...r, total_platos: 1, foto_clave: dishes[i].foto_clave })) });
    for (const [i, r] of restaurants.entries()) {
      if (url === `/api/restaurantes/${r.id}`) return Response.json({ restaurante: r });
      if (url === `/api/restaurantes/${r.id}/platos`) return Response.json({ platos: [dishes[i]] });
      if (url === `/api/platos/${dishes[i].id}`) return Response.json({ restaurante: r, plato: dishes[i], opiniones: [] });
    }
    return Response.json({ error: 'No encontramos este restaurante.' }, { status: 404 });
  };
}

test('Navigation: profile → restaurants → own catalog; back preserves restaurant-specific filters and profile', async () => {
  mockApp();
  const view = render(<App/>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Ver restaurantes' })));
  fireEvent.change(view.getByLabelText('¿Quién se sienta hoy?'), { target: { value: 'manoel' } });
  fireEvent.click(view.getByRole('button', { name: 'Ver restaurantes' }));
  await waitFor(() => assert.ok(view.getByRole('link', { name: 'Ver platos de El Volante' })));
  assert.equal(view.queryByLabelText('Buscar plato'), null);
  fireEvent.click(view.getByRole('link', { name: 'Ver platos de El Volante' }));
  await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Croquetas' })));
  fireEvent.change(view.getByLabelText('Buscar plato'), { target: { value: 'croq' } });
  fireEvent.change(view.getByLabelText('Ordenar platos'), { target: { value: 'rating' } });
  fireEvent.click(view.getByRole('heading', { name: 'Croquetas' }).closest('a')!);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  assert.ok(view.getByText('Restaurante El Volante'));
  fireEvent.click(view.getByRole('link', { name: 'Volver a los platos' }));
  await waitFor(() => assert.ok(view.getByLabelText('Buscar plato')));
  assert.equal((view.getByLabelText('Buscar plato') as HTMLInputElement).value, 'croq');
  assert.equal((view.getByLabelText('Ordenar platos') as unknown as HTMLSelectElement).value, 'rating');
  fireEvent.click(view.getByRole('link', { name: 'Restaurantes' }));
  await waitFor(() => assert.ok(view.getByRole('link', { name: 'Ver platos de Otro local de prueba' })));
  fireEvent.click(view.getByRole('link', { name: 'Ver platos de Otro local de prueba' }));
  await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Croquetas' })));
  assert.equal((view.getByLabelText('Buscar plato') as HTMLInputElement).value, '');
  assert.equal((view.getByLabelText('Ordenar platos') as unknown as HTMLSelectElement).value, 'name');
  assert.equal(view.getByRole('link', { name: 'Añadir plato' }).getAttribute('href'), '#/restaurantes/second-test/nuevo');
  assert.equal(sessionStorage.getItem('plan-bacon-profile'), 'manoel');
  fireEvent.click(view.getByRole('button', { name: 'Cambiar perfil' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Ver restaurantes' })));
  fireEvent.change(view.getByLabelText('¿Quién se sienta hoy?'), { target: { value: 'alexandre' } });
  fireEvent.click(view.getByRole('button', { name: 'Ver restaurantes' }));
  await waitFor(() => assert.ok(view.getByRole('heading', { name: /¿Dónde comemos/ })));
  assert.equal(view.queryByLabelText('Buscar plato'), null);
});

test('New dish: suggestions and writes use the selected restaurant, including duplicate resolution', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    if (init?.method === 'POST') {
      assert.equal(JSON.parse(init.body as string).perfil_id, 'alexandre');
      return Response.json({ error: 'Este plato ya existe.', plato: { id: 'concurrent-dish', nombre: 'Arroz' } }, { status: 409 });
    }
    return Response.json({ platos: [] });
  };
  const view = render(<NewDish restaurant={restaurants[1]} profile={profiles[0]} initialName="" onCreated={() => assert.fail('A duplicate must not be created')}/>);
  await waitFor(() => assert.equal(calls.length, 1));
  assert.ok(view.getByText('Otro local de prueba'));
  fireEvent.change(view.getByLabelText('Nombre del plato'), { target: { value: 'Arroz' } });
  fireEvent.click(view.getByRole('button', { name: 'Crear plato' }));
  await waitFor(() => assert.ok(view.getByRole('link', { name: 'Abrir plato' })));
  assert.deepEqual(calls, [{ url: '/api/restaurantes/second-test/platos', method: 'GET' }, { url: '/api/restaurantes/second-test/platos', method: 'POST' }]);
  assert.equal(view.getByRole('link', { name: 'Abrir plato' }).getAttribute('href'), '#/platos/concurrent-dish');
  assert.equal(view.getByRole('link', { name: 'Volver a los platos' }).getAttribute('href'), '#/restaurantes/second-test');
});

test('Direct links: a saved dish URL resolves its restaurant, and an invalid restaurant never falls back to El Volante', async () => {
  mockApp(); sessionStorage.setItem('plan-bacon-profile', 'alexandre');
  dom.window.history.replaceState(null, '', '/#/platos/dish-1');
  const view = render(<App/>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Añadir valoración' })));
  assert.ok(view.getByText('Otro local de prueba'));
  assert.equal(view.getByRole('link', { name: 'Volver a los platos' }).getAttribute('href'), '#/restaurantes/second-test');
  cleanup(); dom.window.history.replaceState(null, '', '/#/restaurantes/missing');
  const missing = render(<App/>);
  await waitFor(() => assert.ok(missing.getByRole('alert')));
  assert.equal(missing.queryByLabelText('Buscar plato'), null);
  assert.ok(missing.getByRole('link', { name: 'Restaurantes' }));
});
