import { db, getMessageLimit } from "./db.js";

export async function applyRetentionBeforeInsert(peerId: number): Promise<void> {
  if (await isVipPeer(peerId)) {
    return;
  }

  const messageLimit = await getMessageLimit();
  const { rows: countRows } = await db.query<{ count: number }>(
    'select count(*)::int as count from public."Messages" where user_id = $1',
    [peerId]
  );
  const messagesToDelete = (countRows[0]?.count ?? 0) - messageLimit + 1;

  if (messagesToDelete <= 0) {
    return;
  }

  const { rows } = await db.query<{ id: number }>(
    `select id from public."Messages"
    where user_id = $1
    order by timestamp asc, id asc
    limit $2`,
    [peerId, messagesToDelete]
  );

  const ids = rows.map((message) => message.id);

  if (ids.length === 0) {
    return;
  }

  await db.query('delete from public."Messages" where id = any($1::bigint[])', [ids]);
}

async function isVipPeer(peerId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from public."VIP_Users" where telegram_id = $1 limit 1',
    [peerId]
  );

  return (rowCount ?? 0) > 0;
}
