import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface MulterErrorInstance extends Error {
  code: string;
}
interface MulterRuntime {
  MulterError: new (...arguments_: unknown[]) => MulterErrorInstance;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MulterError } = require('multer') as MulterRuntime;

@Catch(MulterError)
export class PpctWorkbookUploadExceptionFilter
  implements ExceptionFilter<MulterErrorInstance>
{
  catch(error: MulterErrorInstance, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: 'PPCT_IMPORT_FILE_TOO_LARGE',
        message: 'Tệp XLSX vượt quá giới hạn 8 MiB.',
      });
      return;
    }
    response.status(HttpStatus.BAD_REQUEST).json({
      error: 'PPCT_IMPORT_MALFORMED_MULTIPART',
      message: 'Yêu cầu tải tệp PPCT không hợp lệ.',
    });
  }
}
