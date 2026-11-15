/** Local-only drafts. Photos are structured-cloned Blobs, never temporary object URLs. */
export interface ReviewDraft {
  key: string;
  dishId: string;
  profileId: string;
  opinionId: number | null;
  requestId: string;
  rating: number | null;
  comment: string;
  photo: Blob | null;
  photoId: string | null;
  photoName: string;
  photoLastModified: number;
  updatedAt: number;
}
export type DraftListing = ReviewDraft & { persisted: boolean };

const DATABASE = 'plan-bacon-drafts';
const STORE = 'reviews';
const PHOTOS = 'photos';
export const draftKey = (dishId: string, profileId: string, opinionId?: number) => JSON.stringify([dishId, profileId, opinionId ?? 'new']);

// Keep the latest unsaved snapshot available on in-app navigation if storage fails.
const memory = new Map<string, { draft: ReviewDraft | null; persisted: boolean }>();
const pending = new Map<string, Promise<void>>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.result.createObjectStore(PHOTOS, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('El almacenamiento de borradores está ocupado.'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, photos: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([STORE, PHOTOS], mode);
      const request = action(tx.objectStore(STORE), tx.objectStore(PHOTOS));
      // A successful request is not yet a committed write.
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar el borrador.'));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function enqueue(key: string, action: () => Promise<void>) {
  const task = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  pending.set(key, task);
  void task.finally(() => { if (pending.get(key) === task) pending.delete(key); }).catch(() => {});
  return task;
}

export function saveDraft(draft: ReviewDraft) {
  const snapshot = { draft, persisted: false };
  memory.set(draft.key, snapshot);
  return enqueue(draft.key, async () => {
    // Metadata and photo commit atomically. Moving the slider does not rewrite a 10 MB file.
    await transaction('readwrite', (store, photos) => {
      const before = store.get(draft.key);
      before.onsuccess = () => {
        if (before.result?.photoId !== draft.photoId) {
          if (draft.photo) photos.put({ key: draft.key, blob: draft.photo });
          else photos.delete(draft.key);
        }
        store.put({ ...draft, photo: null });
      };
      return before;
    });
    snapshot.persisted = true;
    if (memory.get(draft.key) === snapshot) memory.delete(draft.key);
  });
}

export async function readDraft(key: string): Promise<{ draft: ReviewDraft | null; persisted: boolean }> {
  await pending.get(key)?.catch(() => {});
  const cached = memory.get(key);
  if (cached && !cached.persisted) return cached;
  const draft = await transaction<ReviewDraft | undefined>('readonly', (store, photos) => {
    const get = store.get(key);
    const photo = photos.get(key);
    photo.onsuccess = () => { if (get.result) get.result.photo = photo.result?.blob ?? null; };
    return get;
  });
  return { draft: draft ?? null, persisted: true };
}

export async function listDrafts(dishId: string, profileId: string): Promise<DraftListing[]> {
  await Promise.allSettled(pending.values());
  const stored = await transaction<ReviewDraft[]>('readonly', (store, photos) => {
    const get = store.getAll();
    const images = photos.getAll();
    images.onsuccess = () => {
      const blobs = new Map<string, Blob>(images.result.map(p => [p.key, p.blob]));
      for (const draft of get.result) draft.photo = blobs.get(draft.key) ?? null;
    };
    return get;
  });
  const merged = new Map(stored.map(draft => [draft.key, draft]));
  for (const [key, cached] of memory) {
    if (cached.persisted) continue;
    if (cached.draft) merged.set(key, cached.draft); else merged.delete(key);
  }
  return [...merged.values()].filter(draft => draft.dishId === dishId && draft.profileId === profileId)
    .map(draft => ({ ...draft, persisted: memory.get(draft.key)?.persisted !== false }));
}

export function removeDraft(key: string, requestId: string) {
  return enqueue(key, async () => {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE, PHOTOS], 'readwrite');
        const store = tx.objectStore(STORE);
        const get = store.get(key);
        get.onsuccess = () => {
          // A completed submission must never remove a newer draft from another tab.
          if (get.result?.requestId === requestId) { store.delete(key); tx.objectStore(PHOTOS).delete(key); }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('No se pudo retirar el borrador.'));
        tx.onerror = () => reject(tx.error);
      });
      if (memory.get(key)?.draft?.requestId === requestId) memory.delete(key);
    } finally { db.close(); }
  });
}
