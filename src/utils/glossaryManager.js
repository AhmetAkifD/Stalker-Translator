export async function initGlossarySystem(directoryHandle, localLegacyGlossary = []) {
  try {
    // 1. Create glossaries/ and glossaries/backups/ directories
    const glossariesDir = await directoryHandle.getDirectoryHandle('glossaries', { create: true });
    await glossariesDir.getDirectoryHandle('backups', { create: true });

    // 2. Check if Ana_Sozluk.json exists
    let anaSozlukExists = false;
    for await (const entry of glossariesDir.values()) {
      if (entry.kind === 'file' && entry.name === 'Ana_Sozluk.json') {
        anaSozlukExists = true;
        break;
      }
    }

    // 3. If Ana_Sozluk.json does not exist, migrate from legacy glossary.json or localStorage
    if (!anaSozlukExists) {
      let legacyData = [...localLegacyGlossary];
      
      // Check for legacy glossary.json in root
      try {
        const rootLegacyHandle = await directoryHandle.getFileHandle('glossary.json');
        const rootLegacyFile = await rootLegacyHandle.getFile();
        const rootLegacyText = await rootLegacyFile.text();
        const parsed = JSON.parse(rootLegacyText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          legacyData = parsed;
        }
      } catch (e) {
        // No legacy glossary.json in root
      }

      // Ensure some default if completely empty
      if (legacyData.length === 0) {
        legacyData = [
          { id: 'term_1', original: "Stalker", translation: "Stalker", pronunciation: "Stolkır (Stalker'a, Stalker'ın)" },
          { id: 'term_2', original: "Duty", translation: "Görev", pronunciation: "Görev (Görev'e, Görev'in)" },
          { id: 'term_3', original: "Freedom", translation: "Özgürlük", pronunciation: "Özgürlük (Özgürlük'e, Özgürlüğün)" },
          { id: 'term_4', original: "Monolith", translation: "Monolit", pronunciation: "Monolit (Monolit'e, Monolit'in)" }
        ];
      }

      await saveGlossary(directoryHandle, 'Ana_Sozluk', legacyData);
    }

    // 4. Read all glossaries
    return await loadAllGlossaries(directoryHandle);
  } catch (error) {
    console.error("Error initializing glossary system:", error);
    return {};
  }
}

export async function loadAllGlossaries(directoryHandle) {
  const glossariesMap = {};
  try {
    const glossariesDir = await directoryHandle.getDirectoryHandle('glossaries');
    for await (const entry of glossariesDir.values()) {
      // Only process .json files, ignore backups directory
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        const file = await entry.getFile();
        const text = await file.text();
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            const baseName = entry.name.replace('.json', '');
            glossariesMap[baseName] = parsed;
          }
        } catch (e) {
          console.warn(`Failed to parse glossary ${entry.name}`);
        }
      }
    }
  } catch (error) {
    console.error("Error loading glossaries:", error);
  }
  return glossariesMap;
}

export async function saveGlossary(directoryHandle, name, terms) {
  try {
    const glossariesDir = await directoryHandle.getDirectoryHandle('glossaries', { create: true });
    const fileHandle = await glossariesDir.getFileHandle(`${name}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(terms, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    console.error(`Error saving glossary ${name}:`, error);
    throw error;
  }
}

export async function deleteGlossary(directoryHandle, name) {
  try {
    const glossariesDir = await directoryHandle.getDirectoryHandle('glossaries');
    
    // Read current data
    const fileHandle = await glossariesDir.getFileHandle(`${name}.json`);
    const file = await fileHandle.getFile();
    const text = await file.text();

    // Backup
    const backupsDir = await glossariesDir.getDirectoryHandle('backups', { create: true });
    const timestamp = Date.now();
    const backupFileHandle = await backupsDir.getFileHandle(`${name}_${timestamp}.json`, { create: true });
    const writable = await backupFileHandle.createWritable();
    await writable.write(text);
    await writable.close();

    // Delete original
    await glossariesDir.removeEntry(`${name}.json`);
    return true;
  } catch (error) {
    console.error(`Error deleting glossary ${name}:`, error);
    throw error;
  }
}
