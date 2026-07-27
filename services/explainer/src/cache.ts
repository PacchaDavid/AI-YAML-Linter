import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = 3600; // Tiempo de expiración de 1 hora para explicaciones de IA almacenadas en caché

let redisClient: Redis | null = null;

/**
 * Inicializa u obtiene la instancia singleton del cliente Redis con estrategia de reintentos.
 */
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

/**
 * @interface CacheRepository
 * @pattern Interfaz del Patrón Repository (Repositorio)
 * @description Abstrae la persistencia y lectura en caché de explicaciones de errores,
 * permitiendo cambiar el almacenamiento subyacente (Redis, In-Memory, NoOp) sin alterar los consumidores.
 */
export interface CacheRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/**
 * Genera una firma de clave de caché normalizada para un error de análisis dado.
 * Reemplaza valores dinámicos (números de línea, valores entre comillas) con marcadores para que errores idénticos compartan caché.
 */
export function createErrorSignature(error: { stage: string; code: string; message: string }): string {
  const normalizedMessage = error.message.replace(/\d+/g, '{N}').replace(/'[^']*'/g, "'{VAL}'");
  return `explain:es:${error.stage}:${error.code}:${normalizedMessage}`;
}

/**
 * @class RedisCacheRepository
 * @pattern Implementación Concreta del Patrón Repository
 * @description Implementación concreta del repositorio que utiliza Redis para persistir las explicaciones de la IA.
 */
class RedisCacheRepository implements CacheRepository {
  async get(key: string): Promise<string | null> {
    try {
      const client = getClient();
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

/**
 * @class NoOpCacheRepository
 * @pattern Repositorio NoOp / Null Object
 * @description Implementación de reserva (fallback) utilizada cuando la conexión a Redis no está disponible.
 */
class NoOpCacheRepository implements CacheRepository {
  async get(_key: string): Promise<string | null> {
    return null;
  }
  async set(_key: string, _value: string): Promise<void> {
    // Operación sin efecto (no-op) cuando la caché está fuera de línea
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
}

let cacheInstance: CacheRepository | null = null;

/**
 * Función fábrica que provee la instancia activa de CacheRepository (Redis o reserva NoOp).
 */
export function getCache(): CacheRepository {
  if (!cacheInstance) {
    try {
      cacheInstance = new RedisCacheRepository();
    } catch {
      console.warn('[Cache] Redis unavailable, using no-op cache');
      cacheInstance = new NoOpCacheRepository();
    }
  }
  return cacheInstance;
}

/**
 * Inyecta una instancia personalizada del repositorio de caché para pruebas unitarias.
 */
export function setCacheForTesting(cache: CacheRepository): void {
  cacheInstance = cache;
}


