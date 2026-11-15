# Plan Bacon

MVP v0.10 para la mesa de **Restaurante El Volante**. React, TypeScript y Vite en un Worker de Cloudflare; D1 para los datos y R2 Standard para las fotos. Código, migración, carga inicial y herramientas de mantenimiento incluidos. **Publicado en [plan-bacon.plan-bacon.workers.dev](https://plan-bacon.plan-bacon.workers.dev)** (11 de noviembre de 2026).

## Continuar desde GitHub u otro ordenador

Repositorio: [redornitier/plan_bacon](https://github.com/redornitier/plan_bacon), rama `main`. La raíz del repositorio es esta carpeta `plan-bacon`. Lee [la guía de dos ordenadores](docs/DOS_ORDENADORES.md) y [el estado actual](docs/ESTADO.md) antes de continuar. `AGENTS.md` contiene las reglas para nuevos chats de Codex.

Se versionan código, migraciones, semilla, pruebas, documentación, versiones de herramientas y `wrangler.production.example.json`. El ejemplo contiene solo identificadores de los recursos ya publicados, no credenciales. La configuración activa de producción, las sesiones, las bases locales y las copias quedan excluidas. GitHub Actions ejecutará las comprobaciones al subir cambios; el despliegue sigue siendo manual.

## Arrancar en local

Requisitos: Node.js 22.12 o posterior y pnpm 11.25 o posterior. La versión usada aquí fue Node 22.22.1 y pnpm 11.25.0. Se incluye `pnpm-lock.yaml`; no hace falta una cuenta de Cloudflare para trabajar en local.

Desde este directorio:

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Abrir <http://127.0.0.1:5173>. El selector incluye Alexandre, Manoel, Jorge y Gabriel. El catálogo empieza vacío. La selección de perfil se recuerda en la pestaña mediante `sessionStorage`, también al recargar. «Cambiar perfil» vuelve a consultar los perfiles configurados.

`pnpm setup` aplica las migraciones de `migrations/` y `scripts/seed.sql`. La migración `0002_multiple_opinions.sql` conserva las opiniones anteriores y elimina el límite de una opinión por perfil y plato. La carga inicial se puede repetir: no borra ni sustituye los datos existentes. El grupo es `plan-bacon`, el restaurante `el-volante`. Los platos y las opiniones no forman parte de la carga inicial.

Para la prueba de fotos, con el servidor arrancado, ejecutar en otra terminal:

```sh
pnpm demo
```

El script crea «Prueba local de fotos», guarda dos imágenes **de muestra local**, firma como Alexandre y Manoel con 60 y 80, vuelve a pedir la ficha y recupera las fotos desde R2. En un plato de prueba sin otras opiniones, la media es 70 y el total 2. Recupera las dos opiniones de muestra por su ID. Las imágenes son ilustraciones de prueba, no fotos de comida real. Los archivos se generan en `test-output/fixtures/`. El script rechaza destinos que no sean localhost. Repetirlo recupera las mismas opiniones de demostración, sin duplicarlas; usar solo en un entorno de prueba.

D1 y R2 locales viven en `.wrangler/state/`. No se suben a Cloudflare ni se incluyen en el código entregado. Reiniciar `pnpm dev` conserva esos datos. Para comenzar una prueba desde cero, parar el servidor y **mover** `.wrangler/state` a una copia fuera de esa carpeta antes de repetir `pnpm setup`. No tocar esa carpeta con el servidor en marcha.

## Verificar

```sh
pnpm check
pnpm test
pnpm build
```

Las pruebas usan bases D1 y buckets R2 efímeros de Miniflare, aislados de los datos de desarrollo. Procesan imágenes reales JPEG, PNG y WebP. Los errores que aparecen en el registro durante los casos de fallo son intencionados. La entrada que inyecta fallos está en `tests/test-worker.ts` y **no forma parte del Worker publicado**.

Para comprobar la compilación servida, parar `pnpm dev` y ejecutar `pnpm preview`. Vite mostrará la dirección. El informe de aceptación, sus límites y el guion de prueba en móviles están en [docs/VERIFICACION.md](docs/VERIFICACION.md).

## Qué incluye

- Perfiles sin autenticación; cualquiera con acceso a la web puede elegir cualquiera y editar su opinión. No se presenta el selector como una protección de identidad.
- Catálogo, búsqueda sin mayúsculas ni acentos de vocales, orden español A–Z y por media; los empates van por nombre y los no valorados al final. El filtro se conserva al ordenar y al volver de una ficha.
- Alta con sugerencias y resolución de altas simultáneas: un conflicto devuelve HTTP 409 y la ficha existente.
- Varias opiniones por perfil y plato, cada una con foto obligatoria, deslizador 1–100 con selección explícita, comentario opcional de hasta 500 caracteres, edición y reintento.
- Slider protagonista con plato, salsa, vapor y brasas; cinco repertorios de frases aleatorias que se mantienen durante cada gesto. Teclado, movimiento reducido y alternativa sin efectos gráficos. Una nueva opinión sigue empezando sin nota elegida.
- Fichas con selector de orden por fecha de publicación (más recientes primero, por defecto) o puntuación (mayor primero, con empates por fecha); una edición cambia `actualizada_en` y conserva `creada_en`. El identificador incremental resuelve publicaciones en el mismo milisegundo. La miniatura corresponde a la última opinión publicada, aunque se edite una anterior.
- Estados de catálogo vacío, búsqueda sin resultados, plato sin opiniones, carga y error. Controles de cámara y galería separados; diseño revisado a 360 px.

## Arquitectura y fotos

```text
src/             Interfaz React y llamadas a la API
shared/          Tipos, normalización, filtros y ordenación compartidos
worker/          API, validación, procesamiento y almacenamiento de fotos
migrations/      Esquema D1 y restricciones
scripts/         Semilla, demostración, mantenimiento y publicación
tests/           Integración con D1/R2/Images locales y pruebas del formulario
docs/            Verificación y captura de pantalla
```

El nombre normalizado conserva la `ñ`, incluso si llega como caracteres Unicode separados. Se recortan los extremos, se compactan los espacios y se eliminan los acentos de las vocales. La misma función sirve para buscar, detectar duplicados y renombrar mediante mantenimiento. D1 exige unicidad de `(restaurante_id, nombre_normalizado)` y del identificador de solicitud de cada alta de opinión, puntuaciones enteras de 1 a 100, foto no vacía, claves foráneas y límites de texto. La API comprueba además que el perfil pertenece al grupo del restaurante.

**Dependencia adicional: Cloudflare Images, solo para transformar.** El binding `IMAGES` valida la decodificación y genera JPEG de hasta 1600 px y miniatura de hasta 400 px por el lado mayor. No se almacena nada en el producto Images: los dos resultados viven en R2. Se comprueba el MIME y la firma binaria; se rechazan los archivos corruptos y los de más de 10 MiB (10 × 1024² bytes, mostrados como 10 MB en la interfaz). El cuerpo tiene un límite efectivo incluso sin `Content-Length`. Después de recodificar se retiran los segmentos EXIF/GPS, XMP, ICC y comentarios; el original nunca se guarda.

Se ha seguido el [binding oficial de Images](https://developers.cloudflare.com/images/optimization/binding/), que tiene una simulación local sin consumo remoto. Esa simulación no reproduce todas las transformaciones de producción: la orientación de fotos de cámara y la fidelidad final deben comprobarse en CA-11.

Cada subida obtiene una clave aleatoria e inmutable con `full.jpg` y `thumb.jpg`. Solo cuando ambos objetos están guardados se actualiza D1. Cada nueva opinión se inserta de forma independiente. El formulario genera una clave de solicitud que conserva al reintentar: la base solo impide duplicar ese mismo envío; una nueva valoración recibe otra clave. La edición usa el ID de la opinión, el plato y el perfil activo; puede conservar o sustituir la foto y no modifica las demás opiniones del autor. Dos ediciones simultáneas de la misma opinión conservan la foto vigente si no se envía una nueva; en puntuación y comentario prevalece la última escritura confirmada. La media y el total cuentan todas las opiniones, aunque sean del mismo perfil.

No existe una transacción distribuida entre R2 y D1. Por eso **no se borran fotos durante un guardado**, tampoco cuando D1 devuelve un error: podría haberse confirmado la escritura antes de perderse la respuesta. El reintento conserva foto, puntuación y comentario mientras el formulario siga abierto. Una respuesta perdida después de confirmar D1 puede dejar ya visible la nueva opinión; reintentar confirma ese mismo envío sin duplicarlo. Si ya se confirmó, se recupera lo guardado en ese envío; para modificarlo después se utiliza «Editar mi valoración». La limpieza periódica de objetos no referenciados se describe abajo. No se promete conservación del borrador después de cerrar o recargar la pestaña ni funcionamiento sin conexión.

Las consultas calculan las medias desde las opiniones guardadas. El catálogo completo se carga en memoria para este restaurante pequeño; no es una implementación paginada para catálogos grandes. La API usa `no-store`; las fotos inmutables usan caché larga. Las fuentes web tienen alternativas locales si Google Fonts no está disponible.

## Publicar y mantener la web existente

Estos pasos quedan documentados para repetir el despliegue o recuperarlo. En esta instalación ya se han creado los recursos, aplicado ambas migraciones y publicado el Worker; el usuario ha confirmado el aviso de gasto de 1 USD. La configuración local usa un UUID D1 de relleno; `pnpm deploy` se detiene si falta una configuración de producción válida.

1. Iniciar sesión en Cloudflare, activar R2 y configurar su método de pago. Verificar la disponibilidad del binding Images y sus condiciones en esa cuenta. No contratar planes automáticamente. El binding de producción y el tratamiento de fotos deben verificarse antes de dar la web al equipo.
2. Para un despliegue nuevo en otra cuenta, autenticar Wrangler y crear recursos propios. **Si estás preparando otro ordenador para la web ya publicada, sigue la guía de dos ordenadores y reutiliza los recursos existentes; no repitas estos comandos de creación.**

   ```sh
   pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write
   pnpm exec wrangler d1 create plan-bacon
   pnpm exec wrangler r2 bucket create plan-bacon-photos
   ```

   Crear el bucket en **Standard**, sin acceso público directo ni reglas de caducidad global. Si ese nombre no está disponible, elegir otro y usarlo en el paso siguiente.

3. Con el `database_id` devuelto por Cloudflare:

   ```sh
   pnpm configure:production UUID_D1_REAL plan-bacon-photos
   ```

   Se crea `wrangler.production.json` y se mantiene intacta la configuración local. El script no sobrescribe un archivo existente. Si la cuenta requiere `account_id`, añadirlo a esa configuración. Los identificadores no son secretos; no poner tokens en el archivo ni en el repositorio.

4. Preparar **solo** la base remota con la semilla del restaurante y los cuatro perfiles:

   ```sh
   pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.production.json
   pnpm exec wrangler d1 execute DB --remote --config wrangler.production.json --file scripts/seed.sql
   ```

   No copiar `.wrangler/state`, las pruebas ni `test-output` a producción. Los flags `remote: false` del archivo controlan la emulación de desarrollo, no anulan los comandos explícitos `--remote` ni los recursos vinculados al desplegar.

5. Configurar el aviso de gasto antes de publicar. En la cuenta: **Manage Account → Billing → Billable Usage → Create budget alert**. Nombrarlo «Plan Bacon / R2», elegir con el responsable un umbral y comprobar el correo destinatario. Según la [documentación de alertas de presupuesto](https://developers.cloudflare.com/billing/manage/budget-alerts/), la alerta se aplica al gasto variable de **toda la cuenta**, no solo a ese bucket, y no es un tope de gasto. Revisar también las métricas de R2 y de Images. Este paso requiere la cuenta y queda pendiente.

6. Verificar y publicar:

   ```sh
   pnpm test
   pnpm deploy:dry
   pnpm deploy
   ```

   `deploy:dry` compila con los identificadores de producción y prepara el Worker sin publicarlo. `deploy` hace la misma compilación y publica los assets y la API. La dirección inicial será la `workers.dev` que devuelva Wrangler. El script usa `dist/plan_bacon/wrangler.json`, generado por Vite con los bindings correctos. Una compilación local posterior vuelve a usar la configuración local; no desplegar manualmente un `dist` local.

7. Desde la dirección publicada, repetir la prueba con dos móviles, revisar orientación y metadatos de las fotos, puntuaciones y firmas después de recargar. Completar CA-11 y registrar resultado y dispositivos en `docs/VERIFICACION.md`.

La integración React/Vite y la separación de recursos siguen las guías de [React en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) y [desarrollo local](https://developers.cloudflare.com/workers/local-development/).

### Dimensionamiento del piloto

Ejemplo de presupuesto de uso, no medición de tráfico real: 4 personas × 8 comidas/mes × 2 fotos = 64 subidas al mes. Dos versiones por subida son aproximadamente 128 transformaciones y 128 escrituras R2. Incluso estimando 1 MB por pareja de imágenes serían unos 64 MB nuevos/mes antes de limpiar las sustituciones. Las consultas sirven las versiones ya guardadas; no vuelven a transformar la imagen.

En la documentación consultada el 10 de noviembre de 2026, [R2 Standard](https://developers.cloudflare.com/r2/pricing/) incluye 10 GB-mes, un millón de operaciones A y diez millones B; [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) incluye cinco millones de filas leídas y 100.000 escritas al día; [Images Free](https://developers.cloudflare.com/images/pricing/) anuncia 5.000 transformaciones únicas al mes. Son cupos compartidos por la cuenta, no una garantía de coste cero. La guía de subida de Images aún menciona una suscripción Paid como prerrequisito: **confirmar la habilitación real del binding en la cuenta antes de publicar**. El código no activa suscripciones. La limpieza evita acumular indefinidamente las fotos sustituidas.

## Mantenimiento fuera de la app

Hacer una copia antes de modificar producción y usar explícitamente `--local` o `--remote`. La herramienta se niega a ejecutar sin uno de esos flags. El modo remoto requiere `wrangler.production.json` y las credenciales de Wrangler; no hay endpoints de administración.

### Añadir un perfil

```sh
pnpm maintain --local add-profile "Ana"
# En producción, cuando corresponda:
pnpm maintain --remote add-profile "Ana"
```

El ID es nuevo y se vincula a `plan-bacon`. El perfil aparece al volver a abrir el selector o recargar. No ejecutar ambos comandos si solo se quiere modificar uno de los entornos.

### Revisar o corregir un plato

Obtener el ID de la URL de su ficha (`#/platos/ID`). Revisar primero sus opiniones:

```sh
pnpm maintain --local inspect-dish ID_DEL_PLATO
pnpm maintain --local rename-dish ID_DEL_PLATO "Croquetas caseras de jamón"
```

Para producción, cambiar `--local` por `--remote`. El renombrado actualiza nombre y nombre normalizado mediante la función compartida. Mantiene el ID y todas las opiniones. Si el nombre normalizado coincide con otro plato, D1 rechaza la corrección y conserva el anterior. Los nombres con apóstrofos se escapan de forma segura; no se interpolan en comandos de terminal.

### Resolver duplicados con opiniones

No hay fusión ni borrado automático. Las coincidencias aproximadas pueden ser platos distintos. Procedimiento:

1. Parar temporalmente las escrituras del equipo y exportar D1; anotar las dos fichas y las claves de foto. Revisar ambas con `inspect-dish`.
2. Si solo es un nombre incorrecto, renombrar la ficha correcta sin mover sus opiniones.
3. Si son realmente el mismo plato, elegir el ID a conservar y revisar todas sus opiniones. Se pueden conservar varias del mismo perfil. No borrar opiniones solo porque compartan autor; cada una puede corresponder a otra comida.
4. Con ambos IDs revisados, preparar un archivo SQL de mantenimiento para mover todas las opiniones y retirar la ficha duplicada:

   ```sql
   UPDATE opiniones SET plato_id = 'ID_DESTINO' WHERE plato_id = 'ID_ORIGEN';
   DELETE FROM platos WHERE id = 'ID_ORIGEN';
   ```

   Ejecutar el archivo revisado con `wrangler d1 execute DB --file archivo.sql` y el entorno explícito; en remoto, añadir `--config wrangler.production.json`. Si el primer paso falla, detenerse e inspeccionar antes de continuar. La clave foránea impide eliminar una ficha que siga teniendo opiniones. Los IDs y las claves de solicitud de las opiniones se conservan.
5. Volver a consultar la ficha conservada, sus firmas, sus fotos y el resumen. Las fechas de publicación y las claves de foto no se cambian en el movimiento. Reanudar el uso.

### Copias y recuperación

```sh
mkdir -p backups
pnpm exec wrangler d1 export DB --local --output backups/d1-local.sql
pnpm exec wrangler d1 export DB --remote --config wrangler.production.json --output backups/d1-production.sql
```

Dar nombres fechados a las copias para no sobrescribir la última buena. Para restaurar, probar primero el SQL exportado en una base nueva y vacía, sin aplicar antes la migración (la exportación ya contiene el esquema). Comparar recuentos y abrir las fichas antes de sustituir la base utilizada por el Worker. D1 tiene opciones de Time Travel según plan; comprobar su ventana en la cuenta. Una exportación de D1 **no contiene las fotos**: copiar también los objetos de R2 mediante el dashboard o una herramienta S3 autorizada, conservar sus claves y comprobar una restauración de ambos conjuntos. Para las copias locales, parar el servidor y copiar `.wrangler/state` completo.

### Fotos antiguas y subidas incompletas

Mensualmente, o si crece el almacenamiento:

1. Exportar D1 y respaldar R2. Pausar nuevas escrituras durante la revisión y limpieza.
2. Obtener las claves en uso:

   ```sql
   SELECT DISTINCT foto_clave FROM opiniones ORDER BY foto_clave;
   ```

3. Compararlas con los prefijos UUID del bucket. Cada clave activa debe conservar **ambos** objetos, `UUID/full.jpg` y `UUID/thumb.jpg`.
4. Revisar únicamente objetos que tengan más de 7 días y cuyo UUID **no esté referenciado** en D1. Volver a verificar la ausencia inmediatamente antes de borrarlos; conservar las copias. Una subida fallida puede tener solo uno de los dos archivos.
5. Borrar exclusivamente los objetos revisados mediante el dashboard R2 o `wrangler r2 object delete BUCKET/UUID/full.jpg --remote` y su miniatura. No aplicar una regla de caducidad a todo el bucket: también borraría fotos vigentes. En local, usar el bucket local y `--local`.

La limpieza es intencionadamente externa y revisada. No se expone una ruta pública que borre objetos ni se programan tareas de administración dentro del MVP.

### Actualizaciones

Antes de actualizar dependencias, guardar el lockfile actual; instalar, ejecutar `pnpm check`, `pnpm test` y `pnpm build`, y repetir una subida/edición en local. Las migraciones nuevas son archivos adicionales; no modificar una migración ya aplicada en producción. Revisar periódicamente el aviso de gasto, las cuotas compartidas y los errores de subida. Las incidencias del servidor se etiquetan `photo_processing_failed`, `photo_upload_failed`, `opinion_save_failed` y `request_failed`; no se registran los comentarios ni el contenido de las fotos.


## Actualización a varias valoraciones por perfil

Antes de arrancar esta versión sobre una instalación anterior, parar el servidor y hacer una copia. Ejecutar `pnpm db:migrate` y volver a arrancar `pnpm dev`. No editar la migración inicial ni borrar la base: la migración 0002 copia los registros, sus IDs, fotos, puntuaciones, comentarios y fechas. Las opiniones existentes siguen siendo editables desde su tarjeta.

La ficha ofrece siempre «Añadir valoración», aunque el perfil ya tenga opiniones. Cada tarjeta propia contiene «Editar mi valoración». El selector «Ordenar valoraciones» cambia entre fecha y puntuación sin alterar el cálculo del resumen ni la miniatura del catálogo. La media cuenta cada valoración por igual, no una media por persona.

Las rutas de opiniones son `POST /api/platos/:plato/opiniones` para crear (campo `solicitud_id` UUID obligatorio) y `PUT /api/platos/:plato/opiniones/:opinion` para editar. Los clientes de la versión anterior deben recargar la web antes de guardar. En producción, cuando se publique, aplicar también la migración 0002 con `--remote --config wrangler.production.json` antes de desplegar esta versión.
