import { Test } from '@nestjs/testing';
import { NotificationsModule } from '../../src/notifications/notifications.module';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('NotificationsModule DI Bootstrap (unit/integration)', () => {
  it('successfully compiles NotificationsModule without missing dependencies', async () => {
    const previous = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = 'postgresql://test@127.0.0.1:1/di_test';
    process.env['WEB_PUSH_ENABLED'] = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    const service = moduleRef.get<NotificationsService>(NotificationsService);
    const controller = moduleRef.get<NotificationsController>(NotificationsController);

    expect(service).toBeDefined();
    expect(controller).toBeDefined();

    await moduleRef.close();
    if (previous === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previous;
  });
});
