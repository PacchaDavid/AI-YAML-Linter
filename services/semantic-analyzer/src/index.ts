import express from 'express';
import cors from 'cors';
import { semanticAnalyzer } from './semantic-analyzer';

const app = express();
const PORT = parseInt(process.env.PORT || '4003', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'semantic-analyzer' });
});

app.post('/validate', (req, res) => {
  const { ast } = req.body;

  if (!ast) {
    return res.status(400).json({
      valid: false,
      errors: [{
        stage: 'semantic',
        code: 'SEM-000',
        message: 'El cuerpo de la solicitud debe incluir el campo "ast"',
        line: 0,
      }],
    });
  }

  console.log(`[Semantic] Received AST for validation`);
  const result = semanticAnalyzer(ast);
  console.log(`[Semantic] Valid: ${result.valid}, ${result.errors.length} errors`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[Semantic] Service running on port ${PORT}`);
});

export default app;
