const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migrationPath = path.join(
  root,
  'prisma/migrations/20261031120000_p5_056_inapp_notifications_web_push/migration.sql',
);
assert.ok(fs.existsSync(migrationPath), 'Notification migration file must exist');
const migration = fs.readFileSync(migrationPath, 'utf8');

// 1. Models & Enums in schema.prisma
const requiredModels = [
  'InAppNotification',
  'WebPushSubscription',
  'WebPushDelivery',
];
for (const model of requiredModels) {
  assert.match(schema, new RegExp(`\\bmodel\\s+${model}\\s+\\{`), `Missing Prisma model ${model}`);
}

const requiredEnums = [
  'InAppNotificationCategory',
  'InAppNotificationPriority',
  'WebPushDeliveryStatus',
];
for (const enumName of requiredEnums) {
  assert.match(schema, new RegExp(`\\benum\\s+${enumName}\\s+\\{`), `Missing Prisma enum ${enumName}`);
}

// 2. User relations in schema.prisma
assert.match(schema, /inAppNotifications\s+InAppNotification\[\]/);
assert.match(schema, /webPushSubscriptions\s+WebPushSubscription\[\]/);

// 3. Migration non-destructive property
assert.doesNotMatch(migration, /\bDROP\b/i, 'Migration must be additive only; no DROP allowed');
assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i, 'Migration must not delete any data');
assert.doesNotMatch(migration, /\bTRUNCATE\b/i, 'Migration must not truncate tables');

// 4. Migration DDL: tables, enums, FKs with RESTRICT
for (const table of [
  'in_app_notifications',
  'web_push_subscriptions',
  'web_push_deliveries',
]) {
  assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `Missing table ${table}`);
}

for (const fkConstraint of [
  'in_app_notifications_recipient_user_id_fkey',
  'web_push_subscriptions_user_id_fkey',
  'web_push_deliveries_notification_id_fkey',
  'web_push_deliveries_subscription_id_fkey',
]) {
  assert.match(migration, new RegExp(`CONSTRAINT "${fkConstraint}" FOREIGN KEY`), `Missing FK constraint ${fkConstraint}`);
}

console.log('Notification schema & migration static verification PASS');

