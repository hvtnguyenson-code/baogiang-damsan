import { DataReadinessController } from '../../src/data-readiness/data-readiness.controller';
import { DataReadinessService } from '../../src/data-readiness/data-readiness.service';

describe('DataReadinessController (Unit)', () => {
  let controller: DataReadinessController;
  let serviceMock: jest.Mocked<Partial<DataReadinessService>>;

  beforeEach(() => {
    serviceMock = {
      getSummary: jest.fn().mockResolvedValue({
        academicYear: { id: 'y1', code: '2026-2027', name: 'Năm học 2026-2027' },
        academicYears: [],
        overallStatus: 'READY',
        overallStatusLabel: 'Tất cả dữ liệu năm học đã sẵn sàng vận hành',
        domains: [],
        evaluatedAt: new Date().toISOString(),
      }),
    };

    controller = new DataReadinessController(serviceMock as DataReadinessService);
  });

  it('delegates getSummary to service with req and query academicYearId', async () => {
    const fakeReq = { auth: { user: { id: 'u1' } } } as unknown as Parameters<typeof controller.getSummary>[0];
    const res = await controller.getSummary(fakeReq, 'year-123');

    expect(serviceMock.getSummary).toHaveBeenCalledWith(fakeReq, 'year-123');
    expect(res.overallStatus).toBe('READY');
  });
});
