import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useState } from 'react';
import { filterAndSort, normalizeName } from '../shared/domain';
import type { Dish } from '../shared/domain';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const { render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
const { Catalog } = await import('../src/App');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

const dish = (nombre: string, media: number | null, total = 1): Dish => ({
  id: nombre, nombre, nombre_normalizado: normalizeName(nombre), restaurante_id: 'el-volante',
  media, total: media === null ? 0 : total, foto_clave: media === null ? null : `photo-${nombre}`,
});

function CatalogHarness() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  return <Catalog restaurant="Restaurante El Volante" {...{ query, setQuery, sort, setSort }}/>;
}

test('Catalog: the distinction starts at exactly 90 and unreviewed dishes keep a useful placeholder', async () => {
  const dishes = [dish('Justo debajo', 89.99), dish('Exactamente noventa', 90), dish('Sobresaliente', 90.5), dish('Perfecto', 100), dish('Nuevo', null)];
  globalThis.fetch = async () => Response.json({ platos: dishes });
  const view = render(<CatalogHarness/>);
  await waitFor(() => assert.equal(view.getAllByText('De lo mejor').length, 3));
  for (const d of dishes) {
    const card = view.getByRole('heading', { name: d.nombre }).closest('a')!;
    assert.equal(!!within(card).queryByText('De lo mejor'), d.media !== null && d.media >= 90);
    assert.equal(card.getAttribute('href'), `#/platos/${d.id}`);
    if (d.media === null) {
      assert.ok(within(card).getByText('Foto pendiente'));
      assert.ok(within(card).getByText('Sin valorar'));
    } else {
      assert.equal(within(card).getByRole('img').getAttribute('src'), `/media/${d.foto_clave}/thumb.jpg`);
    }
  }
  assert.equal(view.getByRole('link', { name: 'Añadir plato' }).getAttribute('href'), '#/nuevo');
});

test('Catalog: search stays active when changing sort, including most opinions and empty results', async () => {
  const dishes = [dish('Pollo asado', 90, 1), dish('Pollo al curry', 80, 3), dish('Pollo con fideos', 85, 3), dish('Ensalada', 100, 5)];
  globalThis.fetch = async () => Response.json({ platos: dishes });
  const view = render(<CatalogHarness/>);
  await waitFor(() => assert.ok(view.getByText('4 platos')));
  fireEvent.change(view.getByLabelText('Buscar plato'), { target: { value: 'pollo' } });
  const names = () => Array.from(view.container.querySelectorAll('.catalog-card h2')).map(h => h.textContent);
  assert.deepEqual(names(), ['Pollo al curry', 'Pollo asado', 'Pollo con fideos']);
  fireEvent.change(view.getByLabelText('Ordenar platos'), { target: { value: 'rating' } });
  assert.deepEqual(names(), ['Pollo asado', 'Pollo con fideos', 'Pollo al curry']);
  fireEvent.change(view.getByLabelText('Ordenar platos'), { target: { value: 'reviews' } });
  assert.deepEqual(names(), ['Pollo con fideos', 'Pollo al curry', 'Pollo asado']);
  assert.equal((view.getByLabelText('Buscar plato') as HTMLInputElement).value, 'pollo');
  fireEvent.change(view.getByLabelText('Buscar plato'), { target: { value: 'no existe' } });
  assert.ok(view.getByRole('heading', { name: 'Todavía no encontramos ese plato' }));
  assert.ok(view.getByText('0 platos'));
});

test('Most opinions: break ties by average, then Spanish name; unreviewed dishes stay last', () => {
  const dishes = [dish('Zeta', 80, 2), dish('Nuevo', null), dish('Alfa', 80, 2), dish('Beta', 95, 2), dish('Frecuente', 70, 3)];
  assert.deepEqual(filterAndSort(dishes, '', 'reviews').map(d => d.nombre), ['Frecuente', 'Beta', 'Alfa', 'Zeta', 'Nuevo']);
  assert.equal(dishes[0].nombre, 'Zeta');
});
