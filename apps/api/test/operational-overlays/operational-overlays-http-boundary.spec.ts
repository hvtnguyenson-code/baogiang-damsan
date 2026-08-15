import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { OperationalOverlaysController } from '../../src/operational-overlays/operational-overlays.controller';
import { CreateLessonDispositionDto } from '../../src/operational-overlays/dto';

describe('operational overlay HTTP and make-up hard boundary', () => {
  const prototype = OperationalOverlaysController.prototype as unknown as Record<string, object>;
  const route = (method: string) => ({ path: Reflect.getMetadata(PATH_METADATA, prototype[method]), verb: Reflect.getMetadata(METHOD_METADATA, prototype[method]) });

  it.each([
    ['createCalendar', 'calendar-exceptions', RequestMethod.POST], ['listCalendar', 'calendar-exceptions', RequestMethod.GET],
    ['getCalendar', 'calendar-exceptions/:id', RequestMethod.GET], ['reverseCalendar', 'calendar-exceptions/:id/reverse', RequestMethod.POST],
    ['createDisposition', 'lesson-dispositions', RequestMethod.POST], ['listDispositions', 'lesson-dispositions', RequestMethod.GET],
    ['getDisposition', 'lesson-dispositions/:id', RequestMethod.GET], ['reverseDisposition', 'lesson-dispositions/:id/reverse', RequestMethod.POST],
  ])('exposes only the accepted route %s', (method, path, verb) => expect(route(method)).toEqual({ path, verb }));

  it('has no public make-up command method', () => expect(Object.getOwnPropertyNames(prototype).filter((name) => /makeup|make-up/iu.test(name))).toEqual([]));
  it('does not accept an unproven ppctItemId in disposition DTO', () => expect('ppctItemId' in new CreateLessonDispositionDto()).toBe(false));
  it('does not expose generic update, delete, move, swap, occurrence, execution, or progress methods', () => {
    expect(Object.getOwnPropertyNames(prototype).filter((name) => /update|delete|move|swap|occurrence|execution|progress|debt|report/iu.test(name))).toEqual([]);
  });
});
