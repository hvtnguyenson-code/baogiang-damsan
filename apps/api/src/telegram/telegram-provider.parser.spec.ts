import { TelegramProviderParser } from './telegram-provider.parser';

describe('TelegramProviderParser', () => {
  it('1. returns null when update_id is missing or payload is invalid', () => {
    expect(TelegramProviderParser.parseUpdate(null)).toBeNull();
    expect(TelegramProviderParser.parseUpdate(undefined)).toBeNull();
    expect(TelegramProviderParser.parseUpdate([])).toBeNull();
    expect(TelegramProviderParser.parseUpdate('string')).toBeNull();
    expect(TelegramProviderParser.parseUpdate({})).toBeNull();
    expect(TelegramProviderParser.parseUpdate({ update_id: '' })).toBeNull();
  });

  it('2. returns null when update_id is non-numeric', () => {
    expect(TelegramProviderParser.parseUpdate({ update_id: 'abc' })).toBeNull();
    expect(TelegramProviderParser.parseUpdate({ update_id: '12-34' })).toBeNull();
  });

  it('3. provider extra fields do not break /start parsing', () => {
    const raw = {
      update_id: 10001,
      extra_provider_field: 'arbitrary_metadata',
      another_extra: { nested: true, count: 42 },
      message: {
        message_id: 999,
        date: 1728216000,
        text: '/start test_token_1234567890abcdef_XYZ',
        chat: {
          id: 123456789,
          type: 'private',
          first_name: 'Nguyen',
          username: 'nguyen_test',
          extra_chat_field: true,
        },
        from: {
          id: 987654321,
          is_bot: false,
          first_name: 'Nguyen',
          language_code: 'vi',
        },
        entities: [{ offset: 0, length: 6, type: 'bot_command' }],
      },
    };

    const parsed = TelegramProviderParser.parseUpdate(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.updateId).toBe('10001');
    expect(parsed?.isSupportedStart).toBe(true);
    expect(parsed?.rawToken).toBe('test_token_1234567890abcdef_XYZ');
    expect(parsed?.telegramUserId).toBe('987654321');
    expect(parsed?.telegramChatId).toBe('123456789');
  });

  it('4. unsupported valid update -> isSupportedStart: false (ignored, zero mutation)', () => {
    // Non-private chat (group)
    const groupUpdate = {
      update_id: 10002,
      message: {
        text: '/start some_valid_token_12345678',
        chat: { id: 999, type: 'group' },
        from: { id: 888 },
      },
    };
    const parsedGroup = TelegramProviderParser.parseUpdate(groupUpdate);
    expect(parsedGroup).not.toBeNull();
    expect(parsedGroup?.updateId).toBe('10002');
    expect(parsedGroup?.isSupportedStart).toBe(false);

    // Private chat, regular text message (not /start)
    const textUpdate = {
      update_id: 10003,
      message: {
        text: 'Xin chào bot',
        chat: { id: 123456, type: 'private' },
        from: { id: 123456 },
      },
    };
    const parsedText = TelegramProviderParser.parseUpdate(textUpdate);
    expect(parsedText).not.toBeNull();
    expect(parsedText?.updateId).toBe('10003');
    expect(parsedText?.isSupportedStart).toBe(false);

    // /start without token
    const bareStart = {
      update_id: 10004,
      message: {
        text: '/start',
        chat: { id: 123456, type: 'private' },
        from: { id: 123456 },
      },
    };
    const parsedBare = TelegramProviderParser.parseUpdate(bareStart);
    expect(parsedBare?.isSupportedStart).toBe(false);

    // Non-message update (e.g. channel_post, inline_query)
    const inlineUpdate = {
      update_id: 10005,
      inline_query: { id: 'inline1' },
    };
    const parsedInline = TelegramProviderParser.parseUpdate(inlineUpdate);
    expect(parsedInline).not.toBeNull();
    expect(parsedInline?.isSupportedStart).toBe(false);
  });
});
