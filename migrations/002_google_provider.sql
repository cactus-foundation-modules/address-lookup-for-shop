-- Adds the Google Places provider alongside Ideal Postcodes.
-- 001 already carries these columns for fresh installs; this file is what gets
-- them onto installs that ran 001 before the second provider existed. Both are
-- idempotent, so the overlap is harmless.
ALTER TABLE "alk_settings" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'ideal-postcodes';
ALTER TABLE "alk_settings" ADD COLUMN IF NOT EXISTS "google_api_key" TEXT;
ALTER TABLE "alk_settings" ADD COLUMN IF NOT EXISTS "google_region_codes" TEXT NOT NULL DEFAULT 'gb';
