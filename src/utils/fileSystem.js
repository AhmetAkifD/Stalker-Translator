import { hasStringTable, fixXmlStringTable } from './xmlUtils';

export async function readXmlFile(fileHandle) {
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  
  // Try UTF-8 first with fatal: true. If it is valid UTF-8 (including our Turkish backups),
  // it decodes cleanly. If it contains invalid UTF-8 bytes (like Russian windows-1251), it falls back.
  try {
    const utfDecoder = new TextDecoder('utf-8', { fatal: true });
    return utfDecoder.decode(arrayBuffer);
  } catch (e) {
    const winDecoder = new TextDecoder('windows-1251');
    return winDecoder.decode(arrayBuffer);
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
    
    // For backups (which contain Turkish characters in UTF-8), ensure the XML header declares utf-8
    // so that external text editors (Notepad, VS Code, etc.) don't mistakenly parse it as windows-1251.
    let contentToWrite = newXmlContent;
    if (folderName === 'backups') {
      contentToWrite = contentToWrite.replace(/encoding=["']windows-1251["']/i, 'encoding="utf-8"');
    }
    
    // Write string
    await writable.write(contentToWrite);
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

export async function backupAndFixBrokenFiles(directoryHandle, fileNamesToFix, originalFiles = [], translatedFiles = [], backupFiles = []) {
  if (!directoryHandle || !fileNamesToFix || fileNamesToFix.length === 0) {
    return { count: 0, details: [] };
  }

  // 1. Create or get "broken_files" directory at root level (same level as backups)
  const brokenDirHandle = await directoryHandle.getDirectoryHandle('broken_files', { create: true });
  const brokenOrigDir = await brokenDirHandle.getDirectoryHandle('original', { create: true });
  const brokenTransDir = await brokenDirHandle.getDirectoryHandle('translated', { create: true });

  let fixedCount = 0;
  const details = [];

  for (const fileName of fileNamesToFix) {
    let fileModified = false;

    // Check & Fix Original File
    const origHandle = originalFiles.find(f => f.name === fileName);
    if (origHandle) {
      try {
        const origContent = await readXmlFile(origHandle);
        if (!hasStringTable(origContent)) {
          // Backup original broken file
          const backupFileHandle = await brokenOrigDir.getFileHandle(fileName, { create: true });
          const bWritable = await backupFileHandle.createWritable();
          await bWritable.write(origContent);
          await bWritable.close();

          // Overwrite with fixed <string_table> wrap
          const fixedContent = fixXmlStringTable(origContent);
          const origWritable = await origHandle.createWritable();
          await origWritable.write(fixedContent);
          await origWritable.close();

          fileModified = true;
        }
      } catch (err) {
        console.error(`Error fixing original file ${fileName}:`, err);
      }
    }

    // Check & Fix Translated File
    const transHandle = translatedFiles.find(f => f.name === fileName);
    if (transHandle) {
      try {
        const transContent = await readXmlFile(transHandle);
        if (!hasStringTable(transContent)) {
          // Backup translated broken file
          const backupTransHandle = await brokenTransDir.getFileHandle(fileName, { create: true });
          const bWritable2 = await backupTransHandle.createWritable();
          await bWritable2.write(transContent);
          await bWritable2.close();

          // Overwrite with fixed <string_table> wrap
          const fixedTrans = fixXmlStringTable(transContent);
          const transWritable = await transHandle.createWritable();
          await transWritable.write(fixedTrans);
          await transWritable.close();

          fileModified = true;
        }
      } catch (err) {
        console.error(`Error fixing translated file ${fileName}:`, err);
      }
    }

    // Check & Fix Backup File (if present and broken)
    const bckHandle = backupFiles.find(f => f.name === fileName);
    if (bckHandle) {
      try {
        const bckContent = await readXmlFile(bckHandle);
        if (!hasStringTable(bckContent)) {
          const fixedBck = fixXmlStringTable(bckContent);
          const bckWritable = await bckHandle.createWritable();
          await bckWritable.write(fixedBck);
          await bckWritable.close();
          fileModified = true;
        }
      } catch (err) {
        console.error(`Error fixing backup file ${fileName}:`, err);
      }
    }

    if (fileModified) {
      fixedCount++;
      details.push(fileName);
    }
  }

  return { count: fixedCount, details };
}
