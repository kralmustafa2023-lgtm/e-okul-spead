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

    // 1. Soru başlıklarını/etiketlerini temizle (Örn: "S1 20", "s 1 20", "se bir 20", "1. soru 20", "soru 2 25" -> soru indexi puana karışmasın)
    const sRegex = /(?<![0-9a-zğüşıöç])(?:s|se|es|soru)\s*(?:[1-9]|10|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on)(?![0-9a-zğüşıöç])/gui;
    text = text.replace(sRegex, ' ');

    const qRegex = /(?<![0-9a-zğüşıöç])(?:[1-9]|10)\.?\s*soru|(?:birinci|ikinci|üçüncü|dördüncü|beşinci|altıncı|yedinci|sekizinci|dokuzuncu|onuncu)\s*soru(?![a-zğüşıöç])/gui;
    text = text.replace(qRegex, ' ');

    // 2. Binlik ayıracı noktaları kaldır (yalnızca 1-2 basamak + nokta + tam 3 basamak: örn "1.016" -> "1016", "2.500" -> "2500")
    // "14.85" veya "14. 85" gibi notlar BİNLİK DEĞİLDİR, ayrık iki sayıdır!
    text = text.replace(/\b(\d{1,2})\.(\d{3})\b/g, '$1$2');

    // 3. Nokta da dahil tüm noktalama işaretlerini boşluğa çevir (güvenli regex, character range hatası giderildi)
    text = text.replace(/[.,\/#!$%^&*;:{}=_`~()?’"“”—\\-]/g, ' ');

    // 4. "1 016" -> "1016" (1 veya 2 basamak + 3 basamak binlik boşluklu sayı)
    text = text.replace(/\b(\d{1,2})\s+(\d{3})\b/g, '$1$2');

    // 5. "1000 16" veya "2000 16" -> "1016", "2016"
    text = text.replace(/\b([1-9]000)\s+(\d{1,3})\b/g, (match, thousands, rem) => {
      return String(parseInt(thousands, 10) + parseInt(rem, 10));
    });

    // 6. Bitişik yazılan bileşik Türkçe sayıları ayır (Örn: "ondört" -> "on dört", "yirmibeş" -> "yirmi beş", "seksenbeş" -> "seksen beş")
    const tens = 'doksan|seksen|yetmiş|yetmis|altmış|altmis|elli|kırk|kirk|otuz|yirmi|on';
    const ones = 'dokuz|sekiz|yedi|altı|alti|beş|bes|dört|dort|üç|uc|iki|bir';
    const compoundTensOnes = new RegExp('(?<![a-zğüşıöç])(' + tens + ')(' + ones + ')(?![a-zğüşıöç])', 'gui');
    text = text.replace(compoundTensOnes, (m, g1, g2) => g1 + ' ' + g2);

    const hundredsPrefix = new RegExp('(?<![a-zğüşıöç])(iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz)(yüz|yuz)(?![a-zğüşıöç])', 'gui');
    text = text.replace(hundredsPrefix, (m, g1, g2) => g1 + ' ' + g2);

    const hundredsSuffix = new RegExp('(?<![a-zğüşıöç])(yüz|yuz)(' + tens + '|' + ones + ')(?![a-zğüşıöç])', 'gui');
    text = text.replace(hundredsSuffix, (m, g1, g2) => g1 + ' ' + g2);

    // 7. Fazla boşlukları temizle
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

      // 2. Sıfır / Boş / Yok / Girmedi
      if (cur === 'sıfır' || cur === 'sifir' || cur === 'boş' || cur === 'bos' || cur === 'yok' || cur === 'girmedi') {
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

  /**
   * Konuşulan sınav/öğrenci metnini yapılandırılmış olarak ayrıştırır.
   * Hem etiketli konuşmaları ("Okul No 15 Toplam 60 S1 20 S2 20 S3 20", "Öğrenci 42 toplam 85 se bir 25 se iki 30 se üç 30")
   * hem de ardışık sayıları ("15 60 20 20 20", "on beş altmış yirmi yirmi yirmi") kusursuz anlar.
   */
  function parseSpokenStudent(rawText, expectedQCount = 4) {
    if (!rawText) return null;
    const lower = rawText.toLocaleLowerCase('tr-TR').trim();

    const wordToNum = {
      'bir': 1, 'birinci': 1,
      'iki': 2, 'ikinci': 2,
      'üç': 3, 'uc': 3, 'üçüncü': 3, 'ucuncu': 3,
      'dört': 4, 'dort': 4, 'dördüncü': 4, 'dorduncu': 4,
      'beş': 5, 'bes': 5, 'beşinci': 5, 'besinci': 5,
      'altı': 6, 'alti': 6, 'altıncı': 6, 'altinci': 6,
      'yedi': 7, 'yedinci': 7,
      'sekiz': 8, 'sekizinci': 8,
      'dokuz': 9, 'dokuzuncu': 9,
      'on': 10, 'onuncu': 10
    };

    const hasLabels = /(?:okul|öğrenci|ogrenci|numara|\bno\b|toplam|\bs\s*\d|\bse\s*\d|\bes\s*\d|\bsoru)/i.test(lower);

    let studentNo = null;
    let statedTotal = null;
    const questionScoresMap = {};

    if (hasLabels) {
      // 1. Okul No tespiti
      const noMatch = lower.match(/(?:okul\s*no|okul\s*numaras[ıi]|öğrenci\s*no|ogrenci\s*no|numara|\bno)\s*[:=]?\s*([a-zğüşıöç0-9\s]+?)(?=\s+(?:toplam|s\s*\d|se\s*\d|es\s*\d|soru|[1-9]\.?\s*soru)|$)/i);
      if (noMatch) {
        const nums = extractNumbers(noMatch[1]);
        if (nums.length > 0) studentNo = nums[0];
      } else {
        const prefixMatch = lower.match(/^([a-zğüşıöç0-9\s]+?)(?=\s+(?:toplam))/i);
        if (prefixMatch) {
          const nums = extractNumbers(prefixMatch[1]);
          if (nums.length > 0) studentNo = nums[0];
        }
      }

      // 2. Toplam Puan tespiti
      const totMatch = lower.match(/(?:toplam\s*puan|toplam[ıi]|toplam)\s*[:=]?\s*([a-zğüşıöç0-9\s]+?)(?=\s+(?:s\s*\d|se\s*\d|es\s*\d|soru|[1-9]\.?\s*soru|okul|öğrenci)|$)/i);
      if (totMatch) {
        const nums = extractNumbers(totMatch[1]);
        if (nums.length > 0) statedTotal = nums[0];
      }

      // 3. Soru Puanları tespiti (S1, S 1, Se bir, Soru 1, 1. Soru vb.)
      let qNorm = lower;
      for (const [w, n] of Object.entries(wordToNum)) {
        qNorm = qNorm.replace(new RegExp('(?:s|se|es|soru)\\s*' + w + '(?![a-zğüşıöç])', 'gui'), ' §q' + n + ' ');
        qNorm = qNorm.replace(new RegExp(w + '\\.?\\s*soru(?![a-zğüşıöç])', 'gui'), ' §q' + n + ' ');
      }
      qNorm = qNorm.replace(/(?:s|se|es|soru)\s*([1-9]|10)(?![0-9a-zğüşıöç])/gui, (m, g1) => ' §q' + g1 + ' ');
      qNorm = qNorm.replace(/([1-9]|10)\.?\s*soru(?![0-9a-zğüşıöç])/gui, (m, g1) => ' §q' + g1 + ' ');

      const qMatches = [...qNorm.matchAll(/§q([1-9]|10)\s+([a-zğüşıöç0-9\s]+?)(?=\s*§q|\s*(?:okul|toplam)|$)/gui)];
      for (const m of qMatches) {
        const qIdx = parseInt(m[1], 10);
        const valNums = extractNumbers(m[2]);
        if (valNums.length > 0) {
          questionScoresMap[qIdx] = valNums[0];
        }
      }
    }

    const qIndices = Object.keys(questionScoresMap).map(Number).sort((a,b) => a-b);
    const isLabeled = (studentNo !== null || statedTotal !== null || qIndices.length > 0);

    let questionScores = [];
    const allNums = extractNumbers(lower);

    if (isLabeled) {
      const effectiveCount = qIndices.length > 0 ? Math.max(...qIndices, expectedQCount) : expectedQCount;
      for (let i = 1; i <= effectiveCount; i++) {
        questionScores.push(questionScoresMap[i] !== undefined ? questionScoresMap[i] : null);
      }
    } else {
      // Ardışık (saf sayı) format
      if (allNums.length > 0) studentNo = allNums[0];
      if (allNums.length > 1) statedTotal = allNums[1];
      questionScores = allNums.slice(2);
    }

    const validScores = questionScores.filter(v => v !== null && v !== undefined);
    const calculatedTotal = validScores.reduce((s, v) => s + v, 0);

    return {
      isLabeled,
      studentNo,
      statedTotal,
      questionScores,
      questionScoresMap,
      calculatedTotal,
      totalsMatch: statedTotal !== null && statedTotal === calculatedTotal,
      allNumbers: allNums,
      rawText
    };
  }

  /**
   * Whisper veya ses kaydından gelen tüm metni inceleyerek
   * metindeki BÜTÜN öğrencileri (1 veya birden fazla) eksiksiz ayrıştırır.
   * Örnek: "Okul No 15 Toplam 60 S1 20 S2 20 S3 20 Okul No 18 Toplam 80 S1 20 S2 30 S3 30"
   * Veya: "15 60 20 20 20 18 80 20 30 30"
   */
  function parseAllStudentsFromText(rawText, expectedQCount = 4) {
    if (!rawText) return [];
    const lower = rawText.toLocaleLowerCase('tr-TR').trim();

    // 1. Etiketli öğrenci başlangıç kelimeleri var mı?
    const hasLabels = /(?:okul|öğrenci|ogrenci|numara|\bno\s+\d)/i.test(lower);
    const students = [];

    if (hasLabels) {
      // Öğrenci sınırlarına göre parçalara ayır
      const splitRegex = /(?=(?:okul\s*no|okul\s*numaras[ıi]|öğrenci\s*(?:no|numaras[ıi])|ogrenci\s*(?:no|numaras[ıi])|öğrenci\s+\d|ogrenci\s+\d|numara(?:s[ıi])?\s+\d|\bno\s+\d))/gui;
      const parts = lower.split(splitRegex).map(s => s.trim()).filter(Boolean);

      for (const part of parts) {
        const parsed = parseSpokenStudent(part, expectedQCount);
        if (parsed && (parsed.studentNo !== null || (parsed.questionScores && parsed.questionScores.filter(v => v !== null).length > 0))) {
          students.push(parsed);
        }
      }
    }

    if (students.length > 0) return students;

    // 2. Ardışık sayılar formatı (örn: "15 60 20 20 20 18 80 20 30 30")
    const allNums = extractNumbers(lower);
    const rowSize = 2 + expectedQCount;
    for (let i = 0; i < allNums.length; i += rowSize) {
      const chunk = allNums.slice(i, i + rowSize);
      if (chunk.length >= 2) {
        const studentNo = chunk[0];
        const statedTotal = chunk[1];
        const scores = chunk.slice(2);
        const calculatedTotal = scores.reduce((s, v) => s + v, 0);
        students.push({
          isLabeled: false,
          studentNo,
          statedTotal,
          questionScores: scores,
          calculatedTotal,
          totalsMatch: statedTotal === calculatedTotal,
          rawText: chunk.join(' ')
        });
      }
    }

    return students;
  }

  return {
    normalize,
    extractNumbers,
    parseSpokenStudent,
    parseAllStudentsFromText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurkishNumberParser;
}
if (typeof window !== 'undefined') {
  window.TurkishNumberParser = TurkishNumberParser;
}
