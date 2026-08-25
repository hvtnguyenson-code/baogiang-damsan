import { Injectable } from '@nestjs/common';
export const REPORTING_STATEMENT_CLOCK = Symbol('REPORTING_STATEMENT_CLOCK');
export interface ReportingStatementClock { now(): Date; }
@Injectable() export class SystemReportingStatementClock implements ReportingStatementClock { now() { return new Date(); } }
export const PERSONAL_REPORTING_STATEMENT_PROFILE = 'PERSONAL_REPORTING_STATEMENT_V1';
