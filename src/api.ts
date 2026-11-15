export class ApiError extends Error {
  constructor(message: string, public status = 0, public data: Record<string, any> = {}) { super(message); }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('No pudimos conectar. Comprueba tu conexión y vuelve a intentarlo.');
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data) throw new ApiError(data?.error ?? 'No se pudo completar la operación. Reintenta.', response.status, data ?? {});
  return data;
}
