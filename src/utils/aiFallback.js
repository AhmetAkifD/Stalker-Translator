// Fallback order shared by every game: API keys in the order of the key list, and for each key the
// models from the selected one downwards in the model list. Each key+model pair gets `attempts` tries.
//
//   key 1: model A → model B → model C   (all failed, e.g. quota)
//   key 2: model A → model B → model C
//   ...
//
// A runner remembers where it is, so within one bulk run, once key 1 is used up every later request
// starts straight at key 2 instead of failing through key 1's models again.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function modelOrder(models = [], selectedModel) {
  if (!models.length) return [selectedModel];
  const start = models.indexOf(selectedModel);
  return models.slice(start >= 0 ? start : 0);
}

// Short, safe label for a key ("AIza…x1Y2") so a key never appears in full on screen or in logs.
export function maskKey(key = '') {
  const k = key.trim();
  if (k.length <= 10) return '•'.repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function createFallbackRunner({ apiKeys = [], models = [], selectedModel, attempts = 2, retryDelay = 1000, onSwitch }) {
  const keys = apiKeys.map((k) => (k || '').trim()).filter(Boolean);
  const order = modelOrder(models, selectedModel);
  const combos = keys.flatMap((key, keyIndex) => order.map((model) => ({ key, keyIndex, keyCount: keys.length, model })));
  let pos = 0;

  const label = (c) => `Anahtar ${c.keyIndex + 1} (${maskKey(c.key)}) · ${c.model}`;

  return {
    combos,
    label,
    get current() { return combos[pos] || null; },
    get exhausted() { return pos >= combos.length; },

    // fn(apiKey, model) does one request. Returns { ok, value, combo } on success, { stopped } when
    // shouldStop() became true, { error } when onError(err) answered 'abort' (the caller handles that
    // error itself, e.g. splitting a cut-off answer), or { exhausted } when every pair failed.
    async run(fn, { shouldStop = () => false, onError } = {}) {
      while (pos < combos.length) {
        const c = combos[pos];
        for (let attempt = 1; attempt <= attempts; attempt++) {
          if (shouldStop()) return { stopped: true };
          try {
            return { ok: true, value: await fn(c.key, c.model), combo: c };
          } catch (err) {
            if (shouldStop()) return { stopped: true };
            console.error(`[${label(c)}] deneme ${attempt}/${attempts} başarısız:`, err);
            if (onError && onError(err) === 'abort') return { error: err };
            if (attempt < attempts && retryDelay) await sleep(retryDelay);
          }
        }
        pos++;
        if (pos < combos.length) {
          console.warn(`Sıradaki deneniyor: ${label(combos[pos])}`);
          onSwitch?.(combos[pos]);
        }
      }
      return { exhausted: true };
    },
  };
}
