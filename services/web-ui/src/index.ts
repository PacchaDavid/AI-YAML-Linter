import express from 'express';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:4000';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/analyze', async (req, res) => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Orchestrator error', message: error.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'web-ui' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Web UI] Serving on http://localhost:${PORT}`);
});

export default app;

