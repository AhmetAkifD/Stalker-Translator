/**
 * The Witcher 1 TLG (DLG V3.38) <-> XML Converter
 */

// Reads a DataView and extracts the localized string for English (Language ID: 2 or fallback to 0)
function getLocString(dataView, offset) {
  const totalSize = dataView.getUint32(offset, true);
  const strRef = dataView.getUint32(offset + 4, true);
  const strCount = dataView.getUint32(offset + 8, true);
  
  let cursor = offset + 12;
  let englishText = "";
  let fallbackText = "";
  
  for (let i = 0; i < strCount; i++) {
    const langId = dataView.getUint32(cursor, true);
    const strLen = dataView.getUint32(cursor + 4, true);
    
    // Read string
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + cursor + 8, strLen);
    const text = new TextDecoder('utf-8').decode(bytes); // Or windows-1250 if not utf-8, but utf-8 is safe for english
    
    if (langId === 2 || langId === 4 || langId === 6) { // English ID
      englishText = text;
    }
    if (i === 0) fallbackText = text; // Usually Polish
    
    cursor += 8 + strLen;
  }
  
  return englishText || fallbackText;
}

export function tlgToXml(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);
  const header = new TextDecoder('ascii').decode(new Uint8Array(arrayBuffer, 0, 8));
  
  if (!header.startsWith('DLG V3.')) {
    throw new Error('Geçersiz dosya formatı. Beklenen: DLG V3.38');
  }
  
  const fieldOffset = dataView.getUint32(16, true);
  const fieldCount = dataView.getUint32(20, true);
  const labelOffset = dataView.getUint32(24, true);
  const labelCount = dataView.getUint32(28, true);
  const fieldDataOffset = dataView.getUint32(32, true);
  
  // Extract Labels
  const labels = [];
  for (let i = 0; i < labelCount; i++) {
    const rawLabel = new TextDecoder('ascii').decode(new Uint8Array(arrayBuffer, labelOffset + i * 16, 16));
    labels.push(rawLabel.replace(/\0/g, ''));
  }
  
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n<witcher_dialogue>\n`;
  
  for (let i = 0; i < fieldCount; i++) {
    const type = dataView.getUint32(fieldOffset + i * 12, true);
    const labelIdx = dataView.getUint32(fieldOffset + i * 12 + 4, true);
    const dataOrOffset = dataView.getUint32(fieldOffset + i * 12 + 8, true);
    
    if (type === 12 && labels[labelIdx] === 'Text') {
      const locOffset = fieldDataOffset + dataOrOffset;
      const text = getLocString(dataView, locOffset);
      
      xml += `  <entry field_idx="${i}">\n`;
      xml += `    <original>${escapeXml(text)}</original>\n`;
      xml += `    <translation></translation>\n`;
      xml += `  </entry>\n`;
    }
  }
  
  xml += `</witcher_dialogue>`;
  return xml;
}

export function xmlToTlg(originalArrayBuffer, xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const entries = xmlDoc.getElementsByTagName("entry");
  const translationMap = new Map();
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const fieldIdx = parseInt(entry.getAttribute("field_idx"), 10);
    const transNode = entry.getElementsByTagName("translation")[0];
    
    if (transNode && transNode.textContent.trim() !== "") {
      translationMap.set(fieldIdx, transNode.textContent);
    }
  }
  
  if (translationMap.size === 0) {
    // If nothing translated, return original buffer
    return new Uint8Array(originalArrayBuffer);
  }
  
  // We rebuild the file. Instead of remapping the entire FieldData chunk to be perfectly optimal,
  // we just append our modified CExoLocStrings to the END of the original FieldData block 
  // and update the Field pointers to point to our new appended offsets.
  // This is safe because offsets are just byte indices.
  
  const dv = new DataView(originalArrayBuffer);
  const fieldOffset = dv.getUint32(16, true);
  const fieldCount = dv.getUint32(20, true);
  const fieldDataOffset = dv.getUint32(32, true);
  const fieldDataCount = dv.getUint32(36, true);
  
  // Clone original buffer to a mutable array
  const originalBytes = new Uint8Array(originalArrayBuffer);
  
  // Calculate new CExoLocStrings to append
  const appendedChunks = [];
  let currentAppendOffset = fieldDataCount; // Start appending at the end of original FieldData
  const fieldUpdates = []; // { fieldIndex, newDataOffset }
  
  for (const [fieldIdx, translatedText] of translationMap.entries()) {
    const oldDataOffset = dv.getUint32(fieldOffset + fieldIdx * 12 + 8, true);
    const oldLocOffset = fieldDataOffset + oldDataOffset;
    
    const strRef = dv.getUint32(oldLocOffset + 4, true);
    const oldStrCount = dv.getUint32(oldLocOffset + 8, true);
    
    // We will preserve the existing translations (Polish, etc.) but overwrite the English ones (2,4,6)
    // AND add Turkish if we want. Actually, the easiest is to just replace ALL languages with the Turkish translation
    // or specifically replace the English string. Let's just add/replace Language 2 (English).
    
    let cursor = oldLocOffset + 12;
    const substrings = [];
    
    let hasEnglish = false;
    for (let i = 0; i < oldStrCount; i++) {
      const langId = dv.getUint32(cursor, true);
      const strLen = dv.getUint32(cursor + 4, true);
      
      const isEnglish = (langId === 2 || langId === 4 || langId === 6);
      
      if (isEnglish) {
        hasEnglish = true;
        substrings.push({ langId, text: translatedText });
      } else {
        const textBytes = new Uint8Array(originalArrayBuffer, cursor + 8, strLen);
        const text = new TextDecoder('utf-8').decode(textBytes);
        substrings.push({ langId, text });
      }
      cursor += 8 + strLen;
    }
    
    if (!hasEnglish) {
      // If there was no english string, add it as English (2)
      substrings.push({ langId: 2, text: translatedText });
    }
    
    // Serialize new CExoLocString
    const encoder = new TextEncoder();
    const stringDataChunks = [];
    let stringsTotalLength = 0;
    
    for (const sub of substrings) {
      const encodedText = encoder.encode(sub.text);
      stringDataChunks.push({ langId: sub.langId, bytes: encodedText });
      stringsTotalLength += 8 + encodedText.length;
    }
    
    const newLocTotalSize = 12 + stringsTotalLength;
    const chunkBuffer = new ArrayBuffer(newLocTotalSize);
    const chunkDv = new DataView(chunkBuffer);
    
    chunkDv.setUint32(0, newLocTotalSize - 4, true); // Size doesn't include the size uint32 itself? Wait, standard GFF CExoLocString size is the total number of bytes EXCLUDING the TotalSize uint32 itself (so it is total bytes - 4).
    chunkDv.setUint32(4, strRef, true);
    chunkDv.setUint32(8, substrings.length, true);
    
    let c = 12;
    for (const sub of stringDataChunks) {
      chunkDv.setUint32(c, sub.langId, true);
      chunkDv.setUint32(c + 4, sub.bytes.length, true);
      new Uint8Array(chunkBuffer).set(sub.bytes, c + 8);
      c += 8 + sub.bytes.length;
    }
    
    appendedChunks.push(new Uint8Array(chunkBuffer));
    fieldUpdates.push({ fieldIndex: fieldIdx, newDataOffset: currentAppendOffset });
    currentAppendOffset += newLocTotalSize;
  }
  
  // Construct the final binary
  const addedLength = appendedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const newFieldDataCount = fieldDataCount + addedLength;
  
  // Total size of new file = original size + added length
  const newBuffer = new ArrayBuffer(originalArrayBuffer.byteLength + addedLength);
  const newBytes = new Uint8Array(newBuffer);
  const newDv = new DataView(newBuffer);
  
  // 1. Copy everything before FieldData block
  // Wait, in GFF, the blocks might be in any order, but usually they are: Structs, Fields, Labels, FieldData, FieldIndices, ListIndices.
  // We can't just append to the file. We MUST insert inside the FieldData block and shift all subsequent blocks!
  
  // Let's identify the boundaries of FieldData block
  const preFieldData = new Uint8Array(originalArrayBuffer, 0, fieldDataOffset + fieldDataCount);
  newBytes.set(preFieldData, 0);
  
  // Write appended chunks
  let writeOffset = fieldDataOffset + fieldDataCount;
  for (const chunk of appendedChunks) {
    newBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  
  // Copy everything after FieldData block
  const postFieldDataOffset = fieldDataOffset + fieldDataCount;
  const postFieldDataSize = originalArrayBuffer.byteLength - postFieldDataOffset;
  if (postFieldDataSize > 0) {
    const postFieldData = new Uint8Array(originalArrayBuffer, postFieldDataOffset, postFieldDataSize);
    newBytes.set(postFieldData, writeOffset);
  }
  
  // Update header pointers for anything that came AFTER FieldData
  // Let's check all offsets in the header: Struct, Field, Label, FieldData, FieldIndices, ListIndices.
  const offsetsToFix = [
    { name: 'StructOffset', offset: 8 },
    { name: 'FieldOffset', offset: 16 },
    { name: 'LabelOffset', offset: 24 },
    { name: 'FieldIndicesOffset', offset: 40 },
    { name: 'ListIndicesOffset', offset: 48 },
  ];
  
  for (const ptr of offsetsToFix) {
    const oldVal = dv.getUint32(ptr.offset, true);
    if (oldVal > fieldDataOffset) {
      newDv.setUint32(ptr.offset, oldVal + addedLength, true);
    }
  }
  
  // Update FieldDataCount
  newDv.setUint32(36, newFieldDataCount, true);
  
  // Apply field data offset updates for the fields we modified
  for (const update of fieldUpdates) {
    const fieldStructOffset = newDv.getUint32(16, true) + update.fieldIndex * 12;
    newDv.setUint32(fieldStructOffset + 8, update.newDataOffset, true);
  }
  
  return newBytes;
}

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
