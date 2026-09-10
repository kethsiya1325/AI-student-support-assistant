import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { processStudentMessage } from './services/llm.js';
import { memoryManager } from './memory/index.js';
import { ragEngine } from './rag/index.js';
import { executeTool, TOOL_DEFINITIONS, getActiveNotices } from './tools/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// 1. Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default-session', activeProfileId } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty message string is required.' });
    }

    const result = await processStudentMessage({
      message: message.trim(),
      sessionId,
      activeProfileId
    });

    res.json(result);
  } catch (err) {
    console.error('Error handling /api/chat:', err);
    res.status(500).json({ error: 'Internal server error processing query: ' + err.message });
  }
});

// 2. Profile Management
app.get('/api/profile', (req, res) => {
  res.json({
    activeProfile: memoryManager.getActiveProfile(),
    allProfiles: memoryManager.getAllProfiles()
  });
});

app.post('/api/profile', (req, res) => {
  const { profileId, customProfile } = req.body;
  if (profileId) {
    const updated = memoryManager.setActiveProfile(profileId);
    return res.json({ success: true, activeProfile: updated });
  } else if (customProfile) {
    const updated = memoryManager.setActiveProfile(customProfile);
    return res.json({ success: true, activeProfile: updated });
  }
  res.status(400).json({ error: 'Either profileId or customProfile object is required.' });
});

// 3. Direct Tools Execution & Registry
app.get('/api/tools', (req, res) => {
  res.json({ tools: TOOL_DEFINITIONS });
});

app.post('/api/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const result = await executeTool(toolName, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Knowledge Base Document Browser
app.get('/api/docs', (req, res) => {
  const docs = ragEngine.getAllDocuments();
  res.json({ count: docs.length, documents: docs });
});

// 5. Active Notices Direct Feed
app.get('/api/notices', (req, res) => {
  const result = getActiveNotices({});
  res.json(result);
});

// 6. Session History & Reset
app.get('/api/session/:sessionId', (req, res) => {
  const session = memoryManager.getSession(req.params.sessionId);
  res.json(session);
});

app.post('/api/session/clear', (req, res) => {
  const { sessionId = 'default-session' } = req.body;
  memoryManager.clearSession(sessionId);
  res.json({ success: true, message: `Session ${sessionId} cleared.` });
});

// 7. Settings / Dynamic API Key Config
app.post('/api/settings', (req, res) => {
  const { geminiApiKey, geminiModel } = req.body;
  if (geminiApiKey !== undefined) {
    process.env.GEMINI_API_KEY = geminiApiKey.trim();
  }
  if (geminiModel) {
    process.env.GEMINI_MODEL = geminiModel.trim();
  }
  res.json({
    success: true,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
    activeModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  });
});

app.get('/api/settings', (req, res) => {
  res.json({
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
    activeModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AI Student Support Assistant running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
