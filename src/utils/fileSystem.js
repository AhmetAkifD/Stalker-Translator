export async function readXmlFile(fileHandle) {
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  
  // Try to decode as windows-1251 first, if not fallback to utf-8
  try {
    const decoder = new TextDecoder('windows-1251');
    return decoder.decode(arrayBuffer);
  } catch (e) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(arrayBuffer);
  }
}

export async function saveFileToFolder(directoryHandle, originalFileHandle, folderName, newXmlContent) {
  try {
    // Get or create the directory
    const dirHandle = await directoryHandle.getDirectoryHandle(folderName, { create: true });
    
    // Get or create the file in that directory
    const newFileHandle = await dirHandle.getFileHandle(originalFileHandle.name, { create: true });
    
    // Create a writable stream to the file
    const writable = await newFileHandle.createWritable();
    
    // We will just write the string
    await writable.write(newXmlContent);
    await writable.close();
    
    return true;
  } catch (error) {
    console.error(`Error saving file to ${folderName}:`, error);
    throw error;
  }
}

export async function getTranslatedFileHandle(directoryHandle, fileName) {
  try {
    const translatedDirHandle = await directoryHandle.getDirectoryHandle('translated_files');
    return await translatedDirHandle.getFileHandle(fileName);
  } catch (e) {
    return null;
  }
}

export async function getTranslatedFile(directoryHandle, fileName) {
  try {
    const fileHandle = await getTranslatedFileHandle(directoryHandle, fileName);
    if (!fileHandle) return null;
    return await readXmlFile(fileHandle);
  } catch (e) {
    return null; // Not translated yet
  }
}

export async function searchAllFiles(directoryHandle, files, query, extractTranslations) {
  if (!query || !query.trim() || !files || files.length === 0) return [];
  
  const cleanQuery = query.toLowerCase().trim();
  const results = [];

  for (const fileHandle of files) {
    try {
      const originalXml = await readXmlFile(fileHandle);
      const originalItems = extractTranslations(originalXml);
      
      const translatedHandle = await getTranslatedFileHandle(directoryHandle, fileHandle.name);
      const translatedXml = translatedHandle ? await readXmlFile(translatedHandle) : null;
      const translatedItems = translatedXml ? extractTranslations(translatedXml) : [];
      
      // Create map of translated items by ID
      const transMap = new Map();
      translatedItems.forEach(item => {
        transMap.set(item.id, item.originalText);
      });

      // Search matches
      for (const item of originalItems) {
        const originalText = item.originalText || '';
        const translationText = transMap.get(item.id) || '';

        const matchOriginal = originalText.toLowerCase().includes(cleanQuery);
        const matchTranslation = translationText.toLowerCase().includes(cleanQuery);

        if (matchOriginal || matchTranslation) {
          results.push({
            fileName: fileHandle.name,
            fileHandle: fileHandle,
            translatedFileHandle: translatedHandle,
            id: item.id,
            originalText: item.originalText,
            translationText: translationText,
            matchedIn: matchOriginal && matchTranslation ? 'both' : (matchOriginal ? 'original' : 'translation')
          });
        }
      }
    } catch (err) {
      console.error("Error searching in file:", fileHandle.name, err);
    }
  }

  return results;
}
