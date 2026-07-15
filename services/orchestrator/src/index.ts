import express from 'express';
import cors from 'cors';
import { LintError } from '../../../shared/types/error';
import { Orchestrator } from './orchestrator';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

const LEXER_URL = process.env.LEXER_URL || 'http://localhost:4001';
const PARSER_URL = process.env.PARSER_URL || 'http://localhost:4002';
const SEMANTIC_URL = process.env.SEMANTIC_URL || 'http://localhost:4003';
const EXPLAINER_URL = process.env.EXPLAINER_URL || 'http://localhost:4004';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Service Adapters (Facade pattern) ---
const serviceAdapters = {
  lexer: {
    async tokenize(content: string) {
      const response = await fetch(`${LEXER_URL}/tokenize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(`Lexer returned ${response.status}`);
      return response.json() as Promise<{ tokens: unknown[]; errors: LintError[] }>;
    },
  },
  parser: {
    async parse(tokens: unknown[]) {
      const response = await fetch(`${PARSER_URL}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens }),
      });
      if (!response.ok) throw new Error(`Parser returned ${response.status}`);
      return response.json() as Promise<{ ast: unknown; errors: LintError[] }>;
    },
  },
  semantic: {
    async validate(ast: unknown) {
      const response = await fetch(`${SEMANTIC_URL}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ast }),
      });
      if (!response.ok) throw new Error(`Semantic analyzer returned ${response.status}`);
      return response.json() as Promise<{ valid: boolean; errors: LintError[] }>;
    },
  },
  explainer: {
    async explain(error: LintError) {
      const response = await fetch(`${EXPLAINER_URL}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error }),
      });
      if (!response.ok) throw new Error(`Explainer returned ${response.status}`);
      return response.json() as Promise<{ explanation: string; cached: boolean }>;
    },
  },
};

const orchestrator = new Orchestrator(serviceAdapters);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'orchestrator' });
});

app.post('/analyze', async (req, res) => {
  const { content } = req.body;

  if (typeof content !== 'string') {
    return res.status(400).json({
      valid: false,
      errors: [{
        stage: 'orchestrator',
        code: 'CLI-001',
        message: 'El cuerpo de la solicitud debe incluir el campo "content" con un YAML en texto',
        line: 0,
      }],
      stage: 'orchestrator',
    });
  }

  console.log(`[Orchestrator] Received analyze request (${content.length} chars)`);
  try {
    const result = await orchestrator.analyze(content);
    console.log(`[Orchestrator] Result: valid=${result.valid}, ${result.errors.length} errors, stage=${result.stage}`);
    res.json(result);
  } catch (err) {
    console.error(`[Orchestrator] Fatal error:`, err);
    res.status(500).json({
      valid: false,
      errors: [{
        stage: 'orchestrator',
        code: 'FATAL',
        message: `Error interno del orquestador: ${err instanceof Error ? err.message : String(err)}`,
        line: 0,
      }],
      stage: 'orchestrator',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Orchestrator] Service running on port ${PORT}`);
});

export default app;
