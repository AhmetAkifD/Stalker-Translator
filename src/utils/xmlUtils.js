export function hasXmlDeclaration(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return false;
  return /<\?xml[^>]*\?>/i.test(xmlString);
}

export function hasStringTable(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return false;
  return /<string_table[\s>]/i.test(xmlString);
}

export function removeXmlDeclaration(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return xmlString;
  // Replace the XML declaration and any immediate following whitespace/newlines
  return xmlString.replace(/<\?xml[^>]*\?>\s*/i, '');
}

export function removeStringTableTags(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return xmlString;
  // Replace opening and closing string_table tags
  let cleaned = xmlString.replace(/<string_table[^>]*>\s*/i, '');
  cleaned = cleaned.replace(/<\/string_table>\s*/i, '');
  return cleaned;
}

export function extractTranslations(xmlString) {
  const parser = new DOMParser();
  
  // To handle files that lack a single root element (like <string_table>),
  // we must wrap the content in a dummy root. Otherwise, DOMParser stops after the first <string>.
  // We also remove the XML declaration because it's not allowed inside a dummy root.
  const cleanXml = xmlString.replace(/<\?xml[^>]*\?>/i, '');
  const wrappedXml = `<dummy_root>${cleanXml}</dummy_root>`;
  
  const xmlDoc = parser.parseFromString(wrappedXml, "text/xml");
  
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
