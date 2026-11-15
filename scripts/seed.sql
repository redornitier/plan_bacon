-- Safe to repeat. No demo dishes or opinions in production seeds.
INSERT OR IGNORE INTO grupos(id, nombre) VALUES ('plan-bacon', 'Plan Bacon');
INSERT OR IGNORE INTO restaurantes(id, grupo_id, nombre) VALUES ('el-volante', 'plan-bacon', 'Restaurante El Volante');
INSERT OR IGNORE INTO perfiles(id, grupo_id, nombre_visible) VALUES
  ('alexandre', 'plan-bacon', 'Alexandre'),
  ('manoel', 'plan-bacon', 'Manoel'),
  ('jorge', 'plan-bacon', 'Jorge'),
  ('gabriel', 'plan-bacon', 'Gabriel');
