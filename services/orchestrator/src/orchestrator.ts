import { LintError } from '../../../shared/types/error';
import { CircuitBreaker } from './circuit-breaker';

interface ServiceAdapters {
  lexer: { tokenize(content: string): Promise<{ tokens: unknown[]; errors: LintError[] }> };
  parser: { parse(tokens: unknown[]): Promise<{ ast: unknown; errors: LintError[] }> };
  semantic: { validate(ast: unknown): Promise<{ valid: boolean; errors: LintError[] }> };
  explainer: { explain(error: LintError): Promise<{ explanation: string; cached: boolean }> };
}

interface OrchestratorResult {
  valid: boolean;
  errors: LintError[];
  stage: 'lexical' | 'syntactic' | 'semantic' | 'complete';
}

// --- Builder Pattern for error report construction ---
class ErrorReportBuilder {
  private errors: LintError[] = [];

  addError(error: LintError): this {
    this.errors.push(error);
    return this;
  }

  addExplanation(index: number, explanation: string): this {
    if (this.errors[index]) {
      this.errors[index] = { ...this.errors[index], explanation };
    }
    return this;
  }

  build(): LintError[] {
    return [...this.errors];
  }
}

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

  async analyze(content: string): Promise<OrchestratorResult> {
    console.log(`[Orchestrator] Starting analysis of ${content.length} chars`);

    const builder = new ErrorReportBuilder();

    // Step 1: Chain of Responsibility — Lexer
    console.log('[Orchestrator] Step 1: Tokenizing...');
    const lexResult = await this.lexerCB.call(
      () => this.services.lexer.tokenize(content),
      () => ({ tokens: [], errors: [{ stage: 'lexical', code: 'LEX-ERR', message: 'Servicio de lexer no disponible', line: 0 }] as LintError[] })
    );

    if (lexResult.errors.length > 0) {
      console.log(`[Orchestrator] Lexer found ${lexResult.errors.length} errors`);
      lexResult.errors.forEach(e => builder.addError(e));

      // Get explanations for lexical errors
      await this.enrichErrors(builder, lexResult.errors);
      return { valid: false, errors: builder.build(), stage: 'lexical' };
    }

    // Step 2: Chain of Responsibility — Parser
    console.log('[Orchestrator] Step 2: Parsing...');
    const parseResult = await this.parserCB.call(
      () => this.services.parser.parse(lexResult.tokens),
      () => ({ ast: null, errors: [{ stage: 'syntactic', code: 'PAR-ERR', message: 'Servicio de parser no disponible', line: 0 }] as LintError[] })
    );

    if (parseResult.errors.length > 0) {
      console.log(`[Orchestrator] Parser found ${parseResult.errors.length} errors`);
      parseResult.errors.forEach(e => builder.addError(e));

      await this.enrichErrors(builder, parseResult.errors);
      return { valid: false, errors: builder.build(), stage: 'syntactic' };
    }

    // Step 3: Chain of Responsibility — Semantic Analyzer
    console.log('[Orchestrator] Step 3: Validating semantics...');
    const semanticResult = await this.semanticCB.call(
      () => this.services.semantic.validate(parseResult.ast),
      () => ({ valid: false, errors: [{ stage: 'semantic', code: 'SEM-ERR', message: 'Servicio de analizador semántico no disponible', line: 0 }] as LintError[] })
    );

    if (semanticResult.errors.length > 0) {
      console.log(`[Orchestrator] Semantic analyzer found ${semanticResult.errors.length} errors`);
      semanticResult.errors.forEach(e => builder.addError(e));

      await this.enrichErrors(builder, semanticResult.errors);
      return { valid: false, errors: builder.build(), stage: 'semantic' };
    }

    console.log('[Orchestrator] Analysis complete — no errors found');
    return { valid: true, errors: [], stage: 'complete' };
  }

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
