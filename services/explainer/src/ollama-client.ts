const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen:0.5b';

export interface LLMClient {
  generateExplanation(error: { stage: string; code: string; message: string; line: number }): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export class OllamaClient implements LLMClient {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || OLLAMA_URL;
    this.model = model || OLLAMA_MODEL;
  }

  async generateExplanation(error: { stage: string; code: string; message: string; line: number }): Promise<string> {
    const prompt = `Eres un asistente de análisis de configuraciones YAML. Explica el siguiente error en español, en un máximo de 2-3 oraciones, y sugiere cómo corregirlo.

Etapa del error: ${error.stage}
Código del error: ${error.code}
Mensaje del error: ${error.message}
Línea: ${error.line}

Responde únicamente en español. Proporciona una explicación concisa y una sugerencia de corrección.`;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          num_predict: 150,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { response?: string };
    return data.response || 'No se generó ninguna explicación';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export class FallbackLLMClient implements LLMClient {
  async generateExplanation(_error: { stage: string; code: string; message: string; line: number }): Promise<string> {
    throw new Error('LLM client not available');
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
