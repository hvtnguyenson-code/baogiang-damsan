import type { ScopedCapability } from '@baogiang/contracts';
import { describe, expect, it } from 'vitest';
import { canAccessDataReadinessCenter } from '../lib/capabilities';
import { NAVIGATION_REGISTRY } from '../lib/navigation-registry';

describe('P5-055 Data Readiness Center Navigation & Capability Gating', () => {
  it('registers /quan-tri/san-sang-du-lieu in NAVIGATION_REGISTRY under academic-data', () => {
    const item = NAVIGATION_REGISTRY.find((nav) => nav.to === '/quan-tri/san-sang-du-lieu');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Trung tâm sẵn sàng dữ liệu');
    expect(item?.familyId).toBe('academic-data');
    expect(item?.isMatchActive?.('/quan-tri/san-sang-du-lieu')).toBe(true);
    expect(item?.isMatchActive?.('/quan-tri/san-sang-du-lieu/chi-tiet')).toBe(true);
    expect(item?.isMatchActive?.('/quan-tri/khac')).toBe(false);
  });

  describe('canAccessDataReadinessCenter', () => {
    it('allows Principal with APPROVAL_PRINCIPAL SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows Vice Principal with APPROVAL_VICE_PRINCIPAL SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows Timetable manager with TIMETABLE_MANAGE SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'TIMETABLE_MANAGE', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows PPCT manager with PPCT_MANAGE SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'PPCT_MANAGE', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows User manager with USER_MANAGE SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows Academic structure manager with ACADEMIC_STRUCTURE_MANAGE SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('allows Teaching execution manager with TEACHING_EXECUTION_MANAGE SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'TEACHING_EXECUTION_MANAGE', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(true);
    });

    it('rejects System admin with only SYSTEM_ADMIN SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(false);
    });

    it('rejects ordinary teacher with only TEACHER_BASE PERSONAL', () => {
      const caps: ScopedCapability[] = [{ key: 'TEACHER_BASE', scope: 'PERSONAL' }];
      expect(canAccessDataReadinessCenter(caps)).toBe(false);
    });

    it('rejects empty capabilities', () => {
      expect(canAccessDataReadinessCenter([])).toBe(false);
    });

    it('rejects capabilities with PERSONAL or non-school scope', () => {
      const caps: ScopedCapability[] = [
        { key: 'APPROVAL_PRINCIPAL', scope: 'PERSONAL' },
        { key: 'USER_MANAGE', scope: 'SUBJECT' },
      ];
      expect(canAccessDataReadinessCenter(caps)).toBe(false);
    });
  });
});
