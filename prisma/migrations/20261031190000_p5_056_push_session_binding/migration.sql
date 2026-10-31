-- Existing subscriptions have no trustworthy installation/session provenance.
-- Retain their history and require explicit opt-in from an authenticated session.
ALTER TABLE "web_push_subscriptions" ADD COLUMN "auth_session_id" UUID;
ALTER TABLE "web_push_subscriptions" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "web_push_deliveries" ADD COLUMN "subscription_generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_auth_session_id_fkey"
  FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "web_push_subscriptions_auth_session_idx" ON "web_push_subscriptions"("auth_session_id");
UPDATE "web_push_subscriptions" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "revoked_at" IS NULL;
UPDATE "web_push_deliveries" SET "status" = 'DEAD', "last_error_code" = 'SESSION_BINDING_REQUIRED',
  "lease_owner" = NULL, "lease_until" = NULL
WHERE "status" IN ('PENDING', 'LEASED', 'RETRY_WAIT');
