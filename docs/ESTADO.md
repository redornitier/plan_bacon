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

## Estado de publicación y verificaciones

- Publicación inicial: 11 de noviembre de 2026; versión Cloudflare `479f6912-d791-4033-8e17-fdf803f43308`.
- D1 y R2 de producción creados. Migraciones 0001 y 0002 aplicadas. Se cargaron solo restaurante y perfiles, sin trasladar las muestras locales.
- HTTPS, HTML, JavaScript, restaurante, cuatro perfiles y catálogo inicialmente vacío comprobados al publicar.
- Aviso de gasto de 1 USD confirmado por el usuario en su navegador; no es un límite de cargos.
- Preparación para GitHub verificada el 15 de noviembre de 2026: copia limpia de los 42 archivos versionables, instalación desde el lockfile, migraciones y semilla locales, 15 pruebas aprobadas, tipos y compilación correctos. El repositorio local está preparado en la rama `main`; GitHub Actions aún no se ha ejecutado porque no se ha subido el repositorio. Ver `VERIFICACION.md` para alcance y evidencia.
- No inferir que el catálogo sigue vacío actualmente: el equipo puede haber guardado datos reales desde la publicación.

## Pendientes

- CA-11 con dos móviles reales: cámara, galería, orientación y recuperación cruzada. Aún no se ha registrado esta comprobación ni una transformación de una foto real en producción.
- Ensayar una restauración de copia D1 + R2 en un entorno separado.
- Crear el repositorio privado en GitHub y conectar el remoto cuando el usuario lo solicite. Las comprobaciones automáticas se ejecutarán al subirlo; todavía no se han ejecutado en GitHub.
- Clonar en el segundo ordenador y comprobar el arranque local. Autorizar Cloudflare allí solo si se necesita publicar o hacer mantenimiento remoto.

## Qué no se sincroniza con Git

Credenciales, sesiones de navegador, historial de los chats, datos de `.wrangler/state`, fotos locales y copias de seguridad. Los datos compartidos de la aplicación están en Cloudflare. La configuración de ejemplo apunta a esos recursos existentes y no contiene claves de acceso.
