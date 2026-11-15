import { charLength, cleanName, normalizeName } from '../shared/domain';

export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
function name(value: string) {
  const cleaned = cleanName(value);
  if (!cleaned || charLength(cleaned) > 80) throw new Error('El nombre debe tener de 1 a 80 caracteres.');
  return cleaned;
}
export function addProfileSql(value: string, id: string = crypto.randomUUID()) {
  return `INSERT INTO perfiles(id, grupo_id, nombre_visible) VALUES (${literal(id)}, 'plan-bacon', ${literal(name(value))});\nSELECT id, nombre_visible FROM perfiles WHERE id = ${literal(id)};`;
}
export function addRestaurantSql(value: string, id: string = crypto.randomUUID()) {
  const cleaned = cleanName(value);
  if (!cleaned || charLength(cleaned) > 120) throw new Error('El nombre del restaurante debe tener de 1 a 120 caracteres.');
  return `INSERT INTO restaurantes(id, grupo_id, nombre) VALUES (${literal(id)}, 'plan-bacon', ${literal(cleaned)});\nSELECT id, nombre FROM restaurantes WHERE id = ${literal(id)};`;
}
export function renameDishSql(id: string, value: string) {
  const cleaned = name(value);
  return `UPDATE platos SET nombre = ${literal(cleaned)}, nombre_normalizado = ${literal(normalizeName(cleaned))} WHERE id = ${literal(id)} AND restaurante_id IN (SELECT id FROM restaurantes WHERE grupo_id = 'plan-bacon');\nSELECT id, nombre FROM platos WHERE id = ${literal(id)};`;
}
export function inspectDishSql(id: string) {
  return `SELECT d.id, d.nombre, d.nombre_normalizado, o.id opinion_id, p.nombre_visible, o.valoracion, o.comentario, o.foto_clave, o.creada_en, o.actualizada_en FROM platos d LEFT JOIN opiniones o ON o.plato_id = d.id LEFT JOIN perfiles p ON p.id = o.perfil_id WHERE d.id = ${literal(id)} ORDER BY o.creada_en DESC, o.id DESC;`;
}
