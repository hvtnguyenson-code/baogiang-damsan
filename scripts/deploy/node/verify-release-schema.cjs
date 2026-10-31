const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

async function verifyReleaseSchema(db, inspect) {
  const proof = await inspect(db);
  if (!proof.fingerprintMatches || !proof.enforced || !proof.inventoryMatches) {
    throw new Error('RELEASE_SCHEMA_NOT_VERIFIED');
  }
  // Migration status alone cannot detect removed/disabled constraints or indexes.
  const [{ safe }] = await db.$queryRawUnsafe(`WITH expected(child, name, parent, column_name) AS (VALUES
      ('in_app_notifications','in_app_notifications_recipient_user_id_fkey','users','recipient_user_id'),
      ('web_push_subscriptions','web_push_subscriptions_user_id_fkey','users','user_id'),
      ('web_push_subscriptions','web_push_subscriptions_auth_session_id_fkey','auth_sessions','auth_session_id'),
      ('web_push_deliveries','web_push_deliveries_notification_id_fkey','in_app_notifications','notification_id'),
      ('web_push_deliveries','web_push_deliveries_subscription_id_fkey','web_push_subscriptions','subscription_id')
    ), expected_indexes(table_name, index_name, column_names) AS (VALUES
      ('in_app_notifications','in_app_notifications_recipient_dedupe_key',ARRAY['recipient_user_id','dedupe_key']),
      ('web_push_subscriptions','web_push_subscriptions_endpoint_digest_key',ARRAY['endpoint_digest']),
      ('web_push_deliveries','web_push_deliveries_notification_sub_version_key',ARRAY['notification_id','subscription_id','payload_version'])
    ) SELECT
    (SELECT count(*) = 5 FROM expected e JOIN pg_constraint c ON c.conname=e.name
      AND c.conrelid=to_regclass('public.' || e.child) AND c.confrelid=to_regclass('public.' || e.parent)
      WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable AND c.confdeltype='r' AND c.confupdtype='c'
      AND c.conkey=ARRAY(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname=e.column_name)
      AND c.confkey=ARRAY(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='id')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgconstraint=c.oid AND tr.tgenabled <> 'O'))
    AND (SELECT count(*) = 3 FROM expected_indexes e
      JOIN pg_class t ON t.oid=to_regclass('public.' || e.table_name)
      JOIN pg_index i ON i.indrelid=t.oid JOIN pg_class r ON r.oid=i.indexrelid AND r.relname=e.index_name
      WHERE i.indisvalid AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
      AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,ord)
        JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.n ORDER BY k.ord)=e.column_names) AS safe`);
  if (!safe) throw new Error('RELEASE_NOTIFICATION_CONSTRAINTS_NOT_VERIFIED');
}

module.exports = { verifyReleaseSchema };
if (require.main === module) {
  const { inspectUserDeletionSchema } = require(path.resolve(__dirname, '../../../apps/api/dist/apps/api/src/users/user-delete-schema.js'));
  const db = new PrismaClient();
  db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await verifyReleaseSchema(tx, inspectUserDeletionSchema);
  }).then(() => process.stdout.write('RELEASE_SCHEMA_VERIFIED\n'))
    .catch(() => { process.stderr.write('RELEASE_SCHEMA_NOT_VERIFIED\n'); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
