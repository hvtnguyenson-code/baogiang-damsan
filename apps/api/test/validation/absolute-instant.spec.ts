import 'reflect-metadata';
import { validateSync } from 'class-validator';
import {
  CreateMembershipDto, CreateStaffSubjectDto, EndAssignmentDto, ListMembershipDto, ListStaffSubjectDto, UpdateAssignmentDto,
} from '../../src/assignments/dto';
import { CreateGrantDto, ListGrantsDto } from '../../src/capabilities/dto';
import {
  CreateDefinitionDto, CreateDutyAssignmentDto, EndDutyAssignmentDto, ListDefinitionOptionsDto,
  ListDefinitionsDto, ListDutyAssignmentsDto, UpdateDefinitionDto, UpdateDutyAssignmentDto,
} from '../../src/additional-duties/dto';
import { ListAuditDto } from '../../src/audit/audit.controller';

type DtoConstructor = new () => object;
type TemporalCase = { dto: DtoConstructor; field: string; base?: Record<string, unknown> };

const uuidA = '11111111-1111-4111-8111-111111111111';
const uuidB = '22222222-2222-4222-8222-222222222222';

const temporalCases: TemporalCase[] = [
  { dto: CreateMembershipDto, field: 'validFrom', base: { userId: uuidA, subjectGroupId: uuidB } },
  { dto: CreateMembershipDto, field: 'validUntil', base: { userId: uuidA, subjectGroupId: uuidB } },
  { dto: CreateStaffSubjectDto, field: 'validFrom', base: { userId: uuidA, subjectId: uuidB } },
  { dto: CreateStaffSubjectDto, field: 'validUntil', base: { userId: uuidA, subjectId: uuidB } },
  { dto: UpdateAssignmentDto, field: 'validFrom' },
  { dto: UpdateAssignmentDto, field: 'validUntil' },
  { dto: EndAssignmentDto, field: 'endAt' },
  { dto: ListMembershipDto, field: 'activeAt' },
  { dto: ListStaffSubjectDto, field: 'activeAt' },
  { dto: ListGrantsDto, field: 'activeAt' },
  { dto: CreateGrantDto, field: 'validFrom', base: { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' } },
  { dto: CreateGrantDto, field: 'validUntil', base: { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' } },
  { dto: CreateDefinitionDto, field: 'validFrom', base: { code: 'DUTY', name: 'Duty', category: 'CAT' } },
  { dto: CreateDefinitionDto, field: 'validUntil', base: { code: 'DUTY', name: 'Duty', category: 'CAT' } },
  { dto: UpdateDefinitionDto, field: 'validFrom' },
  { dto: UpdateDefinitionDto, field: 'validUntil' },
  { dto: ListDefinitionsDto, field: 'effectiveAt' },
  { dto: ListDefinitionOptionsDto, field: 'effectiveAt' },
  { dto: CreateDutyAssignmentDto, field: 'validFrom', base: { staffProfileId: uuidA, dutyDefinitionId: uuidB, scopeType: 'SCHOOL_WIDE' } },
  { dto: CreateDutyAssignmentDto, field: 'validUntil', base: { staffProfileId: uuidA, dutyDefinitionId: uuidB, scopeType: 'SCHOOL_WIDE' } },
  { dto: UpdateDutyAssignmentDto, field: 'validFrom' },
  { dto: UpdateDutyAssignmentDto, field: 'validUntil' },
  { dto: EndDutyAssignmentDto, field: 'endAt' },
  { dto: ListDutyAssignmentsDto, field: 'activeAt' },
  { dto: ListAuditDto, field: 'createdFrom' },
  { dto: ListAuditDto, field: 'createdTo' },
];

function validateTemporal(testCase: TemporalCase, value?: string) {
  return validateSync(Object.assign(new testCase.dto(), testCase.base, value === undefined ? {} : { [testCase.field]: value }));
}

describe('absolute instant DTO validation', () => {
  it.each(temporalCases)('accepts Z timestamps for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase, '2026-08-09T01:30:00.000Z')).toHaveLength(0);
  });

  it.each(temporalCases)('accepts explicit +07:00 offsets for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase, '2026-08-09T08:30:00+07:00')).toHaveLength(0);
  });

  it.each(temporalCases)('rejects timezone-less datetimes for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase, '2026-08-09T08:30:00')).not.toHaveLength(0);
  });

  it.each(temporalCases)('rejects date-only values for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase, '2026-08-09')).not.toHaveLength(0);
  });

  it.each(temporalCases)('rejects malformed values for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase, 'not-a-timestamp')).not.toHaveLength(0);
  });

  it.each(temporalCases)('accepts omitted optional timestamps for $dto.name.$field', (testCase) => {
    expect(validateTemporal(testCase)).toHaveLength(0);
  });
});
