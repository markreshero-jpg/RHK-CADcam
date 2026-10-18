-- Fixtures: brand + model no. copied onto placed fixtures (jobs stay as-built). Applied live 2026-10-18 as fixtures_brand_snapshot.
alter table room_fixtures add column if not exists brand text, add column if not exists model_no text;
update room_fixtures r set brand = c.brand, model_no = c.model_no from fixture_catalog c where r.catalog_id = c.id and r.brand is null and r.model_no is null;
