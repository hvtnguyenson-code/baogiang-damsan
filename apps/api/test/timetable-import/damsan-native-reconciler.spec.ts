import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AcademicWeekday } from '@prisma/client';
import {
  DAMSAN_NATIVE_SHEETS,
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
  NativeWorkbookStructure,
  teacherSourceRowRefKey,
} from '../../src/timetable-import/damsan-native-adapter.types';
import { validateAndExtractWorkbookStructure } from '../../src/timetable-import/damsan-native-parser';
import { reconcileNativeWorkbook } from '../../src/timetable-import/damsan-native-reconciler';
import { parseWorkbookBuffer } from '../../src/timetable-import/workbook-parser.worker';

describe('DamSanNativeReconciler (Checkpoint B - Peer Reconciliation & TeacherCode Derivation)', () => {
  const fixturePath = resolve(__dirname, '../fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx');
  let baseStructure: NativeWorkbookStructure;

  beforeAll(async () => {
    const fixtureBuffer = readFileSync(fixturePath);
    const parsedFixture = await parseWorkbookBuffer(fixtureBuffer);
    baseStructure = validateAndExtractWorkbookStructure(parsedFixture);
  });

  function cloneStructure(structure: NativeWorkbookStructure): NativeWorkbookStructure {
    return {
      effectiveDate: structure.effectiveDate,
      morningClasses: [...structure.morningClasses],
      afternoonClasses: [...structure.afternoonClasses],
      morningClassSlots: structure.morningClassSlots.map((s) => ({ ...s })),
      afternoonClassSlots: structure.afternoonClassSlots.map((s) => ({ ...s })),
      morningTeacherSlots: structure.morningTeacherSlots.map((s) => ({
        ...s,
        teacherRowRef: { ...s.teacherRowRef },
      })),
      afternoonTeacherSlots: structure.afternoonTeacherSlots.map((s) => ({
        ...s,
        teacherRowRef: { ...s.teacherRowRef },
      })),
      morningTeacherRows: new Map(
        [...structure.morningTeacherRows.entries()].map(([k, v]) => [k, { ...v, rowRef: { ...v.rowRef } }]),
      ),
      afternoonTeacherRows: new Map(
        [...structure.afternoonTeacherRows.entries()].map(([k, v]) => [k, { ...v, rowRef: { ...v.rowRef } }]),
      ),
    };
  }

  describe('Sanitized Fixture Full Reconciliation (Positive)', () => {
    it('reconciles sanitized fixture with 0 duplicates, 0 orphans, 455 teacher-linked slots and 1 zero-allocation row', () => {
      const result = reconcileNativeWorkbook(baseStructure);

      expect(result.morningTeacherLinkedCount).toBe(402);
      expect(result.afternoonTeacherLinkedCount).toBe(53);
      expect(result.totalTeacherLinkedCount).toBe(455);
      expect(result.permittedNonPeerCount).toBe(120);
      expect(result.activeTeacherRowCount).toBe(37);
      expect(result.zeroAllocationRowCount).toBe(1);

      // Verify zero-allocation row 25 on both sheets
      const row25Morning = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.MORNING_TEACHER, rowNumber: 25 }))!;
      expect(row25Morning).toBeDefined();
      expect(row25Morning.isZeroAllocation).toBe(true);
      expect(row25Morning.totalAllocatedSlots).toBe(0);
      expect(row25Morning.derivedTeacherCode).toBeUndefined();

      const row25Afternoon = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 25 }))!;
      expect(row25Afternoon).toBeDefined();
      expect(row25Afternoon.isZeroAllocation).toBe(true);
      expect(row25Afternoon.totalAllocatedSlots).toBe(0);
      expect(row25Afternoon.derivedTeacherCode).toBeUndefined();

      // Verify all active rows derived exactly 1 distinct code
      for (const rowInfo of result.sourceRows.values()) {
        if (rowInfo.isZeroAllocation) {
          expect(rowInfo.derivedTeacherCode).toBeUndefined();
        } else {
          expect(rowInfo.derivedTeacherCode).toMatch(/^GV\d{2}$/);
          expect(rowInfo.totalAllocatedSlots).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Bidirectional Reconciliation & Peer Integrity (Negative Tests)', () => {
    it('throws TKB_NATIVE_PEER_MISSING when a class teacher-linked slot has no teacher peer', () => {
      const struct = cloneStructure(baseStructure);
      // Remove teacher slot matching first morning class teacher-linked slot
      const firstTeacherLinked = struct.morningClassSlots.find((s) => s.kind === 'TEACHER_LINKED')!;
      struct.morningTeacherSlots = struct.morningTeacherSlots.filter(
        (t) => !(t.day === firstTeacherLinked.day && t.period === firstTeacherLinked.period && t.targetClass === firstTeacherLinked.classCode),
      );

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        const err = error as DamSanNativeTimetableException;
        expect(err.errorCode).toBe(DamSanNativeErrorCode.TKB_NATIVE_PEER_MISSING);
        expect(err.safeEvidence?.coordinate).toContain(firstTeacherLinked.classCode);
      }
    });

    it('throws TKB_NATIVE_PEER_MISSING when SH-* marker lacks a teacher peer', () => {
      const struct = cloneStructure(baseStructure);
      const shSlot = struct.morningClassSlots.find((s) => s.subjectCode === 'SH')!;
      struct.morningTeacherSlots = struct.morningTeacherSlots.filter(
        (t) => !(t.day === shSlot.day && t.period === shSlot.period && t.targetClass === shSlot.classCode),
      );

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_MISSING,
        );
      }
    });

    it('throws TKB_NATIVE_PEER_DUPLICATE when multiple teacher rows claim the same session slot', () => {
      const struct = cloneStructure(baseStructure);
      // Duplicate an existing teacher slot onto row 25
      const originalSlot = struct.morningTeacherSlots[0]!;
      struct.morningTeacherSlots.push({
        ...originalSlot,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 25 },
        rowNumber: 25,
      });

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_DUPLICATE,
        );
      }
    });

    it('throws TKB_NATIVE_PEER_ORPHAN when teacher view assigns a slot that is blank in class view', () => {
      const struct = cloneStructure(baseStructure);
      // Find Saturday Period 5 for 10A1 which is blank, and add a teacher slot claiming it
      const blankClassSlot = struct.morningClassSlots.find((s) => s.kind === 'UNSCHEDULED')!;
      struct.morningTeacherSlots.push({
        session: 'MORNING',
        day: blankClassSlot.day,
        weekday: AcademicWeekday.SATURDAY,
        period: blankClassSlot.period,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 8 },
        rowNumber: 8,
        colNumber: 31,
        targetClass: blankClassSlot.classCode,
      });

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_ORPHAN,
        );
      }
    });

    it('throws TKB_NATIVE_PEER_CONFLICT when teacher view claims a slot occupied by CC (Chào cờ)', () => {
      const struct = cloneStructure(baseStructure);
      const ccSlot = struct.morningClassSlots.find((s) => s.specialActivityCode === 'CC')!;
      struct.morningTeacherSlots.push({
        session: 'MORNING',
        day: ccSlot.day,
        weekday: ccSlot.weekday,
        period: ccSlot.period,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 8 },
        rowNumber: 8,
        colNumber: 2,
        targetClass: ccSlot.classCode,
      });

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_CONFLICT,
        );
      }
    });

    it('throws TKB_NATIVE_PEER_CONFLICT when teacher view claims a slot occupied by GDĐP', () => {
      const struct = cloneStructure(baseStructure);
      const gddpSlot = struct.morningClassSlots.find((s) => s.specialActivityCode === 'GDĐP')!;
      struct.morningTeacherSlots.push({
        session: 'MORNING',
        day: gddpSlot.day,
        weekday: gddpSlot.weekday,
        period: gddpSlot.period,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 9 },
        rowNumber: 9,
        colNumber: 5,
        targetClass: gddpSlot.classCode,
      });

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_CONFLICT,
        );
      }
    });

    it('throws TKB_NATIVE_PEER_CONFLICT when teacher view claims a slot occupied by TN-HN', () => {
      const struct = cloneStructure(baseStructure);
      const tnhnSlot = struct.morningClassSlots.find((s) => s.specialActivityCode === 'TN-HN')!;
      struct.morningTeacherSlots.push({
        session: 'MORNING',
        day: tnhnSlot.day,
        weekday: tnhnSlot.weekday,
        period: tnhnSlot.period,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 10 },
        rowNumber: 10,
        colNumber: 28,
        targetClass: tnhnSlot.classCode,
      });

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_CONFLICT,
        );
      }
    });
  });

  describe('TeacherCode Derivation & Integrity', () => {
    it('throws TKB_NATIVE_TEACHER_CODE_CONFLICT when one teacher row derives two distinct teacher codes', () => {
      const struct = cloneStructure(baseStructure);
      // Find two class slots assigned to teacher row 8, change teacherCode of one of them to GV99
      const row8TeacherSlots = struct.morningTeacherSlots.filter((t) => t.rowNumber === 8);
      const slotToModify = struct.morningClassSlots.find(
        (c) => c.day === row8TeacherSlots[0]!.day && c.period === row8TeacherSlots[0]!.period && c.classCode === row8TeacherSlots[0]!.targetClass,
      )!;
      slotToModify.teacherCode = 'GV99';

      expect(() => reconcileNativeWorkbook(struct)).toThrow(DamSanNativeTimetableException);
      try {
        reconcileNativeWorkbook(struct);
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        expect((error as DamSanNativeTimetableException).errorCode).toBe(
          DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
        );
        expect((error as DamSanNativeTimetableException).safeEvidence?.rowNumber).toBe(8);
      }
    });

    it('passes and treats zero-allocation row as inert roster evidence even with arbitrary display text', () => {
      const struct = cloneStructure(baseStructure);
      // Row 25 has 0 allocations, set arbitrary display text
      struct.morningTeacherRows.get(25)!.untrustedDisplayName = 'NGƯỜI KHÔNG CÓ TRONG DANH SÁCH GIÁO VIÊN 12345';
      struct.afternoonTeacherRows.get(25)!.untrustedDisplayName = 'ANOTHER ARBITRARY STRING';

      const result = reconcileNativeWorkbook(struct);
      expect(result.zeroAllocationRowCount).toBe(1);
      const r25M = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.MORNING_TEACHER, rowNumber: 25 }))!;
      expect(r25M.isZeroAllocation).toBe(true);
      expect(r25M.derivedTeacherCode).toBeUndefined();
      const r25A = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 25 }))!;
      expect(r25A.isZeroAllocation).toBe(true);
      expect(r25A.derivedTeacherCode).toBeUndefined();
    });

    it('changing Column A teacher display text does not alter derived TeacherCode or reconciliation result', () => {
      const struct = cloneStructure(baseStructure);
      // Change display name of row 8
      struct.morningTeacherRows.get(8)!.untrustedDisplayName = 'TÊN GIÁO VIÊN ĐÃ BỊ ĐỔI HOÀN TOÀN';
      const result = reconcileNativeWorkbook(struct);
      const r8 = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.MORNING_TEACHER, rowNumber: 8 }))!;
      expect(r8.derivedTeacherCode).toBe('GV01');
      expect(result.activeTeacherRowCount).toBe(37);
    });

    it('does not reject a valid scheduled Saturday Period 5 slot (non-overfitting rule)', () => {
      const struct = cloneStructure(baseStructure);
      // Find Saturday Period 5 for 10A1, convert from UNSCHEDULED to TEACHER_LINKED with teacher row 8
      const satP5Slot = struct.morningClassSlots.find(
        (s) => s.day === 7 && s.period === 5 && s.classCode === '10A1',
      )!;
      satP5Slot.kind = 'TEACHER_LINKED';
      satP5Slot.subjectCode = 'TO';
      satP5Slot.teacherCode = 'GV01';

      // Add matching teacher slot on row 8
      struct.morningTeacherSlots.push({
        session: 'MORNING',
        day: 7,
        weekday: AcademicWeekday.SATURDAY,
        period: 5,
        teacherRowRef: { sheet: 'TKB-GV-SANG', rowNumber: 8 },
        rowNumber: 8,
        colNumber: 31,
        targetClass: '10A1',
      });

      const result = reconcileNativeWorkbook(struct);
      expect(result.totalTeacherLinkedCount).toBe(456); // 455 + 1
      const reconciledSatP5 = result.reconciledSlots.find(
        (s) => s.classSlot.day === 7 && s.classSlot.period === 5 && s.classSlot.classCode === '10A1',
      );
      expect(reconciledSatP5).toBeDefined();
      expect(reconciledSatP5!.derivedTeacherCode).toBe('GV01');
    });

    it('public error payload does not leak Column A display name', () => {
      const struct = cloneStructure(baseStructure);
      struct.morningTeacherRows.get(8)!.untrustedDisplayName = 'SECRET_PII_TEACHER_NAME_SHOULD_NEVER_LEAK';

      // Cause a conflict on row 8
      const r8Slots = struct.morningTeacherSlots.filter((t) => t.rowNumber === 8);
      const slot = struct.morningClassSlots.find(
        (c) => c.day === r8Slots[0]!.day && c.period === r8Slots[0]!.period && c.classCode === r8Slots[0]!.targetClass,
      )!;
      slot.teacherCode = 'GV99';

      try {
        reconcileNativeWorkbook(struct);
        fail('Should have thrown TKB_NATIVE_TEACHER_CODE_CONFLICT');
      } catch (error) {
        expect(error).toBeInstanceOf(DamSanNativeTimetableException);
        const err = error as DamSanNativeTimetableException;
        const responseJson = JSON.stringify(err.getResponse());
        expect(responseJson).not.toContain('SECRET_PII_TEACHER_NAME');
      }
    });

    it('derives TeacherCode independently per TeacherSourceRowRef without cross-sheet rowNumber collapse (Finding 1)', () => {
      const struct = cloneStructure(baseStructure);
      // Row 8 in Morning derives GV01 from existing morning slots.
      // In Afternoon, row 8 has 0 allocations in the baseline fixture.
      // Add a valid afternoon teacher slot on row 8 pointing to 10A1, and matching afternoon class slot with teacherCode GV02.
      const targetClass = '10A1';
      const day = 2; // Monday
      const period = 1;
      const classSlot = struct.afternoonClassSlots.find(
        (c) => c.day === day && c.period === period && c.classCode === targetClass,
      )!;
      classSlot.kind = 'TEACHER_LINKED';
      classSlot.subjectCode = 'TO';
      classSlot.teacherCode = 'GV02';

      struct.afternoonTeacherSlots.push({
        session: 'AFTERNOON',
        day,
        weekday: AcademicWeekday.MONDAY,
        period,
        teacherRowRef: { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 8 },
        rowNumber: 8,
        colNumber: 2,
        targetClass,
      });

      // Reconcile must PASS without TKB_NATIVE_TEACHER_CODE_CONFLICT
      const result = reconcileNativeWorkbook(struct);
      const morningRow8 = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.MORNING_TEACHER, rowNumber: 8 }))!;
      const afternoonRow8 = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 8 }))!;

      expect(morningRow8.derivedTeacherCode).toBe('GV01');
      expect(afternoonRow8.derivedTeacherCode).toBe('GV02');
      expect(morningRow8.derivedTeacherCode).not.toBe(afternoonRow8.derivedTeacherCode);
    });

    it('same row number deriving same code on both morning and afternoon remains valid (Finding 1)', () => {
      const struct = cloneStructure(baseStructure);
      // In Afternoon, add a valid teacher slot on row 8 pointing to 10A1, with teacherCode GV01 (same as Morning row 8)
      const targetClass = '10A1';
      const day = 2; // Monday
      const period = 1;
      const classSlot = struct.afternoonClassSlots.find(
        (c) => c.day === day && c.period === period && c.classCode === targetClass,
      )!;
      classSlot.kind = 'TEACHER_LINKED';
      classSlot.subjectCode = 'TO';
      classSlot.teacherCode = 'GV01';

      struct.afternoonTeacherSlots.push({
        session: 'AFTERNOON',
        day,
        weekday: AcademicWeekday.MONDAY,
        period,
        teacherRowRef: { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 8 },
        rowNumber: 8,
        colNumber: 2,
        targetClass,
      });

      const result = reconcileNativeWorkbook(struct);
      const morningRow8 = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.MORNING_TEACHER, rowNumber: 8 }))!;
      const afternoonRow8 = result.sourceRows.get(teacherSourceRowRefKey({ sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER, rowNumber: 8 }))!;

      expect(morningRow8.derivedTeacherCode).toBe('GV01');
      expect(afternoonRow8.derivedTeacherCode).toBe('GV01');
    });
  });
});
