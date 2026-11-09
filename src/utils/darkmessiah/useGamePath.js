import { useState, useEffect, useCallback } from 'react';
import * as dmApi from './gameApi';

// Location of a game folder, remembered in the browser and validated by that game's local patch service.
// Defaults are Dark Messiah's (folder with mm.exe); other games pass their own key and API.
const DEFAULTS = { storageKey: 'dmGamePath', api: dmApi };

// Pass a module-level (stable) options object, otherwise the first-load check runs on every render.
export function useGamePath({ storageKey, api } = DEFAULTS) {
  const { detectGame, validateGame } = api;
  const read = useCallback(() => { try { return localStorage.getItem(storageKey) || ''; } catch { return ''; } }, [storageKey]);
  const write = useCallback((v) => { try { localStorage.setItem(storageKey, v); } catch { /* storage unavailable */ } }, [storageKey]);
  const [gamePath, setGamePath] = useState(read);
  const [validation, setValidation] = useState(null); // { ok, root, exe } | { ok: false, error }
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);

  const validate = useCallback(async (p) => {
    if (!p.trim()) { setValidation(null); return null; }
    try {
      const v = await validateGame(p);
      setValidation(v);
      return v;
    } catch (err) {
      const v = { ok: false, error: err.message };
      setValidation(v);
      return v;
    }
  }, [validateGame]);

  const savePath = useCallback(async (p) => {
    setGamePath(p);
    write(p);
    setDetectError(null);
    return validate(p);
  }, [validate, write]);

  const detect = useCallback(async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const d = await detectGame();
      if (d.ok) await savePath(d.root);
      else setDetectError(d.error);
    } catch (err) {
      setDetectError(err.message);
    }
    setDetecting(false);
  }, [savePath, detectGame]);

  // On first load: check the saved path, or try to find the game automatically.
  useEffect(() => {
    const saved = read();
    if (saved) validate(saved);
    else detect();
  }, [read, validate, detect]);

  return { gamePath, setGamePath, savePath, validation, detect, detecting, detectError };
}
