import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BUSINESS_POLICY_REGISTRY, PRODUCTION_BUSINESS_POLICY_FAMILIES } from './business-policy-registry';
import { BusinessConfigurationController } from './business-configuration.controller';
import { BusinessConfigurationService } from './business-configuration.service';
@Module({ imports: [AuthModule, AuthorizationModule], controllers: [BusinessConfigurationController], providers: [AuditService, BusinessConfigurationService, { provide: BUSINESS_POLICY_REGISTRY, useValue: PRODUCTION_BUSINESS_POLICY_FAMILIES }], exports: [BusinessConfigurationService, BUSINESS_POLICY_REGISTRY] })
export class BusinessConfigurationModule {}
