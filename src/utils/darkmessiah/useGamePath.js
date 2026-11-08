import { useState, useEffect, useCallback } from 'react';
import { detectGame, validateGame } from './gameApi';

// Location of the game (folder with mm.exe), remembered in the browser and validated by the local patch service.
const STORAGE_KEY = 'dmGamePath';

const read = () => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } };
const write = (v) => { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage unavailable */ } };

export function useGamePath() {
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
  }, []);

  const savePath = useCallback(async (p) => {
    setGamePath(p);
    write(p);
    setDetectError(null);
    return validate(p);
  }, [validate]);

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
  }, [savePath]);

  // On first load: check the saved path, or try to find the game automatically.
  useEffect(() => {
    const saved = read();
    if (saved) validate(saved);
    else detect();
  }, [validate, detect]);

  return { gamePath, setGamePath, savePath, validation, detect, detecting, detectError };
}
