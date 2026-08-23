import { CivilDateString } from '@baogiang/contracts';
import { Prisma } from '@prisma/client';
import { ReportingCounts, ReportingDetail, ReportingFinding } from '../reporting-projection/reporting-projection.types';
export const PERSONAL_TEACHING_REPORTING_PROJECTION_PROFILE = 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1' as const;
export const PERSONAL_REPORTING_CLOCK = Symbol('PERSONAL_REPORTING_CLOCK');
export interface PersonalReportingClock { now(): Date; }
export interface ResolvePersonalReportingProjectionInput { academicYearId:string; targetUserId:string; fromCivilDate:CivilDateString; toCivilDate:CivilDateString; asOfInstant:Date; }
export interface PersonalResponsibilityInterval { teachingAssignmentId:string; schoolClassId:string; subjectId:string; validFrom:CivilDateString; validUntil:CivilDateString|null; }
export interface PersonalReportingFinding { severity:'BLOCKER'; code: ReportingFinding['code']|'RESPONSIBILITY_SCOPE_PROVENANCE_INVALID'|'RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH'|'DUPLICATE_PERSONAL_OCCURRENCE'|'PERSONAL_AGGREGATE_RECONCILIATION_FAILED'; reason:string; entityIds:string[]; occurrenceKey:string|null; }
export interface PersonalReportingSection { schoolClassId:string; subjectId:string; responsibilityIntervals:PersonalResponsibilityInterval[]; status:'PASS'|'BLOCKED'; counts:ReportingCounts|null; details:ReportingDetail[]; findings:PersonalReportingFinding[]; }
export interface PersonalReportingProjection { profile:typeof PERSONAL_TEACHING_REPORTING_PROJECTION_PROFILE; scope:ResolvePersonalReportingProjectionInput; responsibilityState:'RESPONSIBILITY_PRESENT'|'ZERO_RESPONSIBILITY'; status:'PASS'|'BLOCKED'; counts:ReportingCounts|null; responsibilityManifest:PersonalResponsibilityInterval[]; sections:PersonalReportingSection[]; findings:PersonalReportingFinding[]; evaluatedAt:string; }
export type PersonalTx = Prisma.TransactionClient;