import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { Worker } from 'worker_threads';
import {
  WORKBOOK_PARSE_TIMEOUT_MS,
  WORKER_RESOURCE_LIMITS,
} from '../timetable-import/workbook-limits';
import type {
  ParsedWorkbook,
  WorkbookWorkerResponse,
} from '../timetable-import/workbook-parser.types';

@Injectable()
export class PpctWorkbookParserService {
  protected createWorker(workerPath: string): Worker {
    return new Worker(workerPath, {
      resourceLimits: WORKER_RESOURCE_LIMITS,
      ...(workerPath.endsWith('.ts')
        ? { execArgv: ['-r', 'ts-node/register/transpile-only'] }
        : {}),
    });
  }

  parse(buffer: Buffer): Promise<ParsedWorkbook> {
    return new Promise((resolve, reject) => {
      const compiledWorker = join(__dirname, 'ppct-workbook-parser.worker.js');
      const sourceWorker = join(__dirname, 'ppct-workbook-parser.worker.ts');
      const workerPath = existsSync(compiledWorker) ? compiledWorker : sourceWorker;
      const worker = this.createWorker(workerPath);
      let settled = false;

      const finish = (error?: Error, workbook?: ParsedWorkbook): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        error ? reject(error) : resolve(workbook!);
      };

      const timer = setTimeout(
        () =>
          finish(
            new RequestTimeoutException({
              error: 'PPCT_IMPORT_TIMEOUT',
              message: 'Phân tích tệp PPCT vượt quá thời gian cho phép.',
            }),
          ),
        WORKBOOK_PARSE_TIMEOUT_MS,
      );

      worker.once('error', () =>
        finish(
          new BadRequestException({
            error: 'PPCT_IMPORT_INVALID_FILE_TYPE',
            message: 'Tệp PPCT không phải XLSX hợp lệ hoặc không được hỗ trợ.',
          }),
        ),
      );

      worker.once('message', (result: WorkbookWorkerResponse) => {
        if (result.ok) {
          finish(undefined, result.workbook);
          return;
        }
        finish(
          new BadRequestException({
            error: result.code ?? 'PPCT_IMPORT_INVALID_FILE_TYPE',
            message: 'Tệp PPCT không hợp lệ hoặc vi phạm hợp đồng an toàn.',
          }),
        );
      });

      const copy = Uint8Array.from(buffer);
      worker.postMessage(copy, [copy.buffer]);
    });
  }
}
