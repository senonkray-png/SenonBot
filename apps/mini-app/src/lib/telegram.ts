export const telegramApp = window.Telegram?.WebApp;

export function initTelegramApp(): void {
  telegramApp?.ready();
  telegramApp?.expand();
}

