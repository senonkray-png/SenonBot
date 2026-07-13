import {
  ArrowLeft,
  Bot,
  FileText,
  Crown,
  Image,
  MoreHorizontal,
  Mic,
  Pin,
  Play,
  Search,
  Settings,
  Star,
  Video,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addVipUser,
  disableAiChat,
  enableAiChat,
  favoriteChat,
  getChats,
  getMessages,
  getSettings,
  pinChat,
  unfavoriteChat,
  unpinChat,
  updateSettings,
  type ChatMessage,
  type ChatSummary,
  type FullSettings
} from "./lib/api.js";
import { telegramApp } from "./lib/telegram.js";
import { normalizeVipInput } from "./lib/vip.js";

type View = "contacts" | "chat";
type ChatTab = "chats" | "groups" | "favorites" | "media";

const MESSAGE_LIMITS = [10, 15, 20, 25, 30];
const AUTOREPLY_MODES = [
  { value: "none", label: "Выкл" },
  { value: "contacts", label: "Контакты" },
  { value: "all", label: "Все" }
];

const DEFAULT_SETTINGS: FullSettings = {
  messageLimit: 10,
  aiDelayMinutes: 5,
  autoreplyMode: "none",
  autoreplyTemplate: "Спасибо за сообщение. Я отвечу, как только буду на связи.",
  readDelayMinutes: 2
};

export function App() {
  const [view, setView] = useState<View>("contacts");
  const [activeTab, setActiveTab] = useState<ChatTab>("chats");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mediaViewerMessage, setMediaViewerMessage] = useState<ChatMessage | null>(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettingsState] = useState<FullSettings>(DEFAULT_SETTINGS);
  const [vipInput, setVipInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  const loadChats = useCallback(async () => {
    const nextChats = await getChats(search);
    setChats(nextChats);
  }, [search]);

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    loadChats()
      .catch((error) => setNotice(error.message))
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadChats]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadChats().catch((error) => setNotice(error.message));
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadChats]);

  useEffect(() => {
    getSettings()
      .then((s) => setSettingsState(s))
      .catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    const handleBack = () => {
      if (isSettingsOpen) {
        setSettingsOpen(false);
        return;
      }

      setView("contacts");
      setActiveChat(null);
    };

    if (view === "chat" || isSettingsOpen) {
      telegramApp?.BackButton.show();
      telegramApp?.BackButton.onClick(handleBack);
    } else {
      telegramApp?.BackButton.hide();
    }

    return () => {
      telegramApp?.BackButton.offClick(handleBack);
    };
  }, [isSettingsOpen, view]);

  const openChat = async (chat: ChatSummary) => {
    setActiveChat(chat);
    setView("chat");
    setMessages([]);

    try {
      setMessages(await getMessages(chat.user_id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось открыть чат");
    }
  };

  useEffect(() => {
    if (!activeChat || view !== "chat") {
      return;
    }

    const interval = window.setInterval(() => {
      void getMessages(activeChat.user_id)
        .then(setMessages)
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "Не удалось обновить чат")
        );
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeChat, view]);

  const closeChat = () => {
    setView("contacts");
    setActiveChat(null);
  };

  // ---- Settings save helpers ----

  const saveSetting = async <K extends keyof FullSettings>(
    key: K,
    value: FullSettings[K]
  ) => {
    setSettingsState((prev) => ({ ...prev, [key]: value }));
    try {
      const updated = await updateSettings({ [key]: value });
      setSettingsState(updated);
      setNotice("Настройки сохранены");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить");
    }
  };

  const submitVip = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeVipInput(vipInput);

    if (!normalized) {
      setNotice("Проверь формат: ID, @username, t.me/username или +телефон");
      return;
    }

    try {
      const result = await addVipUser(normalized);
      setVipInput("");
      setNotice(`VIP добавлен: ${result.telegramId}`);
      await loadChats();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось добавить VIP");
    }
  };

  const toggleActiveFavorite = async () => {
    if (!activeChat) {
      return;
    }

    try {
      const nextIsVip = !activeChat.is_vip;

      if (nextIsVip) {
        await favoriteChat(activeChat.user_id);
      } else {
        await unfavoriteChat(activeChat.user_id);
      }

      const nextActiveChat = { ...activeChat, is_vip: nextIsVip };

      setActiveChat(nextActiveChat);
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.user_id === activeChat.user_id ? { ...chat, is_vip: nextIsVip } : chat
        )
      );
      setNotice(
        nextIsVip
          ? "Чат добавлен в избранные и будет храниться полностью"
          : "Чат убран из избранных"
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось изменить избранное");
    }
  };

  const toggleActivePin = async () => {
    if (!activeChat) {
      return;
    }

    try {
      const nextIsPinned = !activeChat.is_pinned;

      if (nextIsPinned) {
        await pinChat(activeChat.user_id);
      } else {
        await unpinChat(activeChat.user_id);
      }

      const nextActiveChat = { ...activeChat, is_pinned: nextIsPinned };

      setActiveChat(nextActiveChat);
      setChats((currentChats) =>
        sortChats(
          currentChats.map((chat) =>
            chat.user_id === activeChat.user_id
              ? { ...chat, is_pinned: nextIsPinned }
              : chat
          )
        )
      );
      setNotice(nextIsPinned ? "Чат закреплен" : "Чат откреплен");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось изменить закрепление");
    }
  };

  const toggleActiveAi = async () => {
    if (!activeChat) return;

    try {
      const nextAi = !activeChat.ai_enabled;

      if (nextAi) {
        await enableAiChat(activeChat.user_id);
      } else {
        await disableAiChat(activeChat.user_id);
      }

      const nextActiveChat = { ...activeChat, ai_enabled: nextAi };
      setActiveChat(nextActiveChat);
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.user_id === activeChat.user_id ? { ...chat, ai_enabled: nextAi } : chat
        )
      );
      setNotice(nextAi ? "ИИ ответы включены для этого чата" : "ИИ ответы выключены");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось переключить ИИ");
    }
  };

  const activeTitle = activeChat?.display_name ?? "Чат";
  const filteredChats = useMemo(() => {
    const filtered = chats.filter((chat) => {
      if (activeTab === "chats") {
        return chat.user_id > 0;
      }

      if (activeTab === "groups") {
        return chat.user_id < 0;
      }

      if (activeTab === "favorites") {
        return chat.is_vip;
      }

      if (activeTab === "media") {
        return Boolean(chat.has_media);
      }

      return true;
    });

    return sortChats(filtered);
  }, [activeTab, chats]);

  return (
    <main className="app-shell">
      <section className={`view-stack ${view === "chat" ? "is-chat-open" : ""}`}>
        <div className="contacts-view">
          <header className="contacts-header">
            <label className="search-box">
              <Search size={22} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск"
              />
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label="Настройки"
              title="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={22} />
            </button>
          </header>

          <div className="chat-tabs" aria-label="Фильтры">
            <button
              className={activeTab === "chats" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveTab("chats")}
            >
              Чаты
            </button>
            <button
              className={activeTab === "groups" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveTab("groups")}
            >
              Группы
            </button>
            <button
              className={activeTab === "favorites" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveTab("favorites")}
            >
              VIP <span>{chats.filter((chat) => chat.is_vip).length}</span>
            </button>
            <button
              className={activeTab === "media" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveTab("media")}
            >
              Медиа
            </button>
          </div>

          <div className="chat-list">
            {isLoading ? (
              <p className="empty-state">Загрузка...</p>
            ) : filteredChats.length === 0 ? (
              <p className="empty-state">Пока нет сообщений</p>
            ) : (
              filteredChats.map((chat) => (
                <button
                  className="chat-row"
                  key={chat.user_id}
                  type="button"
                  onClick={() => void openChat(chat)}
                >
                  <Avatar chat={chat} />
                  <span className="chat-main">
                    <span className="chat-title-line">
                      <strong>{chat.display_name}</strong>
                      {chat.is_vip ? <Crown size={17} aria-label="VIP" /> : null}
                      {chat.ai_enabled ? <Bot size={17} aria-label="ИИ" className="ai-badge" /> : null}
                    </span>
                    <span className="chat-preview">{chat.last_message_preview}</span>
                  </span>
                  <span className="chat-meta">
                    <time>{formatListTime(chat.last_message_at)}</time>
                    <Pin
                      className={chat.is_pinned ? "is-pinned" : ""}
                      size={20}
                      aria-label={chat.is_pinned ? "Закреплен" : "Не закреплен"}
                    />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="chat-view" aria-hidden={view !== "chat"}>
          <header className="chat-header">
            <button
              className="back-button"
              type="button"
              aria-label="Назад"
              onClick={closeChat}
            >
              <ArrowLeft size={30} />
            </button>
            <div className="chat-heading">
              <strong>{activeTitle}</strong>
              <span>был(а) недавно</span>
            </div>
            {activeChat ? <Avatar chat={activeChat} compact /> : <span />}
          </header>

          <div className="pinned-message">
            <span />
            <div>
              <strong>Закрепленное сообщение</strong>
              <p>{activeChat ? activeChat.user_id : "ID пользователя"}</p>
            </div>
            <MoreHorizontal size={24} aria-hidden="true" />
          </div>

          {activeChat ? (
            <div className="chat-actions">
              <button
                className={`chat-action-button ${activeChat.is_vip ? "is-active" : ""}`}
                type="button"
                onClick={() => void toggleActiveFavorite()}
              >
                <Star size={19} fill={activeChat.is_vip ? "currentColor" : "none"} />
                <span>{activeChat.is_vip ? "В избранных" : "Избранные"}</span>
              </button>
              <button
                className={`chat-action-button ${activeChat.is_pinned ? "is-active" : ""}`}
                type="button"
                onClick={() => void toggleActivePin()}
              >
                <Pin size={19} fill={activeChat.is_pinned ? "currentColor" : "none"} />
                <span>{activeChat.is_pinned ? "Закреплен" : "Закрепить"}</span>
              </button>
              <button
                className={`chat-action-button ${activeChat.ai_enabled ? "is-active" : ""}`}
                type="button"
                onClick={() => void toggleActiveAi()}
              >
                <Bot size={19} fill={activeChat.ai_enabled ? "currentColor" : "none"} />
                <span>{activeChat.ai_enabled ? "ИИ вкл" : "ИИ ответы"}</span>
              </button>
            </div>
          ) : null}

          <div className="messages-list">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onOpenMedia={setMediaViewerMessage}
              />
            ))}
          </div>
        </div>
      </section>

      {isSettingsOpen ? (
        <div className="modal-layer" role="dialog" aria-modal="true">
          <div className="settings-modal">
            <header>
              <h2>Настройки</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Закрыть"
                title="Закрыть"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={22} />
              </button>
            </header>

            <div className="settings-section">
              <h3>Хранение сообщений</h3>
              <label className="field">
                <span>Лимит сообщений: {settings.messageLimit}</span>
                <input
                  type="range"
                  min={10}
                  max={30}
                  step={5}
                  value={settings.messageLimit}
                  onChange={(e) => void saveSetting("messageLimit", Number(e.target.value))}
                />
                <span className="range-labels">
                  {MESSAGE_LIMITS.map((limit) => (
                    <small key={limit}>{limit}</small>
                  ))}
                </span>
              </label>
            </div>

            <div className="settings-section">
              <h3>Автоответчик</h3>

              <label className="field">
                <span>Режим автоответов</span>
                <div className="radio-group">
                  {AUTOREPLY_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      className={`radio-button ${settings.autoreplyMode === mode.value ? "is-active" : ""}`}
                      type="button"
                      onClick={() => void saveSetting("autoreplyMode", mode.value)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Задержка ИИ ответа (мин): {settings.aiDelayMinutes}</span>
                <input
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={settings.aiDelayMinutes}
                  onChange={(e) => void saveSetting("aiDelayMinutes", Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span>Задержка возврата после прочтения (мин): {settings.readDelayMinutes}</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={settings.readDelayMinutes}
                  onChange={(e) => void saveSetting("readDelayMinutes", Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span>Шаблон автоответа (если LLM недоступен)</span>
                <textarea
                  className="template-input"
                  value={settings.autoreplyTemplate}
                  onChange={(e) => setSettingsState((prev) => ({ ...prev, autoreplyTemplate: e.target.value }))}
                  onBlur={(e) => void saveSetting("autoreplyTemplate", e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </label>
            </div>

            <div className="settings-section">
              <h3>VIP пользователи</h3>
              <form className="vip-form" onSubmit={(event) => void submitVip(event)}>
                <label className="field">
                  <span>VIP пользователь</span>
                  <input
                    value={vipInput}
                    onChange={(event) => setVipInput(event.target.value)}
                    placeholder="@username, t.me/name, +380... или ID"
                  />
                </label>
                <button className="primary-button" type="submit">
                  Добавить VIP
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <button className="toast" type="button" onClick={() => setNotice(null)}>
          {notice}
        </button>
      ) : null}

      {mediaViewerMessage ? (
        <MediaViewer
          message={mediaViewerMessage}
          onClose={() => setMediaViewerMessage(null)}
        />
      ) : null}
    </main>
  );
}

function Avatar({ chat, compact = false }: { chat: ChatSummary; compact?: boolean }) {
  const initials = getInitials(chat.display_name);

  return (
    <span
      className={`avatar ${compact ? "is-compact" : ""}`}
      style={{ "--avatar-hue": getAvatarHue(chat.user_id) } as React.CSSProperties}
    >
      {chat.avatar_url ? <img src={chat.avatar_url} alt="" /> : initials}
    </span>
  );
}

function MessageBubble({
  message,
  onOpenMedia
}: {
  message: ChatMessage;
  onOpenMedia: (message: ChatMessage) => void;
}) {
  const isBot = message.sender === "bot";

  return (
    <article className={`message-bubble ${isBot ? "is-outgoing" : "is-incoming"}`}>
      {message.media_type ? (
        <MediaPreview message={message} onOpen={() => onOpenMedia(message)} />
      ) : null}
      {message.text ? <p>{message.text}</p> : null}
      <div className="message-footer">
        <time>{formatMessageTime(message.timestamp)}</time>
        {message.is_ai_reply ? <Bot size={13} className="ai-reply-badge" aria-label="ИИ" /> : null}
      </div>
    </article>
  );
}

function MediaPreview({ message, onOpen }: { message: ChatMessage; onOpen: () => void }) {
  const mediaType = message.media_type ?? "media";
  const Icon = mediaIcon(mediaType);

  if (message.media_url && mediaType === "photo") {
    return (
      <button className="media-render media-render-photo" type="button" onClick={onOpen}>
        <img src={message.media_url} alt="" loading="lazy" />
      </button>
    );
  }

  if (message.media_url && (mediaType === "video" || mediaType === "animation")) {
    return (
      <button className="media-render media-render-video" type="button" onClick={onOpen}>
        <video src={message.media_url} preload="metadata" playsInline />
        <span className="media-play">
          <Play size={24} fill="currentColor" />
        </span>
      </button>
    );
  }

  if (message.media_url && mediaType === "video_note") {
    return (
      <button className="media-render media-render-note" type="button" onClick={onOpen}>
        <video src={message.media_url} preload="metadata" playsInline />
        <span className="media-play">
          <Play size={22} fill="currentColor" />
        </span>
      </button>
    );
  }

  if (message.media_url && (mediaType === "voice" || mediaType === "audio")) {
    return (
      <div className="audio-preview">
        <span className="media-preview-icon">
          <Icon size={22} />
        </span>
        <audio src={message.media_url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className={`media-preview media-${mediaType}`}>
      <span className="media-preview-icon">
        <Icon size={22} />
      </span>
      <span>
        <strong>{mediaLabel(mediaType)}</strong>
        <small>{mediaHint(message)}</small>
      </span>
    </div>
  );
}

function MediaViewer({
  message,
  onClose
}: {
  message: ChatMessage;
  onClose: () => void;
}) {
  const mediaType = message.media_type ?? "media";

  return (
    <div className="media-viewer" role="dialog" aria-modal="true">
      <button
        className="media-viewer-close"
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
      >
        <X size={26} />
      </button>
      <div className="media-viewer-body">
        {message.media_url && mediaType === "photo" ? (
          <img src={message.media_url} alt="" />
        ) : null}
        {message.media_url &&
        (mediaType === "video" || mediaType === "video_note" || mediaType === "animation") ? (
          <video src={message.media_url} controls autoPlay playsInline />
        ) : null}
        {message.media_url && (mediaType === "voice" || mediaType === "audio") ? (
          <audio src={message.media_url} controls autoPlay />
        ) : null}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function getAvatarHue(id: number): string {
  return `${Math.abs(id) % 360}deg`;
}

function mediaLabel(mediaType: string): string {
  const labels: Record<string, string> = {
    photo: "Фото",
    video: "Видео",
    video_note: "Видеосообщение",
    voice: "Голосовое",
    audio: "Аудио",
    animation: "GIF",
    sticker: "Стикер",
    document: "Файл",
    protected_or_failed: "Защищенное медиа"
  };

  if (labels[mediaType]) {
    return labels[mediaType];
  }

  if (mediaType === "protected_or_failed") {
    return "protected";
  }

  return mediaType.replace("_", " ");
}

function mediaHint(message: ChatMessage): string {
  if (message.media_type === "protected_or_failed") {
    return "Telegram не дал скопировать файл";
  }

  if (!message.media_url) {
    return "Файл еще не загружен в Railway Bucket";
  }

  if (message.media_size) {
    return formatFileSize(message.media_size);
  }

  return "Открыть";
}

function mediaIcon(mediaType: string) {
  if (mediaType === "photo" || mediaType === "sticker" || mediaType === "animation") {
    return Image;
  }

  if (mediaType === "video" || mediaType === "video_note") {
    return Video;
  }

  if (mediaType === "voice" || mediaType === "audio") {
    return Mic;
  }

  if (mediaType === "protected_or_failed") {
    return Play;
  }

  return FileText;
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((left, right) => {
    if (left.is_pinned && !right.is_pinned) {
      return -1;
    }

    if (!left.is_pinned && right.is_pinned) {
      return 1;
    }

    return (
      new Date(right.last_message_at).getTime() -
      new Date(left.last_message_at).getTime()
    );
  });
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatListTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return formatMessageTime(timestamp);
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
