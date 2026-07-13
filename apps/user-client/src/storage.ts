import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Api } from "telegram";
import type { TelegramClient } from "telegram";

export type StoredMedia = {
  path: string;
  mimeType: string;
  size: number;
};

type MediaBucket = {
  bucket: string;
  client: S3Client;
};

let mediaBucket: MediaBucket | null = null;

export async function uploadMessageMedia(
  client: TelegramClient,
  message: Api.Message,
  peerId: number,
  mediaType: string
): Promise<StoredMedia | null> {
  const downloaded = await client.downloadMedia(message, {});

  if (!Buffer.isBuffer(downloaded)) {
    return null;
  }

  const mimeType = getMimeType(message, mediaType);
  const extension = getExtension(mimeType, mediaType);
  const safePeerId = String(peerId).replace(/^-/, "m");
  const path = `${safePeerId}/${message.id}-${Date.now()}.${extension}`;

  const media = getMediaBucket();
  await media.client.send(
    new PutObjectCommand({
      Bucket: media.bucket,
      Key: path,
      Body: downloaded,
      ContentType: mimeType
    })
  );

  return {
    path,
    mimeType,
    size: downloaded.byteLength
  };
}

function getMediaBucket(): MediaBucket {
  if (mediaBucket) {
    return mediaBucket;
  }

  const bucket = getEnv("S3_BUCKET", "AWS_BUCKET", "BUCKET_NAME");
  const endpoint = getEnv("S3_ENDPOINT", "AWS_ENDPOINT", "BUCKET_ENDPOINT");
  const accessKeyId = getEnv(
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
    "BUCKET_ACCESS_KEY_ID"
  );
  const secretAccessKey = getEnv(
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "BUCKET_SECRET_ACCESS_KEY"
  );
  const region = getEnv("S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") ?? "auto";

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Railway Bucket is not configured. Set S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  }

  mediaBucket = {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  };

  return mediaBucket;
}

function getEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getMimeType(message: Api.Message, mediaType: string): string {
  if (message.document?.mimeType) {
    return message.document.mimeType;
  }

  if (mediaType === "photo" || mediaType === "sticker") {
    return "image/jpeg";
  }

  if (mediaType === "video" || mediaType === "video_note") {
    return "video/mp4";
  }

  if (mediaType === "voice") {
    return "audio/ogg";
  }

  if (mediaType === "audio") {
    return "audio/mpeg";
  }

  if (mediaType === "animation") {
    return "video/mp4";
  }

  return "application/octet-stream";
}

function getExtension(mimeType: string, mediaType: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/webm": "webm"
  };

  if (byMime[mimeType]) {
    return byMime[mimeType];
  }

  if (mediaType === "photo") {
    return "jpg";
  }

  if (mediaType === "video" || mediaType === "video_note" || mediaType === "animation") {
    return "mp4";
  }

  if (mediaType === "voice") {
    return "ogg";
  }

  return "bin";
}
