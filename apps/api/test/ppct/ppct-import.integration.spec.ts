import { CatalogStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { integration, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

const PPCT_HEADERS = [
  'Khối lớp *',
  'Loại nội dung',
  'Bài / Chủ đề',
  'Tên bài / Nội dung *',
  'Số tiết *',
  'Tuần bắt đầu dự kiến *',
  'Tuần kết thúc dự kiến *',
  'Tiết PPCT bắt đầu\n(Tự động)',
  'Tiết PPCT kết thúc\n(Tự động)',
] as const;

const SPECIALIZED_HEADERS = [
  'Khối lớp *',
  'Chuyên đề số *',
  'Tên chuyên đề *',
  'Số tiết *',
  'Tuần bắt đầu dự kiến *',
  'Tuần kết thúc dự kiến *',
  'Tiết chuyên đề bắt đầu\n(Tự động)',
  'Tiết chuyên đề kết thúc\n(Tự động)',
] as const;

async function buildWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const info = workbook.addWorksheet('THONG_TIN');
  info.getCell('A4').value = 'Môn học';
  info.getCell('B4').value = 'Địa lí';
  info.getCell('A5').value = 'Năm học';
  info.getCell('B5').value = '2026-2027';
  info.getCell('A6').value = 'Phiên bản mẫu';
  info.getCell('B6').value = 'PPCT_V1';

  const ppct = workbook.addWorksheet('PPCT');
  ppct.addRow([...PPCT_HEADERS]);
  ppct.addRow([10, 'Bài học', 'Bài 1', 'Vị trí địa lí', 2, 1, 2, '', '']);
  ppct.addRow([10, 'Ôn tập', '', 'Ôn tập giữa học kì', 1, 8, 8, '', '']);

  const specialized = workbook.addWorksheet('CHUYEN_DE');
  specialized.addRow([...SPECIALIZED_HEADERS]);
  specialized.addRow([10, 1, 'Đô thị hóa', 2, 20, 21, '', '']);

  workbook.addWorksheet('HUONG_DAN');
  workbook.addWorksheet('DANH_MUC');
  workbook.addWorksheet('VI_DU');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

integration('PPCT native workbook import P2-020 (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    ]);
  });

  it('imports PPCT_V1 atomically into DRAFT and replays identical create requests without duplicate drafts', async () => {
    const year = await h.prisma.academicYear.create({
      data: { code: '2026-2027', name: 'Năm học 2026-2027' },
    });
    const subject = await h.prisma.subject.create({
      data: { code: 'DIALI', name: 'Địa lí', status: CatalogStatus.ACTIVE },
    });
    const manager = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: subject.id }],
    });
    const buffer = await buildWorkbook();
    const upload = () => ({
      filename: 'PPCT_DIA_LI_2026-2027.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const inspect = await manager.agent
      .post('/api/ppct-import/inspect')
      .set('Origin', testOrigin)
      .attach('file', buffer, upload());
    expect(inspect.status).toBe(200);
    expect(inspect.body).toMatchObject({
      metadata: {
        subjectDisplayName: 'Địa lí',
        academicYearCode: '2026-2027',
        templateVersion: 'PPCT_V1',
      },
      gradeLevels: [10],
      issues: [],
    });

    const targets = [{
      gradeLevel: 10,
      targetMode: 'CREATE_NEW_DRAFT',
      targetDraftId: null,
      expectedUpdatedAt: null,
    }];
    const preview = await manager.agent
      .post('/api/ppct-import/preview')
      .set('Origin', testOrigin)
      .field('targets', JSON.stringify(targets))
      .attach('file', buffer, upload());
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      academicYear: { id: year.id, code: '2026-2027' },
      subject: { id: subject.id, code: 'DIALI', name: 'Địa lí' },
      grades: [expect.objectContaining({
        gradeLevel: 10,
        corePeriodCount: 3,
        specializedPeriodCount: 2,
        target: expect.objectContaining({ targetMode: 'CREATE_NEW_DRAFT' }),
      })],
    });
    expect(preview.body.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.body.grades[0].items).toHaveLength(5);
    expect(preview.body.grades[0].items.map((item: { sequence: number }) => item.sequence)).toEqual([1, 2, 3, 1, 2]);

    const confirm = await manager.agent
      .post('/api/ppct-import/confirm')
      .set('Origin', testOrigin)
      .field('targets', JSON.stringify(targets))
      .field('requestFingerprint', preview.body.requestFingerprint as string)
      .attach('file', buffer, upload());
    expect(confirm.status).toBe(200);
    expect(confirm.body.results).toEqual([
      expect.objectContaining({
        gradeLevel: 10,
        outcome: 'CREATED',
        version: expect.objectContaining({ status: 'DRAFT', versionNumber: 1, itemCount: 5 }),
      }),
    ]);

    const plan = await h.prisma.ppctPlan.findFirstOrThrow({
      where: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    expect(await h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.id } })).toBe(1);
    expect(await h.prisma.ppctItemRevision.count({ where: { ppctPlanId: plan.id } })).toBe(5);
    expect(await h.prisma.ppctItemRevision.findMany({
      where: { ppctPlanId: plan.id },
      orderBy: [{ component: 'asc' }, { sequence: 'asc' }],
      select: { component: true, sequence: true, title: true, lessonType: true },
    })).toEqual([
      { component: 'CORE', sequence: 1, title: 'Bài 1: Vị trí địa lí', lessonType: 'Bài học' },
      { component: 'CORE', sequence: 2, title: 'Bài 1: Vị trí địa lí', lessonType: 'Bài học' },
      { component: 'CORE', sequence: 3, title: 'Ôn tập giữa học kì', lessonType: 'Ôn tập' },
      { component: 'SPECIALIZED_STUDY', sequence: 1, title: 'Chuyên đề 1: Đô thị hóa', lessonType: 'Chuyên đề' },
      { component: 'SPECIALIZED_STUDY', sequence: 2, title: 'Chuyên đề 1: Đô thị hóa', lessonType: 'Chuyên đề' },
    ]);

    const replay = await manager.agent
      .post('/api/ppct-import/confirm')
      .set('Origin', testOrigin)
      .field('targets', JSON.stringify(targets))
      .field('requestFingerprint', preview.body.requestFingerprint as string)
      .attach('file', buffer, upload());
    expect(replay.status).toBe(200);
    expect(replay.body.results[0]).toMatchObject({ gradeLevel: 10, outcome: 'REPLAYED' });
    expect(await h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.id } })).toBe(1);
  });

  it('fails closed when the confirm fingerprint does not match the preview package', async () => {
    await h.prisma.academicYear.create({ data: { code: '2026-2027', name: 'Năm học 2026-2027' } });
    const subject = await h.prisma.subject.create({
      data: { code: 'DIALI', name: 'Địa lí', status: CatalogStatus.ACTIVE },
    });
    const manager = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: subject.id }],
    });
    const buffer = await buildWorkbook();
    const targets = [{ gradeLevel: 10, targetMode: 'CREATE_NEW_DRAFT', targetDraftId: null, expectedUpdatedAt: null }];

    const response = await manager.agent
      .post('/api/ppct-import/confirm')
      .set('Origin', testOrigin)
      .field('targets', JSON.stringify(targets))
      .field('requestFingerprint', '0'.repeat(64))
      .attach('file', buffer, {
        filename: 'PPCT.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('PPCT_IMPORT_FINGERPRINT_MISMATCH');
    expect(await h.prisma.ppctVersion.count()).toBe(0);
    expect(await h.prisma.ppctPlan.count()).toBe(0);
  });
});
