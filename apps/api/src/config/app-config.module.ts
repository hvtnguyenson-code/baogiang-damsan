import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfig, AppConfig } from './app.config';

/**
 * AppConfigModule: loads and validates application configuration.
 */
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
  ],
  providers: [
    {
      provide: 'APP_CONFIG',
      useFactory: (configService: ConfigService): AppConfig =>
        configService.get<AppConfig>('app') as AppConfig,
      inject: [ConfigService],
    },
  ],
  exports: ['APP_CONFIG'],
})
export class AppConfigModule {}
