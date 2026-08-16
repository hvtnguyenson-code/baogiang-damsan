import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ConfirmMakeupTeachingExecutionDto, ConfirmNormalTeachingExecutionDto, ConfirmSpecialActivityParticipationDto, ReverseTeachingExecutionDto } from './dto';
import { TeachingExecutionsService } from './teaching-executions.service';

@Controller('teaching-executions')
export class TeachingExecutionsController {
  constructor(private readonly service: TeachingExecutionsService) {}
  @Post('curricular/normal') @UseGuards(SessionAuthGuard, CsrfOriginGuard) normal(@Body() dto: ConfirmNormalTeachingExecutionDto, @Req() req: AuthenticatedRequest) { return this.service.confirmNormal(dto, req); }
  @Post('curricular/makeup') @UseGuards(SessionAuthGuard, CsrfOriginGuard) makeup(@Body() dto: ConfirmMakeupTeachingExecutionDto, @Req() req: AuthenticatedRequest) { return this.service.confirmMakeup(dto, req); }
  @Post('activity-participations') @UseGuards(SessionAuthGuard, CsrfOriginGuard) activity(@Body() dto: ConfirmSpecialActivityParticipationDto, @Req() req: AuthenticatedRequest) { return this.service.confirmActivity(dto, req); }
  @Get('curricular/:id') @UseGuards(SessionAuthGuard) curricular(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) { return this.service.getCurricular(id, req); }
  @Get('activity-participations/:id') @UseGuards(SessionAuthGuard) activityRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) { return this.service.getActivity(id, req); }
  @Post('curricular/:id/reverse') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard) reverseCurricular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseTeachingExecutionDto, @Req() req: AuthenticatedRequest) { return this.service.reverseCurricular(id, dto, req); }
  @Post('activity-participations/:id/reverse') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard) reverseActivity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseTeachingExecutionDto, @Req() req: AuthenticatedRequest) { return this.service.reverseActivity(id, dto, req); }
}
