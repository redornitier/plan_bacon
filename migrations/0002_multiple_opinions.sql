-- Preserve every existing opinion and photo while removing the per-profile limit.
CREATE TABLE opiniones_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plato_id TEXT NOT NULL REFERENCES platos(id),
  perfil_id TEXT NOT NULL REFERENCES perfiles(id),
  foto_clave TEXT NOT NULL CHECK(length(foto_clave) > 0),
  valoracion INTEGER NOT NULL CHECK(typeof(valoracion) = 'integer' AND valoracion BETWEEN 1 AND 100),
  comentario TEXT CHECK(comentario IS NULL OR length(comentario) <= 500),
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  solicitud_id TEXT NOT NULL UNIQUE
);

INSERT INTO opiniones_nueva(id, plato_id, perfil_id, foto_clave, valoracion, comentario, creada_en, actualizada_en, solicitud_id)
SELECT id, plato_id, perfil_id, foto_clave, valoracion, comentario, creada_en, actualizada_en, 'migrada-' || id FROM opiniones;
DROP TABLE opiniones;
ALTER TABLE opiniones_nueva RENAME TO opiniones;
CREATE INDEX opiniones_publicacion ON opiniones(plato_id, creada_en DESC, id DESC);
CREATE INDEX opiniones_perfil ON opiniones(plato_id, perfil_id);
CREATE TRIGGER opiniones_grupo_insert BEFORE INSERT ON opiniones
WHEN NOT EXISTS (
  SELECT 1 FROM perfiles p JOIN restaurantes r ON p.grupo_id = r.grupo_id
  JOIN platos d ON d.restaurante_id = r.id WHERE p.id = NEW.perfil_id AND d.id = NEW.plato_id
) BEGIN SELECT RAISE(ABORT, 'El perfil no pertenece al grupo'); END;
CREATE TRIGGER opiniones_grupo_update BEFORE UPDATE OF plato_id, perfil_id ON opiniones
WHEN NOT EXISTS (
  SELECT 1 FROM perfiles p JOIN restaurantes r ON p.grupo_id = r.grupo_id
  JOIN platos d ON d.restaurante_id = r.id WHERE p.id = NEW.perfil_id AND d.id = NEW.plato_id
) BEGIN SELECT RAISE(ABORT, 'El perfil no pertenece al grupo'); END;
