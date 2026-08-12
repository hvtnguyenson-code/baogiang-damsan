import { BadRequestException, Injectable, RequestTimeoutException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { Worker } from 'worker_threads';
import { WORKBOOK_PARSE_TIMEOUT_MS, WORKER_RESOURCE_LIMITS } from './workbook-limits';
import { ParsedWorkbook, WorkbookWorkerResponse } from './workbook-parser.types';

@Injectable()
export class WorkbookParserService {
  protected createWorker(workerPath: string): Worker {
    return new Worker(workerPath, {
      resourceLimits: WORKER_RESOURCE_LIMITS,
      ...(workerPath.endsWith('.ts') ? { execArgv: ['-r', 'ts-node/register/transpile-only'] } : {}),
    });
  }

  parse(buffer: Buffer): Promise<ParsedWorkbook> {
    return new Promise((resolve, reject) => {
      const compiledWorker = join(__dirname, 'workbook-parser.worker.js');
      const sourceWorker = join(__dirname, 'workbook-parser.worker.ts');
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
      const timer = setTimeout(() => finish(new RequestTimeoutException({ error: 'TIMETABLE_IMPORT_WORKBOOK_PARSE_TIMEOUT', message: 'Workbook parsing timed out.' })), WORKBOOK_PARSE_TIMEOUT_MS);
      worker.once('error', () => finish(new BadRequestException({ error: 'TIMETABLE_IMPORT_INVALID_XLSX', message: 'Workbook is invalid or unsupported.' })));
      worker.once('message', (result: WorkbookWorkerResponse) => result.ok
        ? finish(undefined, result.workbook)
        : finish(new BadRequestException({ error: `TIMETABLE_IMPORT_${result.code ?? 'INVALID_XLSX'}`, message: 'Workbook is invalid or unsupported.' })));
      const copy = Uint8Array.from(buffer);
      worker.postMessage(copy, [copy.buffer]);
    });
  }
}
