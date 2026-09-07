import {
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
  NativeSession,
  NativeWorkbookStructure,
  ParsedClassCell,
  ParsedTeacherCell,
  TeacherSourceRowRef,
} from './damsan-native-adapter.types';

export interface ReconciledSlot {
  classSlot: ParsedClassCell;
  teacherRowRef: TeacherSourceRowRef;
  derivedTeacherCode: string;
}

export interface ReconciledTeacherRow {
  rowNumber: number;
  morningRowRef: TeacherSourceRowRef;
  afternoonRowRef: TeacherSourceRowRef;
  untrustedDisplayName: string;
  totalAllocatedSlots: number;
  morningSlotCount: number;
  afternoonSlotCount: number;
  isZeroAllocation: boolean;
  derivedTeacherCode?: string;
}

export interface NativeReconciliationResult {
  structure: NativeWorkbookStructure;
  reconciledSlots: ReconciledSlot[];
  teacherRows: Map<number, ReconciledTeacherRow>;
  activeTeacherRowCount: number;
  zeroAllocationRowCount: number;
  morningTeacherLinkedCount: number;
  afternoonTeacherLinkedCount: number;
  totalTeacherLinkedCount: number;
  permittedNonPeerCount: number;
}

function sessionCoordinateKey(session: NativeSession, day: number, period: number, classCode: string): string {
  return `${session}:D${day}P${period}:${classCode}`;
}

export function reconcileNativeWorkbook(structure: NativeWorkbookStructure): NativeReconciliationResult {
  const reconciledSlots: ReconciledSlot[] = [];
  const rowCodesMap = new Map<number, Set<string>>();
  const rowSlotCounts = new Map<number, { morning: number; afternoon: number }>();

  for (let r = 8; r <= 45; r += 1) {
    rowCodesMap.set(r, new Set());
    rowSlotCounts.set(r, { morning: 0, afternoon: 0 });
  }

  function reconcileSession(
    session: NativeSession,
    classSlots: ParsedClassCell[],
    teacherSlots: ParsedTeacherCell[],
    teacherSheetName: string,
    classSheetName: string,
  ): void {
    // 1. Index teacher slots: coordinateKey -> array of teacher slots
    const teacherIndex = new Map<string, ParsedTeacherCell[]>();
    for (const tSlot of teacherSlots) {
      const key = sessionCoordinateKey(session, tSlot.day, tSlot.period, tSlot.targetClass);
      if (!teacherIndex.has(key)) {
        teacherIndex.set(key, []);
      }
      teacherIndex.get(key)!.push(tSlot);

      const counts = rowSlotCounts.get(tSlot.teacherRowRef.rowNumber)!;
      if (session === 'MORNING') counts.morning += 1;
      else counts.afternoon += 1;
    }

    // 1b. Check for duplicate teacher claims on the same slot
    for (const [key, claims] of teacherIndex.entries()) {
      if (claims.length > 1) {
        throw new DamSanNativeTimetableException(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_DUPLICATE,
          `Multiple teachers assigned to ${key} on sheet ${teacherSheetName}.`,
          {
            sheet: teacherSheetName,
            coordinate: key,
            actual: claims.length,
            expected: 1,
          },
        );
      }
    }

    // 2. Correlate class view slots
    const classCoordinateSet = new Set<string>();
    const teacherLinkedCoordinateSet = new Set<string>();

    for (const cSlot of classSlots) {
      const coordKey = sessionCoordinateKey(session, cSlot.day, cSlot.period, cSlot.classCode);

      if (cSlot.kind === 'UNSCHEDULED') {
        continue;
      }

      classCoordinateSet.add(coordKey);

      // Check special non-peer activities (CC, GDĐP, TN-HN)
      if (cSlot.kind === 'SPECIAL_NON_PEER') {
        const teacherClaims = teacherIndex.get(coordKey);
        if (teacherClaims && teacherClaims.length > 0) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_PEER_CONFLICT,
            `Special non-peer activity ${cSlot.specialActivityCode} at ${coordKey} has an unexpected teacher assignment.`,
            {
              sheet: teacherSheetName,
              coordinate: coordKey,
              rowNumber: teacherClaims[0]!.teacherRowRef.rowNumber,
              column: teacherClaims[0]!.colNumber,
            },
          );
        }
        continue;
      }

      // Teacher-linked marker
      if (cSlot.kind === 'TEACHER_LINKED') {
        teacherLinkedCoordinateSet.add(coordKey);
        const teacherClaims = teacherIndex.get(coordKey);
        if (!teacherClaims || teacherClaims.length === 0) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_PEER_MISSING,
            `Teacher-linked lesson ${cSlot.subjectCode}-${cSlot.teacherCode} at ${coordKey} has no matching teacher in teacher view.`,
            {
              sheet: classSheetName,
              rowNumber: cSlot.rowNumber,
              column: cSlot.colNumber,
              coordinate: coordKey,
              derivedTeacherCode: cSlot.teacherCode,
            },
          );
        }

        const matchedTeacherSlot = teacherClaims[0]!;
        const rowNum = matchedTeacherSlot.teacherRowRef.rowNumber;
        rowCodesMap.get(rowNum)!.add(cSlot.teacherCode!);

        reconciledSlots.push({
          classSlot: cSlot,
          teacherRowRef: matchedTeacherSlot.teacherRowRef,
          derivedTeacherCode: cSlot.teacherCode!,
        });
      }
    }

    // 3. Inverse check (teacher -> class): ensure no orphan teacher assignments
    for (const [key, claims] of teacherIndex.entries()) {
      if (!teacherLinkedCoordinateSet.has(key)) {
        const claim = claims[0]!;
        throw new DamSanNativeTimetableException(
          DamSanNativeErrorCode.TKB_NATIVE_PEER_ORPHAN,
          `Teacher view assigns teacher at ${key}, but class view has no matching teacher-linked lesson.`,
          {
            sheet: teacherSheetName,
            rowNumber: claim.teacherRowRef.rowNumber,
            column: claim.colNumber,
            coordinate: key,
          },
        );
      }
    }
  }

  // Reconcile Morning and Afternoon independently
  reconcileSession(
    'MORNING',
    structure.morningClassSlots,
    structure.morningTeacherSlots,
    structure.morningTeacherSlots[0]?.teacherRowRef.sheet ?? 'TKB-GV-SANG',
    'TKB THEO LỚP BUỔI SÁNG',
  );
  reconcileSession(
    'AFTERNOON',
    structure.afternoonClassSlots,
    structure.afternoonTeacherSlots,
    structure.afternoonTeacherSlots[0]?.teacherRowRef.sheet ?? 'TKB-GV-CHIỀU',
    'TKB THEO LỚP BUỔI CHIỀU',
  );

  // 4. Derive TeacherCode per active teacher row and check consistency
  const teacherRows = new Map<number, ReconciledTeacherRow>();
  let activeTeacherRowCount = 0;
  let zeroAllocationRowCount = 0;

  for (let r = 8; r <= 45; r += 1) {
    const codes = rowCodesMap.get(r)!;
    const counts = rowSlotCounts.get(r)!;
    const totalAllocatedSlots = counts.morning + counts.afternoon;
    const morningRowInfo = structure.morningTeacherRows.get(r)!;
    const afternoonRowInfo = structure.afternoonTeacherRows.get(r)!;

    if (totalAllocatedSlots === 0) {
      zeroAllocationRowCount += 1;
      teacherRows.set(r, {
        rowNumber: r,
        morningRowRef: morningRowInfo.rowRef,
        afternoonRowRef: afternoonRowInfo.rowRef,
        untrustedDisplayName: morningRowInfo.untrustedDisplayName,
        totalAllocatedSlots: 0,
        morningSlotCount: 0,
        afternoonSlotCount: 0,
        isZeroAllocation: true,
      });
      continue;
    }

    if (codes.size !== 1) {
      throw new DamSanNativeTimetableException(
        DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
        `Teacher source row ${r} matched multiple distinct teacher codes: ${[...codes].join(', ')}.`,
        {
          rowNumber: r,
          actual: [...codes].join(','),
        },
      );
    }

    const derivedCode = [...codes][0]!;
    activeTeacherRowCount += 1;
    teacherRows.set(r, {
      rowNumber: r,
      morningRowRef: morningRowInfo.rowRef,
      afternoonRowRef: afternoonRowInfo.rowRef,
      untrustedDisplayName: morningRowInfo.untrustedDisplayName,
      totalAllocatedSlots,
      morningSlotCount: counts.morning,
      afternoonSlotCount: counts.afternoon,
      isZeroAllocation: false,
      derivedTeacherCode: derivedCode,
    });
  }

  const morningTeacherLinkedCount = reconciledSlots.filter((s) => s.classSlot.session === 'MORNING').length;
  const afternoonTeacherLinkedCount = reconciledSlots.filter((s) => s.classSlot.session === 'AFTERNOON').length;
  const permittedNonPeerCount = structure.morningClassSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER').length
    + structure.afternoonClassSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER').length;

  return {
    structure,
    reconciledSlots,
    teacherRows,
    activeTeacherRowCount,
    zeroAllocationRowCount,
    morningTeacherLinkedCount,
    afternoonTeacherLinkedCount,
    totalTeacherLinkedCount: reconciledSlots.length,
    permittedNonPeerCount,
  };
}
