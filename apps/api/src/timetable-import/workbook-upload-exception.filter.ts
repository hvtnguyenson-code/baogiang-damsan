import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface MulterErrorInstance extends Error { code: string }
interface MulterRuntime { MulterError: new (...arguments_: unknown[]) => MulterErrorInstance }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MulterError } = require('multer') as MulterRuntime;

@Catch(MulterError)
export class WorkbookUploadExceptionFilter implements ExceptionFilter<MulterErrorInstance> {
  catch(error: MulterErrorInstance, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: 'TIMETABLE_IMPORT_FILE_TOO_LARGE',
        message: 'XLSX file exceeds 8 MiB.',
      });
      return;
    }
    response.status(HttpStatus.BAD_REQUEST).json({
      error: 'TIMETABLE_IMPORT_MALFORMED_MULTIPART',
      message: 'Workbook upload is malformed.',
    });
  }
}
