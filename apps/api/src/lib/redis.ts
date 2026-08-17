import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

function build(options: { forBullmq?: boolean } = {}): Redis {
  const client = new Redis(env.REDIS_URL, {
    // BullMQ blocks on commands and requires retries to be uncapped.
    maxRetriesPerRequest: options.forBullmq ? null : 2,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    /**
     * Fail a command outright while the connection is down, rather than parking
     * it until the connection comes back.
     *
     * Everything that uses this client — the cache, the rate limiter — already
     * has an answer for "Redis did not respond": fall through to the source, or
     * fall back to the in-process counter. None of them has an answer for
     * "Redis has not answered yet", and the offline queue turns a stopped Redis
     * into exactly that. Measured, with the queue on: a request arriving during
     * an outage hung for minutes behind the reconnect backoff instead of being
     * served by the fallback that exists for this. BullMQ is the exception and
     * keeps the queue, because it issues blocking commands across reconnects.
     */
    enableOfflineQueue: options.forBullmq ?? false,
  });

  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  return client;
}

export const redis = build();

/** BullMQ needs its own connection with different retry semantics. */
export function createQueueConnection(): Redis {
  return build({ forBullmq: true });
}

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function closeRedis(): Promise<void> {
  if (redis.status !== 'end') await redis.quit().catch(() => redis.disconnect());
}

export async function pingRedis(): Promise<void> {
  await redis.ping();
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'cache:';

/**
 * Read-through cache. A cache backend that is down must never take the API with
 * it, so every failure falls through to the loader.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  // Tests assert on freshly written data; a 60-second cache would make results
  // depend on which test ran first.
  if (env.isTest) return loader();

  const fullKey = CACHE_PREFIX + key;
  try {
    const hit = await redis.get(fullKey);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, 'Cache read failed, falling back to source');
  }

  const value = await loader();

  try {
    await redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'Cache write failed');
  }

  return value;
}

/** Invalidates every cached entry for a workspace (used after any write). */
export async function invalidateWorkspaceCache(workspaceId: string): Promise<void> {
  if (env.isTest) return;

  const pattern = `${CACHE_PREFIX}ws:${workspaceId}:*`;
  try {
    // SCAN rather than KEYS: KEYS blocks the whole server on large datasets.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err, workspaceId }, 'Cache invalidation failed');
  }
}

export const workspaceCacheKey = (workspaceId: string, ...parts: (string | number)[]): string =>
  `ws:${workspaceId}:${parts.join(':')}`;
