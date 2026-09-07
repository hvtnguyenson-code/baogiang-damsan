import {
  DAMSAN_NATIVE_BOUNDARIES,
  DAMSAN_NATIVE_SHEETS,
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
  NativeSession,
  NativeWorkbookStructure,
  ParsedClassCell,
  ParsedTeacherCell,
  TeacherSourceRowRef,
  teacherSourceRowRefKey,
} from './damsan-native-adapter.types';

export interface ReconciledSlot {
  classSlot: ParsedClassCell;
  teacherRowRef: TeacherSourceRowRef;
  derivedTeacherCode: string;
}

export interface ReconciledTeacherRow {
  refKey: string;
  rowRef: TeacherSourceRowRef;
  untrustedDisplayName: string;
  totalAllocatedSlots: number;
  isZeroAllocation: boolean;
  derivedTeacherCode?: string;
}

export interface NativeReconciliationResult {
  structure: NativeWorkbookStructure;
  reconciledSlots: ReconciledSlot[];
  teacherRows: Map<string, ReconciledTeacherRow>;
  sourceRows: Map<string, ReconciledTeacherRow>;
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

  const morningSheetName = structure.morningTeacherSlots[0]?.teacherRowRef.sheet ?? DAMSAN_NATIVE_SHEETS.MORNING_TEACHER;
  const afternoonSheetName = structure.afternoonTeacherSlots[0]?.teacherRowRef.sheet ?? DAMSAN_NATIVE_SHEETS.AFTERNOON_TEACHER;

  const refCodesMap = new Map<string, Set<string>>();
  const refSlotCounts = new Map<string, number>();

  for (let r = DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_START; r <= DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_END; r += 1) {
    const mKey = teacherSourceRowRefKey({ sheet: morningSheetName, rowNumber: r });
    const aKey = teacherSourceRowRefKey({ sheet: afternoonSheetName, rowNumber: r });
    refCodesMap.set(mKey, new Set());
    refCodesMap.set(aKey, new Set());
    refSlotCounts.set(mKey, 0);
    refSlotCounts.set(aKey, 0);
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

      const refKey = teacherSourceRowRefKey(tSlot.teacherRowRef);
      refSlotCounts.set(refKey, (refSlotCounts.get(refKey) ?? 0) + 1);
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
        const refKey = teacherSourceRowRefKey(matchedTeacherSlot.teacherRowRef);
        refCodesMap.get(refKey)!.add(cSlot.teacherCode!);

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
    morningSheetName,
    DAMSAN_NATIVE_SHEETS.MORNING_CLASS,
  );
  reconcileSession(
    'AFTERNOON',
    structure.afternoonClassSlots,
    structure.afternoonTeacherSlots,
    afternoonSheetName,
    DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS,
  );

  // 4. Derive TeacherCode per active TeacherSourceRowRef independently
  const sourceRows = new Map<string, ReconciledTeacherRow>();
  let activeTeacherRowCount = 0;
  let zeroAllocationRowCount = 0;

  for (let r = DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_START; r <= DAMSAN_NATIVE_BOUNDARIES.TEACHER_ROW_END; r += 1) {
    const morningRowInfo = structure.morningTeacherRows.get(r)!;
    const afternoonRowInfo = structure.afternoonTeacherRows.get(r)!;
    const mKey = teacherSourceRowRefKey(morningRowInfo.rowRef);
    const aKey = teacherSourceRowRefKey(afternoonRowInfo.rowRef);

    const mCount = refSlotCounts.get(mKey) ?? 0;
    const aCount = refSlotCounts.get(aKey) ?? 0;
    const mCodes = refCodesMap.get(mKey)!;
    const aCodes = refCodesMap.get(aKey)!;

    // Morning source row ref derivation
    if (mCount === 0) {
      sourceRows.set(mKey, {
        refKey: mKey,
        rowRef: morningRowInfo.rowRef,
        untrustedDisplayName: morningRowInfo.untrustedDisplayName,
        totalAllocatedSlots: 0,
        isZeroAllocation: true,
      });
    } else {
      if (mCodes.size !== 1) {
        throw new DamSanNativeTimetableException(
          DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
          `Teacher source row ${morningRowInfo.rowRef.sheet} Row ${r} matched multiple distinct teacher codes: ${[...mCodes].join(', ')}.`,
          {
            sheet: morningRowInfo.rowRef.sheet,
            rowNumber: r,
            actual: [...mCodes].join(','),
            derivedTeacherCode: [...mCodes].join(','),
          },
        );
      }
      sourceRows.set(mKey, {
        refKey: mKey,
        rowRef: morningRowInfo.rowRef,
        untrustedDisplayName: morningRowInfo.untrustedDisplayName,
        totalAllocatedSlots: mCount,
        isZeroAllocation: false,
        derivedTeacherCode: [...mCodes][0]!,
      });
    }

    // Afternoon source row ref derivation
    if (aCount === 0) {
      sourceRows.set(aKey, {
        refKey: aKey,
        rowRef: afternoonRowInfo.rowRef,
        untrustedDisplayName: afternoonRowInfo.untrustedDisplayName,
        totalAllocatedSlots: 0,
        isZeroAllocation: true,
      });
    } else {
      if (aCodes.size !== 1) {
        throw new DamSanNativeTimetableException(
          DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
          `Teacher source row ${afternoonRowInfo.rowRef.sheet} Row ${r} matched multiple distinct teacher codes: ${[...aCodes].join(', ')}.`,
          {
            sheet: afternoonRowInfo.rowRef.sheet,
            rowNumber: r,
            actual: [...aCodes].join(','),
            derivedTeacherCode: [...aCodes].join(','),
          },
        );
      }
      sourceRows.set(aKey, {
        refKey: aKey,
        rowRef: afternoonRowInfo.rowRef,
        untrustedDisplayName: afternoonRowInfo.untrustedDisplayName,
        totalAllocatedSlots: aCount,
        isZeroAllocation: false,
        derivedTeacherCode: [...aCodes][0]!,
      });
    }

    const physicalAllocated = mCount + aCount;
    if (physicalAllocated === 0) {
      zeroAllocationRowCount += 1;
    } else {
      activeTeacherRowCount += 1;
    }
  }

  const morningTeacherLinkedCount = reconciledSlots.filter((s) => s.classSlot.session === 'MORNING').length;
  const afternoonTeacherLinkedCount = reconciledSlots.filter((s) => s.classSlot.session === 'AFTERNOON').length;
  const permittedNonPeerCount = structure.morningClassSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER').length
    + structure.afternoonClassSlots.filter((s) => s.kind === 'SPECIAL_NON_PEER').length;

  return {
    structure,
    reconciledSlots,
    teacherRows: sourceRows,
    sourceRows,
    activeTeacherRowCount,
    zeroAllocationRowCount,
    morningTeacherLinkedCount,
    afternoonTeacherLinkedCount,
    totalTeacherLinkedCount: reconciledSlots.length,
    permittedNonPeerCount,
  };
}
