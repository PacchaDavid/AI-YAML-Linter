import { describe, it, expect, beforeEach } from 'vitest';
import { explainer, setLLMClientForTesting } from './explainer';
import { setCacheForTesting, CacheRepository } from './cache';
import { LLMClient } from './ollama-client';
import { LintError } from '../../../shared/types/error';

class MockLLMClient implements LLMClient {
  async generateExplanation(_error: LintError): Promise<string> {
    return 'This is a mock LLM explanation for the error. Check your YAML indentation and ensure consistent spacing.';
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

class FailingMockLLMClient implements LLMClient {
  async generateExplanation(_error: LintError): Promise<string> {
    throw new Error('LLM unavailable');
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
}

class MockCacheRepository implements CacheRepository {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('Explainer', () => {
  let mockCache: MockCacheRepository;

  beforeEach(() => {
    mockCache = new MockCacheRepository();
    setCacheForTesting(mockCache);
  });

  it('should generate explanation for lexical error', async () => {
    setLLMClientForTesting(new MockLLMClient());
    const error: LintError = {
      stage: 'lexical',
      code: 'LEX-001',
      message: 'Mixed tabs and spaces on line 3',
      line: 3,
    };

    const result = await explainer(error);
    expect(result.explanation).toBeTruthy();
    expect(typeof result.explanation).toBe('string');
    expect(result.cached).toBe(false);
  });

  it('should cache explanations for same error signature', async () => {
    setLLMClientForTesting(new MockLLMClient());
    const error: LintError = {
      stage: 'lexical',
      code: 'LEX-001',
      message: 'Mixed tabs and spaces on line 5',
      line: 5,
    };

    const first = await explainer(error);
    expect(first.cached).toBe(false);

    const second = await explainer(error);
    expect(second.cached).toBe(true);
    expect(second.explanation).toBe(first.explanation);
  });

  it('should fallback when LLM is unavailable', async () => {
    setLLMClientForTesting(new FailingMockLLMClient());
    const error: LintError = {
      stage: 'lexical',
      code: 'LEX-001',
      message: 'Mixed tabs and spaces on line 3',
      line: 3,
    };

    const result = await explainer(error);
    expect(result.explanation).toBeTruthy();
    expect(result.cached).toBe(false);
  });
});
