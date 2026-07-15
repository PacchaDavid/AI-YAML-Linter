import express from 'express';
import cors from 'cors';
import { parser } from './parser';

const app = express();
const PORT = parseInt(process.env.PORT || '4002', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'parser' });
});

app.post('/parse', (req, res) => {
  const { tokens } = req.body;

  if (!Array.isArray(tokens)) {
    return res.status(400).json({
      ast: null,
      errors: [{
        stage: 'syntactic',
        code: 'PAR-000',
        message: 'El cuerpo de la solicitud debe incluir el campo "tokens" con un arreglo',
        line: 0,
      }],
    });
  }

  console.log(`[Parser] Received ${tokens.length} tokens for parsing`);
  const result = parser(tokens);
  console.log(`[Parser] AST: ${result.ast ? 'built' : 'null'}, ${result.errors.length} errors`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[Parser] Service running on port ${PORT}`);
});

export default app;
