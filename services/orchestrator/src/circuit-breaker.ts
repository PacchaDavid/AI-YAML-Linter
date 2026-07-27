/**
 * Estados operacionales posibles del Circuit Breaker:
 * - `closed` (Cerrado): Operación normal, las peticiones pasan directamente al servicio destino.
 * - `open` (Abierto): Servicio no disponible/fallando; las peticiones usan la función de fallback inmediatamente.
 * - `half-open` (Semi-abierto): Prueba de recuperación; se envía una petición de prueba para verificar si el servicio se ha recuperado.
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Parámetros de configuración para el patrón Circuit Breaker.
 */
interface CircuitBreakerOptions {
  /** Cantidad máxima de fallos consecutivos permitidos antes de abrir el circuito */
  maxFailures: number;
  /** Duración en milisegundos que el circuito permanece 'open' antes de probar recuperación ('half-open') */
  resetTimeoutMs: number;
  /** Tiempo máximo de espera en milisegundos para una llamada al servicio antes de agotar el tiempo (timeout) */
  timeoutMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  maxFailures: parseInt(process.env.CIRCUIT_BREAKER_MAX_FAILURES || '3', 10),
  resetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '10000', 10),
  timeoutMs: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '5000', 10),
};

/**
 * @class CircuitBreaker
 * @pattern Patrón Circuit Breaker (Cortacircuito)
 * @description Previene fallos en cascada entre microservicios envolviendo las peticiones de red.
 * Monitorea las tasas de fallo y degrada la funcionalidad de forma elegante mediante lógica de reserva (fallback) cuando los servicios remotos no responden.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Retorna el estado operacional actual del cortacircuito.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Ejecuta una operación remota protegida con control de timeout, conteo de fallos y fallback.
   *
   * @template T Tipo de dato retornado por la llamada al servicio.
   * @param fn Función asíncrona que ejecuta la llamada al servicio remoto.
   * @param fallback Función de reserva que devuelve valores por defecto si la llamada falla o el circuito está abierto.
   * @returns Promesa que resuelve al resultado del servicio o al valor de fallback.
   */
  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailureTime && (now - this.lastFailureTime) >= this.options.resetTimeoutMs) {
        console.log('[CB] Half-open: testing service');
        this.state = 'half-open';
      } else {
        console.log('[CB] Circuit OPEN, using fallback');
        return fallback();
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.options.timeoutMs)
        ),
      ]);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      console.log(`[CB] Call failed:`, err instanceof Error ? err.message : err);
      return fallback();
    }
  }

  /**
   * Reinicia los contadores de fallo al completar exitosamente una operación.
   */
  private onSuccess(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Incrementa el contador de fallos y cambia el estado a 'open' si se alcanza el umbral configurado.
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.maxFailures) {
      console.log(`[CB] Opening circuit after ${this.failureCount} failures`);
      this.state = 'open';
    }
  }
}


