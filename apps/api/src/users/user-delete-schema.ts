import { Prisma } from '@prisma/client';
import { USER_DELETE_FK_INVENTORY } from './user-delete-fk-inventory';

interface ForeignKey {
  schema: string; child: string; name: string; parent: string;
  columns: string[]; refs: string[]; del: string; upd: string; valid: boolean; deferred: boolean;
}

// Measured from the complete committed migration chain on isolated PG16 and PG17.
// Changes require migration replay and review; runtime must never learn/accept a new hash.
export const EXPECTED_SCHEMA_FINGERPRINT = 'dcc09117df18e7b7c914f4a1aec781fe';

export async function inspectUserDeletionSchema(tx: Prisma.TransactionClient) {
  // A newly added table/column may carry identities without a FK. Require an
  // explicit review before enabling deletion on a different physical schema.
  const [schema] = await tx.$queryRaw<Array<{ fingerprint: string; enforced: boolean }>>`
    SELECT md5(string_agg(t.relname || ':' || a.attname || ':' || format_type(a.atttypid,a.atttypmod)
      || ':' || a.attnotnull::text, ',' ORDER BY n.nspname COLLATE "C",t.relname COLLATE "C",a.attnum)) AS fingerprint,
      current_setting('session_replication_role') = 'origin' AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tr JOIN pg_constraint c ON c.oid=tr.tgconstraint
        WHERE c.contype='f' AND c.confrelid IN (to_regclass('public.users'), to_regclass('public.staff_profiles'),
          to_regclass('public.staff_subjects'), to_regclass('public.subject_group_memberships'))
          AND tr.tgenabled <> 'O'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace
        WHERE rn.nspname='public' AND (r.relrowsecurity OR r.relforcerowsecurity)
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tr WHERE NOT tr.tgisinternal AND tr.tgrelid IN (
          to_regclass('public.users'), to_regclass('public.staff_profiles'),
          to_regclass('public.staff_subjects'), to_regclass('public.subject_group_memberships'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class IN (
          to_regclass('public.users'), to_regclass('public.staff_profiles'),
          to_regclass('public.staff_subjects'), to_regclass('public.subject_group_memberships'))
      ) AS enforced
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      AND t.relkind IN ('r','p','f','m')
      AND NOT (n.nspname='public' AND t.relname='_prisma_migrations')
      AND a.attnum>0 AND NOT a.attisdropped`;

  const actual = await tx.$queryRaw<ForeignKey[]>`
    SELECT ns.nspname AS schema, t.relname AS child, c.conname AS name, p.relname AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,i)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY i) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,i)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY i) AS refs,
      c.confdeltype::text AS del, c.confupdtype::text AS upd, c.convalidated AS valid, c.condeferrable AS deferred
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_class p ON p.oid=c.confrelid
      JOIN pg_namespace ns ON ns.oid=t.relnamespace
    WHERE c.contype='f' AND c.confrelid IN (to_regclass('public.users'), to_regclass('public.staff_profiles'),
      to_regclass('public.staff_subjects'), to_regclass('public.subject_group_memberships'))
    ORDER BY ns.nspname COLLATE "C",t.relname COLLATE "C",c.conname COLLATE "C"`;
  return {
    fingerprint: schema.fingerprint, enforced: schema.enforced,
    fingerprintMatches: schema.fingerprint === EXPECTED_SCHEMA_FINGERPRINT,
    inventoryMatches: JSON.stringify(actual) === JSON.stringify(USER_DELETE_FK_INVENTORY),
    foreignKeyCount: actual.length,
  };
}
