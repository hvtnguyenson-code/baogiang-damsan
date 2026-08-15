import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CalendarExceptionCreateResult, CalendarExceptionListResponse, CalendarExceptionRecord, CalendarExceptionReverseResult, OperationalLessonDispositionCreateResult, OperationalLessonDispositionListResponse, OperationalLessonDispositionRecord, OperationalLessonDispositionReverseResult } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateCalendarExceptionDto, CreateLessonDispositionDto, ListCalendarExceptionsDto, ListLessonDispositionsDto, ReverseOperationalOverlayDto } from './dto';
import { OperationalOverlaysService } from './operational-overlays.service';

@Controller('operational-overlays')
export class OperationalOverlaysController {
  constructor(private readonly service: OperationalOverlaysService) {}

  @Post('calendar-exceptions')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  createCalendar(@Body() dto: CreateCalendarExceptionDto, @Req() request: AuthenticatedRequest): Promise<CalendarExceptionCreateResult> {
    return this.service.createCalendarException(dto, request);
  }

  @Get('calendar-exceptions')
  @UseGuards(SessionAuthGuard)
  listCalendar(@Query() query: ListCalendarExceptionsDto, @Req() request: AuthenticatedRequest): Promise<CalendarExceptionListResponse> {
    return this.service.listCalendarExceptions(query, request);
  }

  @Get('calendar-exceptions/:id')
  @UseGuards(SessionAuthGuard)
  getCalendar(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<CalendarExceptionRecord> {
    return this.service.getCalendarException(id, request);
  }

  @Post('calendar-exceptions/:id/reverse')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  reverseCalendar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseOperationalOverlayDto, @Req() request: AuthenticatedRequest): Promise<CalendarExceptionReverseResult> {
    return this.service.reverseCalendarException(id, dto, request);
  }

  @Post('lesson-dispositions')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  createDisposition(@Body() dto: CreateLessonDispositionDto, @Req() request: AuthenticatedRequest): Promise<OperationalLessonDispositionCreateResult> {
    return this.service.createLessonDisposition(dto, request);
  }

  @Get('lesson-dispositions')
  @UseGuards(SessionAuthGuard)
  listDispositions(@Query() query: ListLessonDispositionsDto, @Req() request: AuthenticatedRequest): Promise<OperationalLessonDispositionListResponse> {
    return this.service.listLessonDispositions(query, request);
  }

  @Get('lesson-dispositions/:id')
  @UseGuards(SessionAuthGuard)
  getDisposition(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<OperationalLessonDispositionRecord> {
    return this.service.getLessonDisposition(id, request);
  }

  @Post('lesson-dispositions/:id/reverse')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  reverseDisposition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseOperationalOverlayDto, @Req() request: AuthenticatedRequest): Promise<OperationalLessonDispositionReverseResult> {
    return this.service.reverseLessonDisposition(id, dto, request);
  }
}
