import { ForbiddenException } from '@nestjs/common';
import { SENSITIVE_CAPABILITY_KEYS } from '../../src/capabilities/sensitive-capability-policy';
import {
  assertGenericGrantSourceSafe,
  assertGenericTemplateSourceSafe,
} from '../../src/capabilities/sensitive-generic-writer-gate';

const oldFlag = process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
afterEach(() => {
  if (oldFlag === undefined) delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
  else process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = oldFlag;
});

describe('P5-057 WS1 generic ingress shadow/cutover guard', () => {
  it('is inactive by default so a staging merge would not change existing authorization', () => {
    delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
    for (const key of SENSITIVE_CAPABILITY_KEYS) {
      expect(() => assertGenericGrantSourceSafe(key)).not.toThrow();
    }
  });

  it('denies all nine sensitive keys on both generic grant/revoke paths when enabled', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    for (const key of SENSITIVE_CAPABILITY_KEYS) {
      expect(() => assertGenericGrantSourceSafe(key)).toThrow(ForbiddenException);
    }
  });

  it('blocks entire mixed template atomically when any sensitive capability is present', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    expect(() => assertGenericTemplateSourceSafe([
      { capabilityKey: 'TEACHER_BASE' },
      { capabilityKey: 'APPROVAL_PRINCIPAL' },
    ])).toThrow(ForbiddenException);
  });

  it('preserves unrelated teacher and subject grants even in cutover mode', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    for (const key of ['TEACHER_BASE', 'TIMETABLE_VIEW', 'SUBJECT_GROUP_MANAGE']) {
      expect(() => assertGenericGrantSourceSafe(key)).not.toThrow();
    }
    expect(() => assertGenericTemplateSourceSafe([
      { capabilityKey: 'TEACHER_BASE' }, { capabilityKey: 'TIMETABLE_VIEW' },
    ])).not.toThrow();
  });

  it('does not enable cutover on ambiguous environment values', () => {
    for (const flag of ['1', 'TRUE', 'yes', 'enabled', '']) {
      process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = flag;
      expect(() => assertGenericGrantSourceSafe('AUDIT_VIEW')).not.toThrow();
    }
  });
});
