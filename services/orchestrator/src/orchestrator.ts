import { LintError } from '../../../shared/types/error';
import { CircuitBreaker } from './circuit-breaker';
import { Token } from '../../../shared/types/token';
import { ASTNode } from '../../../shared/types/ast';

/**
 * Interfaz de adaptadores de servicios que define las firmas de comunicación HTTP/gRPC
 * para interactuar con los microservicios aguas abajo.
 */
interface ServiceAdapters {
  lexer: { tokenize(content: string): Promise<{ tokens: unknown[]; errors: LintError[] }> };
  parser: { parse(tokens: unknown[]): Promise<{ ast: unknown; errors: LintError[] }> };
  semantic: { validate(ast: unknown): Promise<{ valid: boolean; errors: LintError[] }> };
  explainer: { explain(error: LintError): Promise<{ explanation: string; cached: boolean }> };
}

/**
 * Estructura del resultado devuelto por el Orquestador tras ejecutar la canalización de análisis.
 */
interface OrchestratorResult {
  valid: boolean;
  errors: LintError[];
  stage: 'lexical' | 'syntactic' | 'semantic' | 'complete';
  tokens?: Token[];
  ast?: ASTNode | null;
}

/**
 * @pattern Patrón Builder (Constructor)
 * @description Encapsula la construcción progresiva del reporte final de errores.
 * Permite agregar errores de validación crudos y posteriormente enriquecerlos con explicaciones del LLM.
 */
class ErrorReportBuilder {
  private errors: LintError[] = [];

  /**
   * Agrega un nuevo error de análisis al reporte.
   */
  addError(error: LintError): this {
    this.errors.push(error);
    return this;
  }

  /**
   * Asocia una explicación en lenguaje natural a un error específico mediante su índice.
   */
  addExplanation(index: number, explanation: string): this {
    if (this.errors[index]) {
      this.errors[index] = { ...this.errors[index], explanation };
    }
    return this;
  }

  /**
   * Retorna una copia del arreglo del reporte final de errores construido.
   */
  build(): LintError[] {
    return [...this.errors];
  }
}

/**
 * @class Orchestrator
 * @pattern Patrón Chain of Responsibility (Cadena de Responsabilidad) y Facade (Fachada)
 * @description Coordina la canalización de validación YAML secuencial entre el Lexer, Parser y Analizador Semántico.
 * Si cualquier etapa detecta errores, el procesamiento se detiene de inmediato (ejecución con cortocircuito) y los
 * errores se envían al servicio Explainer para enriquecimiento con IA. Cada llamada a un servicio está protegida por un Circuit Breaker.
 */
export class Orchestrator {
  private services: ServiceAdapters;
  private lexerCB: CircuitBreaker;
  private parserCB: CircuitBreaker;
  private semanticCB: CircuitBreaker;
  private explainerCB: CircuitBreaker;

  constructor(services: ServiceAdapters) {
    this.services = services;
    this.lexerCB = new CircuitBreaker();
    this.parserCB = new CircuitBreaker();
    this.semanticCB = new CircuitBreaker();
    this.explainerCB = new CircuitBreaker();
  }

  /**
   * Ejecuta el pipeline de validación multietapa para el contenido YAML en bruto.
   *
   * @param content Cadena de texto YAML a analizar.
   * @returns Resultado detallado del análisis incluyendo estado, etapa alcanzada, tokens, AST y errores enriquecidos.
   */
  async analyze(content: string): Promise<OrchestratorResult> {
    console.log(`[Orchestrator] Starting analysis of ${content.length} chars`);

    const builder = new ErrorReportBuilder();

    // Etapa 1: Cadena de Responsabilidad — Análisis Léxico (Lexer)
    console.log('[Orchestrator] Step 1: Tokenizing...');
    const lexResult = await this.lexerCB.call(
      () => this.services.lexer.tokenize(content),
      () => ({ tokens: [], errors: [{ stage: 'lexical', code: 'LEX-ERR', message: 'Servicio de lexer no disponible', line: 0 }] as LintError[] })
    );

    const tokens = (lexResult.tokens as Token[]) || [];

    if (lexResult.errors.length > 0) {
      console.log(`[Orchestrator] Lexer found ${lexResult.errors.length} errors`);
      lexResult.errors.forEach(e => builder.addError(e));

      // Enriquecer errores léxicos con explicaciones de IA
      await this.enrichErrors(builder, lexResult.errors);
      return { valid: false, errors: builder.build(), stage: 'lexical', tokens };
    }

    // Etapa 2: Cadena de Responsabilidad — Análisis Sintáctico (Parser)
    console.log('[Orchestrator] Step 2: Parsing...');
    const parseResult = await this.parserCB.call(
      () => this.services.parser.parse(tokens),
      () => ({ ast: null, errors: [{ stage: 'syntactic', code: 'PAR-ERR', message: 'Servicio de parser no disponible', line: 0 }] as LintError[] })
    );

    const ast = (parseResult.ast as ASTNode) || null;

    if (parseResult.errors.length > 0) {
      console.log(`[Orchestrator] Parser found ${parseResult.errors.length} errors`);
      parseResult.errors.forEach(e => builder.addError(e));

      await this.enrichErrors(builder, parseResult.errors);
      return { valid: false, errors: builder.build(), stage: 'syntactic', tokens, ast };
    }

    // Etapa 3: Cadena de Responsabilidad — Análisis Semántico
    console.log('[Orchestrator] Step 3: Validating semantics...');
    const semanticResult = await this.semanticCB.call(
      () => this.services.semantic.validate(ast),
      () => ({ valid: false, errors: [{ stage: 'semantic', code: 'SEM-ERR', message: 'Servicio de analizador semántico no disponible', line: 0 }] as LintError[] })
    );

    if (semanticResult.errors.length > 0) {
      console.log(`[Orchestrator] Semantic analyzer found ${semanticResult.errors.length} errors`);
      semanticResult.errors.forEach(e => builder.addError(e));

      await this.enrichErrors(builder, semanticResult.errors);
      return { valid: false, errors: builder.build(), stage: 'semantic', tokens, ast };
    }

    console.log('[Orchestrator] Analysis complete — no errors found');
    return { valid: true, errors: [], stage: 'complete', tokens, ast };
  }

  /**
   * Solicita explicaciones en lenguaje natural para los errores detectados de forma concurrente.
   *
   * @param builder Instancia del constructor de reportes de errores.
   * @param errors Lista de errores a enriquecer.
   */
  private async enrichErrors(builder: ErrorReportBuilder, errors: LintError[]): Promise<void> {
    const enrichmentPromises = errors.map(async (error, index) => {
      try {
        const result = await this.explainerCB.call(
          () => this.services.explainer.explain(error),
          () => ({ explanation: `[SIN CONEXIÓN] Error ${error.stage}: ${error.message}`, cached: false })
        );
        builder.addExplanation(index, result.explanation);
      } catch {
        builder.addExplanation(index, `[ERROR] No se pudo generar la explicación`);
      }
    });

    await Promise.all(enrichmentPromises);
  }
}


