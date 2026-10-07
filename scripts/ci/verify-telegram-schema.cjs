const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migrationPath = path.join(
  root,
  'prisma/migrations/20261006120000_p5_030_telegram_integration/migration.sql',
);
assert.ok(fs.existsSync(migrationPath), 'Telegram migration file must exist');
const migration = fs.readFileSync(migrationPath, 'utf8');

// 1. Models & Enums in schema.prisma
const requiredModels = [
  'TelegramLinkChallenge',
  'TelegramAccountLink',
  'TelegramWebhookReceipt',
  'TelegramNotificationDelivery',
];
for (const model of requiredModels) {
  assert.match(schema, new RegExp(`\\bmodel\\s+${model}\\s+\\{`), `Missing Prisma model ${model}`);
}

const requiredEnums = [
  'TelegramChallengeStatus',
  'TelegramAccountLinkStatus',
  'TelegramWebhookReceiptStatus',
  'TelegramNotificationType',
  'TelegramDeliveryStatus',
];
for (const enumName of requiredEnums) {
  assert.match(schema, new RegExp(`\\benum\\s+${enumName}\\s+\\{`), `Missing Prisma enum ${enumName}`);
}

// 2. User relations in schema.prisma
assert.match(schema, /telegramLinkChallenges\s+TelegramLinkChallenge\[\]/);
assert.match(schema, /telegramAccountLinks\s+TelegramAccountLink\[\]/);
assert.match(schema, /telegramNotificationDeliveries\s+TelegramNotificationDelivery\[\]/);

// 3. Migration non-destructive property
assert.doesNotMatch(migration, /\bDROP\b/i, 'Migration must be additive only; no DROP allowed');
assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i, 'Migration must not delete any data');
assert.doesNotMatch(migration, /\bTRUNCATE\b/i, 'Migration must not truncate tables');

// 4. Migration DDL: tables, enums, FKs with RESTRICT
for (const table of [
  'telegram_link_challenges',
  'telegram_account_links',
  'telegram_webhook_receipts',
  'telegram_notification_deliveries',
]) {
  assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `Missing table ${table}`);
}

for (const fkConstraint of [
  'telegram_link_challenges_user_id_fkey',
  'telegram_account_links_user_id_fkey',
  'telegram_notification_deliveries_actor_user_id_fkey',
  'telegram_notification_deliveries_account_link_id_fkey',
]) {
  assert.match(migration, new RegExp(`CONSTRAINT "${fkConstraint}".*ON DELETE RESTRICT`), `FK ${fkConstraint} must be ON DELETE RESTRICT`);
}

// 5. Partial unique indexes and invariants
assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_link_challenges_one_pending_per_user_key"\s+ON "telegram_link_challenges"\("user_id"\)\s+WHERE "status" = 'PENDING';/,
  'Missing partial unique index for PENDING link challenge per user',
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_account_links_one_active_per_user_key"\s+ON "telegram_account_links"\("user_id"\)\s+WHERE "status" = 'ACTIVE';/,
  'Missing partial unique index for ACTIVE link per user',
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_account_links_one_active_per_telegram_user_key"\s+ON "telegram_account_links"\("telegram_user_id"\)\s+WHERE "status" = 'ACTIVE';/,
  'Missing partial unique index for ACTIVE link per telegram_user_id',
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_account_links_one_active_per_telegram_chat_key"\s+ON "telegram_account_links"\("telegram_chat_id"\)\s+WHERE "status" = 'ACTIVE';/,
  'Missing partial unique index for ACTIVE link per telegram_chat_id',
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_notification_deliveries_command_key_key"\s+ON "telegram_notification_deliveries"\("command_key"\);/,
  'Missing global unique index for command_key',
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX "telegram_notification_deliveries_actor_request_key"\s+ON "telegram_notification_deliveries"\("actor_user_id", "request_key"\)\s+WHERE "request_key" IS NOT NULL;/,
  'Missing partial unique index for actor-scoped request_key',
);

// 6. DB check constraints
assert.match(migration, /CONSTRAINT "telegram_link_challenges_token_hash_check"/);
assert.match(migration, /CONSTRAINT "telegram_account_links_telegram_user_id_check"/);
assert.match(migration, /CONSTRAINT "telegram_account_links_telegram_chat_id_check"/);
assert.match(migration, /CONSTRAINT "telegram_webhook_receipts_update_id_check"/);
assert.match(migration, /CONSTRAINT "telegram_notification_deliveries_request_key_check"/);

console.log('Telegram schema static verification PASS.');
