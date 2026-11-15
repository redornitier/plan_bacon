# Trabajar en Plan Bacon desde dos ordenadores

La carpeta que se sube a GitHub es `plan-bacon`, que contiene este README, `src`, `worker` y `package.json`. No subir la carpeta superior del proyecto de ChatGPT, su espejo de fuentes ni el ZIP antiguo. Usar un repositorio privado.

## Primera subida desde este ordenador

El repositorio local usa la rama `main`. Antes de conectar GitHub:

1. Crear en GitHub un repositorio privado vacío llamado `plan-bacon`, sin añadir README, licencia ni gitignore porque ya existen aquí.
2. Autenticarse con GitHub en este ordenador mediante GitHub Desktop, SSH o el mecanismo habitual de Git. No usar la contraseña de la cuenta como token ni guardarla en la URL del remoto.
3. Copiar la URL del repositorio y ejecutar desde esta carpeta:

   ```sh
   git remote add origin URL_DEL_REPOSITORIO
   git push -u origin main
   ```

   `URL_DEL_REPOSITORIO` es un marcador: sustituirlo por la URL real que muestra GitHub. Revisar antes `git status`, `git log -1` y `git remote -v`. Si hay archivos modificados desde el primer commit, revisarlos y guardarlos en un commit antes de subirlos.

GitHub Actions comprobará tipos, pruebas y compilación. El flujo no publica en Cloudflare y no necesita credenciales de producción.

## Preparar el segundo ordenador

1. Instalar Git, Node 22.22.1 (indicado en `.nvmrc`) y pnpm 11.25.0 (indicado en `package.json`). Instalar Codex e iniciar sesión en la cuenta que corresponda.
2. Clonar el repositorio privado, entrar en la carpeta y arrancar:

   ```sh
   git clone URL_DEL_REPOSITORIO
   cd plan-bacon
   pnpm install --frozen-lockfile
   pnpm setup
   pnpm dev
   ```

3. Abrir `http://127.0.0.1:5173` y añadir esa carpeta como proyecto en Codex.
4. En un chat nuevo, pedir: «Lee AGENTS.md y docs/ESTADO.md; continúa desde el estado documentado del proyecto».

La base y las fotos locales empiezan vacías en cada ordenador. La web publicada mantiene los datos compartidos del equipo en Cloudflare.

## Cada vez que cambies de ordenador

Al empezar, comprobar que no hay cambios pendientes y descargar la última versión:

```sh
git status
git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:migrate
```

Si Git indica cambios locales o que las ramas han divergido, parar y pedir a Codex que los revise: no usar `reset --hard`, ni forzar una subida para resolverlo.

Antes de marcharte, comprobar los cambios, ejecutar las verificaciones pertinentes, actualizar `docs/ESTADO.md` si cambió el comportamiento o quedaron pendientes y guardar/subir:

```sh
git diff
pnpm check
pnpm test
pnpm build
git add RUTAS_REVISADAS
git commit -m "Describe el cambio realizado"
git push
```

`RUTAS_REVISADAS` representa los archivos que has comprobado. También puedes pedir a Codex que haga estos pasos. Evitar trabajar en los mismos archivos desde ambos ordenadores a la vez; si se necesita trabajo paralelo, usar ramas diferentes y revisar la unión de los cambios.

## Publicar desde el segundo ordenador

Para desarrollar y ejecutar las pruebas no hace falta conexión con Cloudflare. Para publicar en la misma web existente:

1. Copiar `wrangler.production.example.json` a `wrangler.production.json`. Puede hacerse con el explorador de archivos en cualquier sistema. En Linux/macOS:

   ```sh
   cp -n wrangler.production.example.json wrangler.production.json
   ```

   El ejemplo contiene los identificadores de la cuenta, D1 y R2 existentes, que no son secretos. La copia activa se ignora en Git; conservar cualquier ajuste local que ya tuviera ese archivo.
2. Autorizar esa cuenta de Cloudflare en el navegador de ese ordenador:

   ```sh
   pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write
   pnpm exec wrangler whoami
   ```

3. Comprobar que se utiliza la cuenta indicada en el archivo y que la copia de código está actualizada. Si hay migraciones nuevas, hacer copia de seguridad y aplicarlas según el README; no crear otra base ni otro bucket.
4. Verificar el proyecto y preparar/publicar cuando corresponda:

   ```sh
   pnpm deploy:dry
   pnpm deploy
   ```

Coordinar las publicaciones: solo un ordenador debe publicar cada cambio. La copia más antigua no debe reemplazar una versión más nueva. Las fotos y opiniones reales no se sincronizan con Git ni se sustituyen al clonar.

## Conversaciones e instrucciones

Git lleva el código, los documentos y `AGENTS.md`. No transfiere este chat ni tus autorizaciones. Cada chat nuevo debe leer las instrucciones y el estado; registrar ahí las decisiones duraderas. Para conservar exactamente una conversación entre equipos, el traslado del chat de Codex se configura aparte.
