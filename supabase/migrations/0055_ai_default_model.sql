-- Kuik — a platform-wide default model
--
-- The provider was already configurable; the model was not, so every tenant
-- without an explicit choice fell back to whatever the code had hardcoded. That
-- is the wrong place for a decision that changes cost per message and that
-- providers revise every few months.

alter table platform_settings
  add column if not exists ai_default_model text;
