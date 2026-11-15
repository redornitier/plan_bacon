export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function cleanName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Same function in search, uniqueness checks, maintenance and UI suggestions. */
export function normalizeName(value: string): string {
  return cleanName(value).toLocaleLowerCase('es').normalize('NFD')
    .replace(/([aeiou])[\u0300-\u036f]+/gu, '$1').normalize('NFC');
}
export const charLength = (value: string) => Array.from(value).length;
export const photoUrl = (key: string, thumb = false) => `/media/${key}/${thumb ? 'thumb' : 'full'}.jpg`;

export interface Profile { id: string; nombre_visible: string }
export interface Restaurant { id: string; nombre: string }
export interface Config { restaurante: Restaurant; perfiles: Profile[] }
export interface Dish {
  id: string; nombre: string; nombre_normalizado: string; restaurante_id: string;
  media: number | null; total: number; foto_clave: string | null;
}
export interface Opinion {
  id: number; plato_id: string; perfil_id: string; nombre_visible: string;
  foto_clave: string; valoracion: number; comentario: string | null;
  creada_en: string; actualizada_en: string;
}
export interface Detail { plato: Dish; opiniones: Opinion[] }

const collator = new Intl.Collator('es', { sensitivity: 'base' });
export function filterAndSort(dishes: Dish[], query: string, sort: string): Dish[] {
  const normalized = normalizeName(query);
  return dishes.filter(d => d.nombre_normalizado.includes(normalized)).sort((a, b) => {
    if (sort === 'rating') {
      if (a.media === null && b.media !== null) return 1;
      if (a.media !== null && b.media === null) return -1;
      if (a.media !== null && b.media !== null && a.media !== b.media) return b.media - a.media;
    }
    return collator.compare(a.nombre, b.nombre) || a.id.localeCompare(b.id);
  });
}

/** Date defaults to newest publication; score ties keep that publication order. */
export function sortOpinions(opinions: Opinion[], sort: string): Opinion[] {
  return [...opinions].sort((a, b) => {
    if (sort === 'rating' && a.valoracion !== b.valoracion) return b.valoracion - a.valoracion;
    return b.creada_en.localeCompare(a.creada_en) || b.id - a.id;
  });
}
