import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn, type ChildProcess } from 'child_process';

// Compatible with Node 20 (import.meta.dirname requires Node 21.2+)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';
const EXAMPLES_DIR = path.resolve(__dirname, '../examples');
const COMPOSE_DIR = path.resolve(__dirname, '..');
const HEALTH_CHECK_INTERVAL = 2000; // 2 seconds
const HEALTH_CHECK_TIMEOUT = 120_000; // 2 minutes
const COMPOSE_UP_TIMEOUT = 180_000; // 3 minutes

interface LintError {
  stage: string;
  code: string;
  message: string;
  line: number;
  column?: number;
  explanation?: string;
}

interface AnalyzeResponse {
  valid: boolean;
  errors: LintError[];
  stage: string;
}

let servicesReachable = false;
let composeProcess: ChildProcess | null = null;

function hasDockerCompose(): boolean {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForService(url: string, timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return true;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL));
  }
  return false;
}

async function analyzeFile(content: string): Promise<AnalyzeResponse> {
  const response = await fetch(`${ORCHESTRATOR_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Orchestrator returned HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<AnalyzeResponse>;
}

function readExampleFile(name: string): string {
  const filePath = path.join(EXAMPLES_DIR, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Example file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// ──────────────────────────────────────────────
// Setup & Teardown
// ──────────────────────────────────────────────

beforeAll(async () => {
  // First, check if services are already running (from manual docker compose up)
  servicesReachable = await waitForService(ORCHESTRATOR_URL, 5000);

  if (!servicesReachable) {
    const dockerAvailable = hasDockerCompose();
    if (!dockerAvailable) {
      console.warn('⚠️  Docker Compose not available and services not reachable — tests will be skipped');
      return;
    }

    console.log('🐳 Starting Docker Compose services...');
    console.log(`    Compose directory: ${COMPOSE_DIR}`);

    try {
      composeProcess = spawn('docker', ['compose', 'up', '--build', '-d'], {
        cwd: COMPOSE_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      servicesReachable = await waitForService(ORCHESTRATOR_URL, COMPOSE_UP_TIMEOUT);

      if (servicesReachable) {
        console.log('✅ All services are healthy');
      } else {
        console.error('⚠️  Services did not become healthy within timeout');
      }
    } catch (err) {
      console.error('⚠️  Failed to start Docker services:', err);
    }
  } else {
    console.log('✅ Services already running (using existing Docker instances)');
  }
}, COMPOSE_UP_TIMEOUT + 10_000);

afterAll(() => {
  // Cleanup if we started Docker (regardless of whether services became healthy)
  if (composeProcess) {
    console.log('🛑 Stopping Docker Compose services...');
    try {
      execSync('docker compose down', { cwd: COMPOSE_DIR, stdio: 'inherit' });
    } catch {
      // Ignore cleanup errors
    }
  }
});

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('E2E: YAML Lint Pipeline (Docker Compose)', () => {
  beforeAll(async () => {
    if (!servicesReachable) {
      console.warn('⏭️  Skipping E2E tests: Services not reachable — run `npm run docker:up` first');
    }
  });

  beforeEach((ctx) => {
    if (!servicesReachable) {
      ctx.skip();
    }
  });

  // ── valid.yaml ──
  it('should report valid.yaml as valid (no errors)', { timeout: 120_000 }, async () => {
    const content = readExampleFile('valid.yaml');
    const result = await analyzeFile(content);

    expect(result.valid).toBe(true);
    expect(result.stage).toBe('complete');
    expect(result.errors).toHaveLength(0);
  });

  // ── lexical-error.yaml ──
  it('should detect lexical errors in lexical-error.yaml', { timeout: 120_000 }, async () => {
    const content = readExampleFile('lexical-error.yaml');
    const result = await analyzeFile(content);

    expect(result.valid).toBe(false);
    expect(result.stage).toBe('lexical');
    expect(result.errors.length).toBeGreaterThan(0);

    // Should detect mixed tabs and spaces (LEX-001)
    const lexErrors = result.errors.filter(e => e.code === 'LEX-001');
    expect(lexErrors.length).toBeGreaterThan(0);
    expect(lexErrors[0].line).toBe(3);
  });

  // ── syntax-error.yaml ──
  it('should detect syntax errors in syntax-error.yaml', { timeout: 120_000 }, async () => {
    const content = readExampleFile('syntax-error.yaml');
    const result = await analyzeFile(content);

    expect(result.valid).toBe(false);
    expect(result.stage).toBe('syntactic');
    expect(result.errors.length).toBeGreaterThan(0);

    // Should detect missing colon (PAR-002) or unexpected token (PAR-001)
    const synthErrors = result.errors.filter(e =>
      e.code === 'PAR-001' || e.code === 'PAR-002'
    );
    expect(synthErrors.length).toBeGreaterThan(0);

    // Every error should have an explanation (even if technical fallback)
    for (const err of result.errors) {
      expect(err.explanation).toBeDefined();
      expect(err.explanation!.length).toBeGreaterThan(0);
    }
  });

  // ── semantic-error.yaml ──
  it('should detect semantic errors in semantic-error.yaml', { timeout: 120_000 }, async () => {
    const content = readExampleFile('semantic-error.yaml');
    const result = await analyzeFile(content);

    expect(result.valid).toBe(false);
    expect(result.stage).toBe('semantic');
    expect(result.errors.length).toBeGreaterThan(0);

    // Should detect at least one of the semantic errors (schema, type, or range)
    const codes = result.errors.map(e => e.code);
    expect(
      codes.some(c => ['SEM-001', 'SEM-002', 'SEM-003'].includes(c))
    ).toBe(true);

    // Every error should have a location
    for (const err of result.errors) {
      expect(err.line).toBeGreaterThan(0);
    }
  });

  // ── Pipeline stops at first error stage ──
  it('should NOT analyze semantic stage when lexical errors exist', { timeout: 120_000 }, async () => {
    const content = readExampleFile('lexical-error.yaml');
    const result = await analyzeFile(content);

    expect(result.stage).toBe('lexical');
    const semanticErrors = result.errors.filter(e => e.stage === 'semantic');
    expect(semanticErrors).toHaveLength(0);
  });

  it('should NOT analyze semantic stage when syntax errors exist', { timeout: 120_000 }, async () => {
    const content = readExampleFile('syntax-error.yaml');
    const result = await analyzeFile(content);

    expect(result.stage).toBe('syntactic');
    const semanticErrors = result.errors.filter(e => e.stage === 'semantic');
    expect(semanticErrors).toHaveLength(0);
  });

  // ── Error explanations ──
  it('should enrich all errors with explanations across all error types', { timeout: 120_000 }, async () => {
    const yamls = ['lexical-error.yaml', 'syntax-error.yaml', 'semantic-error.yaml'];
    for (const yaml of yamls) {
      const content = readExampleFile(yaml);
      const result = await analyzeFile(content);

      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(err.explanation).toBeDefined();
        expect(err.explanation!.length).toBeGreaterThan(0);
      }
    }
  });
});
