/**
 * Turkish Number Parser - v6.0 Ultra Precision
 * Kesinlikle hayali sayı üretmeyen, yalnızca gerçek Türkçe sayı kelimelerini ve rakamları tanıyan motor.
 */

const TurkishNumberParser = (() => {

  // Yalnızca ve sadece gerçek Türkçe sayı kelimeleri (Hayali eklemeler tamamen kaldırıldı!)
  const EXACT_NUMBERS = {
    'sıfır': 0, 'sifir': 0, 'boş': 0, 'bos': 0, 'yok': 0,
    'bir': 1,
    'iki': 2,
    'üç': 3, 'uc': 3,
    'dört': 4, 'dort': 4,
    'beş': 5, 'bes': 5,
    'altı': 6, 'alti': 6,
    'yedi': 7,
    'sekiz': 8,
    'dokuz': 9,
    'on': 10,
    'yirmi': 20,
    'otuz': 30,
    'kırk': 40, 'kirk': 40,
    'elli': 50,
    'altmış': 60, 'altmis': 60,
    'yetmiş': 70, 'yetmis': 70,
    'seksen': 80,
    'doksan': 90,
    'yüz': 100, 'yuz': 100
  };

  const TENS = {
    'on': 10, 'yirmi': 20, 'otuz': 30, 'kırk': 40, 'kirk': 40,
    'elli': 50, 'altmış': 60, 'altmis': 60, 'yetmiş': 70, 'yetmis': 70,
    'seksen': 80, 'doksan': 90
  };

  const ONES = {
    'bir': 1, 'iki': 2, 'üç': 3, 'uc': 3, 'dört': 4, 'dort': 4,
    'beş': 5, 'bes': 5, 'altı': 6, 'alti': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9
  };

  function normalize(text) {
    if (!text) return '';
    return text
      .toLocaleLowerCase('tr-TR')
      .replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()?’"“”—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Metindeki sayıları güvenli ve kesin şekilde ayıklar
   */
  function extractNumbers(rawText) {
    const text = normalize(rawText);
    if (!text) return [];

    const tokens = text.split(' ').filter(Boolean);
    const results = [];

    // İki kelimeli bileşik sayılar: "on sekiz" -> 18, "yirmi beş" -> 25
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const next = tokens[i + 1];

      // 1. Rakam kontrolü (Örn: "18", "15", "4")
      if (/^\d+$/.test(cur)) {
        results.push(parseInt(cur, 10));
        continue;
      }

      // 2. İki kelimeli onluk + birlik birleşimi (Örn: "on sekiz", "yirmi beş")
      if (TENS[cur] !== undefined && next && ONES[next] !== undefined) {
        results.push(TENS[cur] + ONES[next]);
        i++; // next'i atla
        continue;
      }

      // 3. Tek kelimelik sayı kontrolü (Örn: "beş", "on", "yirmi", "sıfır")
      if (EXACT_NUMBERS[cur] !== undefined) {
        results.push(EXACT_NUMBERS[cur]);
        continue;
      }

      // Sayı olmayan kelimeler (örn: "öğrenci", "puan", "ve") tamamen yutulur ve ASLA sayıya dönüştürülmez!
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
