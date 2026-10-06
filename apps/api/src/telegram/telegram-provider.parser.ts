export interface ParsedTelegramUpdate {
  updateId: string;
  isSupportedStart: boolean;
  rawToken?: string;
  telegramUserId?: string;
  telegramChatId?: string;
}

export class TelegramProviderParser {
  /**
   * Bounded minimal parser for Telegram webhook updates.
   * Tolerates additional provider fields (ignores them).
   * Extracts only update_id and /start payload in private chat.
   * Returns null if update_id is missing or malformed.
   */
  static parseUpdate(payload: unknown): ParsedTelegramUpdate | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const raw = payload as Record<string, unknown>;

    // update_id must be a positive integer or decimal string
    if (raw.update_id == null) {
      return null;
    }
    const updateIdStr = String(raw.update_id).trim();
    if (!/^[0-9]{1,32}$/.test(updateIdStr)) {
      return null;
    }

    // Default: unsupported or non-message update (valid update_id, but IGNORED)
    const baseResult: ParsedTelegramUpdate = {
      updateId: updateIdStr,
      isSupportedStart: false,
    };

    if (!raw.message || typeof raw.message !== 'object' || Array.isArray(raw.message)) {
      return baseResult;
    }

    const message = raw.message as Record<string, unknown>;
    const chat = message.chat && typeof message.chat === 'object' ? (message.chat as Record<string, unknown>) : null;
    const from = message.from && typeof message.from === 'object' ? (message.from as Record<string, unknown>) : null;

    // Chat must be 'private'
    if (!chat || chat.type !== 'private' || chat.id == null || from?.id == null) {
      return baseResult;
    }

    const chatIdStr = String(chat.id).trim();
    const fromIdStr = String(from.id).trim();

    // Telegram IDs must be decimal strings (positive integers)
    if (!/^[0-9]{1,32}$/.test(chatIdStr) || !/^[0-9]{1,32}$/.test(fromIdStr)) {
      return baseResult;
    }

    if (typeof message.text !== 'string') {
      return baseResult;
    }

    const text = message.text.trim();
    // Bounded /start with base64url token
    const startMatch = /^\/start\s+([A-Za-z0-9_-]{16,128})$/.exec(text);
    if (!startMatch) {
      return baseResult;
    }

    return {
      updateId: updateIdStr,
      isSupportedStart: true,
      rawToken: startMatch[1],
      telegramUserId: fromIdStr,
      telegramChatId: chatIdStr,
    };
  }
}
