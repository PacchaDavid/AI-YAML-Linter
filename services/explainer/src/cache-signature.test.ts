// Test file to verify the cache signature issue
import { describe, it, expect } from 'vitest';
import { LintError } from '../../../shared/types/error';
import { createErrorSignature } from './cache';

describe('Cache Signature Creation', () => {
  it('should preserve different port values in cache signature', () => {
    const error1: LintError = {
      stage: 'semantic',
      code: 'SEM-003',
      message: 'El valor del puerto 9999999 está fuera del rango (1-65535)',
      line: 5,
    };
    
    const error2: LintError = {
      stage: 'semantic',
      code: 'SEM-003',
      message: 'El valor del puerto 9999998 está fuera del rango (1-65535)',
      line: 5,
    };
    
    const signature1 = createErrorSignature(error1);
    const signature2 = createErrorSignature(error2);
    
    // These should be DIFFERENT signatures (they should NOT be the same)
    console.log('Signature 1:', signature1);
    console.log('Signature 2:', signature2);
    
    expect(signature1).not.toBe(signature2);
  });
});