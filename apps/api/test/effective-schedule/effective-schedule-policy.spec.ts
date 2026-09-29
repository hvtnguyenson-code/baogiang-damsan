import {
  comparisonStateToVietnamese,
  intervalsOverlap,
  normalizeTimeString,
  occupancyStateToVietnamese,
  sourceKindToVietnamese,
} from '../../src/effective-schedule/effective-schedule-policy';

describe('effective-schedule-policy', () => {
  describe('normalizeTimeString', () => {
    it('normalizes Date objects and time strings', () => {
      const d = new Date('1970-01-01T07:15:30.000Z');
      expect(normalizeTimeString(d)).toBe('07:15:30');
      expect(normalizeTimeString('07:15')).toBe('07:15:00');
      expect(normalizeTimeString('07:15:00')).toBe('07:15:00');
    });
  });

  describe('intervalsOverlap (item 17: real-interval overlap comparison)', () => {
    it('returns true when real intervals overlap in half-open domain [start, end)', () => {
      // [07:00, 07:45) and [07:30, 08:15) overlap
      expect(intervalsOverlap('07:00:00', '07:45:00', '07:30:00', '08:15:00')).toBe(true);
      // [07:30, 08:15) and [07:00, 07:45) overlap (symmetric)
      expect(intervalsOverlap('07:30:00', '08:15:00', '07:00:00', '07:45:00')).toBe(true);
      // completely contained
      expect(intervalsOverlap('07:00:00', '08:30:00', '07:15:00', '07:45:00')).toBe(true);
    });

    it('returns false when intervals are strictly disjoint', () => {
      expect(intervalsOverlap('07:00:00', '07:45:00', '08:00:00', '08:45:00')).toBe(false);
      expect(intervalsOverlap('08:00:00', '08:45:00', '07:00:00', '07:45:00')).toBe(false);
    });

    it('returns false for touching boundaries at exact half-open endpoint (07:45 boundary)', () => {
      // [07:00, 07:45) and [07:45, 08:30) do NOT overlap
      expect(intervalsOverlap('07:00:00', '07:45:00', '07:45:00', '08:30:00')).toBe(false);
      expect(intervalsOverlap('07:45:00', '08:30:00', '07:00:00', '07:45:00')).toBe(false);
    });

    it('works with Date objects', () => {
      const d = (t: string) => new Date(`1970-01-01T${t}Z`);
      expect(intervalsOverlap(d('07:00:00'), d('07:45:00'), d('07:30:00'), d('08:00:00'))).toBe(true);
      expect(intervalsOverlap(d('07:00:00'), d('07:45:00'), d('07:45:00'), d('08:30:00'))).toBe(false);
    });
  });

  describe('Vietnamese presentation mappings (item 20)', () => {
    it('maps all source kinds to Vietnamese labels', () => {
      expect(sourceKindToVietnamese('BASE_TIMETABLE')).toBe('Lịch cơ sở');
      expect(sourceKindToVietnamese('SAME_SUBJECT_SUBSTITUTION')).toBe('Dạy thay (cùng môn)');
      expect(sourceKindToVietnamese('DIFFERENT_SUBJECT_SUPERVISION')).toBe('Coi thay (khác môn)');
      expect(sourceKindToVietnamese('MAKEUP_TEACHING')).toBe('Dạy bù');
      expect(sourceKindToVietnamese('SPECIAL_ACTIVITY')).toBe('Hoạt động chuyên biệt');
    });

    it('falls back safely for unknown/unsupported source kind without leaking raw enums', () => {
      expect(sourceKindToVietnamese('UNKNOWN_ENUM' as never)).toBe('Không xác định');
      expect(sourceKindToVietnamese(null)).toBe('Không xác định');
      expect(sourceKindToVietnamese(undefined)).toBe('Không xác định');
    });

    it('maps comparison states to descriptive Vietnamese facts', () => {
      expect(comparisonStateToVietnamese('BOTH_BUSY')).toBe('Cả hai đều bận');
      expect(comparisonStateToVietnamese('BOTH_FREE')).toBe('Cả hai đều trống');
      expect(comparisonStateToVietnamese('SELF_BUSY_PEER_FREE')).toBe('Tôi bận / Đồng nghiệp trống');
      expect(comparisonStateToVietnamese('SELF_FREE_PEER_BUSY')).toBe('Tôi trống / Đồng nghiệp bận');
      expect(comparisonStateToVietnamese('BLOCKED')).toBe('Dữ liệu bị chặn / Không thể xác định');
      expect(comparisonStateToVietnamese('UNKNOWN_STATE' as never)).toBe('Không xác định');
    });

    it('maps occupancy states to Vietnamese', () => {
      expect(occupancyStateToVietnamese('OCCUPIED')).toBe('Có tiết');
      expect(occupancyStateToVietnamese('FREE')).toBe('Trống');
      expect(occupancyStateToVietnamese('BLOCKED')).toBe('Bị chặn');
      expect(occupancyStateToVietnamese(null)).toBe('Không xác định');
    });
  });
});
