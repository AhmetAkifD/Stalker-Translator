export function replaceTurkishCharacters(text) {
  if (!text) return text;
  
  const charMap = {
    'ç': 'c',
    'Ç': 'C',
    'ğ': 'g',
    'Ğ': 'G',
    'ı': 'i',
    'İ': 'I', // In some cases, dotless i vs dotted I
    'ö': 'o',
    'Ö': 'O',
    'ş': 's',
    'Ş': 'S',
    'ü': 'u',
    'Ü': 'U',
    // Şapkalı Harfler (Circumflex vowels)
    'â': 'a',
    'Â': 'A',
    'î': 'i',
    'Î': 'I',
    'û': 'u',
    'Û': 'U',
    'ê': 'e',
    'Ê': 'E'
  };

  return text.replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛêÊ]/g, match => charMap[match]);
}
