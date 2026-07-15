import { describe, it, expect } from 'vitest';
import { parser } from './parser';
import { lexer } from '../../lexer/src/lexer';
import { TokenType } from '../../../shared/types/token';

describe('Parser', () => {
  it('should parse a simple key-value pair', () => {
    const lexResult = lexer('name: John');
    expect(lexResult.errors).toHaveLength(0);
    const result = parser(lexResult.tokens);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).not.toBeNull();
    expect(result.ast!.children).toHaveLength(1);
    expect(result.ast!.children![0].key).toBe('name');
  });

  it('should parse nested mappings', () => {
    const input = 'person:\n  name: John\n  age: 25';
    const lexResult = lexer(input);
    expect(lexResult.errors).toHaveLength(0);
    const result = parser(lexResult.tokens);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).not.toBeNull();
    const personNode = result.ast!.children![0];
    expect(personNode.key).toBe('person');
    expect(personNode.children).toHaveLength(2);
  });

  it('should parse lists', () => {
    const input = '- item1\n- item2\n- item3';
    const lexResult = lexer(input);
    expect(lexResult.errors).toHaveLength(0);
    const result = parser(lexResult.tokens);
    expect(result.errors).toHaveLength(0);
    expect(result.ast!.children).toHaveLength(3);
  });

  it('should handle numeric values', () => {
    const lexResult = lexer('count: 42');
    const result = parser(lexResult.tokens);
    expect(result.errors).toHaveLength(0);
    expect(result.ast!.children![0].value).toBe(42);
  });

  it('should handle boolean values', () => {
    const lexResult = lexer('enabled: true');
    const result = parser(lexResult.tokens);
    expect(result.errors).toHaveLength(0);
    expect(result.ast!.children![0].value).toBe(true);
  });

  it('should detect unexpected tokens', () => {
    const tokens = [
      { type: TokenType.INVALID, value: '@@@', line: 1, column: 1 },
      { type: TokenType.NEWLINE, value: '\n', line: 1, column: 4 },
      { type: TokenType.EOF, value: '', line: 1, column: 4 },
    ];
    const result = parser(tokens);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
