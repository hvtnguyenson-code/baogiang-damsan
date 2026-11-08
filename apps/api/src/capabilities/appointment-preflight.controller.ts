import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { RoleAppointmentPreflightResponse } from '@baogiang/contracts';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { AppointmentPreflightService } from './appointment-preflight.service';
import { RoleAppointmentPreflightDto } from './dto';

@Controller('role-appointments')
export class AppointmentPreflightController {
  constructor(private readonly preflight: AppointmentPreflightService) {}

  @Post('preflight')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  preview(
    @Body() dto: RoleAppointmentPreflightDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleAppointmentPreflightResponse> {
    return this.preflight.preview(dto, request.auth!.user.id, request.auth!.user.mustChangePassword);
  }
}
