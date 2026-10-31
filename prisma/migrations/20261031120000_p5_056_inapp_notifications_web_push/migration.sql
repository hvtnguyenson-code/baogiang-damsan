-- ============================================================
-- Migration: 20261031120000_p5_056_inapp_notifications_web_push
-- Authority: ADR-059, P5-056A, T55 (RESTORE)
-- Scope: Canonical per-account in-app notification center and independent Web Push
-- Invariants:
--   - Additive only; zero destructive changes
--   - In-app notification unique per recipient + dedupe_key
--   - Foreign keys to users: ON DELETE RESTRICT
--   - Web Push delivery unique per notification + subscription + payload_version
-- ============================================================

-- CreateEnum: InAppNotificationCategory
CREATE TYPE "InAppNotificationCategory" AS ENUM ('ACTION_REQUIRED', 'INFORMATION', 'SYSTEM');

-- CreateEnum: InAppNotificationPriority
CREATE TYPE "InAppNotificationPriority" AS ENUM ('NORMAL', 'HIGH');

-- CreateEnum: WebPushDeliveryStatus
CREATE TYPE "WebPushDeliveryStatus" AS ENUM ('PENDING', 'LEASED', 'SENT', 'RETRY_WAIT', 'DEAD', 'INVALID_SUBSCRIPTION');

-- CreateTable: in_app_notifications
CREATE TABLE "in_app_notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "category" "InAppNotificationCategory" NOT NULL,
    "priority" "InAppNotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "source_kind" VARCHAR(64) NOT NULL,
    "source_id" UUID NOT NULL,
    "source_version" VARCHAR(64),
    "source_event_id" VARCHAR(128) NOT NULL,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body_safe" VARCHAR(1000) NOT NULL,
    "action_key" VARCHAR(64),
    "action_params_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "state_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: web_push_subscriptions
CREATE TABLE "web_push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_label" VARCHAR(100),
    "endpoint_ciphertext" TEXT NOT NULL,
    "endpoint_digest" VARCHAR(64) NOT NULL,
    "p256dh_ciphertext" TEXT NOT NULL,
    "auth_ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "vapid_key_version" VARCHAR(32),

    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: web_push_deliveries
CREATE TABLE "web_push_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "status" "WebPushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" VARCHAR(100),
    "lease_until" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "web_push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "in_app_notifications_recipient_dedupe_key" ON "in_app_notifications"("recipient_user_id", "dedupe_key");
CREATE INDEX "in_app_notifications_recipient_created_id_idx" ON "in_app_notifications"("recipient_user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "in_app_notifications_recipient_read_created_idx" ON "in_app_notifications"("recipient_user_id", "read_at", "created_at");
CREATE INDEX "in_app_notifications_source_kind_source_id_idx" ON "in_app_notifications"("source_kind", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_digest_key" ON "web_push_subscriptions"("endpoint_digest");
CREATE INDEX "web_push_subscriptions_user_status_idx" ON "web_push_subscriptions"("user_id", "revoked_at", "invalidated_at");

-- CreateIndex
CREATE UNIQUE INDEX "web_push_deliveries_notification_sub_version_key" ON "web_push_deliveries"("notification_id", "subscription_id", "payload_version");
CREATE INDEX "web_push_deliveries_status_next_attempt_idx" ON "web_push_deliveries"("status", "next_attempt_at");
CREATE INDEX "web_push_deliveries_lease_until_idx" ON "web_push_deliveries"("lease_until");

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "in_app_notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "web_push_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

