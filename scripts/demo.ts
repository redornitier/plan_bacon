import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error('La demostración solo se puede cargar en localhost.');
async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init);
  const data: any = await response.json();
  if (!response.ok && response.status !== 409) throw new Error(JSON.stringify(data));
  return data;
}
const created = await call('/api/platos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Prueba local de fotos', perfil_id: 'alexandre' }) });
const id = created.plato.id;
const savedIds: number[] = [];
await mkdir('test-output/fixtures', { recursive: true });
for (const [index, profile] of ['alexandre', 'manoel'].entries()) {
  const fixture = await sharp(Buffer.from(`<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="${index ? '#70836c' : '#a96c50'}"/><ellipse cx="600" cy="470" rx="400" ry="300" fill="#f5eedd"/><ellipse cx="600" cy="470" rx="330" ry="235" fill="none" stroke="#c6b99c" stroke-width="5"/><g fill="#cb873c" stroke="#a86528" stroke-width="7"><ellipse cx="470" cy="370" rx="100" ry="60" transform="rotate(-25 470 370)"/><ellipse cx="700" cy="410" rx="100" ry="60" transform="rotate(25 700 410)"/><ellipse cx="550" cy="560" rx="100" ry="60" transform="rotate(15 550 560)"/></g><text x="600" y="100" text-anchor="middle" font-family="sans-serif" font-size="28" fill="white">MUESTRA LOCAL · ${profile.toUpperCase()}</text></svg>`)).jpeg({ quality: 85 }).toBuffer();
  await writeFile(`test-output/fixtures/${profile}.jpg`, fixture);
  const form = new FormData(); form.set('perfil_id', profile); form.set('valoracion', index ? '80' : '60');
  form.set('comentario', index ? '' : 'Valoración de prueba local. Sustituir por fotos reales al usar la app.');
  form.set('foto', new File([fixture], `${profile}.jpg`, { type: 'image/jpeg' }));
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`demo:${id}:${profile}`))).toString('hex');
  form.set('solicitud_id', `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`);
  const saved = await call(`/api/platos/${id}/opiniones`, { method: 'POST', body: form });
  savedIds.push(saved.opinion.id);
}
const detail = await call(`/api/platos/${id}`);
if (!savedIds.every(id => detail.opiniones.some((o: any) => o.id === id))) throw new Error('Falta una opinión de muestra');
for (const opinion of detail.opiniones.filter((o: any) => savedIds.includes(o.id))) {
  const photo = await fetch(`${base}/media/${opinion.foto_clave}/full.jpg`);
  if (!photo.ok || !await sharp(Buffer.from(await photo.arrayBuffer())).metadata()) throw new Error('No se recuperó la foto');
}
console.log(`Prueba local: dos opiniones recuperadas, media actual ${detail.plato.media}, dos fotos válidas.\n${base}/#/platos/${id}\nImágenes de prueba en test-output/fixtures (no son fotos reales).`);
