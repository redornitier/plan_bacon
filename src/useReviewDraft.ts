import { useEffect, useRef, useState } from 'react';
import type { Opinion } from '../shared/domain';
import { draftKey, readDraft, removeDraft, saveDraft } from './reviewDrafts';
import type { ReviewDraft } from './reviewDrafts';

export function useReviewDraft(dishId: string, profileId: string, previous?: Opinion) {
  const [draft, setDraft] = useState<ReviewDraft>(() => ({
    key: draftKey(dishId, profileId, previous?.id), dishId, profileId, opinionId: previous?.id ?? null,
    requestId: crypto.randomUUID(), rating: previous?.valoracion ?? null, comment: previous?.comentario ?? '',
    photo: null, photoId: null, photoName: '', photoLastModified: 0, updatedAt: Date.now(),
  }));
  const latest = useRef(draft);
  const mounted = useRef(false);
  const dirty = useRef(false);
  const statusRef = useRef<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [status, setStatus] = useState(statusRef.current);
  const [restored, setRestored] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const saving = useRef<Promise<void>>(Promise.resolve());

  function updateStatus(next: typeof status) {
    statusRef.current = next;
    if (mounted.current) setStatus(next);
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoadError(false); updateStatus('loading');
    readDraft(latest.current.key).then(result => {
      if (!active) return;
      if (result.draft) {
        latest.current = result.draft; setDraft(result.draft); setRestored(true); dirty.current = true;
        updateStatus(result.persisted ? 'saved' : 'error');
      } else updateStatus('idle');
    }).catch(() => { if (active) { setLoadError(true); updateStatus('error'); } });
    return () => { active = false; mounted.current = false; };
  }, [attempt]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current && statusRef.current !== 'saved') { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function persist(next: ReviewDraft) {
    updateStatus('saving');
    const task = saveDraft(next);
    saving.current = task;
    void task.then(() => { if (latest.current === next) updateStatus('saved'); }, () => { if (latest.current === next) updateStatus('error'); });
    return task;
  }

  function change(patch: Partial<Pick<ReviewDraft, 'rating' | 'comment' | 'photo' | 'photoId' | 'photoName' | 'photoLastModified'>>) {
    const next = { ...latest.current, ...patch, updatedAt: Date.now() };
    latest.current = next; dirty.current = true; setDraft(next);
    void persist(next).catch(() => {});
  }

  async function flush() {
    if (!dirty.current) return;
    await saving.current.catch(() => {});
    if (statusRef.current !== 'saved') await persist(latest.current);
  }

  async function complete() {
    await saving.current.catch(() => {});
    await removeDraft(latest.current.key, latest.current.requestId);
    dirty.current = false;
  }

  return { draft, status, restored, loadError, change, flush, complete,
    retryLoad: () => setAttempt(n => n + 1),
    // Storage can be unavailable in private browsing. Never silently overwrite an unread draft.
    continueWithoutStorage: () => { setLoadError(false); updateStatus('error'); },
  };
}
