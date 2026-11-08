import { useState, useCallback } from 'react';

// Shared AI settings for every game. API key and model list are common to all games;
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

export function useAiSettings({ promptKey, defaultPrompt }) {
  const [apiKey, setApiKeyState] = useState(() => read('geminiApiKey', ''));
  const [prompt, setPromptState] = useState(() => read(promptKey, defaultPrompt));
  const [models, setModelsState] = useState(readModels);
  const [model, setModelState] = useState(() => read('geminiModel', null) || readModels()[0]);

  const setApiKey = useCallback((v) => { setApiKeyState(v); write('geminiApiKey', v); }, []);
  const setPrompt = useCallback((v) => { setPromptState(v); write(promptKey, v); }, [promptKey]);
  const resetPrompt = useCallback(() => setPrompt(defaultPrompt), [setPrompt, defaultPrompt]);
  const setModel = useCallback((v) => { setModelState(v); write('geminiModel', v); }, []);
  const setModels = useCallback((v) => { setModelsState(v); write('geminiCustomModels', JSON.stringify(v)); }, []);

  return { apiKey, setApiKey, prompt, setPrompt, resetPrompt, defaultPrompt, model, setModel, models, setModels };
}
