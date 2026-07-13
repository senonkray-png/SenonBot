import { TelegramClient } from "telegram";
import { Api } from "telegram/tl/index.js";
import bigInt from "big-integer";

type DialogFilter = Api.DialogFilter;

/**
 * Manages a single Telegram dialog filter folder ("Без Ответа").
 * Finds the folder by name on startup, caches its ID,
 * and moves chats in/out without creating anything.
 */
export class FolderManager {
  private readonly client: TelegramClient;
  private readonly folderName: string;
  private folderId: number | null = null;
  private pinnedCache: Map<number, { value: boolean; ts: number }> = new Map();
  private static readonly PINNED_TTL = 30_000; // 30 seconds

  constructor(client: TelegramClient, folderName: string) {
    this.client = client;
    this.folderName = folderName;
  }

  /** Find the existing folder by name and cache its ID. */
  async init(): Promise<void> {
    const filters = await this.getFilters();
    const found = filters.find((f) => this.titleText(f) === this.folderName);

    if (!found) {
      console.warn(
        `Telegram folder "${this.folderName}" not found. ` +
        `Create it manually in Telegram settings. Available folders: ` +
        filters.map((f) => `"${this.titleText(f)}" (id=${f.id})`).join(", ")
      );
      return;
    }

    this.folderId = found.id;
    console.log(`Folder "${this.folderName}" found with id=${this.folderId}`);
  }

  /** Returns the cached folder ID (or null if not found). */
  getFolderId(): number | null {
    return this.folderId;
  }

  /** Move a chat into the "Без Ответа" folder. */
  async moveToUnanswered(peerId: number): Promise<void> {
    if (this.folderId === null) return;
    if (await this.isPinned(peerId)) return;

    const inputPeer = await this.resolveInputPeer(peerId);
    const filters = await this.getFilters();
    const folder = filters.find((f) => f.id === this.folderId);
    if (!folder) return;

    const updated = this.addPeer(folder.includePeers, inputPeer);
    if (updated.length === folder.includePeers.length) return; // already in folder

    folder.includePeers = updated;
    await this.client.invoke(
      new Api.messages.UpdateDialogFilter({ id: folder.id, filter: folder })
    );
  }

  /** Remove a chat from the "Без Ответа" folder (return to general). */
  async returnToGeneral(peerId: number): Promise<void> {
    if (this.folderId === null) return;

    const inputPeer = await this.resolveInputPeer(peerId);
    const filters = await this.getFilters();
    const folder = filters.find((f) => f.id === this.folderId);
    if (!folder) return;

    const updated = this.removePeer(folder.includePeers, inputPeer);
    if (updated.length === folder.includePeers.length) return; // wasn't in folder

    folder.includePeers = updated;
    await this.client.invoke(
      new Api.messages.UpdateDialogFilter({ id: folder.id, filter: folder })
    );
  }

  async isPinned(peerId: number): Promise<boolean> {
    const cached = this.pinnedCache.get(peerId);
    if (cached && Date.now() - cached.ts < FolderManager.PINNED_TTL) {
      return cached.value;
    }

    let result = false;
    try {
      const dialogs = await this.client.getDialogs({ limit: 200 });
      for (const d of dialogs) {
        const entity = d.entity;
        if (entity && "id" in entity && Number(entity.id) === peerId) {
          result = Boolean(d.pinned);
          break;
        }
      }
    } catch {
      // If we can't check, assume not pinned
    }

    this.pinnedCache.set(peerId, { value: result, ts: Date.now() });
    return result;
  }

  private async resolveInputPeer(peerId: number): Promise<Api.TypeInputPeer> {
    try {
      return await this.client.getInputEntity(peerId);
    } catch {
      return new Api.InputPeerUser({ userId: bigInt(peerId), accessHash: bigInt(0) });
    }
  }

  private async getFilters(): Promise<DialogFilter[]> {
    const result = await this.client.invoke(new Api.messages.GetDialogFilters());
    const filters = "filters" in result ? result.filters : (result as unknown as Api.TypeDialogFilter[]);
    return (filters as Api.TypeDialogFilter[]).filter(
      (f): f is DialogFilter => f instanceof Api.DialogFilter
    );
  }

  private titleText(filter: DialogFilter): string {
    const title = filter.title;
    if (typeof title === "string") return title;
    if (title && typeof title === "object" && "text" in title) {
      return (title as { text: string }).text;
    }
    return String(title ?? "");
  }

  private peerKey(peer: Api.TypeInputPeer): string {
    if (peer instanceof Api.InputPeerUser) return `user:${peer.userId}`;
    if (peer instanceof Api.InputPeerChat) return `chat:${peer.chatId}`;
    if (peer instanceof Api.InputPeerChannel) return `channel:${peer.channelId}`;
    return `unknown:${JSON.stringify(peer)}`;
  }

  private addPeer(peers: Api.TypeInputPeer[], inputPeer: Api.TypeInputPeer): Api.TypeInputPeer[] {
    const current = [...peers];
    const key = this.peerKey(inputPeer);
    if (!current.some((p) => this.peerKey(p) === key)) {
      current.push(inputPeer);
    }
    return current;
  }

  private removePeer(peers: Api.TypeInputPeer[], inputPeer: Api.TypeInputPeer): Api.TypeInputPeer[] {
    const key = this.peerKey(inputPeer);
    return peers.filter((p) => this.peerKey(p) !== key);
  }
}
