-- Migration: replace text depth_override with typed depth_level enum column
-- UP

create type depth_level as enum (
  'inner_5',
  'trusted_15',
  'active_50',
  'network_150',
  'periphery_500'
);

alter table people
  add column if not exists depth depth_level;

-- Migrate existing depth_override text values to the new enum column.
-- Old values were German labels from the original 4-tier model.
update people
set depth = case depth_override
  when 'Persönlich' then 'inner_5'::depth_level
  when 'Vertraut'   then 'trusted_15'::depth_level
  when 'Bekannt'    then 'active_50'::depth_level
  when 'Fremd'      then 'periphery_500'::depth_level
  when 'Tier 1'     then 'inner_5'::depth_level
  when 'Tier 2'     then 'trusted_15'::depth_level
  when 'Tier 3'     then 'active_50'::depth_level
  when 'Tier 4'     then 'network_150'::depth_level
  when 'Tier 5'     then 'periphery_500'::depth_level
  else null
end
where depth_override is not null;

-- DOWN
-- alter table people drop column if exists depth;
-- drop type if exists depth_level;
