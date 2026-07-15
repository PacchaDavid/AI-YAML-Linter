import { describe, it, expect } from 'vitest';
import { lexer } from './lexer';
import { TokenType } from '../../../shared/types/token';

describe('Lexer', () => {
  it('should tokenize a simple key-value pair', () => {
    const result = lexer('name: John');
    expect(result.errors).toHaveLength(0);
    const types = result.tokens.map(t => t.type);
    expect(types).toContain(TokenType.KEY);
    expect(types).toContain(TokenType.COLON);
    expect(types).toContain(TokenType.STRING);
  });

  it('should tokenize a number value', () => {
    const result = lexer('age: 25');
    expect(result.errors).toHaveLength(0);
    const numberToken = result.tokens.find(t => t.type === TokenType.NUMBER);
    expect(numberToken).toBeDefined();
    expect(numberToken!.value).toBe('25');
  });

  it('should tokenize a boolean value', () => {
    const result = lexer('active: true');
    expect(result.errors).toHaveLength(0);
    const boolToken = result.tokens.find(t => t.type === TokenType.BOOLEAN);
    expect(boolToken).toBeDefined();
    expect(boolToken!.value).toBe('true');
  });

  it('should tokenize a null value', () => {
    const result = lexer('value: null');
    expect(result.errors).toHaveLength(0);
    const nullToken = result.tokens.find(t => t.type === TokenType.NULL);
    expect(nullToken).toBeDefined();
  });

  it('should detect mixed tabs and spaces', () => {
    const result = lexer('  name: John\n\t  age: 25');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('LEX-001');
  });

  it('should handle lists with dashes', () => {
    const result = lexer('- item1\n- item2');
    expect(result.errors).toHaveLength(0);
    const dashes = result.tokens.filter(t => t.type === TokenType.DASH);
    expect(dashes).toHaveLength(2);
  });

  it('should handle indentation', () => {
    const result = lexer('person:\n  name: John\n  age: 25');
    expect(result.errors).toHaveLength(0);
    const indents = result.tokens.filter(t => t.type === TokenType.INDENT);
    expect(indents.length).toBeGreaterThan(0);
  });

  it('should detect invalid characters', () => {
    const result = lexer('key: val\u0000ue');
    const invalidErrors = result.errors.filter(e => e.code === 'LEX-002');
    expect(invalidErrors.length).toBeGreaterThan(0);
  });

  it('should detect inconsistent indentation', () => {
    const result = lexer('parent:\n  child: val\n notchild: val2');
    const indentErrors = result.errors.filter(e => e.code === 'LEX-003');
    expect(indentErrors.length).toBeGreaterThan(0);
  });

  it('should handle empty lines and comments', () => {
    const result = lexer('# This is a comment\nkey: value\n\nother: val');
    expect(result.errors).toHaveLength(0);
    const comments = result.tokens.filter(t => t.type === TokenType.COMMENT);
    expect(comments.length).toBeGreaterThan(0);
  });
});
