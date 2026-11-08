import { GoogleGenerativeAI } from "@google/generative-ai";

export function buildGlossaryPrompt(glossary = [], targetTexts = null) {
  if (!Array.isArray(glossary) || glossary.length === 0) return "";
  let validTerms = glossary.filter(
    item => item && typeof item.original === 'string' && typeof item.translation === 'string' &&
            item.original.trim() !== '' && item.translation.trim() !== ''
  );

  // DYNAMIC FILTERING: Only include terms that actually appear in the target text
  if (targetTexts && validTerms.length > 0) {
    const combinedText = (Array.isArray(targetTexts) ? targetTexts.join("\n") : targetTexts).toLowerCase();
    validTerms = validTerms.filter(item => {
      const originalLower = item.original.trim().toLowerCase();
      return combinedText.includes(originalLower);
    });
  }

  if (validTerms.length === 0) return "";

  let promptAddition = "\n\nCRITICAL GLOSSARY & TURKISH SUFFIX / PRONUNCIATION RULES:\n";
  promptAddition += "1. You MUST strictly translate the following terms as specified whenever they appear.\n";
  promptAddition += "2. When attaching Turkish grammatical suffixes (e.g. dative -e/-a, genitive -in/-ın, locative -de/-da, ablative -den/-dan, accusative -i/-ı, etc.) to proper nouns or foreign terms, use an apostrophe (kesme işareti) and follow Turkish vowel harmony matching the Turkish pronunciation/reading specified below.\n";
  promptAddition += "Terms list:\n";

  validTerms.forEach(item => {
    const orig = item.original.trim();
    const trans = item.translation.trim();
    const pron = (item.pronunciation && typeof item.pronunciation === 'string') ? item.pronunciation.trim() : "";
    if (pron) {
      promptAddition += `- "${orig}" => "${trans}" (Türkçe Okunuşu / Ek Çekimi Kuralı: ${pron})\n`;
    } else {
      promptAddition += `- "${orig}" => "${trans}"\n`;
    }
  });
  return promptAddition;
}

export async function checkTokenLimit(textsArray, apiKey, prompt, modelName = "gemini-3.7-flash", glossary = []) {
  if (!apiKey) return 0;
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const payload = JSON.stringify(textsArray);
  const glossaryPrompt = buildGlossaryPrompt(glossary, textsArray);
  const fullPrompt = prompt + glossaryPrompt + "\n\nTranslate the following JSON array of strings, returning only a JSON array of translated strings in the same order:\n" + payload;

  try {
    const { totalTokens } = await model.countTokens(fullPrompt);
    return totalTokens;
  } catch (e) {
    console.error("Token count error", e);
    return Math.ceil(fullPrompt.length / 4);
  }
}

// Translates rows by ID instead of by position. `entries` is [{ id, text }]; the model gets
// {"<id>": "<text>", ...} and must answer with the same keys. Returns a Map(id -> translation)
// containing only the IDs that actually came back, so a skipped row stays missing instead of
// shifting every following translation by one.
export async function translateKeyed(entries, apiKey, prompt, modelName = "gemini-3.7-flash", glossary = [], signal) {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });

  const payload = {};
  for (const e of entries) payload[e.id] = e.text;
  const glossaryPrompt = buildGlossaryPrompt(glossary, entries.map((e) => e.text));
  const fullPrompt = prompt + glossaryPrompt +
    "\n\nYou are given a JSON object. Each key is a row ID and each value is the text to translate. " +
    "Return a JSON object with exactly the same keys, each mapped to the translation of its own value. " +
    "Translate every key; never merge, split, skip or rename keys. Return raw JSON only, no markdown.\n\nObject to translate:\n" +
    JSON.stringify(payload);

  let parsed;
  try {
    const result = await model.generateContent(fullPrompt, signal ? { signal } : undefined);
    let responseText = (await result.response.text()).trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
    }
    parsed = JSON.parse(responseText.trim());
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed using ${modelName}: ` + error.message);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Translation failed using ${modelName}: response is not a JSON object`);
  }

  const out = new Map();
  for (const e of entries) {
    const v = parsed[e.id];
    if (typeof v === "string" && v.trim() !== "") out.set(e.id, v);
  }
  return out;
}

export async function translateText(text, apiKey, prompt, modelName = "gemini-3.7-flash", glossary = []) {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const glossaryPrompt = buildGlossaryPrompt(glossary, text);
  const fullPrompt = prompt + glossaryPrompt + "\n\nText to translate:\n" + text;

  try {
    const result = await model.generateContent(fullPrompt);
    return (await result.response.text()).trim();
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed using ${modelName}: ` + error.message);
  }
}
