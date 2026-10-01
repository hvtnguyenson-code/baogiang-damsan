import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  PpctImportConfirmResponse,
  PpctImportInspectionResponse,
  PpctImportPreviewResponse,
} from '@baogiang/contracts/ppct-import';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MAX_XLSX_BYTES } from '../timetable-import/workbook-limits';
import {
  ConfirmPpctWorkbookDto,
  PreviewPpctWorkbookDto,
} from './ppct-import.dto';
import {
  PpctImportService,
  PpctUploadedWorkbookFile,
} from './ppct-import.service';
import { PpctWorkbookUploadExceptionFilter } from './ppct-workbook-upload-exception.filter';

@Controller('ppct-import')
@UseGuards(SessionAuthGuard)
export class PpctImportController {
  constructor(private readonly service: PpctImportService) {}

  @Post('inspect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  @UseFilters(PpctWorkbookUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 8, parts: 9 },
    }),
  )
  inspect(
    @UploadedFile() file: PpctUploadedWorkbookFile | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctImportInspectionResponse> {
    return this.service.inspect(file, request);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  @UseFilters(PpctWorkbookUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 8, parts: 9 },
    }),
  )
  preview(
    @UploadedFile() file: PpctUploadedWorkbookFile | undefined,
    @Body() dto: PreviewPpctWorkbookDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctImportPreviewResponse> {
    return this.service.preview(file, dto.targets, request);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  @UseFilters(PpctWorkbookUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 8, parts: 9 },
    }),
  )
  confirm(
    @UploadedFile() file: PpctUploadedWorkbookFile | undefined,
    @Body() dto: ConfirmPpctWorkbookDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctImportConfirmResponse> {
    return this.service.confirm(
      file,
      dto.targets,
      dto.requestFingerprint,
      request,
    );
  }
}
