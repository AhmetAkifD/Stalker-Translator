import { useState, useCallback } from 'react';

// Shared AI settings for every game. API keys and model list are common to all games;
// the system prompt is stored per game under `promptKey`.
export const DEFAULT_MODELS = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.6-pro'];

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function readModels() {
  try {
    const parsed = JSON.parse(read('geminiCustomModels', 'null'));
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_MODELS;
  } catch {
    return DEFAULT_MODELS;
  }
}

// Keys are stored as a JSON list; an older single key ('geminiApiKey') becomes the first entry.
function readKeys() {
  try {
    const parsed = JSON.parse(read('geminiApiKeys', 'null'));
    if (Array.isArray(parsed)) return parsed.filter((k) => typeof k === 'string');
  } catch { /* fall through */ }
  const single = read('geminiApiKey', '');
  return single ? [single] : [];
}

export function useAiSettings({ promptKey, defaultPrompt }) {
  const [apiKeys, setApiKeysState] = useState(readKeys);
  const [prompt, setPromptState] = useState(() => read(promptKey, defaultPrompt));
  const [models, setModelsState] = useState(readModels);
  const [model, setModelState] = useState(() => read('geminiModel', null) || readModels()[0]);

  const setApiKeys = useCallback((v) => {
    setApiKeysState(v);
    write('geminiApiKeys', JSON.stringify(v));
    write('geminiApiKey', v.find((k) => k.trim()) || ''); // kept in step for older code paths
  }, []);
  // First non-empty key: used for token counting and to tell whether AI translation is possible.
  const apiKey = apiKeys.find((k) => k.trim()) || '';
  const setPrompt = useCallback((v) => { setPromptState(v); write(promptKey, v); }, [promptKey]);
  const resetPrompt = useCallback(() => setPrompt(defaultPrompt), [setPrompt, defaultPrompt]);
  const setModel = useCallback((v) => { setModelState(v); write('geminiModel', v); }, []);
  const setModels = useCallback((v) => { setModelsState(v); write('geminiCustomModels', JSON.stringify(v)); }, []);

  return { apiKey, apiKeys, setApiKeys, prompt, setPrompt, resetPrompt, defaultPrompt, model, setModel, models, setModels };
}
