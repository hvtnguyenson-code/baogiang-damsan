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

      if (response.ok) {
        try {
          const body = (await response.json()) as { ok?: boolean; result?: { message_id?: number } };
          if (body?.ok === true && body.result?.message_id != null) {
            return {
              success: true,
              providerMessageId: String(body.result.message_id),
            };
          }
          // CX-03: HTTP 200 with missing message_id or malformed body without definitive rejection MUST be UNKNOWN
          return {
            success: false,
            sanitizedErrorCode: 'MALFORMED_SUCCESS_ACKNOWLEDGEMENT',
            uncertainOutcome: true,
          };
        } catch (parseError: unknown) {
          const isAbort = (parseError as { name?: string })?.name === 'AbortError';
          return {
            success: false,
            sanitizedErrorCode: isAbort ? 'TIMEOUT' : 'PROVIDER_RESPONSE_PARSE_ERROR',
            uncertainOutcome: true,
          };
        }
      }

      // CX-02: 4xx client errors are definitive provider rejections.
      // Persist ONLY deterministic safe code derived from HTTP status code (e.g. HTTP_400, HTTP_403, HTTP_404, HTTP_429).
      // NEVER inspect or persist untrusted provider description to prevent secret leakage (bot token, webhook secret, URLs, raw prose).
      if (response.status >= 400 && response.status < 500) {
        return {
          success: false,
          sanitizedErrorCode: `HTTP_${response.status}`,
          uncertainOutcome: false,
        };
      }

      // 5xx server errors are uncertain because provider might have dispatched the message before failing
      return {
        success: false,
        sanitizedErrorCode: `HTTP_${response.status}`,
        uncertainOutcome: true,
      };
    } catch (error: unknown) {
      const isAbort = (error as { name?: string })?.name === 'AbortError';
      return {
        success: false,
        sanitizedErrorCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        uncertainOutcome: true,
      };
    } finally {
      // CX-04: Timeout deadline covers the entire network operation including body reading/parsing.
      clearTimeout(timeoutId);
    }
  }
}
