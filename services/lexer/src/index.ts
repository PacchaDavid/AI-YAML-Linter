import express from 'express';
import cors from 'cors';
import { lexer } from './lexer';

const app = express();
const PORT = parseInt(process.env.PORT || '4001', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lexer' });
});

app.post('/tokenize', (req, res) => {
  const { content } = req.body;

  if (typeof content !== 'string') {
    return res.status(400).json({
      tokens: [],
      errors: [{
        stage: 'lexical',
        code: 'LEX-000',
        message: 'El cuerpo de la solicitud debe incluir el campo "content" con un texto',
        line: 0,
      }],
    });
  }

  console.log(`[Lexer] Received ${content.length} chars for tokenization`);
  const result = lexer(content);
  console.log(`[Lexer] Produced ${result.tokens.length} tokens, ${result.errors.length} errors`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[Lexer] Service running on port ${PORT}`);
});

export default app;
