-- =====================================================================
-- Insulation Take-Off App — seed data
-- =====================================================================
-- Loads a starter price list + sample builder profiles on first run.
-- Everything here is fully editable in the app. All rates are
-- ILLUSTRATIVE PLACEHOLDERS (AUD, ex-GST, per m²) — replace with yours.
-- The loader runs this only when the products table is empty.
-- =====================================================================

-- wastage_pct: % extra material ordered for cuts/offcuts (applied to the
-- supply quantity only — install labour is charged on the actual net area).
-- 10% is a common rule of thumb for batts; wrap/sarking/sealant run leaner.
INSERT INTO products (code, name, category, unit, default_supply_rate, default_install_rate, wastage_pct, notes, active) VALUES
  ('WALL_R1.5',       'R1.5 external wall batts',                    'external_wall',  'm2',  6.50, 4.50, 10, 'Lightweight or brick-veneer framed wall',                 1),
  ('WALL_R2.0',       'R2.0 external wall batts',                    'external_wall',  'm2',  7.50, 4.50, 10, 'Most common external wall batt',                          1),
  ('WALL_R2.5',       'R2.5 external wall batts',                    'external_wall',  'm2',  9.00, 5.00, 10, 'Higher-performance external wall',                        1),
  ('GARAGE_WALL_R2.0','R2.0 garage common-wall batts',              'garage_wall',    'm2',  7.50, 4.50, 10, 'Garage-to-house internal wall',                           1),
  ('CEIL_R3.5',       'R3.5 ceiling batts',                          'ceiling',        'm2',  6.00, 4.00, 10, 'Standard ceiling',                                        1),
  ('CEIL_R4.0',       'R4.0 ceiling batts',                          'ceiling',        'm2',  7.00, 4.00, 10, 'Higher-performance ceiling',                              1),
  ('CEIL_R5.0',       'R5.0 ceiling batts',                          'ceiling',        'm2',  8.50, 4.50, 10, 'Colder-climate ceiling',                                  1),
  ('CEIL_OUT_R1.5',   'R1.5 outdoor-living / alfresco ceiling batts','ceiling_outdoor','m2',  6.00, 5.00, 10, 'Alfresco / outdoor living ceiling',                       1),
  ('FIRE_R1.7_60',    'R1.7 60mm fire batts (zero-boundary)',        'special_wall',   'm2', 14.00, 8.00, 10, 'e.g. HardieFire / HardieSmart boundary wall build-up',    1),
  ('FIRE_R2.0_BDY',   'R2.0 fire batts (boundary wall)',             'special_wall',   'm2', 16.00, 8.00, 10, 'FRL-rated boundary wall',                                 1),
  ('ACOUS_WALL_R2.0', 'R2.0 acoustic wall batts',                    'acoustic',       'm2',  9.50, 4.50, 10, 'Internal acoustic (wet areas, media, etc.)',              1),
  ('WRAP_FOIL',       'Reflective foil sarking wall wrap',           'wall_wrap',      'm2',  3.20, 3.00, 5,  'Reflective foil sarking to external framed walls',        1),
  ('WRAP_VP',         'Vapour-permeable wall wrap / sarking',        'wall_wrap',      'm2',  3.50, 3.00, 5,  'Class 4 vapour-permeable sarking to cladded walls',       1),
  ('WRAP_SUBFLOOR',   'Subfloor wrap',                               'subfloor_wrap',  'm2',  3.50, 3.50, 5,  'Vapour-permeable wrap to suspended subfloor',             1),
  ('SEAL_CONT',       'Continuous draught / gap sealing',            'sealant',        'lm',  2.00, 3.00, 5,  'Continuous sealant/foam bead at specified junctions',     1),
  ('SARK_ANTIGLARE',  'Anti-glare roof sarking',                     'roof_sarking',   'm2',  3.00, 3.50, 5,  'Anti-glare reflective sarking to underside of roof',      1);

INSERT INTO builders (name, aliases, notes) VALUES
  ('Avia Homes',    '["AVIA Homes","AVIA Homes Australia Pty Ltd","Avia"]', 'Sample profile — verify rates before quoting'),
  ('Hancock Homes', '["Hancock","Hancock Homes Pty Ltd"]',                  'Sample profile — verify rates before quoting');

-- Avia Homes overrides
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 7.20, 4.20 FROM builders b, products p WHERE b.name='Avia Homes'    AND p.code='WALL_R2.0';
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 5.80, 3.80 FROM builders b, products p WHERE b.name='Avia Homes'    AND p.code='CEIL_R3.5';
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 5.80, 4.80 FROM builders b, products p WHERE b.name='Avia Homes'    AND p.code='CEIL_OUT_R1.5';
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 13.50, 7.50 FROM builders b, products p WHERE b.name='Avia Homes'   AND p.code='FIRE_R1.7_60';

-- Hancock Homes overrides
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 7.80, 4.80 FROM builders b, products p WHERE b.name='Hancock Homes' AND p.code='WALL_R2.0';
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 6.20, 4.20 FROM builders b, products p WHERE b.name='Hancock Homes' AND p.code='CEIL_R3.5';
INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
SELECT b.id, p.id, 9.80, 4.80 FROM builders b, products p WHERE b.name='Hancock Homes' AND p.code='ACOUS_WALL_R2.0';
