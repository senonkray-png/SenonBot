import { Api } from "telegram";

type PeerProfile = {
  telegramId: number;
  username: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
};

export function getPeerStorageId(peer: Api.TypePeer): number {
  if (peer instanceof Api.PeerUser) {
    return toNumber(peer.userId);
  }

  if (peer instanceof Api.PeerChat) {
    return -toNumber(peer.chatId);
  }

  if (peer instanceof Api.PeerChannel) {
    return Number(`-100${toNumber(peer.channelId)}`);
  }

  throw new Error("Unsupported peer type");
}

export function getPeerProfile(entity: Api.TypeUser | Api.TypeChat, peerId: number): PeerProfile {
  if (entity instanceof Api.User) {
    const firstName = entity.firstName ?? null;
    const lastName = entity.lastName ?? null;
    const username = entity.username ?? null;
    const phone = entity.phone ? normalizePhone(entity.phone) : null;
    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      (username ? `@${username}` : `User ${peerId}`);

    return {
      telegramId: peerId,
      username,
      phone,
      firstName,
      lastName,
      displayName
    };
  }

  if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
    const username = "username" in entity ? entity.username ?? null : null;

    return {
      telegramId: peerId,
      username,
      phone: null,
      firstName: null,
      lastName: null,
      displayName: entity.title || `Chat ${peerId}`
    };
  }

  return {
    telegramId: peerId,
    username: null,
    phone: null,
    firstName: null,
    lastName: null,
    displayName: `Chat ${peerId}`
  };
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value && typeof value === "object" && "toJSNumber" in value) {
    return Number((value as { toJSNumber: () => number }).toJSNumber());
  }

  return Number(value);
}

function normalizePhone(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

