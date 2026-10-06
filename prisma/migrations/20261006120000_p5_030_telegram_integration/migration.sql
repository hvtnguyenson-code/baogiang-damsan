-- ============================================================
-- Migration: 20261006120000_p5_030_telegram_integration
-- Authority: ADR-058, P5-030A, T33 (NEW_PRODUCT_AUTHORITY)
-- Scope: Dedicated Báo giảng Telegram integration persistence foundation
-- Invariants:
--   - Additive only; zero destructive changes
--   - Partial unique index: at most 1 PENDING challenge per user
--   - Partial unique indexes: at most 1 ACTIVE link per user, telegram user, and chat
--   - Global unique: command_key
--   - Actor-scoped unique: (actor_user_id, request_key) WHERE request_key IS NOT NULL
--   - Foreign keys: ON DELETE RESTRICT
-- ============================================================

-- CreateEnum: TelegramChallengeStatus
CREATE TYPE "TelegramChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED');

-- CreateEnum: TelegramAccountLinkStatus
CREATE TYPE "TelegramAccountLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum: TelegramWebhookReceiptStatus
CREATE TYPE "TelegramWebhookReceiptStatus" AS ENUM ('PROCESSED', 'IGNORED');

-- CreateEnum: TelegramNotificationType
CREATE TYPE "TelegramNotificationType" AS ENUM ('LINK_SUCCESS', 'SELF_TEST');

-- CreateEnum: TelegramDeliveryStatus
CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('RESERVED', 'ATTEMPTING', 'SENT', 'FAILED', 'UNKNOWN');

-- CreateTable: telegram_link_challenges
CREATE TABLE "telegram_link_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "TelegramChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_link_challenges_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateTable: telegram_account_links
CREATE TABLE "telegram_account_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "telegram_user_id" VARCHAR(64) NOT NULL,
    "telegram_chat_id" VARCHAR(64) NOT NULL,
    "status" "TelegramAccountLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_account_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_account_links_telegram_user_id_check" CHECK ("telegram_user_id" ~ '^[0-9]+$'),
    CONSTRAINT "telegram_account_links_telegram_chat_id_check" CHECK ("telegram_chat_id" ~ '^-?[0-9]+$')
);

-- CreateTable: telegram_webhook_receipts
CREATE TABLE "telegram_webhook_receipts" (
    "id" UUID NOT NULL,
    "update_id" VARCHAR(64) NOT NULL,
    "status" "TelegramWebhookReceiptStatus" NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "telegram_webhook_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_webhook_receipts_update_id_check" CHECK ("update_id" ~ '^[0-9]+$')
);

-- CreateTable: telegram_notification_deliveries
CREATE TABLE "telegram_notification_deliveries" (
    "id" UUID NOT NULL,
    "command_key" VARCHAR(200) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_key" VARCHAR(100),
    "command_fingerprint" VARCHAR(128) NOT NULL,
    "account_link_id" UUID NOT NULL,
    "telegram_chat_id" VARCHAR(64) NOT NULL,
    "notification_type" "TelegramNotificationType" NOT NULL,
    "payload_digest" VARCHAR(128) NOT NULL,
    "delivery_status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'RESERVED',
    "attempt_started_at" TIMESTAMPTZ(3),
    "provider_message_id" VARCHAR(100),
    "sanitized_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "telegram_notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_notification_deliveries_request_key_check" CHECK ("request_key" IS NULL OR "request_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

-- Indexes & Unique constraints for telegram_link_challenges
CREATE UNIQUE INDEX "telegram_link_challenges_token_hash_key" ON "telegram_link_challenges"("token_hash");
CREATE INDEX "telegram_link_challenges_user_status_idx" ON "telegram_link_challenges"("user_id", "status");
CREATE INDEX "telegram_link_challenges_expires_at_idx" ON "telegram_link_challenges"("expires_at");
CREATE UNIQUE INDEX "telegram_link_challenges_one_pending_per_user_key" ON "telegram_link_challenges"("user_id") WHERE "status" = 'PENDING';

-- Indexes & Unique constraints for telegram_account_links
CREATE INDEX "telegram_account_links_user_status_idx" ON "telegram_account_links"("user_id", "status");
CREATE INDEX "telegram_account_links_telegram_user_idx" ON "telegram_account_links"("telegram_user_id");
CREATE INDEX "telegram_account_links_telegram_chat_idx" ON "telegram_account_links"("telegram_chat_id");
CREATE UNIQUE INDEX "telegram_account_links_one_active_per_user_key" ON "telegram_account_links"("user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "telegram_account_links_one_active_per_telegram_user_key" ON "telegram_account_links"("telegram_user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "telegram_account_links_one_active_per_telegram_chat_key" ON "telegram_account_links"("telegram_chat_id") WHERE "status" = 'ACTIVE';

-- Indexes & Unique constraints for telegram_webhook_receipts
CREATE UNIQUE INDEX "telegram_webhook_receipts_update_id_key" ON "telegram_webhook_receipts"("update_id");
CREATE INDEX "telegram_webhook_receipts_status_idx" ON "telegram_webhook_receipts"("status");
CREATE INDEX "telegram_webhook_receipts_received_at_idx" ON "telegram_webhook_receipts"("received_at");

-- Indexes & Unique constraints for telegram_notification_deliveries
CREATE UNIQUE INDEX "telegram_notification_deliveries_command_key_key" ON "telegram_notification_deliveries"("command_key");
CREATE INDEX "telegram_notification_deliveries_actor_status_idx" ON "telegram_notification_deliveries"("actor_user_id", "delivery_status");
CREATE INDEX "telegram_notification_deliveries_link_status_idx" ON "telegram_notification_deliveries"("account_link_id", "delivery_status");
CREATE INDEX "telegram_notification_deliveries_status_attempt_idx" ON "telegram_notification_deliveries"("delivery_status", "attempt_started_at");
CREATE UNIQUE INDEX "telegram_notification_deliveries_actor_request_key" ON "telegram_notification_deliveries"("actor_user_id", "request_key") WHERE "request_key" IS NOT NULL;

-- Foreign Keys (ON DELETE RESTRICT)
ALTER TABLE "telegram_link_challenges" ADD CONSTRAINT "telegram_link_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telegram_account_links" ADD CONSTRAINT "telegram_account_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_deliveries" ADD CONSTRAINT "telegram_notification_deliveries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_deliveries" ADD CONSTRAINT "telegram_notification_deliveries_account_link_id_fkey" FOREIGN KEY ("account_link_id") REFERENCES "telegram_account_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
