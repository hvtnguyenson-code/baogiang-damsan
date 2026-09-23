import { ConflictException, NotFoundException } from '@nestjs/common';
import { CapabilitiesService } from '../../src/capabilities/capabilities.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CAPABILITIES, validateCapabilityCatalog } = require('../../../../prisma/capability-catalog.cjs') as {
  CAPABILITIES: Array<[string, string, string[]]>;
  validateCapabilityCatalog: () => boolean;
};

describe('GDĐP Coordinator Normalization (Unit Tests)', () => {
  describe('Capability Catalog', () => {
    it('contains GDDP_COORDINATOR with ACTIVITY scope and Vietnamese description', () => {
      const gddpEntry = CAPABILITIES.find(([key]) => key === 'GDDP_COORDINATOR');
      expect(gddpEntry).toBeDefined();
      expect(gddpEntry![1]).toBe('Điều phối Giáo dục địa phương.');
      expect(gddpEntry![2]).toEqual(['ACTIVITY']);
    });

    it('does NOT contain typo GDDDP_COORDINATOR', () => {
      const typoEntry = CAPABILITIES.find(([key]) => key === 'GDDDP_COORDINATOR');
      expect(typoEntry).toBeUndefined();
    });

    it('validates canonical catalog successfully', () => {
      expect(validateCapabilityCatalog()).toBe(true);
    });
  });

  describe('CapabilitiesService resource normalization for GDDP_COORDINATOR', () => {
    let service: CapabilitiesService;
    let prismaMock: {
      programmeMaster: { findUnique: jest.Mock };
      subjectGroup: { findUnique: jest.Mock };
      subject: { findUnique: jest.Mock };
    };

    beforeEach(() => {
      prismaMock = {
        programmeMaster: { findUnique: jest.fn() },
        subjectGroup: { findUnique: jest.fn() },
        subject: { findUnique: jest.fn() },
      };
      service = new CapabilitiesService(prismaMock as never, {} as never);
    });

    it('accepts GDDP_COORDINATOR for GDDP programme master', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue({
        id: 'master-gddp-1',
        kind: 'GDDP',
      });

      const res = await (service as unknown as { normalizeResource: (dto: unknown) => Promise<string> }).normalizeResource({
        capabilityKey: 'GDDP_COORDINATOR',
        scopeType: 'ACTIVITY',
        scopeResourceId: 'master-gddp-1',
      });
      expect(res).toBe('master-gddp-1');
      expect(prismaMock.programmeMaster.findUnique).toHaveBeenCalledWith({
        where: { id: 'master-gddp-1' },
        select: { id: true, kind: true },
      });
    });

    it('rejects GDDP_COORDINATOR for HDTN_HN programme master with Vietnamese GDĐP error message', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue({
        id: 'master-hdtn-1',
        kind: 'HDTN_HN',
      });

      await expect(
        (service as unknown as { normalizeResource: (dto: unknown) => Promise<string> }).normalizeResource({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: 'master-hdtn-1',
        }),
      ).rejects.toThrow(new ConflictException('Chương trình không phải Giáo dục địa phương (GDĐP).'));
    });

    it('rejects GDDP_COORDINATOR when programme master is not found', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(null);

      await expect(
        (service as unknown as { normalizeResource: (dto: unknown) => Promise<string> }).normalizeResource({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: 'missing-master',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects HĐTN_COORDINATOR for GDDP programme master', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue({
        id: 'master-gddp-1',
        kind: 'GDDP',
      });

      await expect(
        (service as unknown as { normalizeResource: (dto: unknown) => Promise<string> }).normalizeResource({
          capabilityKey: 'HĐTN_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: 'master-gddp-1',
        }),
      ).rejects.toThrow(new ConflictException('Chương trình không phải Hoạt động trải nghiệm, hướng nghiệp (HDTN_HN).'));
    });
  });
});
