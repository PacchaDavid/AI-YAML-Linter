import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = 3600; // 1 hour

let redisClient: Redis | null = null;

function getClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error(`[Cache] Redis error:`, err.message);
    });
  }
  return redisClient;
}

export interface CacheRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export function createErrorSignature(error: { stage: string; code: string; message: string }): string {
  // Normalize message by removing line numbers and specific values
  const normalizedMessage = error.message.replace(/\d+/g, '{N}').replace(/'[^']*'/g, "'{VAL}'");
  return `explain:es:${error.stage}:${error.code}:${normalizedMessage}`;
}

class RedisCacheRepository implements CacheRepository {
  async get(key: string): Promise<string | null> {
    try {
      const client = getClient();
      // Only connect if not already connected
      if (client.status === 'end') {
        console.log('[Cache] Redis not available');
        return null;
      }
      const value = await client.get(key);
      console.log(`[Cache] ${value ? 'HIT' : 'MISS'} for key: ${key}`);
      return value;
    } catch (err) {
      console.warn(`[Cache] Get error:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      const client = getClient();
      if (client.status === 'end') return;
      await client.setex(key, CACHE_TTL, value);
      console.log(`[Cache] SET key: ${key}`);
    } catch (err) {
      console.warn(`[Cache] Set error:`, err instanceof Error ? err.message : err);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = getClient();
      if (client.status === 'end') return false;
      const ping = await client.ping();
      return ping === 'PONG';
    } catch {
      return false;
    }
  }
}

class NoOpCacheRepository implements CacheRepository {
  async get(_key: string): Promise<string | null> {
    return null;
  }
  async set(_key: string, _value: string): Promise<void> {
    // no-op
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
}

let cacheInstance: CacheRepository | null = null;

export function getCache(): CacheRepository {
  if (!cacheInstance) {
    // Try to connect to Redis, fall back to no-op if unavailable
    try {
      cacheInstance = new RedisCacheRepository();
    } catch {
      console.warn('[Cache] Redis unavailable, using no-op cache');
      cacheInstance = new NoOpCacheRepository();
    }
  }
  return cacheInstance;
}

// For testing
export function setCacheForTesting(cache: CacheRepository): void {
  cacheInstance = cache;
}
