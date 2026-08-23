import { Injectable } from "@nestjs/common";
import { PersonalReportingClock } from "./personal-reporting-projection.types";
@Injectable()
export class SystemPersonalReportingClock implements PersonalReportingClock {
  now(): Date {
    return new Date();
  }
}
