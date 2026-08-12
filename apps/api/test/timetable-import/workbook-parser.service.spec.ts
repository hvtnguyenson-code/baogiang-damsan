import { EventEmitter } from 'events';
import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { Worker } from 'worker_threads';
import { WorkbookParserService } from '../../src/timetable-import/workbook-parser.service';
import { WORKBOOK_PARSE_TIMEOUT_MS } from '../../src/timetable-import/workbook-limits';

class FakeWorker extends EventEmitter {
  readonly terminate = jest.fn().mockResolvedValue(0);
  readonly postMessage = jest.fn();
}

class TimeoutParserService extends WorkbookParserService {
  constructor(private readonly fakeWorker: FakeWorker) { super(); }
  protected createWorker(): Worker { return this.fakeWorker as unknown as Worker; }
}

interface TestArchive {
  append(source: string | Buffer, options: { name: string }): void;
  finalize(): Promise<void>;
  pipe(stream: PassThrough): void;
  once(event: 'error', listener: (error: Error) => void): void;
}
type TestArchiver = (format: 'zip', options: { zlib: { level: number } }) => TestArchive;
// Test-only fixture construction reuses ExcelJS's already-installed archiver dependency.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver') as TestArchiver;

async function syntheticOoxmlPackage(extraName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    output.once('end', () => resolve(Buffer.concat(chunks)));
    output.once('error', reject);
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.once('error', reject);
    archive.pipe(output);
    archive.append('<Types/>', { name: '[Content_Types].xml' });
    archive.append('<workbook/>', { name: 'xl/workbook.xml' });
    archive.append(Buffer.from('never executed'), { name: extraName });
    void archive.finalize();
  });
}

describe('WorkbookParserService worker boundary', () => {
  it('parses a real XLSX through the isolated worker protocol', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TKB').addRow(['Thứ', 'Buổi']);
    const result = await new WorkbookParserService().parse(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(result.sheets[0]).toMatchObject({ name: 'TKB', state: 'VISIBLE', rowCount: 1, columnCount: 2 });
  });

  it('terminates the parser worker when the hard deadline expires', async () => {
    jest.useFakeTimers();
    const worker = new FakeWorker();
    const parser = new TimeoutParserService(worker);
    const result = parser.parse(Buffer.from('untrusted workbook'));
    const rejection = expect(result).rejects.toMatchObject({ status: 408 });
    await jest.advanceTimersByTimeAsync(WORKBOOK_PARSE_TIMEOUT_MS);
    await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('sanitizes worker failures and never exposes the raw parser error', async () => {
    const worker = new FakeWorker();
    const parser = new TimeoutParserService(worker);
    const result = parser.parse(Buffer.from('untrusted workbook'));
    worker.emit('error', new Error('C:\\Users\\Administrator\\secret raw XML <x>'));
    const error = await result.catch((reason: unknown) => reason) as { response: { error: string }; message: string };
    expect(error.response.error).toBe('TIMETABLE_IMPORT_INVALID_XLSX');
    expect(error.message).not.toContain('secret raw XML');
  });

  it.each([
    ['xl/vbaProject.bin', 'TIMETABLE_IMPORT_MACRO_WORKBOOK_UNSUPPORTED'],
    ['xl/externalLinks/externalLink1.xml', 'TIMETABLE_IMPORT_EXTERNAL_LINKS_UNSUPPORTED'],
  ])('rejects the real ZIP preflight part %s with stable public code', async (partName, publicCode) => {
    const result = new WorkbookParserService().parse(await syntheticOoxmlPackage(partName));
    await expect(result).rejects.toMatchObject({ response: { error: publicCode } });
  });
});
