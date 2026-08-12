import { Body, Controller, HttpCode, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TimetableImportWorkbookConfirmResponse, TimetableImportWorkbookInspectionResponse, TimetableImportWorkbookPreviewResponse } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { ConfirmTimetableImportWorkbookDto, InspectTimetableImportWorkbookDto, PreviewTimetableImportWorkbookDto } from './dto';
import { TimetableImportWorkbookService, UploadedWorkbookFile } from './timetable-import-workbook.service';
import { MAX_XLSX_BYTES } from './workbook-limits';
import { WorkbookUploadExceptionFilter } from './workbook-upload-exception.filter';

const upload = FileInterceptor('file', { limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 8, parts: 9 } });

@Controller('timetable-import/workbooks')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
@UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
@UseFilters(WorkbookUploadExceptionFilter)
export class TimetableImportWorkbookController {
  constructor(private readonly service: TimetableImportWorkbookService) {}

  @Post('inspect')
  @UseInterceptors(upload)
  inspect(@UploadedFile() file: UploadedWorkbookFile | undefined, @Body() dto: InspectTimetableImportWorkbookDto): Promise<TimetableImportWorkbookInspectionResponse> {
    return this.service.inspect(file, dto.profileRevisionId);
  }

  @Post('preview')
  @UseInterceptors(upload)
  preview(@UploadedFile() file: UploadedWorkbookFile | undefined, @Body() dto: PreviewTimetableImportWorkbookDto): Promise<TimetableImportWorkbookPreviewResponse> {
    return this.service.preview(file, dto);
  }

  @Post('confirm')
  @HttpCode(200)
  @UseInterceptors(upload)
  confirm(
    @UploadedFile() file: UploadedWorkbookFile | undefined,
    @Body() dto: ConfirmTimetableImportWorkbookDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportWorkbookConfirmResponse> {
    return this.service.confirm(file, dto, request.auth!.user.id, requestMeta(request));
  }
}
