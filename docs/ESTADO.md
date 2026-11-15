# Estado del proyecto

Actualizado: 15 de noviembre de 2026. Versión de la aplicación: 0.10.0.

## Punto de partida para otro chat u ordenador

Plan Bacon está publicada en https://plan-bacon.plan-bacon.workers.dev. El restaurante configurado es El Volante y los perfiles iniciales son Alexandre, Manoel, Jorge y Gabriel. El historial de los chats no forma parte del repositorio; este documento resume las decisiones necesarias para continuar.

El código usa React/TypeScript/Vite con Cloudflare Workers, D1, R2 Standard y el binding Images. Instalación y mantenimiento detallados en `README.md`; flujo de dos ordenadores en `DOS_ORDENADORES.md`.

## Decisiones vigentes

- Varias opiniones por perfil y plato, cada una con su foto y puntuación; comentario opcional.
- Edición independiente de cada opinión propia. Nuevas altas con clave de solicitud para que un reintento no duplique la opinión.
- Media y total calculados con todas las opiniones, sin agrupar por autor.
- Orden de la ficha por fecha de publicación descendente o puntuación descendente; empates por publicación.
- Miniatura del catálogo de la última opinión publicada. Editar otra opinión no altera esa elección.
- Fotos JPEG/PNG/WebP hasta 10 MB; versiones reducidas sin metadatos. Fotos sustituidas y subidas incompletas se limpian con el procedimiento externo documentado.
- La puntuación abre el formulario: slider 1–100 con plato, salsa animada, vapor, brasas y celebración al llegar a 100. Cinco repertorios (35 frases) elegidos al azar por gesto, sin repetir el repertorio anterior; se mantiene dentro del mismo arrastre. La animación respeta movimiento reducido, se detiene al ocultar la pestaña y libera recursos al cerrar el formulario. Sin WebGL/canvas el control sigue funcionando.
- Las nuevas valoraciones empiezan sin puntuación elegida; la edición conserva su nota. La foto sigue siendo obligatoria y los efectos no cambian lo que se guarda.

## Estado de publicación y verificaciones

- Publicación inicial: 11 de noviembre de 2026; versión Cloudflare `479f6912-d791-4033-8e17-fdf803f43308`.
- Slider de cocina publicado el 15 de noviembre de 2026; versión Cloudflare `c71af5d8-aa4e-4b37-817b-69f0d9f8a384`. Sin migraciones ni cambios de datos.
- D1 y R2 de producción creados. Migraciones 0001 y 0002 aplicadas. Se cargaron solo restaurante y perfiles, sin trasladar las muestras locales.
- HTTPS, HTML, JavaScript, restaurante, cuatro perfiles y catálogo inicialmente vacío comprobados al publicar.
- Aviso de gasto de 1 USD confirmado por el usuario en su navegador; no es un límite de cargos.
- Preparación para GitHub verificada el 15 de noviembre de 2026: copia limpia de los 42 archivos versionables, instalación desde el lockfile, migraciones y semilla locales, 15 pruebas aprobadas, tipos y compilación correctos. Repositorio conectado y publicado en https://github.com/redornitier/plan_bacon, rama `main`. GitHub Actions aprobado para el primer commit `0801e8fb4b7ffe14880e965873fcbdf1f85e5186`: https://github.com/redornitier/plan_bacon/actions/runs/43748858299. El repositorio es público según su configuración actual. Ver `VERIFICACION.md` para alcance y evidencia.
- No inferir que el catálogo sigue vacío actualmente: el equipo puede haber guardado datos reales desde la publicación.

## Pendientes

- CA-11 con dos móviles reales: cámara, galería, orientación y recuperación cruzada. Aún no se ha registrado esta comprobación ni una transformación de una foto real en producción.
- Ensayar una restauración de copia D1 + R2 en un entorno separado.
- Clonar en el segundo ordenador y comprobar el arranque local. Autorizar Cloudflare allí solo si se necesita publicar o hacer mantenimiento remoto.

## Slider de cocina · 15 de noviembre de 2026

- Integrado el diseño interactivo aprobado en `src/RatingSlider.tsx`, con textos en `ratingCopy.ts`, efectos aislados en `ratingEffects.ts` y estilos propios en `rating-slider.css`. Sin dependencias nuevas ni cambios de API, base de datos o migraciones.
- `pnpm check`, `pnpm test` (19 aprobadas), `pnpm build` y `pnpm deploy:dry` correctos. Las pruebas nuevas cubren cambio de repertorio por gesto, coherencia de sus frases, selección explícita por teclado, bloqueo durante guardado, movimiento reducido, alternativa sin canvas y limpieza de animaciones.
- Navegador local: nueva valoración sin nota, selección de 100 con teclado, efectos cargados sin errores, cancelación y edición de una opinión de 82 conservando su foto. Sin desbordamiento horizontal a 320/360 px. El guardado y los reintentos siguen cubiertos por las pruebas de integración y formulario; no se añadieron opiniones en producción para probar.
- Compilación final y web publicada revisadas en navegador: inicio sin nota, teclado hasta 100, plato decorativo y colores correctos. Se usa la paleta clara de la aplicación; se evitó `light-dark()` porque su transformación en la compilación combinaba incorrectamente valores de variables CSS. La ficha de producción consultada conserva sus dos opiniones y su media 90,5.

## Qué no se sincroniza con Git

Credenciales, sesiones de navegador, historial de los chats, datos de `.wrangler/state`, fotos locales y copias de seguridad. Los datos compartidos de la aplicación están en Cloudflare. La configuración de ejemplo apunta a esos recursos existentes y no contiene claves de acceso.
