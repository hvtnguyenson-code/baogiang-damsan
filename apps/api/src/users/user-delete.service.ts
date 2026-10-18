import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { UserDeleteBlockerCode, UserDeletePreflightResponse, UserDeleteResponse } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { USER_DELETE_FK_INVENTORY } from './user-delete-fk-inventory';

type Db = Prisma.TransactionClient;
interface ForeignKey {
  schema: string; child: string; name: string; parent: string;
  columns: string[]; refs: string[]; del: string; upd: string; valid: boolean; deferred: boolean;
}
const SETUP = new Set(['staff_profiles', 'subject_group_memberships', 'staff_subjects']);
const SECURITY = new Set(['auth_sessions', 'capability_grants', 'audit_events']);
const REASONS: Record<UserDeleteBlockerCode, string> = {
  SELF: 'Không thể tự xóa tài khoản đang đăng nhập.',
  PROTECTED: 'Tài khoản khởi tạo được bảo vệ; hãy vô hiệu hóa khi cần ngừng truy cập.',
  LOGIN_HISTORY: 'Tài khoản đã có lịch sử đăng nhập.',
  SECURITY_HISTORY: 'Tài khoản có lịch sử phiên đăng nhập, phân quyền hoặc nhật ký hoạt động cần lưu giữ.',
  BUSINESS_HISTORY: 'Tài khoản có dữ liệu nghiệp vụ hoặc nguồn gốc xử lý cần lưu giữ.',
  INDIRECT_HISTORY: 'Hồ sơ hoặc môn phụ trách đã được sử dụng trong dữ liệu nghiệp vụ.',
  UNVERIFIED_REFERENCE: 'Không thể xác minh đầy đủ các tham chiếu; không được phép xóa tài khoản.',
};

// These are the migration-backed non-FK identity containers: policy payload,
// command results, frozen reporting snapshot and bootstrap audit provenance.
// Do not use input or live catalog identifiers to construct SQL.
const NON_FK_CONTAINERS = [
  ['audit_events', 'metadata'],
  ['business_policy_versions', 'payload'],
  ['business_policy_commands', 'result'],
  ['programme_planning_commands', 'result'],
  ['reporting_statement_revisions', 'canonical_snapshot_json'],
] as const;

function ident(value: string): Prisma.Sql {
  // Callers use only the static reviewed inventory, never request/catalog values.
  if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid static deletion identifier');
  return Prisma.raw(`"${value}"`);
}

export type UserDeleteTestHookStage =
  | 'stage1_after_user_lock'
  | 'stage1_after_inspect'
  | 'stage2_after_table_lock'
  | 'stage2_after_child_locks'
  | 'stage2_after_inspect';

export type UserDeleteTestHook = (
  stage: UserDeleteTestHookStage,
  userId: string,
  tx: Db,
) => Promise<void> | void;

@Injectable()
export class UserDeleteService {
  // Test-only synchronization hook for concurrency and lock contention tests.
  public static testHook?: UserDeleteTestHook;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async preflight(id: string, actorUserId: string): Promise<UserDeletePreflightResponse> {
    // A preview is advisory; REPEATABLE READ provides one read-only snapshot.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return this.inspect(tx, id, actorUserId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
  }

  async delete(id: string, confirmUsername: string, actorUserId: string, meta: RequestMeta): Promise<UserDeleteResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        // FOR UPDATE (not NO KEY UPDATE) conflicts with FK KEY SHARE checks.
        // In READ COMMITTED the following reads see child commits that won first.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.users WHERE id = ${id}::uuid FOR UPDATE`;
        if (locked.length !== 1) throw new NotFoundException('Không tìm thấy người dùng.');
        id = locked[0].id; // Canonical DB UUID for comparisons and retained snapshots.

        if (UserDeleteService.testHook) {
          await UserDeleteService.testHook('stage1_after_user_lock', id, tx);
        }

        // STAGE 1 — PRELIMINARY ELIGIBILITY
        // Run preliminary inspection WITHOUT holding SHARE ROW EXCLUSIVE table locks.
        // If target is blocked, fail closed early without contending on global table locks.
        const stage1Preview = await this.inspect(tx, id, actorUserId);
        if (confirmUsername !== stage1Preview.username) {
          throw new BadRequestException('Tên đăng nhập xác nhận không khớp chính xác.');
        }
        if (stage1Preview.eligibility !== 'ELIGIBLE') {
          throw new ConflictException(stage1Preview);
        }

        if (UserDeleteService.testHook) {
          await UserDeleteService.testHook('stage1_after_inspect', id, tx);
        }

        // STAGE 2 — FINAL CONCURRENCY BARRIER
        // Target is provisionally eligible. Non-FK writes cannot participate in the
        // User FK lock protocol. Briefly serialize their writers, including bootstrap
        // provenance, until commit. Fixed order; lock timeout/deadlock aborts transaction.
        await tx.$executeRaw`LOCK TABLE public.audit_events, public.business_policy_commands,
          public.business_policy_versions, public.historical_teaching_import_rows,
          public.programme_planning_commands, public.reporting_statement_histories,
          public.reporting_statement_revisions, public.timetable_import_entity_aliases
          IN SHARE ROW EXCLUSIVE MODE`;

        if (UserDeleteService.testHook) {
          await UserDeleteService.testHook('stage2_after_table_lock', id, tx);
        }

        // Protect all allowlisted children from concurrent indirect FK inserts.
        await tx.$queryRaw`SELECT id FROM public.staff_profiles WHERE user_id = ${id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM public.staff_subjects WHERE user_id = ${id}::uuid ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM public.subject_group_memberships WHERE user_id = ${id}::uuid ORDER BY id FOR UPDATE`;

        if (UserDeleteService.testHook) {
          await UserDeleteService.testHook('stage2_after_child_locks', id, tx);
        }

        // Re-run COMPLETE inspect() as the authoritative final safety barrier.
        const finalPreview = await this.inspect(tx, id, actorUserId);
        if (confirmUsername !== finalPreview.username) {
          throw new BadRequestException('Tên đăng nhập xác nhận không khớp chính xác.');
        }
        if (finalPreview.eligibility !== 'ELIGIBLE') {
          throw new ConflictException(finalPreview);
        }

        if (UserDeleteService.testHook) {
          await UserDeleteService.testHook('stage2_after_inspect', id, tx);
        }

        const subjectGroups = await tx.subjectGroupMembership.deleteMany({ where: { userId: id } });
        const subjects = await tx.staffSubject.deleteMany({ where: { userId: id } });
        const profiles = await tx.staffProfile.deleteMany({ where: { userId: id } });
        const cleanupCounts = { staffProfiles: profiles.count, subjectGroupMemberships: subjectGroups.count, staffSubjects: subjects.count };
        if (JSON.stringify(cleanupCounts) !== JSON.stringify(finalPreview.cleanupCounts)) {
          throw new ConflictException('Dữ liệu thiết lập đã thay đổi; hãy kiểm tra lại.');
        }
        await tx.user.delete({ where: { id } });
        await this.audit.write({
          actorUserId, entityType: 'User', entityId: id, action: 'USER_CLEAN_SLATE_DELETED',
          result: AuditResult.SUCCESS, requestId: meta.requestId,
          metadata: { deletedUserId: id, username: finalPreview.username, displayName: finalPreview.displayName, cleanupCounts },
        }, tx);
        return { deletedUserId: id, cleanupCounts };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2010', 'P2025', 'P2028', 'P2034'].includes(error.code)) {
        throw new ConflictException('Không thể xác minh và xóa an toàn do dữ liệu hoặc giao dịch đồng thời đã thay đổi. Hãy kiểm tra lại hoặc vô hiệu hóa tài khoản.');
      }
      throw error;
    }
  }

  private async inspect(tx: Db, id: string, actorUserId: string): Promise<UserDeletePreflightResponse> {
    const user = await tx.user.findUnique({
      where: { id }, select: { id: true, username: true, status: true, lastLoginAt: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    id = user.id; // A valid route UUID may use uppercase; identity comparisons may not.
    const codes = new Set<UserDeleteBlockerCode>();
    if (id === actorUserId) codes.add('SELF');
    if (user.lastLoginAt) codes.add('LOGIN_HISTORY');
    if (!await this.verifiedGraph(tx)) {
      codes.add('UNVERIFIED_REFERENCE');
      const [shape] = await tx.$queryRaw<Array<{ readable: boolean }>>`SELECT count(*) = 2 AS readable
        FROM pg_attribute WHERE attrelid=to_regclass('public.staff_profiles')
          AND attname IN ('user_id', 'display_name') AND attnum>0 AND NOT attisdropped`;
      const names = shape.readable
        ? await tx.$queryRaw<Array<{ display_name: string }>>`SELECT display_name FROM public.staff_profiles WHERE user_id = ${id}::uuid`
        : [];
      return {
        targetUserId: id, username: user.username, displayName: names[0]?.display_name ?? user.username,
        eligibility: 'BLOCKED', blockers: [...codes].map((code) => ({ code, reason: REASONS[code] })),
        cleanupCounts: null, disableRecommended: true,
      };
    }
    const profile = await tx.staffProfile.findUnique({ where: { userId: id }, select: { id: true, displayName: true, staffCode: true } });
    const cleanupCounts = {
      staffProfiles: await tx.staffProfile.count({ where: { userId: id } }),
      subjectGroupMemberships: await tx.subjectGroupMembership.count({ where: { userId: id } }),
      staffSubjects: await tx.staffSubject.count({ where: { userId: id } }),
    };

    for (const fk of USER_DELETE_FK_INVENTORY) {
      if (fk.parent === 'users' && SETUP.has(fk.child)) continue;
      // Static migration-verified identifiers only. Composite references are
      // joined on every coordinate, not just on the child ID.
      const predicate = fk.parent === 'users'
        ? Prisma.sql`c.${ident(fk.columns[0])} = ${id}::uuid`
        : Prisma.sql`EXISTS (SELECT 1 FROM public.${ident(fk.parent)} p WHERE p.user_id = ${id}::uuid AND ${Prisma.join(fk.columns.map((col, i) => Prisma.sql`c.${ident(col)} = p.${ident(fk.refs[i])}`), ' AND ')})`;
      const rows = await tx.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`SELECT EXISTS (SELECT 1 FROM public.${ident(fk.child)} c WHERE ${predicate}) AS found`);
      if (rows[0].found) codes.add(fk.parent !== 'users' ? 'INDIRECT_HISTORY' : SECURITY.has(fk.child) ? 'SECURITY_HISTORY' : 'BUSINESS_HISTORY');
    }

    // Bootstrap identity comes from retained provenance, never a username.
    const bootstrap = await tx.auditEvent.count({ where: { action: 'AUTH_BOOTSTRAP_ADMIN_SUCCESS', entityType: 'User', entityId: id } });
    if (bootstrap > 0) codes.add('PROTECTED');

    const identities = [id,
      ...((await tx.staffProfile.findMany({ where: { userId: id }, select: { id: true } })).map((p) => p.id)),
      ...((await tx.staffSubject.findMany({ where: { userId: id }, select: { id: true } })).map((p) => p.id)),
      ...((await tx.subjectGroupMembership.findMany({ where: { userId: id }, select: { id: true } })).map((p) => p.id)),
    ];
    const textIdentities = [user.username, ...(profile?.staffCode ? [profile.staffCode] : [])];
    // Administrative receipts for allowlisted setup remain retained snapshots.
    // Prove exact action/entity/ownership/payload; never exempt actor history or
    // grant history, and never ignore an action name without its full evidence.
    const receiptObject = Prisma.sql`(CASE WHEN jsonb_typeof(c.metadata)='object' THEN c.metadata ELSE '{}'::jsonb END)`;
    const profileEditReceipt = Prisma.sql`${receiptObject} ?& ARRAY['changedFields','profileCreated']
      AND (${receiptObject} - 'changedFields' - 'profileCreated')='{}'::jsonb
      AND jsonb_typeof(${receiptObject}->'profileCreated')='boolean'
      AND jsonb_typeof(${receiptObject}->'changedFields')='array'
      AND (${receiptObject}->'changedFields') <@ '["username","profile"]'::jsonb`;
    const assignmentEditReceipt = Prisma.sql`${receiptObject} ? 'changedFields'
      AND (${receiptObject} - 'changedFields')='{}'::jsonb
      AND jsonb_typeof(${receiptObject}->'changedFields')='array'
      AND (${receiptObject}->'changedFields') <@ '["validFrom","validUntil","isPrimary"]'::jsonb`;
    const assignmentEndReceipt = Prisma.sql`${receiptObject} ?& ARRAY['previousValidUntil','newValidUntil']
      AND (${receiptObject} - 'previousValidUntil' - 'newValidUntil')='{}'::jsonb
      AND ${receiptObject}->'previousValidUntil'='null'::jsonb
      AND jsonb_typeof(${receiptObject}->'newValidUntil')='string'
      AND pg_input_is_valid(${receiptObject}->>'newValidUntil','timestamp with time zone')`;
    const retainedSetupReceipt = Prisma.sql`COALESCE((c.actor_user_id IS NOT NULL AND c.actor_user_id <> ${id}::uuid
      AND c.result='SUCCESS' AND (
        (c.entity_type='User' AND c.entity_id=${id} AND (
          (c.action='USER_CREATED' AND (c.metadata IS NULL OR c.metadata='null'::jsonb))
          OR (c.action='USER_UPDATED' AND ${profileEditReceipt})))
        OR (c.entity_type='SubjectGroupMembership' AND EXISTS (
          SELECT 1 FROM public.subject_group_memberships r WHERE r.user_id=${id}::uuid AND r.id::text=c.entity_id
            AND ((c.action='SUBJECT_GROUP_MEMBERSHIP_CREATED' AND c.metadata=jsonb_build_object('userId',r.user_id,'subjectGroupId',r.subject_group_id))
              OR (c.action='SUBJECT_GROUP_MEMBERSHIP_UPDATED' AND ${assignmentEditReceipt})
              OR (c.action='SUBJECT_GROUP_MEMBERSHIP_ENDED' AND ${assignmentEndReceipt}))))
        OR (c.entity_type='StaffSubject' AND EXISTS (
          SELECT 1 FROM public.staff_subjects r WHERE r.user_id=${id}::uuid AND r.id::text=c.entity_id
            AND ((c.action='STAFF_SUBJECT_CREATED' AND c.metadata=jsonb_build_object('userId',r.user_id,'subjectId',r.subject_id))
              OR (c.action='STAFF_SUBJECT_UPDATED' AND ${assignmentEditReceipt})
              OR (c.action='STAFF_SUBJECT_ENDED' AND ${assignmentEndReceipt}))))
      )),false)`;
    const [auditReferences] = await tx.$queryRaw<Array<{ user_history: boolean; setup_history: boolean }>>(Prisma.sql`SELECT
      EXISTS (SELECT 1 FROM public.audit_events c WHERE c.entity_type='User' AND strpos(lower(c.entity_id),${id})>0
        AND c.action <> 'AUTH_BOOTSTRAP_ADMIN_SUCCESS' AND NOT (${retainedSetupReceipt})) AS user_history,
      EXISTS (SELECT 1 FROM public.audit_events c WHERE NOT (${retainedSetupReceipt}) AND (
        (c.entity_type='StaffProfile' AND EXISTS (SELECT 1 FROM public.staff_profiles r WHERE r.user_id=${id}::uuid AND strpos(lower(c.entity_id),r.id::text)>0))
        OR (c.entity_type='StaffSubject' AND EXISTS (SELECT 1 FROM public.staff_subjects r WHERE r.user_id=${id}::uuid AND strpos(lower(c.entity_id),r.id::text)>0))
        OR (c.entity_type='SubjectGroupMembership' AND EXISTS (SELECT 1 FROM public.subject_group_memberships r WHERE r.user_id=${id}::uuid AND strpos(lower(c.entity_id),r.id::text)>0))
      )) AS setup_history`);
    if (auditReferences.user_history) codes.add('SECURITY_HISTORY');
    if (auditReferences.setup_history) codes.add('UNVERIFIED_REFERENCE');
    for (const [table, column] of NON_FK_CONTAINERS) {
      const tests = [
        ...identities.map((identity) => Prisma.sql`strpos(lower(c.${ident(column)}::text), ${identity}) > 0`),
        ...textIdentities.map((identity) => Prisma.sql`strpos(lower(c.${ident(column)}::text), ${JSON.stringify(identity.toLowerCase())}) > 0`),
      ];
      const rows = await tx.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`SELECT EXISTS (
        SELECT 1 FROM public.${ident(table)} c WHERE (${Prisma.join(tests, ' OR ')})
          ${table === 'audit_events' ? Prisma.sql`AND NOT (${retainedSetupReceipt})` : Prisma.empty}
      ) AS found`);
      if (rows[0].found) codes.add('UNVERIFIED_REFERENCE');
    }
    // Retained import/report snapshots also contain staff-code identities as
    // scalar text, while teacher import aliases may use username or staff code.
    // A reused code is ambiguous, so it must not silently bypass history proof.
    if (profile?.staffCode) {
      const [history] = await tx.$queryRaw<Array<{ found: boolean }>>`SELECT
        EXISTS (SELECT 1 FROM public.historical_teaching_import_rows WHERE lower(actual_teacher_staff_code) = lower(${profile.staffCode}))
        OR EXISTS (SELECT 1 FROM public.reporting_statement_revisions WHERE lower(submitter_staff_code_snapshot) = lower(${profile.staffCode}))
        OR EXISTS (SELECT 1 FROM public.reporting_statement_histories WHERE lower(actor_staff_code_snapshot) = lower(${profile.staffCode})) AS found`;
      if (history.found) codes.add('UNVERIFIED_REFERENCE');
    }
    const [alias] = await tx.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM public.timetable_import_entity_aliases WHERE entity_type='TEACHER' AND (
        lower(source_value) IN (${Prisma.join(textIdentities.map((identity) => identity.toLowerCase()))})
        OR lower(source_value_key) IN (${Prisma.join(textIdentities.map((identity) => identity.toLowerCase()))})
      )) AS found`);
    if (alias.found) codes.add('UNVERIFIED_REFERENCE');
    return {
      targetUserId: id, username: user.username, displayName: profile?.displayName ?? user.username,
      eligibility: codes.size === 0 ? 'ELIGIBLE' : 'BLOCKED',
      blockers: [...codes].map((code) => ({ code, reason: REASONS[code] })),
      cleanupCounts, disableRecommended: codes.size > 0,
    };
  }

  private async verifiedGraph(tx: Db): Promise<boolean> {
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
    if (schema.fingerprint !== '13031cf488b8cd86152b3e981e348bb5' || !schema.enforced) return false;
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
    return JSON.stringify(actual) === JSON.stringify(USER_DELETE_FK_INVENTORY);
  }
}
