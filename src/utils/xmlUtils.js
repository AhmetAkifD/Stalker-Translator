export function extractTranslations(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const items = [];
  const stringNodes = xmlDoc.getElementsByTagName("string");
  
  for (let i = 0; i < stringNodes.length; i++) {
    const node = stringNodes[i];
    const id = node.getAttribute("id");
    const textNode = node.getElementsByTagName("text")[0];
    
    if (textNode) {
      items.push({
        id: id || "item_" + i,
        originalText: textNode.textContent,
        translatedText: "", // Start empty
      });
    }
  }
  
  return items;
}

export function applyTranslations(originalXmlString, translations) {
  let updatedXmlString = originalXmlString;
  
  translations.forEach((item) => {
    if (item.translatedText && item.translatedText.trim() !== "") {
      const idRegex = new RegExp("(<string\\s+[^>]*id=\"" + escapeRegExp(item.id) + "\"[^>]*>\\s*<text>)([\\s\\S]*?)(</text>\\s*</string>)", "i");
      
      updatedXmlString = updatedXmlString.replace(idRegex, (match, p1, p2, p3) => {
        const safeTranslation = escapeXml(item.translatedText);
        return p1 + safeTranslation + p3;
      });
    }
  });
  
  return updatedXmlString;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
