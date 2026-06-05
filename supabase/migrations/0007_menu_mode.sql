-- Kuik — menu mode: interactive builder vs. uploaded PDF
-- Some restaurants just want to upload their existing PDF menu instead of
-- building it product-by-product. When menu_mode = 'pdf', the public page shows
-- the PDF; otherwise it renders the interactive menu.

alter table tenant_theme
  add column menu_mode    text not null default 'builder'
    check (menu_mode in ('builder', 'pdf')),
  add column menu_pdf_url text;
