import { BadRequestException } from '@nestjs/common';
import { CatalogStatus } from '@prisma/client';
import { CatalogsService, normalizeCatalogCode, normalizeCatalogName, toCatalogEntry } from '../../src/catalogs/catalogs.service';

describe('catalog helpers', () => {
  it('normalizes code and name and maps only the public record', () => {
    expect(normalizeCatalogCode('  geo  ')).toBe('GEO');
    expect(normalizeCatalogName('  Địa lý  ')).toBe('Địa lý');
    expect(toCatalogEntry({ id: 'id', code: 'GEO', name: 'Địa lý', status: CatalogStatus.ACTIVE, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z') })).toEqual({ id: 'id', code: 'GEO', name: 'Địa lý', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' });
  });

  it('rejects an empty update before a database transaction begins', async () => {
    const service = new CatalogsService({ $transaction: jest.fn() } as never, {} as never);
    await expect(service.update('subject', 'id', {}, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    expect((service as unknown as { prisma: { $transaction: jest.Mock } }).prisma.$transaction).not.toHaveBeenCalled();
  });
});
