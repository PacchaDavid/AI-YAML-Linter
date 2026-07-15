#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';

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

function printUsage(): void {
  console.log(chalk.bold('\n📋 YAML Linter — Configuration Analysis Tool\n'));
  console.log(chalk.dim('Usage:'));
  console.log('  yaml-lint --file <path>     Analyze a YAML file');
  console.log('  yaml-lint --help             Show this help message\n');
  console.log(chalk.dim('Options:'));
  console.log('  -f, --file <path>   Path to the YAML file to analyze');
  console.log('  --help              Show this help message\n');
  console.log(chalk.dim('Environment:'));
  console.log('  ORCHESTRATOR_URL    Orchestrator service URL (default: http://localhost:4000)\n');
}

function printErrorTable(errors: LintError[]): void {
  if (errors.length === 0) return;

  console.log(chalk.bold('\n❌ Errors Found:\n'));

  const stageColors: Record<string, (s: string) => string> = {
    lexical: chalk.red.bold,
    syntactic: chalk.yellow.bold,
    semantic: chalk.magenta.bold,
  };

  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    const stageColor = stageColors[error.stage] || chalk.gray.bold;
    const stageLabel = error.stage.toUpperCase().padEnd(10);

    console.log(chalk.bold(`  ${i + 1}. [${stageColor(stageLabel)}] ${chalk.white(error.code)}`));
    console.log(`     ${chalk.dim('Location:')} Line ${error.line}${error.column ? `, Col ${error.column}` : ''}`);
    console.log(`     ${chalk.dim('Message:')}  ${error.message}`);

    if (error.explanation) {
      const explanation = error.explanation.startsWith('[TECHNICAL]')
        ? chalk.hex('#ff6b6b')(error.explanation)
        : chalk.hex('#69db7c')(error.explanation);
      console.log(`     ${chalk.dim('Fix:')}       ${explanation}`);
    }

    console.log('');
  }
}

async function analyzeFile(filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`\n❌ File not found: ${resolvedPath}`));
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  console.log(chalk.dim(`\n📄 Analyzing: ${resolvedPath} (${content.length} chars)`));

  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(chalk.red(`\n❌ Orchestrator returned HTTP ${response.status}: ${text}`));
      process.exit(1);
    }

    const result = await response.json() as AnalyzeResponse;

    if (result.valid) {
      console.log(chalk.green.bold('\n✅ No errors found — YAML configuration is valid!\n'));
      process.exit(0);
    } else {
      if (result.errors.length > 0) {
        printErrorTable(result.errors);
      }
      console.log(chalk.dim(`Pipeline stopped at: ${result.stage.toUpperCase()} stage\n`));
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(chalk.red(`\n❌ Request timed out. Is the orchestrator running at ${ORCHESTRATOR_URL}?`));
    } else {
      console.error(chalk.red(`\n❌ Connection error: ${err instanceof Error ? err.message : err}`));
    }
    console.log(chalk.dim(`\nMake sure all services are running: docker compose up\n`));
    process.exit(1);
  }
}

// --- Main ---
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  printUsage();
  process.exit(0);
}

const fileIndex = args.indexOf('--file') !== -1 ? args.indexOf('--file') : args.indexOf('-f');
if (fileIndex === -1 || !args[fileIndex + 1]) {
  console.error(chalk.red('❌ Please provide a file path with --file <path>'));
  printUsage();
  process.exit(1);
}

analyzeFile(args[fileIndex + 1]);
