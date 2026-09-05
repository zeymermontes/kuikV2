-- A full design per section, replacing the accent/background pair from 0059.
--
-- `theme` holds the same colour and font keys as the menu theme, every one
-- optional: a category may recolour everything, swap fonts, or set nothing and
-- inherit. The two 0059 columns fold into it so nothing already saved is lost.
alter table categories add column if not exists theme jsonb;

update categories
   set theme = jsonb_strip_nulls(jsonb_build_object(
         'primary_color', accent_color,
         'secondary_color', accent_color,
         'button_color', accent_color,
         'background_color', background_color))
 where accent_color is not null or background_color is not null;

alter table categories
  drop column if exists accent_color,
  drop column if exists background_color;

comment on column categories.theme is 'Section design: optional colour/font keys mirroring tenant_theme. Null = inherit.';
