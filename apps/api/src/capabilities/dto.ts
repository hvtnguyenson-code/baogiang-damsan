import { Type } from 'class-transformer'; import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'; import { CapabilityScope } from '@baogiang/contracts';
export class PageDto { @IsOptional()@Type(()=>Number)@IsInt()@Min(1)page=1;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(100)pageSize=20; }
export class ListCapabilitiesDto extends PageDto { @IsOptional()@Type(()=>Boolean)@IsBoolean()isActive?:boolean; }
export class ListGrantsDto extends PageDto { @IsOptional()@IsString()capabilityKey?:string;@IsOptional()@IsEnum(['PERSONAL','SUBJECT_GROUP','SUBJECT','ACTIVITY','SCHOOL_WIDE'])scopeType?:CapabilityScope;@IsOptional()@Type(()=>Boolean)@IsBoolean()revoked?:boolean;@IsOptional()@IsDateString()activeAt?:string; }
export class CreateGrantDto { @IsString()capabilityKey!:string;@IsEnum(['PERSONAL','SUBJECT_GROUP','SUBJECT','ACTIVITY','SCHOOL_WIDE'])scopeType!:CapabilityScope;@IsOptional()@IsUUID()scopeResourceId?:string;@IsOptional()@IsDateString()validFrom?:string;@IsOptional()@IsDateString()validUntil?:string; }
export class RevokeGrantDto { @IsOptional()@IsString()revokeReason?:string; }
