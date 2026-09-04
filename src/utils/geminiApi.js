import { GoogleGenerativeAI } from "@google/generative-ai";

export function buildGlossaryPrompt(glossary = []) {
  if (!Array.isArray(glossary) || glossary.length === 0) return "";
  const validTerms = glossary.filter(
    item => item && typeof item.original === 'string' && typeof item.translation === 'string' &&
            item.original.trim() !== '' && item.translation.trim() !== ''
  );
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
  const glossaryPrompt = buildGlossaryPrompt(glossary);
  const fullPrompt = prompt + glossaryPrompt + "\n\nTranslate the following JSON array of strings, returning only a JSON array of translated strings in the same order:\n" + payload;

  try {
    const { totalTokens } = await model.countTokens(fullPrompt);
    return totalTokens;
  } catch (e) {
    console.error("Token count error", e);
    return Math.ceil(fullPrompt.length / 4);
  }
}

export async function translateBulk(textsArray, apiKey, prompt, modelName = "gemini-3.7-flash", glossary = []) {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const payload = JSON.stringify(textsArray);
  const glossaryPrompt = buildGlossaryPrompt(glossary);
  const fullPrompt = prompt + glossaryPrompt + "\n\nYou must return a valid JSON array of strings containing the translations, preserving the exact same order. Do NOT wrap in markdown blocks, just return raw JSON.\n\nArray to translate:\n" + payload;

  try {
    const result = await model.generateContent(fullPrompt);
    let responseText = await result.response.text();
    responseText = responseText.trim();
    
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n?/, "");
      responseText = responseText.replace(/\n?```$/, "");
    }
    
    return JSON.parse(responseText.trim());
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed using ${modelName}: ` + error.message);
  }
}

export async function translateText(text, apiKey, prompt, modelName = "gemini-3.7-flash", glossary = []) {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const glossaryPrompt = buildGlossaryPrompt(glossary);
  const fullPrompt = prompt + glossaryPrompt + "\n\nText to translate:\n" + text;

  try {
    const result = await model.generateContent(fullPrompt);
    return (await result.response.text()).trim();
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed using ${modelName}: ` + error.message);
  }
}
