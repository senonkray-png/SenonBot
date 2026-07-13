/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
