import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, Prisma } from '@prisma/client';
import {
  PpctWorkspaceAcademicYearOptionListResponse,
  PpctWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ListPpctWorkspaceAcademicYearsDto } from './dto';
import { PpctManageScopeResult } from './ppct-access.service';

@Injectable()
export class PpctOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAcademicYears(query: ListPpctWorkspaceAcademicYearsDto): Promise<PpctWorkspaceAcademicYearOptionListResponse> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicYear.findMany({
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, code: true, name: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.academicYear.count(),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getWorkspace(academicYearId: string, manageScope: PpctManageScopeResult): Promise<PpctWorkspaceOptionsResponse> {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, code: true, name: true },
    });
    if (!academicYear) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }

    const subjectWhere: Prisma.SubjectWhereInput = {
      status: CatalogStatus.ACTIVE,
      ...(manageScope.schoolWide ? {} : { id: { in: manageScope.subjectIds } }),
    };

    const [classes, subjects] = await this.prisma.$transaction([
      this.prisma.schoolClass.findMany({
        where: { academicYearId },
        select: { id: true, code: true, name: true, gradeLevel: true, status: true },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.subject.findMany({
        where: subjectWhere,
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      academicYear,
      classes: classes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        gradeLevel: c.gradeLevel as 10 | 11 | 12,
        status: c.status,
      })),
      subjects: subjects.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        status: s.status,
      })),
    };
  }
}
