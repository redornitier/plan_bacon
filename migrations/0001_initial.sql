PRAGMA foreign_keys = ON;

CREATE TABLE grupos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 80)
);
CREATE TABLE perfiles (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  nombre_visible TEXT NOT NULL CHECK(length(trim(nombre_visible)) BETWEEN 1 AND 80)
);
CREATE TABLE restaurantes (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 120)
);
CREATE TABLE platos (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id),
  nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 80),
  nombre_normalizado TEXT NOT NULL CHECK(length(nombre_normalizado) BETWEEN 1 AND 80),
  creado_por TEXT NOT NULL REFERENCES perfiles(id),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(restaurante_id, nombre_normalizado)
);
CREATE TABLE opiniones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plato_id TEXT NOT NULL REFERENCES platos(id),
  perfil_id TEXT NOT NULL REFERENCES perfiles(id),
  foto_clave TEXT NOT NULL CHECK(length(foto_clave) > 0),
  valoracion INTEGER NOT NULL CHECK(typeof(valoracion) = 'integer' AND valoracion BETWEEN 1 AND 100),
  comentario TEXT CHECK(comentario IS NULL OR length(comentario) <= 500),
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(plato_id, perfil_id)
);
CREATE INDEX opiniones_publicacion ON opiniones(plato_id, creada_en DESC, id DESC);
CREATE INDEX perfiles_grupo ON perfiles(grupo_id);

-- Protect group membership during maintenance as well as through the API.
CREATE TRIGGER platos_grupo_insert BEFORE INSERT ON platos
WHEN NOT EXISTS (
  SELECT 1 FROM perfiles p JOIN restaurantes r ON p.grupo_id = r.grupo_id
  WHERE p.id = NEW.creado_por AND r.id = NEW.restaurante_id
) BEGIN SELECT RAISE(ABORT, 'El perfil no pertenece al grupo'); END;
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
