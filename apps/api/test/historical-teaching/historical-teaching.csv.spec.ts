import { parseHistoricalTeachingCsv } from '../../src/historical-teaching/historical-teaching.csv';

const header = 'LOP,MON,NGAY_GOC,BUOI_GOC,TIET_GOC,GIAO_VIEN_THUC_DAY,LOAI,NGAY_DAY_THUC_TE,BUOI_THUC_TE,TIET_THUC_TE,GHI_CHU';

describe('historical teaching CSV parser', () => {
  it('parses normalized Vietnamese aliases without exposing technical ids', () => {
    const result = parseHistoricalTeachingCsv([
      header,
      '10A1,DIA,2026-09-07,SANG,1,GV001,BINH_THUONG,,,,"Đã dạy"',
    ].join('\n'));

    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      schoolClassCode: '10A1',
      subjectCode: 'DIA',
      sourceCivilDate: '2026-09-07',
      sourceSession: 'MORNING',
      sourceOrdinal: 1,
      actualTeacherStaffCode: 'GV001',
      kind: 'NORMAL',
      executionCivilDate: '2026-09-07',
      executionSession: 'MORNING',
      executionOrdinal: 1,
      note: 'Đã dạy',
    });
    expect(result.rows[0]!.rowRef).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('accepts tab-separated rows copied directly from a spreadsheet', () => {
    const tsvHeader = header.replaceAll(',', '\t');
    const result = parseHistoricalTeachingCsv([
      tsvHeader,
      ['10A1', 'DIA', '2026-09-07', 'SANG', '1', 'GV001', 'BINH_THUONG', '', '', '', 'Dán từ Excel'].join('\t'),
    ].join('\n'));

    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      schoolClassCode: '10A1',
      subjectCode: 'DIA',
      kind: 'NORMAL',
      actualTeacherStaffCode: 'GV001',
      note: 'Dán từ Excel',
    });
  });

  it('requires an explicit target for DAY_BU', () => {
    const result = parseHistoricalTeachingCsv([
      header,
      '10A1,DIA,2026-09-07,SANG,1,GV001,DAY_BU,,,,',
    ].join('\n'));

    expect(result.rows).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toContain('HISTORY_MAKEUP_TARGET_REQUIRED');
  });

  it('rejects target drift for BINH_THUONG and DAY_THAY', () => {
    const result = parseHistoricalTeachingCsv([
      header,
      '10A1,DIA,2026-09-07,SANG,1,GV001,DAY_THAY,2026-09-08,SANG,1,',
    ].join('\n'));

    expect(result.rows).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toContain('HISTORY_NON_MAKEUP_TARGET_MISMATCH');
  });

  it('rejects invalid civil dates and invalid kind', () => {
    const result = parseHistoricalTeachingCsv([
      header,
      '10A1,DIA,2026-02-31,SANG,1,GV001,TU_Y,2026-02-31,SANG,1,',
    ].join('\n'));

    expect(result.rows).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'HISTORY_SOURCE_DATE_INVALID',
      'HISTORY_KIND_INVALID',
      'HISTORY_EXECUTION_DATE_INVALID',
    ]));
  });

  it('parses quoted commas and escaped quotes deterministically', () => {
    const source = [
      header,
      '10A1,DIA,2026-09-07,SANG,1,GV001,BINH_THUONG,,,,"Nội dung, có ""ngoặc"""',
    ].join('\n');
    const first = parseHistoricalTeachingCsv(source);
    const second = parseHistoricalTeachingCsv(source);

    expect(first.issues).toEqual([]);
    expect(first.rows[0]!.note).toBe('Nội dung, có "ngoặc"');
    expect(first.rows[0]!.rowRef).toBe(second.rows[0]!.rowRef);
  });

  it('rejects wrong header and excessive column count', () => {
    const wrongHeader = parseHistoricalTeachingCsv('LOP,MON\n10A1,DIA');
    expect(wrongHeader.issues[0]?.code).toBe('HISTORY_HEADER_MISMATCH');

    const badRow = parseHistoricalTeachingCsv([
      header,
      '10A1,DIA,2026-09-07,SANG,1,GV001,BINH_THUONG,,,,,EXTRA',
    ].join('\n'));
    expect(badRow.issues.map((issue) => issue.code)).toContain('HISTORY_ROW_COLUMN_COUNT');
  });
});
