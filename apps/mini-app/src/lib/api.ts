const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export type ChatSummary = {
  user_id: number;
  chat_id: number;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  last_message_preview: string;
  last_message_at: string;
  has_media?: boolean;
  is_vip: boolean;
  is_pinned?: boolean;
  ai_enabled?: boolean;
};

export type ChatMessage = {
  id: number;
  user_id: number;
  chat_id: number;
  sender: "user" | "bot";
  text: string | null;
  media_file_id: string | null;
  media_type: string | null;
  media_storage_path: string | null;
  media_mime_type: string | null;
  media_size: number | null;
  media_url: string | null;
  is_ai_reply: boolean;
  timestamp: string;
};

export type FullSettings = {
  messageLimit: number;
  aiDelayMinutes: number;
  autoreplyMode: string;
  autoreplyTemplate: string;
  readDelayMinutes: number;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export async function getChats(query = ""): Promise<ChatSummary[]> {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  const response = await apiRequest<{ chats: ChatSummary[] }>(
    `/api/chats${params.size ? `?${params}` : ""}`
  );
  return response.chats;
}

export async function getMessages(userId: number): Promise<ChatMessage[]> {
  const response = await apiRequest<{ messages: ChatMessage[] }>(
    `/api/chats/${userId}/messages`
  );
  return response.messages;
}

export async function getSettings(): Promise<FullSettings> {
  return apiRequest("/api/settings");
}

export async function updateSettings(
  patch: Partial<FullSettings>
): Promise<FullSettings> {
  return apiRequest("/api/settings", {
    method: "PATCH",
    body: patch
  });
}

// Legacy wrapper
export async function updateMessageLimit(
  messageLimit: number
): Promise<FullSettings> {
  return updateSettings({ messageLimit });
}

export async function addVipUser(
  input: string
): Promise<{ telegramId: number; source: string }> {
  return apiRequest("/api/vip", {
    method: "POST",
    body: { input }
  });
}

export async function favoriteChat(
  userId: number
): Promise<{ telegramId: number; isFavorite: boolean }> {
  return apiRequest(`/api/chats/${userId}/favorite`, {
    method: "POST"
  });
}

export async function unfavoriteChat(
  userId: number
): Promise<{ telegramId: number; isFavorite: boolean }> {
  return apiRequest(`/api/chats/${userId}/favorite`, {
    method: "DELETE"
  });
}

export async function pinChat(
  userId: number
): Promise<{ telegramId: number; isPinned: boolean }> {
  return apiRequest(`/api/chats/${userId}/pin`, {
    method: "POST"
  });
}

export async function unpinChat(
  userId: number
): Promise<{ telegramId: number; isPinned: boolean }> {
  return apiRequest(`/api/chats/${userId}/pin`, {
    method: "DELETE"
  });
}

export async function enableAiChat(
  userId: number
): Promise<{ telegramId: number; aiEnabled: boolean }> {
  return apiRequest(`/api/chats/${userId}/ai`, {
    method: "POST"
  });
}

export async function disableAiChat(
  userId: number
): Promise<{ telegramId: number; aiEnabled: boolean }> {
  return apiRequest(`/api/chats/${userId}/ai`, {
    method: "DELETE"
  });
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const initData = window.Telegram?.WebApp.initData ?? "";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload as T;
}
