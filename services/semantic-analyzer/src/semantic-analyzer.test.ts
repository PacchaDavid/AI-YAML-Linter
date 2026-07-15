import { describe, it, expect } from 'vitest';
import { semanticAnalyzer } from './semantic-analyzer';
import { ASTNode } from '../../../shared/types/ast';
import { lexer } from '../../lexer/src/lexer';
import { parser } from '../../parser/src/parser';

function parseYaml(input: string): ASTNode {
  const lexResult = lexer(input);
  expect(lexResult.errors).toHaveLength(0);
  const parseResult = parser(lexResult.tokens);
  expect(parseResult.errors).toHaveLength(0);
  return parseResult.ast!;
}

describe('Semantic Analyzer', () => {
  it('should validate a simple valid config', () => {
    const input = 'name: test\nversion: 1';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect duplicate keys', () => {
    const input = 'name: first\nname: second';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    const dupErrors = result.errors.filter(e => e.code === 'SEM-005');
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it('should detect type mismatches', () => {
    const input = 'count: hello\nport: world';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    const typeErrors = result.errors.filter(e => e.code === 'SEM-002');
    expect(typeErrors.length).toBeGreaterThan(0);
  });

  it('should detect out of range values', () => {
    const input = 'port: 99999';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    const rangeErrors = result.errors.filter(e => e.code === 'SEM-003');
    expect(rangeErrors.length).toBeGreaterThan(0);
  });

  it('should detect empty values', () => {
    const input = 'name:';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    const emptyErrors = result.errors.filter(e => e.code === 'SEM-006');
    expect(emptyErrors.length).toBeGreaterThan(0);
  });

  it('should accept valid config without errors', () => {
    const input = 'server:\n  port: 8080\n  host: localhost\n  debug: false';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    expect(result.valid).toBe(true);
  });

  it('should detect null for an empty value', () => {
    const input = 'value: null';
    const ast = parseYaml(input);
    const result = semanticAnalyzer(ast);
    expect(result.valid).toBe(true);
  });
});
