import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app.config';
import { TelegramSendResult, TelegramTransportPort } from './telegram-transport.port';

@Injectable()
export class TelegramBotApiAdapter implements TelegramTransportPort {
  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  async sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
    if (!this.config.telegram.enabled || !this.config.telegram.botToken) {
      return {
        success: false,
        sanitizedErrorCode: 'FEATURE_DISABLED',
        uncertainOutcome: false,
      };
    }

    const token = this.config.telegram.botToken;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        try {
          const body = (await response.json()) as { ok?: boolean; result?: { message_id?: number } };
          if (body?.ok === true && body.result?.message_id != null) {
            return {
              success: true,
              providerMessageId: String(body.result.message_id),
            };
          }
          return {
            success: false,
            sanitizedErrorCode: 'INVALID_PROVIDER_PAYLOAD',
            uncertainOutcome: false,
          };
        } catch {
          // If JSON parse fails on 200 OK, message might have been sent!
          return {
            success: false,
            sanitizedErrorCode: 'PROVIDER_RESPONSE_PARSE_ERROR',
            uncertainOutcome: true,
          };
        }
      }

      // 4xx client errors (e.g. 400 Bad Request, 403 Forbidden, 404 Not Found)
      if (response.status >= 400 && response.status < 500) {
        let code = `HTTP_${response.status}`;
        try {
          const errBody = (await response.json()) as { error_code?: number; description?: string };
          if (errBody?.description) {
            // Sanitize description: take alphanumeric, dash, underscore, space, bounded to 64 chars
            const sanitizedDesc = errBody.description.replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 64).trim();
            if (sanitizedDesc) {
              code = `${code}_${sanitizedDesc.toUpperCase().replace(/\s+/g, '_')}`;
            }
          }
        } catch {
          // Fall back to HTTP_status
        }
        return {
          success: false,
          sanitizedErrorCode: code.slice(0, 64),
          uncertainOutcome: false,
        };
      }

      // 5xx server errors are uncertain because server might have dispatched the message
      return {
        success: false,
        sanitizedErrorCode: `HTTP_${response.status}`,
        uncertainOutcome: true,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (error as { name?: string })?.name === 'AbortError';
      return {
        success: false,
        sanitizedErrorCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        uncertainOutcome: true,
      };
    }
  }
}
