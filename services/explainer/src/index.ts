import express from 'express';
import cors from 'cors';
import { explainer } from './explainer';

const app = express();
const PORT = parseInt(process.env.PORT || '4004', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'explainer' });
});

app.post('/explain', async (req, res) => {
  const { error } = req.body;

  if (!error || !error.stage || !error.message) {
    return res.status(400).json({
      explanation: 'Invalid error object. Required: stage, message, code',
      cached: false,
    });
  }

  console.log(`[Explainer] Received error: [${error.code}] ${error.message}`);
  try {
    const result = await explainer(error);
    console.log(`[Explainer] Response: cached=${result.cached}, explanation length=${result.explanation.length}`);
    res.json(result);
  } catch (err) {
    console.error(`[Explainer] Unexpected error:`, err);
    res.status(500).json({
      explanation: 'Internal server error in explainer',
      cached: false,
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Explainer] Service running on port ${PORT}`);
});

export default app;
