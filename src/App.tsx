import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, ApiError } from './api';
import { RatingSlider } from './RatingSlider';
import { charLength, cleanName, filterAndSort, MAX_PHOTO_BYTES, normalizeName, PHOTO_TYPES, photoUrl, sortOpinions } from '../shared/domain';
import type { Config, Detail, Dish, Opinion, Profile, Restaurant, RestaurantSummary } from '../shared/domain';

function Icon({ name, size = 20 }: { name: 'arrow' | 'plus' | 'search' | 'camera' | 'image' | 'sort' | 'back' | 'check' | 'star'; size?: number }) {
  const paths = {
    arrow: <path d="m9 5 7 7-7 7M4 12h12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    sort: <path d="M4 6h16M4 12h11M4 18h6"/>,
    back: <path d="m10 5-7 7 7 7M3 12h17"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>,
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
const restaurantPath = (id: string) => `/restaurantes/${encodeURIComponent(id)}`;
const catalogApi = (id: string) => `/api${restaurantPath(id)}/platos`;
const restaurantName = (name: string) => name.replace(/^Restaurante /i, '');
type CatalogPreferences = { query: string; sort: string };
const defaultPreferences: CatalogPreferences = { query: '', sort: 'name' };

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
  const [catalogPreferences, setCatalogPreferences] = useState<Record<string, CatalogPreferences>>({});
  const [notice, setNotice] = useState('');
  const route = useSyncExternalStore(subscribe, currentRoute);
  const heading = useRef<HTMLElement>(null);
  const profile = config.data?.perfiles.find(p => p.id === profileId);
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [route, choosing]);
  useEffect(() => { if (!route.startsWith('/platos/')) setNotice(''); }, [route]);
  const choose = (id: string) => {
    setProfileId(id); setChoosing(false); setNotice('');
    try { sessionStorage.setItem('plan-bacon-profile', id); } catch { /* Session-only fallback. */ }
    go('/');
  };
  const changeProfile = () => { setChoosing(true); config.retry(); go('/'); };
  const showChooser = choosing || !profile;
  const dishId = route.match(/^\/platos\/([\w-]+)$/)?.[1];
  const restaurantRoute = route.match(/^\/restaurantes\/([\w-]+)(\/nuevo)?$/);
  const restaurantId = restaurantRoute?.[1] ?? (route === '/nuevo' ? config.data?.restaurante.id : undefined);
  const addingDish = !!restaurantRoute?.[2] || route === '/nuevo';
  const preferences = catalogPreferences[restaurantId ?? ''] ?? defaultPreferences;
  const setPreferences = (patch: Partial<CatalogPreferences>) => {
    if (restaurantId) setCatalogPreferences(current => ({ ...current, [restaurantId]: { ...(current[restaurantId] ?? defaultPreferences), ...patch } }));
  };
  const showCatalog = !config.loading && !config.error && !showChooser && !addingDish && !dishId;
  return <>
    <a className="skip-link" href="#main">Saltar al contenido</a>
    <header className={`site-header${showCatalog ? ' catalog-header' : ''}`}><a href="#/" className="brand" aria-label="Plan Bacon, inicio"><span className="brand-mark">b.</span><span>plan bacon<span className="brand-caption">LAS OPINIONES DE NUESTRA MESA</span></span></a>
      {!showChooser && <div className="profile-control"><span className="avatar">{profile.nombre_visible[0]}</span><span><strong>{profile.nombre_visible}</strong><button className="text-button" onClick={changeProfile}>Cambiar perfil</button></span></div>}
    </header>
    <main id="main" className={showCatalog ? 'catalog-main' : undefined} tabIndex={-1} ref={heading}>
      {config.loading ? <p className="loading" role="status">Preparando la mesa…</p> : config.error ? <ErrorBox message={config.error} retry={config.retry}/> : config.data && (showChooser ?
        <ProfileChooser profiles={config.data.perfiles} selected={profileId} onChoose={choose}/> :
        dishId ? <DishDetail key={`${dishId}:${profileId}`} id={dishId} profile={profile!} notice={notice} onSaved={() => setNotice('Tu valoración está guardada. ¡Gracias por compartirla!')}/> :
        restaurantId ? <RestaurantPage key={restaurantId} id={restaurantId} addingDish={addingDish} profile={profile!} preferences={preferences} setPreferences={setPreferences} onCreated={() => { setPreferences({ query: '' }); setNotice('Plato añadido. Ya puedes valorar tu ración.'); }}/> :
        <Restaurants/>
      )}
    </main>
    <footer><span>Buen criterio. Mejor compañía.</span><span>Plan Bacon · Nuestra mesa</span></footer>
  </>;
}

function ProfileChooser({ profiles, selected, onChoose }: { profiles: Profile[]; selected: string; onChoose: (id: string) => void }) {
  const [value, setValue] = useState(selected);
  return <section className="welcome"><span className="eyebrow">PRIMERO, LA COMPAÑÍA</span><h1>¿Quién se sienta<br/><em>hoy a la mesa?</em></h1><p className="intro">Tus sitios, tus platos y las opiniones del grupo.<br className="desktop-break"/> Todo a mano antes de volver a pedir.</p><Plate/>
    <form className="profile-form" onSubmit={e => { e.preventDefault(); if (profiles.some(p => p.id === value)) onChoose(value); }}>
      <label htmlFor="profile">¿Quién se sienta hoy?</label>
      <select id="profile" value={value} onChange={e => setValue(e.target.value)} required><option value="" disabled>Elige tu perfil</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.nombre_visible}</option>)}</select>
      <button className="primary" disabled={!value}>Ver restaurantes <Icon name="arrow"/></button>
      <p className="hint">Sin contraseñas: cualquiera puede elegir cualquier perfil y editar su opinión.</p>
    </form>
  </section>;
}

export function Restaurants() {
  const list = useLoad<{ restaurantes: RestaurantSummary[] }>('/api/restaurantes');
  return <section className="restaurants" aria-label="Elegir restaurante">
    <span className="eyebrow">LAS MESAS DEL GRUPO</span><h1>¿Dónde comemos<span className="title-dot">?</span></h1><p className="restaurants-intro">Nuestros sitios, plato a plato.</p>
    {list.loading ? <p className="loading" role="status">Preparando las mesas…</p> : list.error ? <ErrorBox message={list.error} retry={list.retry}/> : !list.data?.restaurantes.length ? <Empty title="Una mesa por estrenar">Todavía no hay restaurantes en el grupo.</Empty> : <>
      <p className="restaurants-count">{list.data.restaurantes.length} {list.data.restaurantes.length === 1 ? 'restaurante' : 'restaurantes'}</p>
      <div className="restaurant-list">{list.data.restaurantes.map(r => <a className="restaurant-card" href={`#${restaurantPath(r.id)}`} key={r.id} aria-label={`Ver platos de ${restaurantName(r.nombre)}`}>
        <div className={`restaurant-cover${r.foto_clave ? '' : ' without-photo'}`}>{r.foto_clave ? <img src={photoUrl(r.foto_clave)} alt="" width={800} height={320} loading="lazy" decoding="async"/> : <Plate/>}</div>
        <div className="restaurant-copy"><span className="restaurant-kicker">RESTAURANTE</span><div className="restaurant-title"><h2>{restaurantName(r.nombre)}</h2><span className="restaurant-enter"><Icon name="arrow" size={16}/></span></div><span className="restaurant-total">{r.total_platos ? `${r.total_platos} ${r.total_platos === 1 ? 'plato' : 'platos'} en nuestra mesa` : 'Todavía sin platos'}</span></div>
      </a>)}</div>
    </>}
    <aside className="catalog-note"><span/>Buena mesa. Buena memoria.<span/></aside>
  </section>;
}

function RestaurantPage({ id, addingDish, profile, preferences, setPreferences, onCreated }: { id: string; addingDish: boolean; profile: Profile; preferences: CatalogPreferences; setPreferences: (patch: Partial<CatalogPreferences>) => void; onCreated: () => void }) {
  const restaurant = useLoad<{ restaurante: Restaurant }>(`/api${restaurantPath(id)}`);
  if (restaurant.loading) return <p className="loading" role="status">Preparando el restaurante…</p>;
  if (restaurant.error || !restaurant.data) return <><a className="back-link" href="#/"><Icon name="back"/>Restaurantes</a><ErrorBox message={restaurant.error} retry={restaurant.retry}/></>;
  return addingDish ? <NewDish restaurant={restaurant.data.restaurante} profile={profile} initialName={preferences.query} onCreated={onCreated}/> : <Catalog restaurant={restaurant.data.restaurante} query={preferences.query} sort={preferences.sort} setQuery={query => setPreferences({ query })} setSort={sort => setPreferences({ sort })}/>;
}

export function Catalog({ restaurant, query, setQuery, sort, setSort }: { restaurant: Restaurant; query: string; setQuery: (s: string) => void; sort: string; setSort: (s: string) => void }) {
  const list = useLoad<{ platos: Dish[] }>(catalogApi(restaurant.id));
  const newDishLink = `#${restaurantPath(restaurant.id)}/nuevo`;
  const dishes = filterAndSort(list.data?.platos ?? [], query, sort);
  return <section className="catalog" aria-label="Platos del restaurante">
    <a className="back-link restaurants-back" href="#/"><Icon name="back"/>Restaurantes</a>
    <div className="catalog-heading"><span className="eyebrow">LOS PLATOS DE NUESTRA MESA</span><div className="catalog-title-row"><h1>{restaurantName(restaurant.nombre)}<span className="title-dot">.</span></h1><a className="catalog-add" href={newDishLink} aria-label="Añadir plato"><Icon name="plus"/><span>Añadir plato</span></a></div><p>Lo que probamos. Lo que repetimos.</p></div>
    <div className="catalog-search"><Icon name="search"/><label className="sr-only" htmlFor="search">Buscar plato</label><input id="search" type="search" placeholder="¿Qué te apetece pedir?" value={query} onChange={e => setQuery(e.target.value)}/></div>
    <div className="catalog-toolbar"><span className="catalog-count" role="status">{!list.loading && !list.error && `${dishes.length} ${dishes.length === 1 ? 'plato' : 'platos'}`}</span><div className="catalog-order"><Icon name="sort" size={16}/><label className="sr-only" htmlFor="catalog-sort">Ordenar platos</label><select id="catalog-sort" value={sort} onChange={e => setSort(e.target.value)}><option value="name">De la A a la Z</option><option value="rating">Mejor valorados</option><option value="reviews">Más opiniones</option></select></div></div>
    {list.loading ? <p className="loading" role="status">Buscando los platos de la mesa…</p> : list.error ? <ErrorBox message={list.error} retry={list.retry}/> : !list.data?.platos.length ? <Empty title="La mesa está por estrenar" action={<a className="primary" href={newDishLink}><Icon name="plus"/>Añadir el primer plato</a>}>Añade un plato de {restaurantName(restaurant.nombre)} y guarda la primera opinión del grupo.</Empty> : !dishes.length ? <Empty title="Todavía no encontramos ese plato" action={<a className="primary" href={newDishLink}><Icon name="plus"/>Añadir plato</a>}>Prueba con otro nombre o añade «{query}» a nuestra mesa.</Empty> : <div className="catalog-grid">{dishes.map(d => {
      const outstanding = d.media !== null && d.media >= 90;
      return <a className={`catalog-card${outstanding ? ' is-outstanding' : ''}`} href={`#/platos/${d.id}`} key={d.id}>
        <div className="catalog-photo">{d.foto_clave ? <img src={photoUrl(d.foto_clave, true)} alt={`Ración de ${d.nombre}`} width={400} height={400} loading="lazy" decoding="async"/> : <div className="catalog-placeholder"><Plate small/><span>Foto pendiente</span></div>}{outstanding && <span className="catalog-badge"><Icon name="star" size={13}/>De lo mejor</span>}</div>
        <div className="catalog-card-copy"><h2>{d.nombre}</h2>{d.media === null ? <span className="catalog-unrated">Sin valorar</span> : <div className="catalog-rating"><span className="catalog-score"><span className="sr-only">Media: </span>{score(d.media)}<span className="sr-only"> de 100</span></span><span className="catalog-reviews">{d.total} {d.total === 1 ? 'opinión' : 'opiniones'}</span></div>}</div>
      </a>;
    })}</div>}
    <aside className="catalog-note"><span/>Buena mesa. Buena memoria.<span/></aside>
  </section>;
}

export function NewDish({ restaurant, profile, initialName, onCreated }: { restaurant: Restaurant; profile: Profile; initialName: string; onCreated: () => void }) {
  const catalog = useLoad<{ platos: Dish[] }>(catalogApi(restaurant.id));
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
      const { plato } = await api<{ plato: Dish }>(catalogApi(restaurant.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name, perfil_id: profile.id }) });
      onCreated(); go(`/platos/${plato.id}`);
    } catch (e) { if (e instanceof ApiError && e.status === 409) setConflict(e.data.plato); else setError(message(e)); }
    finally { setBusy(false); }
  }
  return <section className="narrow"><a className="back-link" href={`#${restaurantPath(restaurant.id)}`}><Icon name="back"/>Volver a los platos</a><span className="eyebrow">{restaurant.nombre}</span><h1>Añadir plato</h1><p className="intro">Escríbelo como aparece en la carta.<br/>La foto llegará con tu valoración.</p>
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
  if (detail.error || !detail.data) return <><a className="back-link" href="#/">Restaurantes</a><ErrorBox message={detail.error} retry={detail.retry}/></>;
  const { plato, opiniones, restaurante } = detail.data;
  const sortedOpinions = sortOpinions(opiniones, opinionSort);
  return <>
    <a className="back-link" href={`#${restaurantPath(plato.restaurante_id)}`}><Icon name="back"/>Volver a los platos</a>
    <section className="detail-heading"><span className="eyebrow">{restaurante.nombre}</span><h1>{plato.nombre}</h1><div className="detail-meta">{plato.media === null ? <span className="unrated">Sin valorar</span> : <><span className="rating-number">{score(plato.media)}<small>/100</small></span><span>{plato.total} {plato.total === 1 ? 'valoración de la mesa' : 'valoraciones de la mesa'}</span></>}</div></section>
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
