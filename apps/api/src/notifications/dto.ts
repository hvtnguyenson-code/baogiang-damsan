import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  limit?: string;
}

class WebPushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]{87}=?$/)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]{22}(==)?$/)
  auth!: string;
}

export class CreateWebPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  endpoint!: string;

  @IsObject()
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys!: WebPushKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;
}

export class RevokeWebPushEndpointDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  endpoint!: string;
}
