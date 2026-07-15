import { describe, it, expect } from 'vitest';
import { Orchestrator } from './orchestrator';
import { LintError } from '../../../shared/types/error';

describe('Orchestrator', () => {
  const mockServices = {
    lexer: {
      async tokenize(content: string) {
        if (content.includes('INVALID')) {
          return {
            tokens: [],
            errors: [{
              stage: 'lexical', code: 'LEX-001',
              message: 'Invalid character found',
              line: 1,
            } as LintError],
          };
        }
        return {
          tokens: [{ type: 'KEY', value: 'name', line: 1, column: 1 }],
          errors: [],
        };
      },
    },
    parser: {
      async parse(_tokens: unknown[]) {
        return {
          ast: { type: 'root', children: [{ type: 'mapping', key: 'name', value: 'test', line: 1 }] },
          errors: [],
        };
      },
    },
    semantic: {
      async validate(_ast: unknown) {
        return { valid: true, errors: [] };
      },
    },
    explainer: {
      async explain(_error: LintError) {
        return { explanation: 'Test explanation', cached: false };
      },
    },
  };

  it('should return valid=true for valid YAML', async () => {
    const orchestrator = new Orchestrator(mockServices);
    const result = await orchestrator.analyze('name: test');
    expect(result.valid).toBe(true);
    expect(result.stage).toBe('complete');
    expect(result.errors).toHaveLength(0);
  });

  it('should stop at lexical errors', async () => {
    const orchestrator = new Orchestrator(mockServices);
    const result = await orchestrator.analyze('INVALID content');
    expect(result.valid).toBe(false);
    expect(result.stage).toBe('lexical');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should enrich errors with explanations', async () => {
    const orchestrator = new Orchestrator(mockServices);
    const result = await orchestrator.analyze('INVALID content');
    expect(result.errors[0].explanation).toBe('Test explanation');
  });
});
