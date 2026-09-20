import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthorizedProgrammePlanningService } from './authorized-programme-planning.service';
import {
  AttestOccurrenceDto,
  CreateDraftOccurrenceDto,
  CreateDraftPlanVersionDto,
  CreateProgrammeMasterDto,
  CreateReplacementOccurrenceDto,
  CreateSuccessorDraftPlanVersionDto,
  EditDraftOccurrenceDto,
  EditDraftPlanVersionDto,
  ListPlannedOccurrencesDto,
  ListProgrammeMastersDto,
  MaterializeOccurrenceDto,
  PlannedProgrammeOccurrenceRecord,
  ProgrammeMasterRecord,
  ProgrammeMaterializedActivityRecord,
  ProgrammeOccurrenceAttestationRecord,
  ProgrammeOccurrenceAttestationsListResponse,
  ProgrammePlanVersionRecord,
  PublishOccurrenceDto,
  PublishPlanVersionDto,
  ReplaceMaterializedSlotDto,
  ReplaceOccurrenceSlotsStaffingDto,
  ReverseAttestationDto,
} from './dto';

@Controller('programme-planning')
@UseGuards(SessionAuthGuard)
export class ProgrammePlanningController {
  constructor(private readonly service: AuthorizedProgrammePlanningService) {}

  private auditContext(req: AuthenticatedRequest) {
    return {
      route: req.route?.path ?? req.path,
      method: req.method,
    };
  }

  // =========================================================================
  // PROGRAMME MASTERS
  // =========================================================================

  @Post('masters')
  @UseGuards(CsrfOriginGuard)
  async createMaster(
    @Body() dto: CreateProgrammeMasterDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMasterRecord> {
    return this.service.createMaster(dto, req.auth!.user.id, this.auditContext(req));
  }

  @Get('masters')
  async listMasters(
    @Query() query: ListProgrammeMastersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMasterRecord[]> {
    return this.service.listMasters(query, req.auth!.user.id);
  }

  @Get('masters/:masterId')
  async getMaster(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMasterRecord> {
    return this.service.getMaster(masterId, req.auth!.user.id, this.auditContext(req));
  }

  // =========================================================================
  // PLAN VERSIONS
  // =========================================================================

  @Post('masters/:masterId/plan-versions')
  @UseGuards(CsrfOriginGuard)
  async createDraftPlanVersion(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Body() dto: CreateDraftPlanVersionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord> {
    if (dto.programmeMasterId && dto.programmeMasterId !== masterId) {
      throw new BadRequestException('programmeMasterId trong body không khớp với đường dẫn URL.');
    }
    dto.programmeMasterId = masterId;
    return this.service.createDraftPlanVersion(dto, req.auth!.user.id, this.auditContext(req));
  }

  @Post('masters/:masterId/plan-versions/successors')
  @UseGuards(CsrfOriginGuard)
  async createSuccessorDraftPlanVersion(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Body() dto: CreateSuccessorDraftPlanVersionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord> {
    if (dto.programmeMasterId && dto.programmeMasterId !== masterId) {
      throw new BadRequestException('programmeMasterId trong body không khớp với đường dẫn URL.');
    }
    dto.programmeMasterId = masterId;
    return this.service.createSuccessorDraftPlanVersion(
      dto,
      req.auth!.user.id,
      this.auditContext(req),
    );
  }

  @Get('masters/:masterId/plan-versions')
  async listPlanVersions(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord[]> {
    return this.service.listPlanVersions(masterId, req.auth!.user.id, this.auditContext(req));
  }

  @Get('plan-versions/:id')
  async getPlanVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.service.getPlanVersion(id, req.auth!.user.id, this.auditContext(req));
  }

  @Post('plan-versions/:id/edit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async editDraftPlanVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditDraftPlanVersionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.service.editDraftPlanVersion(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Post('plan-versions/:id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async publishPlanVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishPlanVersionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.service.publishPlanVersion(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  // =========================================================================
  // PLANNED OCCURRENCES
  // =========================================================================

  @Post('masters/:masterId/occurrences')
  @UseGuards(CsrfOriginGuard)
  async createDraftOccurrence(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Body() dto: CreateDraftOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    if (dto.programmeMasterId && dto.programmeMasterId !== masterId) {
      throw new BadRequestException('programmeMasterId trong body không khớp với đường dẫn URL.');
    }
    dto.programmeMasterId = masterId;
    return this.service.createDraftOccurrence(dto, req.auth!.user.id, this.auditContext(req));
  }

  @Get('masters/:masterId/occurrences')
  async listMasterOccurrences(
    @Param('masterId', ParseUUIDPipe) masterId: string,
    @Query() query: ListPlannedOccurrencesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord[]> {
    if (query.programmeMasterId && query.programmeMasterId !== masterId) {
      throw new BadRequestException('programmeMasterId trong query không khớp với đường dẫn URL.');
    }
    query.programmeMasterId = masterId;
    return this.service.listOccurrences(query, req.auth!.user.id, this.auditContext(req));
  }

  @Get('occurrences/:id')
  async getOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.service.getOccurrence(id, req.auth!.user.id, this.auditContext(req));
  }

  @Post('occurrences/:id/edit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async editDraftOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditDraftOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.service.editDraftOccurrence(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Post('occurrences/:id/slots-staffing')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async replaceOccurrenceSlotsAndStaffing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceOccurrenceSlotsStaffingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.service.replaceOccurrenceSlotsAndStaffing(
      id,
      dto,
      req.auth!.user.id,
      this.auditContext(req),
    );
  }

  @Post('occurrences/:id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async publishOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.service.publishOccurrence(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Post('occurrences/:id/replacements')
  @UseGuards(CsrfOriginGuard)
  async createReplacementOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplacementOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    if (dto.replacesOccurrenceId && dto.replacesOccurrenceId !== id) {
      throw new BadRequestException('replacesOccurrenceId trong body không khớp với đường dẫn URL.');
    }
    dto.replacesOccurrenceId = id;
    return this.service.createReplacementOccurrence(
      id,
      dto,
      req.auth!.user.id,
      this.auditContext(req),
    );
  }

  // =========================================================================
  // RUNTIME BRIDGE & ATTESTATION (P4-040)
  // =========================================================================

  @Post('occurrences/:id/materialize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async materializeOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MaterializeOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMaterializedActivityRecord[]> {
    return this.service.materializeOccurrence(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Get('occurrences/:id/materialization')
  async getOccurrenceMaterialization(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMaterializedActivityRecord[]> {
    return this.service.getOccurrenceMaterialization(id, req.auth!.user.id, this.auditContext(req));
  }

  @Post('materialized-slots/:id/replacements')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async replaceMaterializedSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceMaterializedSlotDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeMaterializedActivityRecord> {
    return this.service.replaceMaterializedSlot(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Post('occurrences/:id/attestations')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async attestOccurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttestOccurrenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeOccurrenceAttestationRecord> {
    return this.service.attestOccurrence(id, dto, req.auth!.user.id, this.auditContext(req));
  }

  @Get('occurrences/:id/attestations')
  async listOccurrenceAttestations(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeOccurrenceAttestationsListResponse> {
    return this.service.listOccurrenceAttestations(id, req.auth!.user.id, this.auditContext(req));
  }

  @Post('attestations/:attestationId/reverse')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  async reverseAttestation(
    @Param('attestationId', ParseUUIDPipe) attestationId: string,
    @Body() dto: ReverseAttestationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProgrammeOccurrenceAttestationRecord> {
    return this.service.reverseAttestation(attestationId, dto, req.auth!.user.id, this.auditContext(req));
  }
}
