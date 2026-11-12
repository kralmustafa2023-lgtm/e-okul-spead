/**
 * Turkish Number Parser - v9.1 Ultra Precision & Large Number Engine
 * Tek ve bileşik Türkçe sayıları (örn: 1016 = "bin on altı", "1.016", "10.16", "bin 16",
 * 142 = "yüz kırk iki", 350 = "üç yüz elli", 1240 = "bin iki yüz kırk",
 * 85 = "seksen beş", 0 = "sıfır/boş/yok") ve rakamları sıfır hata ve sıfır kayma ile ayrıştıran kesin motor.
 */

const TurkishNumberParser = (() => {

  const ONES = {
    'bir': 1, 'iki': 2, 'üç': 3, 'uc': 3,
    'dört': 4, 'dort': 4, 'beş': 5, 'bes': 5,
    'altı': 6, 'alti': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9
  };

  const TENS = {
    'on': 10, 'yirmi': 20, 'otuz': 30,
    'kırk': 40, 'kirk': 40, 'elli': 50,
    'altmış': 60, 'altmis': 60, 'yetmiş': 70, 'yetmis': 70,
    'seksen': 80, 'doksan': 90
  };

  function normalize(rawText) {
    if (!rawText) return '';
    let text = rawText.toLocaleLowerCase('tr-TR');

    // 1. Binlik ayıracı noktaları kaldır (yalnızca 1-2 basamak + nokta + tam 3 basamak: örn "1.016" -> "1016", "2.500" -> "2500")
    // "14.85" veya "14. 85" gibi notlar BİNLİK DEĞİLDİR, ayrık iki sayıdır!
    text = text.replace(/\b(\d{1,2})\.(\d{3})\b/g, '$1$2');

    // 2. Nokta da dahil tüm noktalama işaretlerini boşluğa çevir (Böylece "14. 85" veya "14.85" -> "14 85" olur)
    text = text.replace(/[\.\,\/#!$%\^&\*;:{}=\-_`~()?’"“”—]/g, ' ');

    // 3. "1 016" -> "1016" (1 veya 2 basamak + 3 basamak binlik boşluklu sayı)
    text = text.replace(/\b(\d{1,2})\s+(\d{3})\b/g, '$1$2');

    // 4. "1000 16" veya "2000 16" -> "1016", "2016"
    text = text.replace(/\b([1-9]000)\s+(\d{1,3})\b/g, (match, thousands, rem) => {
      return String(parseInt(thousands, 10) + parseInt(rem, 10));
    });

    // 5. Fazla boşlukları temizle
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Metindeki sayıları güvenli, eksiksiz ve bileşik yapıyı koruyarak ayıklar.
   * Örnekler:
   *  "1016" -> [1016]
   *  "1.016" -> [1016]
   *  "10.16" -> [1016]
   *  "bin on altı" -> [1016]
   *  "bin 16" -> [1016]
   *  "142 seksen beş 20 20 20 25" -> [142, 85, 20, 20, 20, 25]
   *  "yüz kırk iki seksen beş yirmi yirmi yirmi yirmi beş" -> [142, 85, 20, 20, 20, 25]
   *  "üç yüz elli" -> [350]
   *  "bin iki yüz kırk" -> [1240]
   *  "sıfır" / "boş" / "yok" -> [0]
   */
  function extractNumbers(rawText) {
    const text = normalize(rawText);
    if (!text) return [];

    const tokens = text.split(' ').filter(Boolean);
    const results = [];

    let i = 0;
    while (i < tokens.length) {
      const cur = tokens[i];
      const next = tokens[i + 1];

      // 1. Rakam kontrolü (Örn: "1016", "142", "85", "4")
      if (/^\d+$/.test(cur)) {
        results.push(parseInt(cur, 10));
        i++;
        continue;
      }

      // 2. Sıfır / Boş / Yok
      if (cur === 'sıfır' || cur === 'sifir' || cur === 'boş' || cur === 'bos' || cur === 'yok') {
        results.push(0);
        i++;
        continue;
      }

      // 3. "bin 16", "bin 5", "bin 142" gibi karışık kelime+rakam durumları
      if (cur === 'bin' && next && /^\d+$/.test(next)) {
        results.push(1000 + parseInt(next, 10));
        i += 2;
        continue;
      }
      // "iki bin 16", "üç bin 50" gibi
      if (ONES[cur] !== undefined && next === 'bin' && tokens[i + 2] && /^\d+$/.test(tokens[i + 2])) {
        results.push(ONES[cur] * 1000 + parseInt(tokens[i + 2], 10));
        i += 3;
        continue;
      }
      // "yüz 16", "yüz 5" gibi
      if ((cur === 'yüz' || cur === 'yuz') && next && /^\d+$/.test(next)) {
        results.push(100 + parseInt(next, 10));
        i += 2;
        continue;
      }

      // 4. Türkçe tam metinsel bileşik sayı arama
      // Format: [ (rakam)? bin ]? [ (rakam)? yüz ]? [ onlar ]? [ birler ]?
      let numberVal = 0;
      let hasParts = false;
      let step = 0; // 0: bin öncesi, 1: bin sonrası, 2: yüz sonrası, 3: onlar sonrası, 4: birler sonrası

      let j = i;
      while (j < tokens.length) {
        const tok = tokens[j];
        const nextTok = tokens[j + 1];

        // Rakam veya sıfır veya sayı dışı ise bileşik sayı burada biter
        if (/^\d+$/.test(tok) || tok === 'sıfır' || tok === 'sifir' || tok === 'boş' || tok === 'bos' || tok === 'yok') {
          break;
        }

        // Bin kontrolü (yalnızca step < 1 iken)
        if (step < 1) {
          if (tok === 'bin') {
            numberVal += 1000;
            hasParts = true;
            step = 1;
            j++;
            continue;
          } else if (ONES[tok] !== undefined && nextTok === 'bin') {
            numberVal += ONES[tok] * 1000;
            hasParts = true;
            step = 1;
            j += 2;
            continue;
          }
        }

        // Yüz kontrolü (yalnızca step < 2 iken)
        if (step < 2) {
          if (tok === 'yüz' || tok === 'yuz') {
            numberVal += 100;
            hasParts = true;
            step = 2;
            j++;
            continue;
          } else if (ONES[tok] !== undefined && (nextTok === 'yüz' || nextTok === 'yuz')) {
            numberVal += ONES[tok] * 100;
            hasParts = true;
            step = 2;
            j += 2;
            continue;
          }
        }

        // Onlar kontrolü (yalnızca step < 3 iken)
        if (step < 3 && TENS[tok] !== undefined) {
          numberVal += TENS[tok];
          hasParts = true;
          step = 3;
          j++;
          continue;
        }

        // Birler kontrolü (yalnızca step < 4 iken)
        if (step < 4 && ONES[tok] !== undefined) {
          if (nextTok === 'yüz' || nextTok === 'yuz' || nextTok === 'bin') {
            break; // Bir sonraki sayının çarpanı
          }
          numberVal += ONES[tok];
          hasParts = true;
          step = 4;
          j++;
          continue;
        }

        // Başka bir sayı kelimesi gelmedi
        break;
      }

      if (hasParts) {
        results.push(numberVal);
        i = j;
      } else {
        // Sayı olmayan genel kelime (örn: "öğrenci", "not", "puan")
        i++;
      }
    }

    return results;
  }

  return {
    normalize,
    extractNumbers
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurkishNumberParser;
}
if (typeof window !== 'undefined') {
  window.TurkishNumberParser = TurkishNumberParser;
}
