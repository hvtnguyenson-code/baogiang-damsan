import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBulkTeachingAssignmentDto } from '../../src/teaching-assignments/dto';

const first = '7fb33924-7136-4488-9cb5-703a4d7ec411';
const second = 'fd841df3-4583-4889-a0f0-9c6b40e90b12';
const base = {
  schoolClassIds: [first, second],
  subjectId: '2c43c36d-6b85-4b9f-966e-56b34561f8d7',
  teacherUserId: '8fc01a82-e6f6-4e19-a63b-bf7f68565311',
  validFrom: '2026-09-01',
};

describe('bulk teaching assignment DTO', () => {
  it('accepts a distinct multi-class selection', async () => {
    expect(await validate(plainToInstance(CreateBulkTeachingAssignmentDto, base))).toHaveLength(0);
  });
  it('rejects an empty selection', async () => {
    expect(await validate(plainToInstance(CreateBulkTeachingAssignmentDto, { ...base, schoolClassIds: [] }))).not.toHaveLength(0);
  });
  it('rejects duplicate class IDs and forged non-UUID entries', async () => {
    expect(await validate(plainToInstance(CreateBulkTeachingAssignmentDto, { ...base, schoolClassIds: [first, first] }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreateBulkTeachingAssignmentDto, { ...base, schoolClassIds: [first, 'not-a-uuid'] }))).not.toHaveLength(0);
  });
  it('rejects more than 100 classes', async () => {
    const schoolClassIds = Array.from({ length: 101 }, (_, i) => '7fb33924-7136-4488-9cb5-' + String(i).padStart(12, '0'));
    expect(await validate(plainToInstance(CreateBulkTeachingAssignmentDto, { ...base, schoolClassIds }))).not.toHaveLength(0);
  });
});
