import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: string;
}

export class CreateWebPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsObject()
  @IsNotEmpty()
  keys!: {
    p256dh: string;
    auth: string;
  };

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;
}

