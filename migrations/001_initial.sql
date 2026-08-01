-- address-lookup-for-shop: settings singleton.
-- The Ideal Postcodes API key lives here (per-install, entered on the shop
-- settings sub-tab); IDEAL_POSTCODES_KEY in the environment acts as a fallback
-- so a key never has to be pasted twice on installs that already carry one.
CREATE TABLE IF NOT EXISTS "alk_settings" (
  "id" TEXT PRIMARY KEY,
  "api_key" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "alk_settings" ("id") VALUES ('singleton')
ON CONFLICT ("id") DO NOTHING;
