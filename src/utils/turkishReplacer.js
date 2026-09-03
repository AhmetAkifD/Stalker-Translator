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
    'Ü': 'U'
  };

  return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, match => charMap[match]);
}
