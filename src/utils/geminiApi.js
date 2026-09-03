import { GoogleGenerativeAI } from "@google/generative-ai";

export async function checkTokenLimit(textsArray, apiKey, prompt, modelName = "gemini-3.7-flash") {
  if (!apiKey) return 0;
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const payload = JSON.stringify(textsArray);
  const fullPrompt = prompt + "\n\nTranslate the following JSON array of strings, returning only a JSON array of translated strings in the same order:\n" + payload;

  try {
    const { totalTokens } = await model.countTokens(fullPrompt);
    return totalTokens;
  } catch (e) {
    console.error("Token count error", e);
    return Math.ceil(fullPrompt.length / 4);
  }
}

export async function translateBulk(textsArray, apiKey, prompt, modelName = "gemini-3.7-flash") {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const payload = JSON.stringify(textsArray);
  const fullPrompt = prompt + "\n\nYou must return a valid JSON array of strings containing the translations, preserving the exact same order. Do NOT wrap in markdown blocks, just return raw JSON.\n\nArray to translate:\n" + payload;

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

export async function translateText(text, apiKey, prompt, modelName = "gemini-3.7-flash") {
  if (!apiKey) throw new Error("API Key is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const fullPrompt = prompt + "\n\nText to translate:\n" + text;

  try {
    const result = await model.generateContent(fullPrompt);
    return (await result.response.text()).trim();
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed using ${modelName}: ` + error.message);
  }
}
