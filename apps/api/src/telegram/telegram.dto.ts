import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { TelegramTestNotificationRequest } from '@baogiang/contracts';

export class SendTelegramTestNotificationDto implements TelegramTestNotificationRequest {
  @IsNotEmpty({ message: 'requestKey là bắt buộc' })
  @IsString({ message: 'requestKey phải là chuỗi' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, {
    message: 'requestKey phải là UUID v4 chữ thường chuẩn',
  })
  requestKey!: string;
}
