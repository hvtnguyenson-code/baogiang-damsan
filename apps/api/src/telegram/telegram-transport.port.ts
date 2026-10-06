export const TELEGRAM_TRANSPORT_PORT = Symbol('TELEGRAM_TRANSPORT_PORT');

export interface TelegramSendResult {
  success: boolean;
  providerMessageId?: string;
  sanitizedErrorCode?: string;
  uncertainOutcome?: boolean;
}

export interface TelegramTransportPort {
  sendMessage(chatId: string, text: string): Promise<TelegramSendResult>;
}
