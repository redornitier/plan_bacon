import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '../shared/domain';
import type { Env } from './env';
import { HttpError } from './errors';

function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  const text = new TextDecoder('ascii');
  if (text.decode(bytes.slice(0, 4)) === 'RIFF' && text.decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Drop APP1–APP15 and COM after re-encoding: no EXIF, GPS, XMP or original text. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (imageType(bytes) !== 'image/jpeg') throw new Error('Invalid encoded JPEG');
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG segment');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) { parts.push(bytes.slice(start)); break; }
    const size = (bytes[offset] << 8) | bytes[offset + 1];
    if (size < 2 || offset + size > bytes.length) throw new Error('Invalid JPEG length');
    offset += size;
    if (!(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe) parts.push(bytes.slice(start, offset));
  }
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const part of parts) { result.set(part, i); i += part.length; }
  return result;
}

export async function processPhoto(file: File, env: Env) {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new HttpError(400, 'La foto debe ocupar entre 1 byte y 10 MB.');
  if (!PHOTO_TYPES.includes(file.type)) throw new HttpError(400, 'Elige una foto JPEG, PNG o WebP.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (imageType(bytes) !== file.type) throw new HttpError(400, 'El contenido de la foto no coincide con su formato.');
  let full: Uint8Array;
  let thumb: Uint8Array;
  try {
    const info = await env.IMAGES.info(file.stream());
    if (!('width' in info) || !info.width || !info.height) throw new Error('Invalid raster image');
    const encode = async (edge: number) => {
      const ratio = Math.min(1, edge / Math.max(info.width, info.height));
      const output = await env.IMAGES.input(file.stream()).transform({
        width: Math.max(1, Math.round(info.width * ratio)),
        height: Math.max(1, Math.round(info.height * ratio)),
        fit: 'scale-down',
      }).output({ format: 'image/jpeg', quality: 82 });
      return stripJpegMetadata(new Uint8Array(await output.response().arrayBuffer()));
    };
    // Sequential processing bounds peak memory. Originals are never stored.
    full = await encode(1600);
    thumb = await encode(400);
  } catch (error) {
    console.error('photo_processing_failed', String(error));
    throw new HttpError(422, 'No se pudo procesar la foto. Comprueba que es válida y vuelve a intentarlo.');
  }
  const key = crypto.randomUUID();
  try {
    await env.PHOTOS.put(`${key}/full.jpg`, full, { httpMetadata: { contentType: 'image/jpeg' } });
    await env.PHOTOS.put(`${key}/thumb.jpg`, thumb, { httpMetadata: { contentType: 'image/jpeg' } });
  } catch (error) {
    console.error('photo_upload_failed', String(error));
    throw new HttpError(503, 'No se pudo subir la foto. Tu puntuación y comentario siguen aquí. Reintenta el guardado.');
  }
  return key;
}
