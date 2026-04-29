/**
 * MiMo TTS Proxy Server
 *
 * 用于解决浏览器直接调用 MiMo API 时的 CORS 限制。
 * 通过此代理转发请求，同时隐藏 API Key。
 *
 * 使用方式：
 *   1. npm install express node-fetch
 *   2. 在 .env 文件中设置 MIMO_API_KEY=your_key_here
 *   3. node server.js
 *   4. 前端将 BASE_URL 改为 http://localhost:3000/v1
 *
 * API 端点：
 *   POST /v1/chat/completions  —  转发到 https://api.xiaomimimo.com/v1/chat/completions
 */

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MIMO_BASE = 'https://api.xiaomimimo.com/v1';

// ── Middleware ──
app.use(express.json({ limit: '50mb' })); // 音色复刻 base64 可能较大
app.use(express.static(path.join(__dirname))); // 静态文件服务

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Proxy endpoint ──
app.post('/v1/chat/completions', async (req, res) => {
  const apiKey = req.headers['api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: { message: '缺少 api-key header' } });
  }

  const isStream = req.body.stream === true;

  try {
    const upstream = await fetch(`${MIMO_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(req.body)
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      return res.status(upstream.status).send(errBody);
    }

    if (isStream) {
      // ── Stream mode: pipe SSE directly ──
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      upstream.body.pipe(res);
      upstream.body.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      // ── Non-stream: forward JSON ──
      const data = await upstream.json();
      res.json(data);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: { message: '代理服务器错误: ' + err.message } });
  }
});

// ── Fallback: serve index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MiMo TTS Proxy running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} to use the TTS web app`);
});
