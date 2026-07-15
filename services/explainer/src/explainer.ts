import { LintError } from '../../../shared/types/error';
import { getCache, createErrorSignature } from './cache';
import { OllamaClient, FallbackLLMClient, LLMClient } from './ollama-client';
import { CircuitBreaker } from './circuit-breaker';

interface ExplainerResult {
  explanation: string;
  cached: boolean;
}

let llmClient: LLMClient = new OllamaClient();
const circuitBreaker = new CircuitBreaker();

// Allow injection for testing
export function setLLMClientForTesting(client: LLMClient): void {
  llmClient = client;
}

export async function explainer(error: LintError): Promise<ExplainerResult> {
  const cache = getCache();
  const signature = createErrorSignature(error);

  // 1. Try cache first (Decorator pattern)
  const cached = await cache.get(signature);
  if (cached) {
    return { explanation: cached, cached: true };
  }

  // 2. Try LLM with Circuit Breaker
  const result = await circuitBreaker.call(
    async () => {
      return await llmClient.generateExplanation(error);
    },
    () => {
      throw new Error('LLM unavailable (fallback)');
    }
  ).catch(() => {
    // 3. Fallback: technical explanation without LLM
    return generateFallbackExplanation(error);
  });

  // 4. Cache the result (if not a fallback technical explanation)
  if (!result.startsWith('[TECHNICAL]')) {
    await cache.set(signature, result).catch(() => {});
  }

  return { explanation: result, cached: false };
}

function generateFallbackExplanation(error: LintError): string {
  const explanations: Record<string, string> = {
    'LEX-001': `[TECHNICAL] Se detectaron tabulaciones y espacios mezclados. YAML requiere una indentación consistente. Usa solo espacios (2 espacios por nivel es lo habitual).`,
    'LEX-002': `[TECHNICAL] Carácter no válido. YAML solo permite caracteres ASCII imprimibles y ciertos espacios Unicode. Elimina o reemplaza el carácter no válido.`,
    'LEX-003': `[TECHNICAL] Indentación inconsistente. Todos los elementos del mismo nivel deben tener la misma indentación. Ajusta la indentación para que coincida con el nivel padre.`,
    'PAR-001': `[TECHNICAL] Token inesperado. La estructura YAML está mal formada en esta posición. Comprueba si faltan dos puntos, hay guiones de más o la sintaxis es incorrecta.`,
    'PAR-002': `[TECHNICAL] Falta dos puntos después de la clave. Los mapeos YAML requieren dos puntos (:) entre la clave y su valor.`,
    'SEM-001': `[TECHNICAL] Campo obligatorio ausente. La configuración no incluye un campo esperado por el esquema.`,
    'SEM-002': `[TECHNICAL] Tipo incompatible. El valor proporcionado no coincide con el tipo de dato esperado para este campo.`,
    'SEM-003': `[TECHNICAL] Valor fuera de rango. El valor numérico proporcionado está fuera del rango aceptable para este campo.`,
    'SEM-005': `[TECHNICAL] Clave duplicada. Los mapeos YAML deben tener claves únicas. Elimina o renombra la clave duplicada.`,
    'SEM-006': `[TECHNICAL] Valor vacío. Esta clave no tiene valor ni elementos hijos asociados. Proporciona un valor o elimina la clave.`,
  };

  return explanations[error.code] || `[TECHNICAL] Error ${error.stage.toUpperCase()} en la línea ${error.line}: ${error.message}`;
}
