import Deasciifier from 'turkish-deasciifier';

// Expanded Turkish Dictionary for games & dialogue
const TURKISH_DICT = new Map([
  ["sag", "sağ"], ["sagol", "sağol"], ["kardesim", "kardeşim"], ["kardes", "kardeş"],
  ["nasilsin", "nasılsın"], ["tesekkurler", "teşekkürler"], ["tesekkur", "teşekkür"],
  ["gorusuruz", "görüşürüz"], ["lutfen", "lütfen"], ["dusunuyorum", "düşünüyorum"],
  ["seyler", "şeyler"], ["degil", "değil"], ["cok", "çok"], ["hic", "hiç"],
  ["onlarin", "onların"], ["nerede", "nerede"], ["nasil", "nasıl"], ["nicin", "niçin"],
  ["simdi", "şimdi"], ["once", "önce"], ["baska", "başka"], ["su", "şu"],
  ["arkadas", "arkadaş"], ["arkadasim", "arkadaşım"], ["dusman", "düşman"],
  ["gorev", "görev"], ["is", "iş"], ["olum", "ölüm"], ["gun", "gün"],
  ["aksam", "akşam"], ["buyuk", "büyük"], ["kucuk", "küçük"], ["kotu", "kötü"],
  ["guzel", "güzel"], ["hazir", "hazır"], ["dogru", "doğru"], ["yanlis", "yanlış"],
  ["gordum", "gördüm"], ["anladim", "anladım"], ["tamamdir", "tamamdır"],
  ["hosca", "hoşça"], ["bilmiyorum", "bilmiyorum"], ["istiyorum", "istiyorum"],
  ["bize", "bize"], ["size", "size"], ["adamlarim", "adamlarım"], ["pisliklerin", "pisliklerin"],
  ["basi", "başı"], ["belaya", "belaya"], ["girdi", "girdi"], ["grubu", "grubu"],
  ["biraz", "biraz"], ["geldi", "geldi"], ["gitti", "gitti"], ["aldi", "aldı"],
  ["verdi", "verdi"], ["bakalim", "bakalım"], ["gidelim", "gidelim"], ["yaptim", "yaptım"],
  ["yapti", "yaptı"], ["oldu", "oldu"], ["olacak", "olacak"], ["oldugunu", "olduğunu"],
  ["yapacagiz", "yapacağız"], ["edecegiz", "edeceğiz"], ["geldigim", "geldiğim"],
  ["gittigim", "gittiğim"], ["dusundum", "düşündüm"], ["gormedim", "görmedim"],
  ["soyledi", "söyledi"], ["soyle", "söyle"], ["demisti", "demişti"], ["canli", "canlı"],
  ["olumcul", "ölümcül"], ["tehlikeli", "tehlikeli"], ["bolge", "bölge"],
  ["tamam", "tamam"], ["evet", "evet"], ["hayir", "hayır"], ["olmaz", "olmaz"]
]);

export function deasciifyWord(word) {
  if (!word || typeof word !== 'string') return word;
  
  const lower = word.toLowerCase();
  
  // 1. Dictionary lookup
  if (TURKISH_DICT.has(lower)) {
    const target = TURKISH_DICT.get(lower);
    if (word[0] === word[0].toUpperCase()) {
      return target.charAt(0).toUpperCase() + target.slice(1);
    }
    return target;
  }
  
  // 2. Fallback rule transforms for common Turkish ASCII patterns
  let res = word;
  res = res.replace(/sh/g, 'ş').replace(/Sh/g, 'Ş');
  res = res.replace(/acagiz$/i, 'acağız').replace(/ecegiz$/i, 'eceğiz');
  res = res.replace(/acagim$/i, 'acağım').replace(/ecegim$/i, 'eceğim');
  res = res.replace(/dugunu$/i, 'duğunu').replace(/digini$/i, 'diğini');
  res = res.replace(/dugu$/i, 'duğu').replace(/digi$/i, 'diği');
  res = res.replace(/larin$/i, 'lerin').replace(/larina$/i, 'larına');
  res = res.replace(/lerinde$/i, 'lerinde').replace(/larinda$/i, 'larında');
  res = res.replace(/larindan$/i, 'larından').replace(/lerin/i, 'lerin');
  
  return res;
}

export function deasciifyText(text) {
  if (!text || typeof text !== 'string') return text || "";
  
  const tokens = text.split(/([\s.,!?;:'"()\-\\/]+)/);
  return tokens.map(deasciifyWord).join('');
}

export function analyzeForDeasciification(text) {
  if (!text || typeof text !== 'string') return { changes: [] };
  
  const deasciifiedText = deasciifyText(text);
  if (!deasciifiedText || text === deasciifiedText) return { changes: [] };

  const wordsOriginal = text.split(/([\s.,!?;:'"()\-\\/]+)/);
  const wordsDeasciified = deasciifiedText.split(/([\s.,!?;:'"()\-\\/]+)/);

  const changes = [];
  const limit = Math.min(wordsOriginal.length, wordsDeasciified.length);

  for (let i = 0; i < limit; i++) {
    const orig = wordsOriginal[i];
    const deasc = wordsDeasciified[i];
    
    if (orig && deasc && orig !== deasc && /[a-zA-Z]/.test(orig)) {
      // If it matches dictionary, mark as successful. If it was rule-guessed, mark suspicious.
      const isDictMatch = TURKISH_DICT.has(orig.toLowerCase());
      let isSuccessful = isDictMatch;
      
      // If not in dict, but didn't have uppercase acronyms, let's treat it as candidate
      if (orig === orig.toUpperCase() && orig.length > 1) {
        isSuccessful = false;
      }

      changes.push({
        originalWord: orig,
        proposedWord: deasc,
        indexInArray: i,
        isSuccessful
      });
    }
  }

  return {
    originalText: text,
    wordsArray: wordsOriginal,
    changes: changes
  };
}
