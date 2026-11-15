import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, ApiError } from './api';
import { RatingSlider } from './RatingSlider';
import { charLength, cleanName, filterAndSort, MAX_PHOTO_BYTES, normalizeName, PHOTO_TYPES, photoUrl, sortOpinions } from '../shared/domain';
import type { Config, Detail, Dish, Opinion, Profile } from '../shared/domain';

function Icon({ name, size = 20 }: { name: 'arrow' | 'plus' | 'search' | 'camera' | 'image' | 'sort' | 'back' | 'check'; size?: number }) {
  const paths = {
    arrow: <path d="m9 5 7 7-7 7M4 12h12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    sort: <path d="M4 6h16M4 12h11M4 18h6"/>,
    back: <path d="m10 5-7 7 7 7M3 12h17"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Plate({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'plate small' : 'plate'} viewBox="0 0 120 100" fill="none" aria-hidden="true"><ellipse cx="60" cy="55" rx="36" ry="30"/><ellipse cx="60" cy="55" rx="26" ry="21"/><path d="M12 25v50M6 25v18q6 8 12 0V25M108 25q-12 15 0 25v25M48 15q-6-7 0-12M62 15q-6-7 0-12M76 15q-6-7 0-12"/></svg>;
}
function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><Plate/><h2>{title}</h2><p>{children}</p>{action}</div>;
}
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error" role="alert"><p>{message}</p>{retry && <button className="text-button" onClick={retry}>Volver a intentar</button>}</div>;
}
const message = (e: unknown) => e instanceof Error ? e.message : 'Algo no ha ido bien. Vuelve a intentarlo.';
const score = (value: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function go(path = '/') { window.location.hash = path; }
const subscribe = (fn: () => void) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };
const currentRoute = () => window.location.hash.slice(1) || '/';

function useLoad<T>(url: string, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api<T>(url, { signal: controller.signal }).then(setData).catch(e => {
      if (!controller.signal.aborted) setError(message(e));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision, attempt]);
  return { data, error, loading, retry: () => setAttempt(n => n + 1) };
}

export default function App() {
  const config = useLoad<Config>('/api/config');
  const [profileId, setProfileId] = useState(() => { try { return sessionStorage.getItem('plan-bacon-profile') ?? ''; } catch { return ''; } });
  const [choosing, setChoosing] = useState(!profileId);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [notice, setNotice] = useState('');
  const route = useSyncExternalStore(subscribe, currentRoute);
  const heading = useRef<HTMLElement>(null);
  const profile = config.data?.perfiles.find(p => p.id === profileId);
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [route, choosing]);
  useEffect(() => { if (route === '/') setNotice(''); }, [route]);
  const choose = (id: string) => {
    setProfileId(id); setChoosing(false); setNotice('');
    try { sessionStorage.setItem('plan-bacon-profile', id); } catch { /* Session-only fallback. */ }
    go('/');
  };
  const changeProfile = () => { setChoosing(true); config.retry(); go('/'); };
  const showChooser = choosing || !profile;
  const dishId = route.match(/^\/platos\/([\w-]+)$/)?.[1];
  return <>
    <a className="skip-link" href="#main">Saltar al contenido</a>
    <header className="site-header"><a href="#/" className="brand" aria-label="Plan Bacon, inicio"><span className="brand-mark">b.</span><span>plan bacon<span className="brand-caption">LAS OPINIONES DE NUESTRA MESA</span></span></a>
      {!showChooser && <div className="profile-control"><span className="avatar">{profile.nombre_visible[0]}</span><span><strong>{profile.nombre_visible}</strong><button className="text-button" onClick={changeProfile}>Cambiar perfil</button></span></div>}
    </header>
    <main id="main" tabIndex={-1} ref={heading}>
      {config.loading ? <p className="loading" role="status">Preparando la mesa…</p> : config.error ? <ErrorBox message={config.error} retry={config.retry}/> : config.data && (showChooser ?
        <ProfileChooser profiles={config.data.perfiles} selected={profileId} onChoose={choose}/> :
        route === '/nuevo' ? <NewDish profile={profile!} initialName={query} onCreated={() => { setQuery(''); setNotice('Plato añadido. Ya puedes valorar tu ración.'); }}/> :
        dishId ? <DishDetail key={`${dishId}:${profileId}`} id={dishId} profile={profile!} notice={notice} onSaved={() => setNotice('Tu valoración está guardada. ¡Gracias por compartirla!')}/> :
        <Catalog restaurant={config.data.restaurante.nombre} query={query} setQuery={setQuery} sort={sort} setSort={setSort}/>
      )}
    </main>
    <footer><span>Buen criterio. Mejor compañía.</span><span>Plan Bacon · Nuestra mesa</span></footer>
  </>;
}

function ProfileChooser({ profiles, selected, onChoose }: { profiles: Profile[]; selected: string; onChoose: (id: string) => void }) {
  const [value, setValue] = useState(selected);
  return <section className="welcome"><span className="eyebrow">BIENVENIDO A LA MESA</span><h1>¿Qué tal estaba<br/><em>lo de la otra vez?</em></h1><p className="intro">Las fotos, los favoritos y las opiniones del grupo.<br className="desktop-break"/> Todo a mano antes de volver a pedir.</p><Plate/>
    <form className="profile-form" onSubmit={e => { e.preventDefault(); if (profiles.some(p => p.id === value)) onChoose(value); }}>
      <label htmlFor="profile">¿Quién se sienta hoy?</label>
      <select id="profile" value={value} onChange={e => setValue(e.target.value)} required><option value="" disabled>Elige tu perfil</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.nombre_visible}</option>)}</select>
      <button className="primary" disabled={!value}>Entrar a El Volante <Icon name="arrow"/></button>
      <p className="hint">Sin contraseñas: cualquiera puede elegir cualquier perfil y editar su opinión.</p>
    </form>
  </section>;
}

function Catalog({ restaurant, query, setQuery, sort, setSort }: { restaurant: string; query: string; setQuery: (s: string) => void; sort: string; setSort: (s: string) => void }) {
  const list = useLoad<{ platos: Dish[] }>('/api/platos');
  const [ordering, setOrdering] = useState(false);
  const dishes = filterAndSort(list.data?.platos ?? [], query, sort);
  return <>
    <section className="catalog-heading"><span className="eyebrow">NUESTRO RESTAURANTE DE SIEMPRE</span><div className="title-row"><h1>{restaurant.replace(/^Restaurante /, '')}<span className="title-dot">.</span></h1><span className="restaurant-label">RESTAURANTE<br/>Y BUENA COMPAÑÍA</span></div><p>Lo que pedimos. Lo que pensamos. Lo que repetiríamos.</p></section>
    <div className="catalog-tools"><div className="search-wrap"><Icon name="search"/><label className="sr-only" htmlFor="search">Buscar plato</label><input id="search" type="search" placeholder="¿Qué te apetece pedir?" value={query} onChange={e => setQuery(e.target.value)}/></div><button className="secondary order-button" aria-expanded={ordering} aria-controls="sort-options" onClick={() => setOrdering(!ordering)}><Icon name="sort"/>Ordenar</button></div>
    {ordering && <fieldset className="sort-options" id="sort-options"><legend>Orden de los platos</legend>{[['name', 'Por nombre'], ['rating', 'Por valoración']].map(([value, label]) => <label key={value}><input type="radio" name="sort" checked={sort === value} onChange={() => setSort(value)}/>{label}</label>)}</fieldset>}
    <div className="section-line"><span>{dishes.length} {dishes.length === 1 ? 'plato' : 'platos'}<span className="muted"> · {sort === 'rating' ? 'Por valoración' : 'De la A a la Z'}</span></span><a className="text-button" href="#/nuevo"><Icon name="plus"/>Añadir plato</a></div>
    {list.loading ? <p className="loading" role="status">Buscando los platos de la mesa…</p> : list.error ? <ErrorBox message={list.error} retry={list.retry}/> : !list.data?.platos.length ? <Empty title="La mesa está por estrenar" action={<a className="primary" href="#/nuevo"><Icon name="plus"/>Añadir el primer plato</a>}>Añade un plato de El Volante y guarda la primera opinión del grupo.</Empty> : !dishes.length ? <Empty title="Todavía no encontramos ese plato" action={<a className="primary" href="#/nuevo"><Icon name="plus"/>Añadir plato</a>}>Prueba con otro nombre o añade «{query}» a nuestra mesa.</Empty> : <div className="dish-list">{dishes.map(d => <a className="dish-card" href={`#/platos/${d.id}`} key={d.id}>
      {d.foto_clave ? <img src={photoUrl(d.foto_clave, true)} alt={`Ración de ${d.nombre}`} loading="lazy"/> : <div className="dish-placeholder"><Plate small/></div>}
      <div className="dish-copy"><h2>{d.nombre}</h2>{d.media === null ? <span className="unrated">Sin valorar <span>· ¿Lo has probado?</span></span> : <div className="dish-rating"><span className="rating-number">{score(d.media)}<small>/100</small></span><span>{d.total} {d.total === 1 ? 'valoración' : 'valoraciones'}</span></div>}</div><span className="card-arrow"><Icon name="arrow"/></span>
    </a>)}</div>}
    <aside className="table-note"><span className="note-line"/><p>Una foto de tu plato.<br/><strong>Una pista para la próxima vez.</strong></p><span className="note-line"/></aside>
  </>;
}

function NewDish({ profile, initialName, onCreated }: { profile: Profile; initialName: string; onCreated: () => void }) {
  const catalog = useLoad<{ platos: Dish[] }>('/api/platos');
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ id: string; nombre: string } | null>(null);
  const normalized = normalizeName(name);
  const matches = normalized ? filterAndSort(catalog.data?.platos ?? [], name, 'name') : [];
  const exact = conflict ?? matches.find(d => d.nombre_normalizado === normalized);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!cleanName(name) || charLength(cleanName(name)) > 80) { setError('Escribe un nombre de entre 1 y 80 caracteres.'); return; }
    setBusy(true);
    try {
      const { plato } = await api<{ plato: Dish }>('/api/platos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name, perfil_id: profile.id }) });
      onCreated(); go(`/platos/${plato.id}`);
    } catch (e) { if (e instanceof ApiError && e.status === 409) setConflict(e.data.plato); else setError(message(e)); }
    finally { setBusy(false); }
  }
  return <section className="narrow"><a className="back-link" href="#/"><Icon name="back"/>Volver a los platos</a><span className="eyebrow">HAY SITIO PARA OTRO</span><h1>Añadir plato</h1><p className="intro">Escríbelo como aparece en la carta.<br/>La foto llegará con tu valoración.</p>
    <form onSubmit={submit}><label htmlFor="dish-name">Nombre del plato</label><input id="dish-name" autoFocus maxLength={80} value={name} disabled={busy} onChange={e => { setName(e.target.value); setConflict(null); setError(''); }} placeholder="Por ejemplo, Croquetas de jamón" required/><div className="field-bottom"><span>Lo añade {profile.nombre_visible}</span><span>{charLength(name)}/80</span></div>
      {exact ? <div className="suggestion exact" role="status"><strong>Este plato ya está en nuestra mesa</strong><p>{exact.nombre}</p><a className="secondary" href={`#/platos/${exact.id}`}>Abrir plato <Icon name="arrow"/></a></div> : matches.length > 0 && <div className="suggestion"><span className="eyebrow">¿TE REFIERES A ALGUNO DE ESTOS?</span>{matches.slice(0, 5).map(d => <a key={d.id} href={`#/platos/${d.id}`}>{d.nombre}<Icon name="arrow"/></a>)}<p className="hint">Si es otro plato, puedes crearlo igualmente.</p></div>}
      {catalog.error && <ErrorBox message="No se pudieron cargar las sugerencias. Al guardar comprobaremos si el plato ya existe." retry={catalog.retry}/>}
      {error && <ErrorBox message={error}/>}
      <button className="primary wide" disabled={busy || !!exact}>{busy ? 'Creando plato…' : 'Crear plato'}<Icon name="plus"/></button>
    </form>
  </section>;
}

export function DishDetail({ id, profile, notice, onSaved }: { id: string; profile: Profile; notice: string; onSaved: () => void }) {
  const detail = useLoad<Detail>(`/api/platos/${id}`);
  const [editing, setEditing] = useState<Opinion | 'new' | null>(null);
  const [opinionSort, setOpinionSort] = useState('date');
  if (detail.loading) return <p className="loading" role="status">Preparando el plato…</p>;
  if (detail.error || !detail.data) return <><a className="back-link" href="#/">Volver a los platos</a><ErrorBox message={detail.error} retry={detail.retry}/></>;
  const { plato, opiniones } = detail.data;
  const sortedOpinions = sortOpinions(opiniones, opinionSort);
  return <>
    <a className="back-link" href="#/"><Icon name="back"/>Volver a los platos</a>
    <section className="detail-heading"><span className="eyebrow">RESTAURANTE EL VOLANTE</span><h1>{plato.nombre}</h1><div className="detail-meta">{plato.media === null ? <span className="unrated">Sin valorar</span> : <><span className="rating-number">{score(plato.media)}<small>/100</small></span><span>{plato.total} {plato.total === 1 ? 'valoración de la mesa' : 'valoraciones de la mesa'}</span></>}</div></section>
    {notice && !editing && <p className="notice" role="status"><Icon name="check"/>{notice}</p>}
    {editing ? <ReviewForm key={editing === 'new' ? 'new' : editing.id} dish={plato} profile={profile} previous={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); detail.retry(); }}/> : <div className="review-callout"><div><strong>¿Qué tal estaba esta vez?</strong><p>Puedes guardar una nueva opinión cada vez que lo pruebes.</p></div><button className="primary" onClick={() => setEditing('new')}><Icon name="plus"/>Añadir valoración</button></div>}
    <div className="section-line"><h2>Las opiniones de la mesa</h2><div className="opinion-sort"><label htmlFor="opinion-sort">Ordenar valoraciones</label><select id="opinion-sort" value={opinionSort} onChange={e => setOpinionSort(e.target.value)}><option value="date">Por fecha · más recientes</option><option value="rating">Por puntuación · mayor primero</option></select></div></div>
    {!opiniones.length ? <Empty title="La primera opinión puede ser la tuya">Todavía nadie ha valorado este plato. Cuéntanos qué tal estaba.</Empty> : <div className="opinions">{sortedOpinions.map(o => <article className="opinion" key={o.id}>
      <a href={photoUrl(o.foto_clave)} target="_blank" rel="noreferrer" aria-label={`Ampliar la foto de ${o.nombre_visible}`}><img src={photoUrl(o.foto_clave)} alt={`Ración de ${plato.nombre} de ${o.nombre_visible}`} loading="lazy"/></a>
      <div className="opinion-body"><div className="opinion-top"><div className="opinion-author"><span className="avatar">{o.nombre_visible[0]}</span><strong>{o.nombre_visible}</strong>{o.perfil_id === profile.id && <span className="you">Tú</span>}</div><span className="rating-number">{o.valoracion}<small>/100</small></span></div>
        {o.comentario && <p className="comment">{o.comentario}</p>}<p className="date">Publicada · <time dateTime={o.creada_en}>{date(o.creada_en)}</time><br/>Última edición · <time dateTime={o.actualizada_en}>{date(o.actualizada_en)}</time></p>
      </div>
      {o.perfil_id === profile.id && <div className="opinion-edit"><button className="text-button" disabled={!!editing} onClick={() => { setEditing(o); window.scrollTo(0, 0); }} aria-label={`Editar mi valoración de ${o.valoracion} puntos, ${date(o.creada_en)}`}>Editar mi valoración</button></div>}
    </article>)}</div>}
  </>;
}

export function ReviewForm({ dish, profile, previous, onCancel, onSaved }: { dish: Dish; profile: Profile; previous?: Opinion; onCancel: () => void; onSaved: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [rating, setRating] = useState<number | null>(previous?.valoracion ?? null);
  const [comment, setComment] = useState(previous?.comentario ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [missingPhoto, setMissingPhoto] = useState(false);
  const [missingRating, setMissingRating] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function selectFile(next?: File) {
    if (!next) return;
    if (!PHOTO_TYPES.includes(next.type) || !next.size || next.size > MAX_PHOTO_BYTES) { setError('Elige una foto JPEG, PNG o WebP de hasta 10 MB.'); return; }
    setFile(next); setMissingPhoto(false); setError('');
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    setMissingPhoto(!file && !previous); setMissingRating(rating === null);
    if ((!file && !previous) || rating === null) return;
    setBusy(true);
    const form = new FormData();
    form.set('perfil_id', profile.id); form.set('valoracion', String(rating)); form.set('comentario', comment);
    if (file) form.set('foto', file);
    if (!previous) form.set('solicitud_id', requestId);
    try { await api(`/api/platos/${dish.id}/opiniones${previous ? `/${previous.id}` : ''}`, { method: previous ? 'PUT' : 'POST', body: form }); onSaved(); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  const image = preview || (previous ? photoUrl(previous.foto_clave) : '');
  return <form className="review-form" onSubmit={submit} noValidate>
    <div className="form-heading"><h2>{previous ? 'Actualizar mi opinión' : 'Tu ración, tu opinión'}</h2><button className="text-button" type="button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    <fieldset disabled={busy} className="review-fields"><legend className="sr-only">Valoración de {dish.nombre}</legend>
      <RatingSlider dishName={dish.nombre} value={rating} onChange={value => { setRating(value); setMissingRating(false); }} invalid={missingRating} disabled={busy}/>
      <label>2. Una foto de tu ración <span className="required">Obligatoria</span></label>
      {image && <div className="photo-preview"><img src={image} alt="Foto de tu ración"/><span>{file ? 'Nueva foto seleccionada' : 'Conservamos tu foto actual'}</span></div>}
      <div className="photo-actions"><label className="secondary file-button" htmlFor="camera"><Icon name="camera"/>Hacer foto<input id="camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }}/></label><label className="secondary file-button" htmlFor="gallery"><Icon name="image"/>Elegir de galería<input id="gallery" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }}/></label></div>
      <p className="hint">JPEG, PNG o WebP · Hasta 10 MB. {previous && 'Si no eliges otra, se conserva la que ya tienes.'}</p>
      {missingPhoto && <p className="field-error" role="alert">Añade una foto de tu ración.</p>}
      <label htmlFor="comment">3. Una pista para la próxima <span className="optional">Opcional</span></label><textarea id="comment" rows={3} maxLength={500} value={comment} onChange={e => setComment(e.target.value)} placeholder="El punto, la salsa, la ración… ¿con qué te quedas?"/><div className="field-bottom"><span>Con tus palabras, sin complicaciones.</span><span>{charLength(comment)}/500</span></div>
    </fieldset>
    {error && <ErrorBox message={error}/>}
    <button className="primary wide" disabled={busy}>{busy ? 'Guardando tu valoración…' : `${error ? 'Reintentar · ' : ''}Guardar como ${profile.nombre_visible}`}<Icon name="check"/></button>
    <p className="hint signature">La opinión se firma como {profile.nombre_visible}. Puedes añadir tantas valoraciones como quieras.</p>
  </form>;
}
