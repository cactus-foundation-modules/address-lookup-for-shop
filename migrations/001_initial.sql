-- address-lookup-for-shop: settings singleton.
-- The provider's API key lives here (per-install, entered on the shop settings
-- sub-tab); an environment variable per provider acts as a fallback so a key
-- never has to be pasted twice on installs that already carry one.
-- Each provider keeps its own key column, so switching between them and back
-- does not throw the first key away.
CREATE TABLE IF NOT EXISTS "alk_settings" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'ideal-postcodes',
  "api_key" TEXT,
  "google_api_key" TEXT,
  "google_region_codes" TEXT NOT NULL DEFAULT 'gb',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "alk_settings" ("id") VALUES ('singleton')
ON CONFLICT ("id") DO NOTHING;
