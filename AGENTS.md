# Plan Bacon: guía para trabajar en el repositorio

## Antes de cambiar código

- Lee `README.md`, `docs/ESTADO.md` y `docs/DOS_ORDENADORES.md`.
- La raíz de este repositorio es esta carpeta `plan-bacon`, no la carpeta superior del proyecto de ChatGPT.
- Consulta `git status` y respeta los cambios existentes. No sobrescribas trabajo del usuario ni restablezcas archivos ajenos al encargo.
- No dependas del historial de un chat: registra las decisiones y pendientes que afecten al siguiente trabajo en `docs/ESTADO.md`.

## Reglas del producto vigentes

- Un grupo, Restaurante El Volante y perfiles seleccionables sin autenticación.
- Cada perfil puede publicar tantas valoraciones como quiera por plato. La media cuenta todas las opiniones.
- Se edita cada opinión por su ID, plato y perfil. Nunca volver al límite de una opinión por persona.
- La ficha ordena por publicación más reciente o puntuación descendente; los empates de puntuación van por publicación.
- El catálogo usa la foto de la última opinión publicada, aunque se edite una anterior.
- Mantener la selección explícita de puntuación, la foto obligatoria, la normalización que conserva ñ y los reintentos sin duplicar envíos.

## Entornos y datos

- `pnpm setup` y `pnpm dev` usan D1/R2 locales. La semilla no contiene platos ni fotos de prueba.
- `wrangler.production.example.json` contiene identificadores de los recursos existentes de Plan Bacon, no credenciales.
- La copia activa `wrangler.production.json`, `.wrangler`, exportaciones, fotos de prueba y credenciales no se versionan.
- No crear nuevos recursos remotos al preparar otro ordenador. No publicar, ejecutar migraciones remotas ni modificar datos de producción salvo que el encargo lo autorice.
- No editar migraciones ya aplicadas: añadir una nueva y conservar los datos existentes.
- No guardar tokens, contraseñas, archivos de sesión o claves en Git ni copiarlos al otro ordenador.

## Verificación y entrega

- Usar Node y pnpm indicados en `.nvmrc` y `package.json`; conservar `pnpm-lock.yaml`.
- Para cambios de lógica: `pnpm check`, `pnpm test` y `pnpm build`. Para cambios de documentación, comprobar enlaces e instrucciones relevantes.
- Las pruebas de integración usan almacenamiento efímero. No hacer pruebas destructivas contra la web publicada.
- No cambiar acceso, añadir despliegue automático o crear un remoto GitHub sin un encargo que lo autorice.
- Actualizar `docs/ESTADO.md` al cerrar un cambio funcional o dejar un pendiente material.
