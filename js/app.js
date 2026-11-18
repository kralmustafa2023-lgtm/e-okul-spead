/**
 * e-Okul Spead - Ana Uygulama Mantığı (app.js) - v6.0 Ultra Precision
 * Canlı Slot Sistemi (Live Slot System), Sıfır Hayali Sayı, Sıfır Tekrar
 */

class EOkulSpeadApp {
  constructor() {
    this.students = [];
    this.settings = {
      questionCount: 4,
      examTitle: '1. Dönem 1. Yazılı',
      autoSort: true,
      soundEnabled: true,
      continuousListening: true
    };

    this.recognition = null;
    this.isListening = false;
    this.speechSupported = false;

    // GİRMEYEN ÖĞRENCİLER İÇİN ÖZEL SES TANIMA
    this.absentRecognition = null;
    this.isAbsentListening = false;

    // Gerçek zamanlı ses görselleştirici
    this.audioContext = null;
    this.audioAnalyser = null;
    this.micStream = null;
    this.animFrameId = null;

    // AKTİF OKUNAN ÖĞRENCİNİN CANLI KUTUCUKLARI (SLOTS)
    // [OkulNo, ToplamPuan, Soru1, Soru2, Soru3, Soru4]
    this.currentSlots = [];

    // ÖZEL SES KAYIT BUTONU (Şu An Okunan Öğrenci İçin Anlık Kayıt)
    this.isSlotRecording = false;
    this.slotRecordTimer = null;
    this.slotRecordSeconds = 0;
    this.slotRecognition = null;
    this.slotAccumulatedTranscript = '';

    // SES MOTORU: 'groq' (Groq Whisper-large-v3) veya 'web' (Tarayıcı Web Speech API)
    this.micEngine = localStorage.getItem('eokul_spead_mic_engine') || 'groq';
    this.groqModel = 'whisper-large-v3';
    this.oneShotRecorder = null;
    this.oneShotChunks = [];
    this.oneShotStream = null;
    this.oneShotTimer = null;
    this.oneShotSeconds = 0;
    this.oneShotMimeType = 'audio/webm';
    this.isStartingOneShotRecording = false;
    this.oneShotTranscriptionId = 0;
    this.retryWhisperAudioBlob = null;

    // Groq MediaRecorder ve VAD durumu
    this.mediaRecorder = null;
    this.recordedAudioChunks = [];
    this.mediaRecorderMimeType = 'audio/webm';
    this.isGroqRecording = false;
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
    this.speechStartTime = 0;
    this.isTranscribing = false;
    this.groqVadInterval = null;
    this.minimumGroqSpeechDurationMs = 120;
    this.groqSpeechHangoverMs = 700;
    this.groqSpeechStartCandidateAt = 0;
    this.groqNoiseFloor = 2;
    this.discardCurrentGroqSegment = false;
    this.groqSlotStartedAt = 0;
    this.groqSlotTimeoutMs = 60000;
    this.groqTranscriptionQueue = Promise.resolve();
    this.groqSessionId = 0;
    this.activeTranscriptionController = null;

    this.init();
  }

  init() {
    this.loadFromStorage();
    this.setupSpeechRecognition();
    this.setupAbsentRecognition();
    this.renderSettings();
    this.renderTable();
    this.renderLiveSlots();
    this.updateStats();
    this.updateEngineUI();
    this.setupEventListeners();
    this.updateBookmarkletLink();
  }

  loadFromStorage() {
    try {
      const savedStudents = localStorage.getItem('eokul_spead_students');
      if (savedStudents) {
        this.students = JSON.parse(savedStudents);
      }
      const savedSettings = localStorage.getItem('eokul_spead_settings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }
      delete this.settings.recordStudentCount;
      const savedQuestionCount = Number(this.settings.questionCount);
      this.settings.questionCount = Number.isInteger(savedQuestionCount) && savedQuestionCount >= 1 && savedQuestionCount <= 30
        ? savedQuestionCount
        : 4;
    } catch (e) {
      console.warn('LocalStorage yükleme hatası:', e);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('eokul_spead_students', JSON.stringify(this.students));
      localStorage.setItem('eokul_spead_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('LocalStorage kayıt hatası:', e);
    }
  }

  // --- MİKROFON SES SEVİYESİ GÖSTERGESİ ---
  async initAudioVisualizer() {
    try {
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 512;
      source.connect(this.audioAnalyser);

      const bufferLength = this.audioAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const volumeBar = document.getElementById('mic-volume-level');

      const draw = () => {
        if (!this.isListening) {
          if (volumeBar) volumeBar.style.width = '0%';
          return;
        }

        this.animFrameId = requestAnimationFrame(draw);
        this.audioAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const percent = Math.min(100, Math.round((average / 128) * 100));

        if (volumeBar) {
          volumeBar.style.width = Math.max(5, percent * 1.5) + '%';
        }
      };

      draw();
    } catch (err) {
      console.warn('Ses seviyesi göstergesi başlatılamadı:', err);
    }
  }

  stopAudioVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    const volumeBar = document.getElementById('mic-volume-level');
    if (volumeBar) volumeBar.style.width = '0%';
  }

  // --- SES TANIMA (SPEECH RECOGNITION) --- v10.0 Rock-Solid Ultra-Sync & Instant Feedback
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.speechSupported = false;
      this.showToast('Tarayıcınız Web Speech API desteklemiyor. Google Chrome kullanın.', 'error');
      const micStatus = document.getElementById('mic-status-text');
      if (micStatus) micStatus.textContent = 'Tarayıcı Desteği Yok';
      return;
    }

    this.speechSupported = true;
    this._silenceTimer = null;
    this._restartLock = false;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'tr-TR';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this._restartLock = false;
      this.updateMicUI(true);
      this.initAudioVisualizer();
    };

    this.recognition.onend = () => {
      if (this._silenceTimer) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;
      }
      if (this.isListening) {
        this._safeRestart();
      } else {
        this.updateMicUI(false);
        this.stopAudioVisualizer();
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        this.showToast('Mikrofon izni verilmedi! Lütfen adres çubuğundaki kilit simgesinden mikrofon iznini açın.', 'error');
        this.isListening = false;
        this.updateMicUI(false);
      }
    };

    this.recognition.onresult = (event) => {
      let finalSegment = '';
      const finalTranscripts = [];
      let interimSegment = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscripts.push(text);
          finalSegment += ' ' + text;
        } else {
          interimSegment += ' ' + text;
        }
      }

      // Canlı önizleme metnini güncelle
      const livePreview = document.getElementById('speech-live-preview');
      if (livePreview) {
        livePreview.textContent = (interimSegment || finalSegment || 'Sizi dinliyorum...').trim();
      }

      // 1. KESİNLEŞMİŞ (FINAL) SESLERİ ANINDA VE KESİN OLARAK İŞLE
      if (finalSegment.trim()) {
        for (const transcript of finalTranscripts) {
          if (livePreview) livePreview.textContent = transcript.trim();
          const parsed = TurkishNumberParser.parseSpokenStudent(transcript, this.settings.questionCount);
          if (parsed && parsed.isLabeled) {
            this.handleSpokenTranscript(transcript, true);
          } else {
            const numbers = this.normalizeWebMicNumbers(TurkishNumberParser.extractNumbers(transcript));
            if (numbers && numbers.length > 0) {
              this.feedNumbers(numbers);
            }
          }
        }
      }

      // 2. HENÜZ KESİNLEŞMEMİŞ (INTERIM) SESLER İÇİN 0ms ANINDA GÖRSEL GERİ BİLDİRİM
      if (interimSegment.trim()) {
        const parsed = TurkishNumberParser.parseSpokenStudent(interimSegment, this.settings.questionCount);
        if (parsed && parsed.isLabeled) {
          this.handleSpokenTranscript(interimSegment, false);
        } else {
          const interimNumbers = this.normalizeWebMicNumbers(TurkishNumberParser.extractNumbers(interimSegment));
          // Canlı kutucuklarda anında önizleme göster
          this.renderLiveSlots(interimNumbers);
        }
      }
    };
  }

  isNumericOnlyTranscript(transcript) {
    const normalized = TurkishNumberParser.normalize(transcript);
    if (!normalized) return false;

    const numberWords = new Set([
      'sıfır', 'sifir',
      'bir', 'iki', 'üç', 'uc', 'dört', 'dort', 'beş', 'bes',
      'altı', 'alti', 'yedi', 'sekiz', 'dokuz',
      'on', 'yirmi', 'otuz', 'kırk', 'kirk', 'elli', 'altmış',
      'altmis', 'yetmiş', 'yetmis', 'seksen', 'doksan', 'yüz', 'yuz', 'bin'
    ]);

    return normalized.split(/\s+/).every((token) => /^\d+$/.test(token) || numberWords.has(token));
  }

  normalizeWebMicNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return [];

    const rowSize = 2 + this.settings.questionCount;
    const normalized = [];

    for (const number of numbers) {
      const slotIndex = (this.currentSlots.length + normalized.length) % rowSize;

      // Tek bir Web Speech sonucu 100 + 1..99 puanlarını (örn. 100 ve 50)
      // "150" diye birleştirdiyse, yalnızca soru puanı kutularında ayır.
      if (slotIndex >= 2 && number > 100 && number < 200) {
        normalized.push(100, number - 100);
      } else {
        normalized.push(number);
      }
    }

    return normalized;
  }

  // ── Güvenli Yeniden Başlatma ──
  _safeRestart() {
    if (this._restartLock) return;
    this._restartLock = true;

    const doStart = (attempt = 1) => {
      if (!this.isListening) {
        this._restartLock = false;
        return;
      }
      try {
        this.recognition.start();
        this._restartLock = false;
      } catch (e) {
        if (attempt < 5) {
          setTimeout(() => doStart(attempt + 1), Math.min(50 * attempt, 250));
        } else {
          this.isListening = false;
          this._restartLock = false;
          this.updateMicUI(false);
          this.stopAudioVisualizer();
          this.showToast('Mikrofon bağlantısı koptu. Tekrar başlatmak için mikrofon butonuna basın.', 'error');
        }
      }
    };

    setTimeout(() => doStart(1), 30);
  }

  // --- SINAVA GİRMEYEN ÖĞRENCİLER İÇİN ÖZEL SES TANIMA MOTORU ---
  setupAbsentRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.absentRecognition = new SpeechRecognition();
    this.absentRecognition.lang = 'tr-TR';
    this.absentRecognition.continuous = true;
    this.absentRecognition.interimResults = true;
    this.absentRecognition.maxAlternatives = 1;

    this.absentRecognition.onstart = () => {
      this.isAbsentListening = true;
      this.updateAbsentMicUI(true);
    };

    this.absentRecognition.onend = () => {
      if (this.isAbsentListening) {
        try {
          this.absentRecognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isAbsentListening) {
              try { this.absentRecognition.start(); } catch(err){}
            }
          }, 200);
        }
      } else {
        this.updateAbsentMicUI(false);
      }
    };

    this.absentRecognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        this.showToast('Girmeyen mikrofonu için izin verilmedi!', 'error');
        this.isAbsentListening = false;
        this.updateAbsentMicUI(false);
      }
    };

    this.absentRecognition.onresult = (event) => {
      let finalSegment = '';
      let interimSegment = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalSegment += ' ' + text;
        } else {
          interimSegment += ' ' + text;
        }
      }

      const input = document.getElementById('absent-input-text');
      if (input && (finalSegment || interimSegment)) {
        input.value = (finalSegment || interimSegment).trim();
      }

      // Kesinleşen numaraları anında 0 puan olarak listeye işle
      if (finalSegment.trim()) {
        const numbers = TurkishNumberParser.extractNumbers(finalSegment);
        if (numbers && numbers.length > 0) {
          this.addAbsentStudents(numbers, finalSegment.trim());
          if (input) input.value = '';
        }
      }
    };
  }

  toggleAbsentListening() {
    if (!this.absentRecognition) {
      this.setupAbsentRecognition();
    }
    if (!this.absentRecognition) {
      this.showToast('Tarayıcınız ses tanıma desteklemiyor. Google Chrome kullanın.', 'error');
      return;
    }

    if (this.isAbsentListening) {
      this.isAbsentListening = false;
      try { this.absentRecognition.stop(); } catch(e){}
      this.updateAbsentMicUI(false);
      this.showToast('Girmeyen öğrenci mikrofonu durduruldu.', 'info');
    } else {
      // Eğer ana not mikrofonu açıksa çakışmayı önlemek için kapat
      if (this.isListening) {
        this.toggleListening();
      }
      this.isAbsentListening = true;
      try {
        this.absentRecognition.start();
      } catch (e) {
        console.warn('Absent mic start error:', e);
      }
      this.updateAbsentMicUI(true);
      this.showToast('Girmeyen mikrofonu açık. Öğrenci numaralarını söyleyebilirsiniz (örn: 14, 28)...', 'info');
    }
  }

  updateAbsentMicUI(active) {
    const btn = document.getElementById('absent-mic-btn');
    const badge = document.getElementById('absent-mic-status-badge');
    const btnText = document.getElementById('absent-mic-btn-text');
    const icon = document.getElementById('absent-mic-icon');
    const input = document.getElementById('absent-input-text');

    if (active) {
      if (btn) {
        btn.className = 'px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/40 animate-pulse active:scale-95';
      }
      if (badge) badge.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Dinlemeyi Durdur';
      if (icon) icon.textContent = '⏹️';
      if (input) input.placeholder = 'Dinleniyor... Sınava girmeyen numaraları söyleyin (örn: 14, 28)...';
    } else {
      if (btn) {
        btn.className = 'px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-600/30 active:scale-95 group';
      }
      if (badge) badge.classList.add('hidden');
      if (btnText) btnText.textContent = 'Sesle Söyle';
      if (icon) icon.textContent = '🎤';
      if (input) input.placeholder = "Öğrenci numaralarını söyleyin veya yazın: örn. 14 28 42";
    }
  }

  // Sınava girmeyen öğrencileri 0 puan ile topluca ekleme metodu
  addAbsentStudents(numbers, rawSpeech = '') {
    if (!numbers || numbers.length === 0) return;

    const uniqueNums = [...new Set(numbers)];
    const addedList = [];

    uniqueNums.forEach(no => {
      const studentNo = parseInt(no, 10);
      if (isNaN(studentNo) || studentNo <= 0) return;

      const scores = Array(this.settings.questionCount).fill(0);
      const studentEntry = {
        studentNo: studentNo,
        statedTotal: 0,
        questionScores: scores,
        calculatedTotal: 0,
        totalsMatch: true,
        hasExpectedQuestions: true,
        status: 'PERFECT',
        isAbsent: true
      };

      this.addOrUpdateStudent(studentEntry, rawSpeech ? `[Sınava Girmedi] ${rawSpeech}` : `[Sınava Girmedi] No: ${studentNo}`);
      addedList.push(studentNo);
    });

    if (addedList.length > 0) {
      this.showToast(`${addedList.join(', ')} nolu öğrenci(ler) sınava girmedi olarak (tüm puanlar 0) eklendi!`, 'success');
      if (this.settings.soundEnabled) {
        SoundEffects.playSuccess();
      }
    }
  }

  // --- CANLI SLOT BESLEYİCİ (SLOT FEEDER) ---
  feedNumbers(numbers, capturedAt = Date.now()) {
    if (!numbers || numbers.length === 0) return;

    const neededTotal = 2 + this.settings.questionCount; // 1 No + 1 Toplam + Sorular

    for (let i = 0; i < numbers.length; i++) {
      const num = numbers[i];
      if (this.currentSlots.length === 0) this.groqSlotStartedAt = capturedAt;
      this.currentSlots.push(num);
      this.renderLiveSlots();

      // Bu öğrencinin tüm kutuları doldu mu?
      if (this.currentSlots.length === neededTotal) {
        this.commitCurrentSlots();
      }
    }
  }

  // Canlı kutucuklar tamamlandığında öğrenciyi kaydet
  commitCurrentSlots() {
    if (this.currentSlots.length < 2 || this.currentSlots[0] === undefined || this.currentSlots[1] === undefined) return;

    const studentNo = parseInt(this.currentSlots[0], 10);
    const statedTotal = parseInt(this.currentSlots[1], 10);
    if (isNaN(studentNo) || studentNo <= 0) {
      this.showToast('Geçersiz öğrenci numarası!', 'warning');
      return;
    }

    const scores = [];
    for (let q = 0; q < this.settings.questionCount; q++) {
      const val = this.currentSlots[2 + q];
      scores.push((val !== undefined && val !== null && !isNaN(val)) ? parseInt(val, 10) : 0);
    }

    const calculatedTotal = scores.reduce((sum, v) => sum + v, 0);
    const totalsMatch = statedTotal === calculatedTotal;

    const studentEntry = {
      studentNo,
      statedTotal,
      questionScores: scores,
      calculatedTotal,
      totalsMatch,
      hasExpectedQuestions: true,
      status: totalsMatch ? 'PERFECT' : 'TOTAL_MISMATCH'
    };

    this.addOrUpdateStudent(studentEntry, `No: ${studentNo} | Toplam: ${statedTotal} | Puanlar: ${scores.join(', ')}`);

    // Slotları temizle ve bir sonraki öğrenciye geç!
    this.currentSlots = [];
    this.groqSlotStartedAt = 0;
    this.renderLiveSlots();
    if (!totalsMatch) {
      this.showToast(`Öğrenci ${studentNo} eklendi; söylenen toplam ${statedTotal}, hesaplanan toplam ${calculatedTotal}.`, 'warning');
    }
  }

  // Son söylenen tek bir sayıyı geri al
  undoLastNumber() {
    if (this.currentSlots.length > 0) {
      this.currentSlots.pop();
      if (this.currentSlots.length === 0) this.groqSlotStartedAt = 0;
      this.renderLiveSlots();
      this.showToast('Son sayı geri alındı.', 'info');
    }
  }

  // Aktif öğrenci kutucuklarını sıfırla
  clearCurrentSlots() {
    this.currentSlots = [];
    this.groqSlotStartedAt = 0;
    this.renderLiveSlots();
    this.showToast('Aktif öğrenci kutucukları temizlendi.', 'info');
  }

  // Kutucuğa doğrudan tıklanıp değer girildiğinde
  setSlotValue(slotIndex, value) {
    const val = value === '' ? undefined : parseInt(value, 10);
    if (val === undefined || isNaN(val)) {
      this.currentSlots[slotIndex] = undefined;
    } else {
      while (this.currentSlots.length <= slotIndex) {
        this.currentSlots.push(undefined);
      }
      this.currentSlots[slotIndex] = val;
    }
    this.renderLiveSlots();

    const neededTotal = 2 + this.settings.questionCount;
    const filledCount = this.currentSlots.slice(0, neededTotal).filter(v => v !== undefined && v !== null).length;
    if (filledCount === neededTotal) {
      this.commitCurrentSlots();
    }
  }

  // Manuel olarak mevcut slotları kaydet
  commitManualSlots() {
    if (this.currentSlots.length < 2 || this.currentSlots[0] === undefined || this.currentSlots[1] === undefined) {
      this.showToast('En az Okul No ve Toplam puan girilmiş olmalıdır.', 'warning');
      return;
    }
    this.commitCurrentSlots();
  }

  // Konuşulan veya kaydedilen metni slotlara aktar
  handleSpokenTranscript(transcript, isFinal = false) {
    if (!transcript) return;
    const parsed = TurkishNumberParser.parseSpokenStudent(transcript, this.settings.questionCount);
    if (!parsed) return;

    if (parsed.isLabeled) {
      // 1. Okul No
      if (parsed.studentNo !== null) {
        this.currentSlots[0] = parsed.studentNo;
      }
      // 2. Toplam
      if (parsed.statedTotal !== null) {
        this.currentSlots[1] = parsed.statedTotal;
      }
      // 3. Soru Puanları (S1, S2, S3...)
      const answeredQs = Object.keys(parsed.questionScoresMap).map(Number);
      if (answeredQs.length > 0) {
        const maxQ = Math.max(...answeredQs);
        if (maxQ !== this.settings.questionCount && parsed.totalsMatch && answeredQs.length >= 2) {
          this.updateQuestionCount(maxQ);
        }

        for (let q = 0; q < this.settings.questionCount; q++) {
          const slotIdx = 2 + q;
          const qNum = q + 1;
          if (parsed.questionScoresMap[qNum] !== undefined) {
            this.currentSlots[slotIdx] = parsed.questionScoresMap[qNum];
          }
        }
      }
    } else {
      // Ardışık (saf sayı) format
      const nums = parsed.allNumbers;
      if (nums.length > 0) {
        const maxSlots = 2 + this.settings.questionCount;
        for (let i = 0; i < nums.length && i < maxSlots; i++) {
          this.currentSlots[i] = nums[i];
        }
      }
    }

    this.renderLiveSlots();

    // Tüm kutular dolu mu?
    const neededTotal = 2 + this.settings.questionCount;
    const isComplete = this.currentSlots.length >= neededTotal &&
      this.currentSlots.slice(0, neededTotal).every(v => v !== undefined && v !== null);

    if (isComplete && isFinal) {
      this.commitCurrentSlots();
    }
  }

  // --- ÖZEL SES KAYDI BUTONU KONTROLLERİ ---
  toggleVoiceRecording() {
    if (this.isSlotRecording) {
      this.stopVoiceRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  startVoiceRecording() {
    if (this.isListening) {
      this.toggleListening();
    }
    if (this.isAbsentListening) {
      this.toggleAbsentListening();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast('Tarayıcınız ses tanıma desteklemiyor. Google Chrome veya Edge kullanın.', 'error');
      return;
    }

    this.isSlotRecording = true;
    this.slotAccumulatedTranscript = '';
    this.slotRecordSeconds = 0;

    // UI Güncelle
    const recBtn = document.getElementById('btn-slot-record');
    const recIcon = document.getElementById('slot-record-icon');
    const recText = document.getElementById('slot-record-text');
    const recTimer = document.getElementById('slot-record-timer');
    const banner = document.getElementById('slot-recording-banner');

    if (recBtn) {
      recBtn.className = 'px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-600/40 animate-pulse active:scale-95 group';
    }
    if (recIcon) recIcon.textContent = '⏹️';
    if (recText) recText.textContent = 'Kaydı Bitir & Aktar';
    if (recTimer) {
      recTimer.classList.remove('hidden');
      recTimer.textContent = '00:00';
    }
    if (banner) banner.classList.remove('hidden');

    if (this.settings.soundEnabled && typeof SoundEffects !== 'undefined' && SoundEffects.playRecordStart) {
      SoundEffects.playRecordStart();
    }

    // Sayaç Başlat
    if (this.slotRecordTimer) clearInterval(this.slotRecordTimer);
    this.slotRecordTimer = setInterval(() => {
      this.slotRecordSeconds++;
      if (recTimer) {
        const m = String(Math.floor(this.slotRecordSeconds / 60)).padStart(2, '0');
        const s = String(this.slotRecordSeconds % 60).padStart(2, '0');
        recTimer.textContent = `${m}:${s}`;
      }
    }, 1000);

    this.initAudioVisualizer();

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      this.slotRecognition = recognition;

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += ' ' + text;
          } else {
            interim += ' ' + text;
          }
        }

        if (final.trim()) {
          this.slotAccumulatedTranscript = (this.slotAccumulatedTranscript + ' ' + final).trim();
        }

        const currentCombined = (this.slotAccumulatedTranscript + ' ' + interim).trim();

        const livePreview = document.getElementById('speech-live-preview');
        if (livePreview) livePreview.textContent = currentCombined || 'Dinleniyor...';

        this.handleSpokenTranscript(currentCombined, false);
      };

      recognition.onerror = (err) => {
        console.warn('Slot ses tanıma hatası:', err);
        if (err.error === 'not-allowed') {
          this.showToast('Mikrofon izni verilmedi! Lütfen tarayıcı izinlerini kontrol edin.', 'error');
          this.stopVoiceRecording();
        }
      };

      recognition.onend = () => {
        if (this.isSlotRecording && this.slotRecognition === recognition) {
          try {
            recognition.start();
          } catch(e) {}
        }
      };

      recognition.start();
      this.showToast('🎙️ Ses kaydı başladı! Öğrenci notlarını söyleyin.', 'info');
    } catch(err) {
      console.error('Kayıt başlatılamadı:', err);
      this.showToast('Ses kaydı başlatılamadı.', 'error');
      this.stopVoiceRecording();
    }
  }

  stopVoiceRecording() {
    this.isSlotRecording = false;

    if (this.slotRecordTimer) {
      clearInterval(this.slotRecordTimer);
      this.slotRecordTimer = null;
    }

    if (this.slotRecognition) {
      const rec = this.slotRecognition;
      this.slotRecognition = null;
      try { rec.stop(); } catch(e) {}
    }

    this.stopAudioVisualizer();

    if (this.settings.soundEnabled && typeof SoundEffects !== 'undefined' && SoundEffects.playRecordStop) {
      SoundEffects.playRecordStop();
    }

    // UI Reset
    const recBtn = document.getElementById('btn-slot-record');
    const recIcon = document.getElementById('slot-record-icon');
    const recText = document.getElementById('slot-record-text');
    const recTimer = document.getElementById('slot-record-timer');
    const banner = document.getElementById('slot-recording-banner');

    if (recBtn) {
      recBtn.className = 'px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-600/30 active:scale-95 group';
    }
    if (recIcon) recIcon.textContent = '🔴';
    if (recText) recText.textContent = 'Ses Kaydı Al';
    if (recTimer) recTimer.classList.add('hidden');
    if (banner) banner.classList.add('hidden');

    // Son metni işle
    if (this.slotAccumulatedTranscript.trim()) {
      this.handleSpokenTranscript(this.slotAccumulatedTranscript.trim(), true);
    }

    const neededTotal = 2 + this.settings.questionCount;
    const isComplete = this.currentSlots.length >= neededTotal &&
      this.currentSlots.slice(0, neededTotal).every(v => v !== undefined && v !== null);

    if (isComplete) {
      this.commitCurrentSlots();
    } else if (this.currentSlots.length > 0 && this.currentSlots[0] !== undefined) {
      this.showToast('Söylediğiniz sayılar kutulara aktarıldı. Eksik kutuları tamamlayıp Tabloya Ekle butonuna basabilirsiniz.', 'info');
    }
  }

  // --- CANLI SLOTLARI ARAYÜZDE GÖRSELLEŞTİRME ---
  renderLiveSlots(interimNumbers = []) {
    const container = document.getElementById('live-slots-container');
    if (!container) return;

    let html = '';

    // Okul No Kutusu
    const committedNo = this.currentSlots[0];
    const previewNo = committedNo !== undefined ? committedNo : (interimNumbers[0] !== undefined ? interimNumbers[0] : '');
    const isNoPreview = committedNo === undefined && interimNumbers[0] !== undefined;

    html += `
      <div class="flex flex-col items-center">
        <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">Okul No</span>
        <input type="number" min="1" value="${previewNo !== '' ? previewNo : ''}" placeholder="?"
          onchange="app.setSlotValue(0, this.value)"
          class="w-16 h-12 rounded-xl text-center font-mono font-bold text-sm border-2 transition-all outline-none ${
            committedNo !== undefined
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/30 scale-105'
              : isNoPreview
              ? 'bg-indigo-950/80 text-indigo-200 border-indigo-400 border-dashed animate-pulse scale-105'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-500 focus:border-indigo-400 focus:text-white'
          }">
      </div>
    `;

    // Toplam Puan Kutusu
    const committedTot = this.currentSlots[1];
    const interimTotIndex = 1 - this.currentSlots.length;
    const previewTot = committedTot !== undefined ? committedTot : (interimTotIndex >= 0 && interimNumbers[interimTotIndex] !== undefined ? interimNumbers[interimTotIndex] : '');
    const isTotPreview = committedTot === undefined && previewTot !== '';

    html += `
      <div class="flex flex-col items-center">
        <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">Toplam</span>
        <input type="number" min="0" value="${previewTot !== '' ? previewTot : ''}" placeholder="?"
          onchange="app.setSlotValue(1, this.value)"
          class="w-14 h-12 rounded-xl text-center font-mono font-bold text-sm border-2 transition-all outline-none ${
            committedTot !== undefined
              ? 'bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-500/30 scale-105'
              : isTotPreview
              ? 'bg-violet-950/80 text-violet-200 border-violet-400 border-dashed animate-pulse scale-105'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-500 focus:border-violet-400 focus:text-white'
          }">
      </div>
    `;

    // Soru Puanları Kutuları
    for (let q = 0; q < this.settings.questionCount; q++) {
      const slotIndex = 2 + q;
      const committedQ = this.currentSlots[slotIndex];
      const interimQIndex = slotIndex - this.currentSlots.length;
      const previewQ = committedQ !== undefined ? committedQ : (interimQIndex >= 0 && interimNumbers[interimQIndex] !== undefined ? interimNumbers[interimQIndex] : '');
      const isQPreview = committedQ === undefined && previewQ !== '';

      html += `
        <div class="flex flex-col items-center">
          <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">S${q + 1}</span>
          <input type="number" min="0" value="${previewQ !== '' && previewQ !== '-' ? previewQ : ''}" placeholder="-"
            onchange="app.setSlotValue(${slotIndex}, this.value)"
            class="w-12 h-12 rounded-xl text-center font-mono font-bold text-sm border-2 transition-all outline-none ${
              committedQ !== undefined
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/30 scale-105'
                : isQPreview
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-400 border-dashed animate-pulse scale-105'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-500 focus:border-emerald-400 focus:text-white'
            }">
        </div>
      `;
    }

    container.innerHTML = html;
  }

  setMicEngine(engine) {
    if (this.micEngine === engine) return;
    const wasListening = this.isListening;
    if (wasListening) {
      this.toggleListening();
    }
    this.micEngine = engine;
    localStorage.setItem('eokul_spead_mic_engine', engine);
    this.updateEngineUI();
    if (engine === 'groq') {
      this.showToast('⚡ Groq Whisper-large-v3 Yapay Zeka motoru aktif!', 'success');
    } else {
      this.showToast('🌐 Tarayıcı Standart Web Mikrofonu aktif!', 'info');
    }
  }

  updateEngineUI() {
    const groqBtn = document.getElementById('btn-engine-groq');
    const webBtn = document.getElementById('btn-engine-web');
    if (!groqBtn || !webBtn) return;

    if (this.micEngine === 'groq') {
      groqBtn.className = 'px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 bg-violet-600 text-white shadow-md shadow-violet-600/30';
      webBtn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
    } else {
      webBtn.className = 'px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 bg-indigo-600 text-white shadow-md shadow-indigo-600/30';
      groqBtn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
    }
  }

  // --- GROQ WHISPER-LARGE-V3 YAPAY ZEKA MOTORU ---
  isCurrentGroqSession(sessionId) {
    return sessionId === this.groqSessionId && this.isListening && this.micEngine === 'groq';
  }

  releaseGroqAudioStream(stream = this.micStream) {
    if (!stream) return;
    stream.getTracks().forEach(track => {
      try { track.stop(); } catch (e) {}
    });
    if (this.micStream === stream) this.micStream = null;
    this.stopAudioVisualizer();
  }

  async startGroqRecording() {
    const sessionId = ++this.groqSessionId;
    let sessionStream = null;
    try {
      if (!this.micStream || !this.micStream.active) {
        sessionStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false
          },
          video: false
        });
        if (!this.isCurrentGroqSession(sessionId)) {
          this.releaseGroqAudioStream(sessionStream);
          return;
        }
        this.micStream = sessionStream;
      } else {
        sessionStream = this.micStream;
      }
      await this.initAudioVisualizer();
      if (!this.isCurrentGroqSession(sessionId)) {
        this.releaseGroqAudioStream(sessionStream);
        return;
      }

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }
      this.mediaRecorderMimeType = mimeType;

      const audioChunks = [];
      const recorder = new MediaRecorder(sessionStream, { mimeType });
      this.recordedAudioChunks = audioChunks;
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const shouldTranscribe = !this.discardCurrentGroqSegment && this.isCurrentGroqSession(sessionId);
        this.discardCurrentGroqSegment = false;

        // Chunk'ları hemen yakala ve diziyi temizle
        if (this.recordedAudioChunks === audioChunks) this.recordedAudioChunks = [];
        const capturedChunks = audioChunks.slice();
        audioChunks.length = 0;

        // ÖNCELİK: Kayıt cihazını ÖNCE yeniden başlat → ölü süreyi minimuma indir
        // Eski kod burada race condition yaratıyordu (recorder.state kontrolü
        // her zaman geçmiyordu). Artık 30ms güvenli gecikme ile başlatılıyor.
        if (this.isCurrentGroqSession(sessionId) && this.mediaRecorder === recorder) {
          setTimeout(() => {
            if (this.isCurrentGroqSession(sessionId) && this.mediaRecorder === recorder && recorder.state === 'inactive') {
              try {
                recorder.start();
              } catch (err) {
                console.warn('Groq mediaRecorder yeniden başlatma hatası:', err);
              }
            }
          }, 30);
        }

        // SONRA yakalanan sesi işle (yeni kayıtla PARALEL çalışır)
        if (capturedChunks.length > 0) {
          const audioBlob = new Blob(capturedChunks, { type: this.mediaRecorderMimeType });
          const capturedAt = Date.now();
          if (shouldTranscribe && audioBlob.size > 800) {
            this.enqueueGroqTranscription(audioBlob, sessionId, capturedAt);
          } else if (!shouldTranscribe) {
            const livePreview = document.getElementById('speech-live-preview');
            if (livePreview && this.isCurrentGroqSession(sessionId)) {
              livePreview.textContent = 'Kısa ses parçası filtrelendi veya mikrofon kapatıldı.';
            }
          }
        }
      };

      if (!this.isCurrentGroqSession(sessionId)) {
        this.releaseGroqAudioStream(sessionStream);
        return;
      }
      recorder.start();
      this.isGroqRecording = true;
      this.isSpeaking = false;
      this.groqSpeechStartCandidateAt = 0;
      this.lastSpeechTime = 0;
      this.speechStartTime = 0;
      this.discardCurrentGroqSegment = false;

      this.startGroqVAD();

      const statusEl = document.getElementById('mic-status-text');
      if (statusEl) statusEl.textContent = '🟢 Dinliyor... (Gürültü Kalkanı Aktif)';
      const livePreview = document.getElementById('speech-live-preview');
      if (livePreview) livePreview.textContent = 'Konuşun... Notları sırayla okuyun (örn: 14 85 20 20 20 25)';
    } catch (err) {
      if (!this.isCurrentGroqSession(sessionId)) return;
      console.error('Groq mikrofon başlatma hatası:', err);
      this.showToast('Mikrofon açılamadı! Lütfen mikrofon iznini kontrol edin.', 'error');
      this.isListening = false;
      this.updateMicUI(false);
      this.releaseGroqAudioStream(sessionStream);
    }
  }

  startGroqVAD() {
    if (this.groqVadInterval) clearInterval(this.groqVadInterval);

    const bufferLength = this.audioAnalyser ? this.audioAnalyser.fftSize : 0;
    const dataArray = new Uint8Array(bufferLength);

    this.groqVadInterval = setInterval(() => {
      if (
        !this.isListening ||
        this.micEngine !== 'groq' ||
        !this.audioAnalyser ||
        !this.mediaRecorder ||
        this.mediaRecorder.state !== 'recording'
      ) return;

      this.audioAnalyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const sample = dataArray[i] - 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      const now = Date.now();
      const speechStartThreshold = Math.min(18, Math.max(5, this.groqNoiseFloor * 2.0 + 2));
      const speechContinueThreshold = Math.max(2.5, speechStartThreshold * 0.5);

      if (!this.isSpeaking) {
        if (rms >= speechStartThreshold) {
          if (!this.groqSpeechStartCandidateAt) this.groqSpeechStartCandidateAt = now;
          // Kısa ama gerçek sayı parçalarını yakala; tek ölçümlük tıkırtıları ele.
          if (now - this.groqSpeechStartCandidateAt >= 70) {
            this.isSpeaking = true;
            this.speechStartTime = this.groqSpeechStartCandidateAt;
            this.lastSpeechTime = now;
            this.groqSpeechStartCandidateAt = 0;
            const statusEl = document.getElementById('mic-status-text');
            if (statusEl) {
              statusEl.textContent = this.isTranscribing
                ? '🎙️ Konuşma algılandı... sıraya alınıyor'
                : '🎙️ Konuşma Algılandı... (Dinliyor)';
            }
          }
        } else {
          this.groqSpeechStartCandidateAt = 0;
          this.groqNoiseFloor = Math.min(10, this.groqNoiseFloor * 0.95 + rms * 0.05);
        }
      } else if (rms >= speechContinueThreshold) {
        this.lastSpeechTime = now;
      } else if (this.isSpeaking) {
        if (now - this.lastSpeechTime > this.groqSpeechHangoverMs) {
          this.isSpeaking = false;
          this.groqSpeechStartCandidateAt = 0;
          // Gerçek ses süresini ölç; sessizlik bekleme süresini konuşma süresine katma.
          const speechDuration = this.lastSpeechTime - this.speechStartTime;
          this.discardCurrentGroqSegment = speechDuration < this.minimumGroqSpeechDurationMs;

          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            const statusEl = document.getElementById('mic-status-text');
            if (statusEl) {
              statusEl.textContent = this.discardCurrentGroqSegment
                ? 'Kısa arka plan sesi filtreleniyor...'
                : '⚡ Whisper AI Çözümlüyor...';
            }
            this.mediaRecorder.stop();
          }
        }
      }
    }, 100);
  }

  enqueueGroqTranscription(audioBlob, sessionId, capturedAt) {
    this.groqTranscriptionQueue = this.groqTranscriptionQueue
      .catch(() => {})
      .then(() => {
        if (!this.isCurrentGroqSession(sessionId)) return;
        return this.transcribeWithGroq(audioBlob, sessionId, capturedAt);
      })
      .catch((error) => {
        console.error('Groq ses kuyruğu hatası:', error);
      });
  }

  isGarbageOrHallucination(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();

    // v7.0: Eğer metinde çıkartılabilir sayı varsa, ASLA reddetme.
    // Eski kod "altı yüz" gibi meşru sayı ifadelerini "altyazı" ile
    // karıştırarak tüm çıktıyı çöpe atıyordu.
    const numbers = TurkishNumberParser.extractNumbers(text);
    if (numbers && numbers.length > 0) return false;

    // Yalnızca hiç sayı içermeyen saf gürültü/halüsinasyon metinleri reddet
    const badPatterns = [
      'altyazı', 'altyazi', 'teşekkür', 'tesekkur', 'izlediğiniz', 'izlediginiz',
      'abone', 'beğen', 'begen', 'videoyu', 'yorum', 'hoşça kal', 'hosca kal',
      'görüşmek', 'gorusmek', 'bay bay', 'bye', 'www.', '.com', '.org',
      'kanalımıza', 'seslendiren', 'çeviri', 'ceviri', 'tr dublaj', 'senkron'
    ];
    for (const p of badPatterns) {
      if (lower.includes(p)) return true;
    }
    return false;
  }

  validateGroqNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return false;

    // v7.0: Yumuşatılmış validasyon — eski slot-bazlı kontrol, Whisper
    // çoklu öğrenci döndürdüğünde modüler indeksi yanlış hesaplıyordu
    // ve meşru sayıları reddediyordu. Artık yalnızca temel sağlık kontrolü
    // yapılır; slot mantığı feedNumbers()'a bırakılır.
    for (const number of numbers) {
      if (!Number.isSafeInteger(number) || number < 0) return false;
    }
    return true;
  }

  async requestWhisperTranscription(audioBlob, signal, shouldContinue = () => true, promptMode = 'context') {
    if (!shouldContinue()) return '';
    const mimeType = audioBlob.type || this.mediaRecorderMimeType || 'audio/webm';
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const createFormData = () => {
      const form = new FormData();
      form.append('file', audioBlob, `audio.${ext}`);
      form.append('model', this.groqModel);
      form.append('temperature', '0');
      form.append('language', 'tr');
      if (promptMode === 'context') {
        form.append('prompt', 'Türkçe sınav notu diktesi; öğrenci numaraları, toplam puanlar ve soru puanları.');
      }
      form.append('response_format', 'json');
      return form;
    };

    const user = window.db?.auth?.currentUser;
    const idToken = user ? await user.getIdToken() : '';
    if (!idToken) throw new Error('Oturum doğrulanamadı. Lütfen yeniden giriş yapın.');
    if (!shouldContinue()) return '';
    const url = '/api/transcriptions';
    const headers = { 'Authorization': 'Bearer ' + idToken };

    const maxAttempts = 2;
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!shouldContinue()) return '';
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: createFormData(),
          signal
        });
      } catch (fetchError) {
        if (signal?.aborted || fetchError.name === 'AbortError') throw fetchError;
        if (!shouldContinue()) return '';
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 700 * attempt));
          continue;
        }

        const details = fetchError.message || fetchError.name || 'bağlantı hatası';
        const networkError = new Error(`Whisper sunucu bağlantısı kurulamadı (${details}).`);
        networkError.code = 'WHISPER_NETWORK_ERROR';
        throw networkError;
      }

      if (url === '/api/transcriptions' && response.status === 404) {
        throw new Error('Whisper sunucu uç noktası bulunamadı. Projeyi Vercel üzerinden açın.');
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 700 * attempt));
        continue;
      }
      break;
    }

    if (!shouldContinue()) return '';
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const requestError = new Error(errorData.error?.message || `HTTP ${response.status}`);
      if (response.status === 429 || response.status >= 500) {
        requestError.code = 'WHISPER_TEMPORARY_ERROR';
      }
      throw requestError;
    }

    const data = await response.json();
    if (!shouldContinue()) return '';
    return (data.text || '').trim();
  }

  async transcribeWithGroq(audioBlob, sessionId = this.groqSessionId, capturedAt = Date.now()) {
    if (!this.isCurrentGroqSession(sessionId)) return;
    this.isTranscribing = true;
    const livePreview = document.getElementById('speech-live-preview');
    const statusEl = document.getElementById('mic-status-text');
    const controller = new AbortController();
    this.activeTranscriptionController = controller;

    try {
      const text = await this.requestWhisperTranscription(
        audioBlob,
        controller.signal,
        () => this.isCurrentGroqSession(sessionId)
      );
      if (!this.isCurrentGroqSession(sessionId)) return;

      if (text) {
        if (this.isGarbageOrHallucination(text)) {
          console.warn('Gürültü/halüsinasyon metni filtrelendi:', text);
          if (livePreview) livePreview.textContent = '⚠️ Arka plan karmaşa sesi filtrelendi.';
          // Gürültü parçasını yok say; önceki doğru sayılar kutularda kalsın.
          return;
        }
        if (livePreview) livePreview.textContent = text;
        const parsed = TurkishNumberParser.parseSpokenStudent(text, this.settings.questionCount);
        if (parsed && parsed.isLabeled) {
          this.handleSpokenTranscript(text, true);
        } else {
          const numbers = TurkishNumberParser.extractNumbers(text);
          if (numbers && numbers.length > 0) {
            if (
              this.currentSlots.length > 0 &&
              this.groqSlotStartedAt &&
              capturedAt - this.groqSlotStartedAt > this.groqSlotTimeoutMs
            ) {
              this.currentSlots = [];
              this.groqSlotStartedAt = 0;
              this.renderLiveSlots();
              this.showToast('Eksik Whisper kaydı zaman aşımına uğradı ve temizlendi.', 'warning');
            }

            if (!this.validateGroqNumbers(numbers)) {
              this.showToast('Bu ses parçasındaki sayı aralık dışı; önceki kutular korundu.', 'warning');
              return;
            }

            this.feedNumbers(numbers, capturedAt);
            if (this.currentSlots.length === 0) this.groqSlotStartedAt = 0;
          }
        }
      }
    } catch (err) {
      if (!this.isCurrentGroqSession(sessionId) || err.name === 'AbortError') return;
      console.warn('Groq Whisper çözümleme hatası:', err);
      this.showToast('Whisper API hatası: ' + err.message, 'warning');
    } finally {
      if (this.activeTranscriptionController === controller) {
        this.activeTranscriptionController = null;
        this.isTranscribing = false;
      }
      if (this.isCurrentGroqSession(sessionId) && statusEl && !this.isSpeaking) {
        statusEl.textContent = '🟢 Dinliyor... (Whisper AI)';
      }
    }
  }

  stopGroqRecording() {
    // İzin penceresi veya Whisper isteği henüz beklerken kapatma olursa eski oturumu geçersiz kıl.
    this.groqSessionId++;
    this.discardCurrentGroqSegment = true;
    this.isTranscribing = false;
    if (this.activeTranscriptionController) {
      this.activeTranscriptionController.abort();
      this.activeTranscriptionController = null;
    }
    if (this.groqVadInterval) {
      clearInterval(this.groqVadInterval);
      this.groqVadInterval = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.isGroqRecording = false;
    this.isSpeaking = false;
    this.groqSpeechStartCandidateAt = 0;
    this.recordedAudioChunks = [];
    this.renderLiveSlots();
    this.releaseGroqAudioStream();
  }

  toggleListening() {
    if (this.isListening) {
      this.stopOneShotRecording();
      return;
    }
    this.startOneShotRecording();
  }

  async startOneShotRecording() {
    if (this.isStartingOneShotRecording || this.isTranscribing) return;

    if (this.currentSlots.some(value => value !== undefined && value !== null)) {
      this.showToast('Yeni kayıt öncesinde aktif öğrenci kutularını tabloya ekleyin veya sıfırlayın.', 'warning');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.showToast('Ses kaydı için güncel bir tarayıcıda veya HTTPS bağlantısında açın.', 'error');
      return;
    }

    this.isStartingOneShotRecording = true;
    this.updateMicUI(false, true, 'Mikrofon izni bekleniyor…');

    try {
      if (this.isAbsentListening) this.toggleAbsentListening();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.oneShotStream = stream;
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? supportedTypes.find(type => MediaRecorder.isTypeSupported(type)) || ''
        : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      this.oneShotMimeType = recorder.mimeType || mimeType || 'audio/webm';
      this.oneShotChunks = [];
      this.oneShotRecorder = recorder;
      this.micStream = stream;
      this.oneShotSeconds = 0;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) this.oneShotChunks.push(event.data);
      };

      recorder.onstop = () => {
        this.isListening = false;
        if (this.oneShotTimer) {
          clearInterval(this.oneShotTimer);
          this.oneShotTimer = null;
        }
        this.updateMicUI(false, true, 'Kayıt Whisper AI’ya gönderiliyor…');
        const audioBlob = new Blob(this.oneShotChunks, { type: this.oneShotMimeType });
        this.oneShotChunks = [];
        if (this.oneShotRecorder === recorder) this.oneShotRecorder = null;

        stream.getTracks().forEach(track => track.stop());
        if (this.oneShotStream === stream) this.oneShotStream = null;
        if (this.micStream === stream) this.micStream = null;
        this.stopAudioVisualizer();

        if (audioBlob.size < 800) {
          this.updateMicUI(false);
          this.showToast('Kayıt çok kısa veya sessiz. Lütfen tekrar deneyin.', 'warning');
          return;
        }

        this.transcribeOneShotRecording(audioBlob);
      };

      recorder.onerror = event => {
        console.error('Ses kaydı hatası:', event.error || event);
        this.showToast('Ses kaydı sırasında hata oluştu. Tekrar deneyin.', 'error');
      };

      recorder.start();
      this.isListening = true;
      this.retryWhisperAudioBlob = null;
      const retryButton = document.getElementById('retry-whisper-btn');
      if (retryButton) retryButton.classList.add('hidden');
      this.updateMicUI(true);
      this.oneShotTimer = setInterval(() => {
        this.oneShotSeconds++;
        const timer = document.getElementById('mic-record-timer');
        if (timer) {
          const minutes = String(Math.floor(this.oneShotSeconds / 60)).padStart(2, '0');
          const seconds = String(this.oneShotSeconds % 60).padStart(2, '0');
          timer.textContent = `${minutes}:${seconds}`;
        }
      }, 1000);

      this.initAudioVisualizer();
      if (this.settings.soundEnabled && typeof SoundEffects !== 'undefined' && SoundEffects.playRecordStart) {
        SoundEffects.playRecordStart();
      }
      this.showToast(`Ses kaydı başladı. ${this.getVoiceScoreFormatHint()} Bitince kırmızı düğmeye basın.`, 'info');
    } catch (error) {
      console.error('Ses kaydı başlatılamadı:', error);
      if (this.oneShotStream) {
        this.oneShotStream.getTracks().forEach(track => track.stop());
        this.oneShotStream = null;
        this.micStream = null;
      }
      this.oneShotRecorder = null;
      this.oneShotChunks = [];
      if (this.oneShotTimer) {
        clearInterval(this.oneShotTimer);
        this.oneShotTimer = null;
      }
      this.stopAudioVisualizer();
      this.isListening = false;
      this.updateMicUI(false);
      const message = error.name === 'NotAllowedError'
        ? 'Mikrofon izni verilmedi. Tarayıcı izinlerinden mikrofon erişimini açın.'
        : 'Mikrofon açılamadı. Bağlantısını ve tarayıcı iznini kontrol edin.';
      this.showToast(message, 'error');
    } finally {
      this.isStartingOneShotRecording = false;
    }
  }

  stopOneShotRecording() {
    const recorder = this.oneShotRecorder;
    if (!recorder || recorder.state === 'inactive') return;

    this.isListening = false;
    if (this.oneShotTimer) {
      clearInterval(this.oneShotTimer);
      this.oneShotTimer = null;
    }
    this.stopAudioVisualizer();
    this.updateMicUI(false, true, 'Kayıt Whisper AI’ya gönderiliyor…');
    if (this.settings.soundEnabled && typeof SoundEffects !== 'undefined' && SoundEffects.playRecordStop) {
      SoundEffects.playRecordStop();
    }

    try {
      recorder.stop();
    } catch (error) {
      console.error('Ses kaydı durdurulamadı:', error);
      this.isListening = false;
      this.oneShotRecorder = null;
      this.oneShotChunks = [];
      if (this.oneShotStream) {
        this.oneShotStream.getTracks().forEach(track => track.stop());
        if (this.micStream === this.oneShotStream) this.micStream = null;
        this.oneShotStream = null;
      }
      this.updateMicUI(false);
      this.showToast('Kayıt durdurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
    }
  }

  prepareStudentEntriesFromTranscript(transcript) {
    const selectedQuestionCount = Number(this.settings.questionCount);
    if (!Number.isInteger(selectedQuestionCount) || selectedQuestionCount < 1 || selectedQuestionCount > 30) {
      return { ok: false, message: 'Lütfen sınav soru sayısını 1 ile 30 arasında seçin.' };
    }
    const parsedStudents = TurkishNumberParser.parseAllStudentsFromText(
      transcript,
      selectedQuestionCount
    );
    if (parsedStudents.length === 0) {
      return { ok: false, message: 'Kayıttan öğrenci grubu çıkarılamadı. Sayıları daha net söyleyip tekrar deneyin.' };
    }
    const labeledQuestionCounts = parsedStudents.map(parsed => {
      if (!parsed.isLabeled || !parsed.questionScoresMap) return null;
      const questionIndices = Object.keys(parsed.questionScoresMap)
        .map(Number)
        .filter(Number.isSafeInteger)
        .sort((a, b) => a - b);
      const contiguous = questionIndices.length >= 2 &&
        questionIndices.every((questionNumber, index) => questionNumber === index + 1);
      return contiguous && parsed.totalsMatch ? questionIndices.length : null;
    });
    const inferredQuestionCount = labeledQuestionCounts[0];
    const canInferQuestionCount = inferredQuestionCount !== null &&
      labeledQuestionCounts.every(count => count === inferredQuestionCount);
    const questionCount = canInferQuestionCount
      ? inferredQuestionCount
      : this.settings.questionCount;

    const groupsByStudentNumber = new Map();
    for (const parsed of parsedStudents) {
      if (!Number.isSafeInteger(parsed.studentNo) || parsed.studentNo <= 0) {
        return { ok: false, message: 'Öğrenci numarası tanınmayan bir grup var. Kaydı tekrar deneyin.' };
      }
      const sameNumberGroups = groupsByStudentNumber.get(parsed.studentNo) || [];
      sameNumberGroups.push(parsed);
      groupsByStudentNumber.set(parsed.studentNo, sameNumberGroups);
    }

    let duplicateGroupsIgnored = 0;
    const students = [];
    for (const [studentNo, sameNumberGroups] of groupsByStudentNumber) {
      const candidates = [];
      let invalidGroupMessage = '';
      for (const parsed of sameNumberGroups) {
        if (!Number.isSafeInteger(parsed.statedTotal) || parsed.statedTotal < 0) {
          invalidGroupMessage ||= `Öğrenci ${studentNo} için toplam puan tanınmadı.`;
          continue;
        }

        const questionScores = parsed.isLabeled
          ? Array.from({ length: questionCount }, (_, index) => parsed.questionScoresMap?.[index + 1])
          : (parsed.questionScores || []).slice(0, questionCount);
        if (
          questionScores.length !== questionCount ||
          questionScores.some(score => !Number.isSafeInteger(score) || score < 0)
        ) {
          invalidGroupMessage ||= `Öğrenci ${studentNo} için soru puanları eksik. Soru sayısını ayarlayın veya puanları daha net söyleyin.`;
          continue;
        }

        const calculatedTotal = questionScores.reduce((sum, score) => sum + score, 0);
        const totalsMatch = parsed.statedTotal === calculatedTotal;
        candidates.push({
          rawSpeech: parsed.rawText || transcript,
          totalDifference: Math.abs(parsed.statedTotal - calculatedTotal),
          entry: {
            studentNo,
            statedTotal: parsed.statedTotal,
            questionScores,
            calculatedTotal,
            totalsMatch,
            hasExpectedQuestions: true,
            status: totalsMatch ? 'PERFECT' : 'TOTAL_MISMATCH'
          }
        });
      }

      if (candidates.length === 0) {
        return { ok: false, message: invalidGroupMessage || `Öğrenci ${studentNo} için puanlar okunamadı.` };
      }

      // Whisper aynı numarayı birden fazla grup olarak döndürürse, kullanılabilir
      // grupları önce toplamı tutana, sonra toplam farkı en küçük olana göre seç.
      candidates.sort((a, b) => Number(b.entry.totalsMatch) - Number(a.entry.totalsMatch) || a.totalDifference - b.totalDifference);
      students.push(candidates[0]);
      duplicateGroupsIgnored += sameNumberGroups.length - 1;
    }

    if (canInferQuestionCount && inferredQuestionCount !== this.settings.questionCount) {
      this.updateQuestionCount(inferredQuestionCount);
    }
    return { ok: true, students, duplicateGroupsIgnored };
  }

  async transcribeOneShotRecording(audioBlob) {
    const transcriptionId = ++this.oneShotTranscriptionId;
    const controller = new AbortController();
    this.activeTranscriptionController = controller;
    this.isTranscribing = true;
    const retryButton = document.getElementById('retry-whisper-btn');
    if (retryButton) retryButton.classList.add('hidden');
    this.updateMicUI(false, true, 'Whisper kaydı metne çeviriyor…');
    const livePreview = document.getElementById('speech-live-preview');
    let finalPreview = '';

    try {
      let text = await this.requestWhisperTranscription(
        audioBlob,
        controller.signal,
        () => transcriptionId === this.oneShotTranscriptionId,
        'none'
      );
      if (transcriptionId !== this.oneShotTranscriptionId) return;
      if (!text || TurkishNumberParser.extractNumbers(text).length === 0) {
        console.info('Whisper sayıları tanıyamadı; kısa sınav bağlamıyla tekrar deneniyor.');
        const fallbackText = await this.requestWhisperTranscription(
          audioBlob,
          controller.signal,
          () => transcriptionId === this.oneShotTranscriptionId,
          'context'
        );
        if (fallbackText) text = fallbackText;
        if (transcriptionId !== this.oneShotTranscriptionId) return;
      }
      if (!text) {
        this.retryWhisperAudioBlob = audioBlob;
        if (retryButton) retryButton.classList.remove('hidden');
        finalPreview = 'Whisper konuşmayı algılayamadı. Daha net ve biraz daha yüksek sesle tekrar deneyin.';
        this.showToast('Ses kaydında konuşma algılanamadı.', 'warning');
        return;
      }
      if (TurkishNumberParser.extractNumbers(text).length === 0) {
        this.retryWhisperAudioBlob = audioBlob;
        if (retryButton) retryButton.classList.remove('hidden');
        finalPreview = 'Sayılar tanınamadı. Soru sayısını kontrol edip daha net bir kayıt deneyin.';
        this.showToast('Sayılar tanınamadı. Kaydı tekrar deneyin.', 'warning');
        return;
      }
      if (this.isGarbageOrHallucination(text)) {
        this.retryWhisperAudioBlob = audioBlob;
        if (retryButton) retryButton.classList.remove('hidden');
        finalPreview = 'Whisper geçerli bir sayı algılayamadı. Kaydı tekrar deneyin.';
        this.showToast('Kayıtta öğrenci numarası veya puan bulunamadı.', 'warning');
        return;
      }

      const parsed = this.prepareStudentEntriesFromTranscript(text);
      if (!parsed.ok) {
        this.retryWhisperAudioBlob = audioBlob;
        if (retryButton) retryButton.classList.remove('hidden');
        finalPreview = parsed.message;
        this.showToast(parsed.message, 'warning');
        return;
      }

      this.retryWhisperAudioBlob = null;
      this.currentSlots = [];
      this.groqSlotStartedAt = 0;
      this.renderLiveSlots();
      parsed.students.forEach(student => {
        this.addOrUpdateStudent(student.entry, student.rawSpeech, { silent: true });
      });

      const mismatchedTotals = parsed.students.filter(student => !student.entry.totalsMatch).length;
      finalPreview = `${parsed.students.length} öğrenci kaydedildi.`;
      if (parsed.duplicateGroupsIgnored > 0) {
        finalPreview += ` ${parsed.duplicateGroupsIgnored} tekrarlanan grup yok sayıldı.`;
      }
      if (mismatchedTotals > 0) {
        finalPreview += ` ${mismatchedTotals} öğrencide söylenen toplam ile soru puanları uyuşmuyor; tabloyu kontrol edin.`;
        const duplicateGroupMessage = parsed.duplicateGroupsIgnored > 0
          ? ` ${parsed.duplicateGroupsIgnored} tekrarlanan grup yok sayıldı.`
          : '';
        this.showToast(`${parsed.students.length} öğrenci kaydedildi; ${mismatchedTotals} toplam puanı uyuşmuyor.${duplicateGroupMessage}`, 'warning');
      } else if (parsed.duplicateGroupsIgnored > 0) {
        this.showToast(`${parsed.students.length} öğrenci kaydedildi. ${parsed.duplicateGroupsIgnored} tekrarlanan grup yok sayıldı.`, 'warning');
      } else {
        this.showToast(`${parsed.students.length} öğrenci başarıyla tabloya eklendi veya güncellendi.`, 'success');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Whisper ses kaydı çözümlenemedi:', error);
      this.retryWhisperAudioBlob = audioBlob;
      if (retryButton) retryButton.classList.remove('hidden');
      finalPreview = `Whisper kaydı gönderilemedi; ses kaydı bu sayfada saklandı. Tekrar dene düğmesine basın. (${error.message})`;
      this.showToast('Whisper hatası: ' + error.message, 'error');
    } finally {
      if (this.activeTranscriptionController === controller) {
        this.activeTranscriptionController = null;
      }
      if (transcriptionId === this.oneShotTranscriptionId) {
        this.isTranscribing = false;
        this.updateMicUI(false);
        if (livePreview && finalPreview) livePreview.textContent = finalPreview;
      }
    }
  }

  retryFailedWhisperRecording() {
    if (!this.retryWhisperAudioBlob || this.isTranscribing || this.isListening || this.isStartingOneShotRecording) return;
    const audioBlob = this.retryWhisperAudioBlob;
    this.retryWhisperAudioBlob = null;
    this.transcribeOneShotRecording(audioBlob);
  }

  updateMicUI(active, processing = false, statusMessage = '') {
    const micBtn = document.getElementById('mic-toggle-btn');
    const micLabel = document.getElementById('mic-button-label');
    const micStatus = document.getElementById('mic-status-text');
    const micPulse = document.getElementById('mic-pulse-ring');
    const micDot = document.getElementById('mic-status-dot');
    const micTimer = document.getElementById('mic-record-timer');
    const livePreview = document.getElementById('speech-live-preview');
    const micIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    const stopIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    const loadingIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

    if (processing) {
      if (micBtn) {
        micBtn.disabled = true;
        micBtn.setAttribute('aria-label', 'Whisper kaydı çözümlüyor');
        micBtn.title = statusMessage || 'Whisper kaydı çözümlüyor';
        micBtn.innerHTML = loadingIcon;
        micBtn.classList.remove('bg-red-500', 'hover:bg-red-600', 'animate-pulse');
        micBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700', 'opacity-70', 'cursor-wait');
      }
      if (micStatus) micStatus.textContent = statusMessage || 'Whisper kaydı metne çeviriyor…';
      if (micLabel) micLabel.textContent = 'Whisper çözümlüyor…';
      if (micDot) micDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
      if (micPulse) micPulse.classList.add('hidden');
      if (micTimer) micTimer.classList.add('hidden');
      if (livePreview) livePreview.textContent = statusMessage || 'Kayıt Whisper AI ile çözümleniyor. Öğrenci grupları hazırlanıyor…';
    } else if (active) {
      if (micBtn) {
        micBtn.disabled = false;
        micBtn.setAttribute('aria-label', 'Kaydı durdur ve Whisper’a gönder');
        micBtn.title = 'Kaydı bitir ve Whisper AI’ya gönder';
        micBtn.innerHTML = stopIcon;
        micBtn.classList.remove('opacity-70', 'cursor-wait', 'bg-indigo-600', 'hover:bg-indigo-700');
        micBtn.classList.add('bg-red-500', 'hover:bg-red-600', 'animate-pulse');
      }
      if (micStatus) micStatus.textContent = 'Kayıt alınıyor — bitirmek için düğmeye basın';
      if (micLabel) micLabel.textContent = 'Kaydı bitir ve gönder';
      if (micDot) micDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping';
      if (micPulse) micPulse.classList.remove('hidden');
      if (micTimer) micTimer.classList.remove('hidden');
      if (livePreview) livePreview.textContent = this.getVoiceScoreFormatHint();
    } else {
      if (micBtn) {
        micBtn.disabled = false;
        micBtn.setAttribute('aria-label', 'Ses kaydını başlat');
        micBtn.title = 'Kaydı başlat; bitince tekrar tıklayarak Whisper’a gönder';
        micBtn.innerHTML = micIcon;
        micBtn.classList.remove('opacity-70', 'cursor-wait');
        micBtn.classList.remove('bg-red-500', 'hover:bg-red-600', 'animate-pulse');
        micBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
      }
      if (micStatus) micStatus.textContent = 'Kayda hazır';
      if (micLabel) micLabel.textContent = 'Kaydı başlat';
      if (micDot) micDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-slate-400';
      if (micPulse) micPulse.classList.add('hidden');
      if (micTimer) {
        micTimer.classList.add('hidden');
        micTimer.textContent = '00:00';
      }
      if (livePreview) livePreview.textContent = `Kaydı başlatın. ${this.getVoiceScoreFormatHint()} Tam gruplar tabloya eklenir.`;
    }
  }

  getVoiceScoreFormatHint() {
    const questionCount = this.settings.questionCount;
    const valuesPerStudent = questionCount + 2;
    return `Etiket söylemeyin. Her öğrenci için okul numarası, toplam puan, ardından ${questionCount} soru puanını sırayla söyleyin. Her ${valuesPerStudent} sayı bir öğrencidir; tamamlanan gruplar eklenir.`;
  }

  addOrUpdateStudent(entry, rawSpeech = '', options = {}) {
    const existingIndex = this.students.findIndex(s => s.studentNo === entry.studentNo);
    const newStudent = {
      id: existingIndex >= 0 ? this.students[existingIndex].id : 'std_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      studentNo: entry.studentNo,
      statedTotal: entry.statedTotal,
      calculatedTotal: entry.calculatedTotal,
      scores: entry.questionScores,
      status: entry.status,
      isAbsent: entry.isAbsent !== undefined ? !!entry.isAbsent : (existingIndex >= 0 ? !!this.students[existingIndex].isAbsent : false),
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      rawSpeech: rawSpeech
    };

    if (existingIndex >= 0) {
      this.students[existingIndex] = newStudent;
      if (!options.silent) this.showToast(`${entry.studentNo} nolu öğrenci güncellendi!`, 'info');
    } else {
      this.students.push(newStudent);
      if (!options.silent) this.showToast(`${entry.studentNo} nolu öğrenci eklendi!`, 'success');
    }

    if (this.settings.soundEnabled && !options.silent) {
      if (entry.status === 'PERFECT') {
        SoundEffects.playSuccess();
      } else {
        SoundEffects.playWarning();
      }
    }

    if (this.settings.autoSort) {
      this.sortStudents();
    }

    this.saveToStorage();
    this.renderTable();
    this.updateStats();
    this.logSpeechHistory(rawSpeech, entry.status);
  }

  sortStudents() {
    this.students.sort((a, b) => a.studentNo - b.studentNo);
  }

  renderTable() {
    const tbody = document.getElementById('students-table-body');
    const thead = document.getElementById('students-table-head');
    const emptyState = document.getElementById('empty-state');

    if (!tbody || !thead) return;

    let headerHtml = `
      <tr>
        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Sıra</th>
        <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Öğrenci No</th>
        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Söylenen Toplam</th>
        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Hesaplanan</th>
    `;

    for (let i = 1; i <= this.settings.questionCount; i++) {
      headerHtml += `<th class="px-3 py-3 text-center text-xs font-semibold text-indigo-600 bg-indigo-50/50 uppercase tracking-wider w-16">S${i}</th>`;
    }

    headerHtml += `
        <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Durum</th>
        <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">İşlem</th>
      </tr>
    `;
    thead.innerHTML = headerHtml;

    if (this.students.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    let bodyHtml = '';
    this.students.forEach((student, index) => {
      const isMismatch = student.statedTotal !== student.calculatedTotal;
      const isCountMismatch = student.scores.length !== this.settings.questionCount;

      let statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">✅ Kusursuz</span>`;
      if (student.isAbsent) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300" title="Bu öğrenci sınava girmedi olarak işaretlendi (Tüm puanlar 0)">🚫 Girmedi (0)</span>`;
      } else if (isCountMismatch) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">⚠️ Eksik Soru</span>`;
      } else if (isMismatch) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800" title="Söylenen (${student.statedTotal}) ile soru toplamı (${student.calculatedTotal}) eşit değil!">❌ Toplam Farkı</span>`;
      }

      bodyHtml += `
        <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 ${student.isAbsent ? 'bg-amber-50/20' : (isMismatch ? 'bg-rose-50/20' : '')}" data-id="${student.id}">
          <td class="px-4 py-3 text-xs text-slate-400 font-mono">${index + 1}</td>
          <td class="px-4 py-3 text-sm font-bold text-slate-800">
            <input type="number" value="${student.studentNo}" onchange="app.updateCell('${student.id}', 'studentNo', this.value)" class="w-20 px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded text-slate-800 font-bold focus:outline-none transition">
          </td>
          <td class="px-4 py-3 text-center text-sm font-semibold text-slate-600">
            <input type="number" value="${student.statedTotal}" onchange="app.updateCell('${student.id}', 'statedTotal', this.value)" class="w-16 text-center px-1 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded text-slate-600 font-medium focus:outline-none transition">
          </td>
          <td class="px-4 py-3 text-center text-sm font-bold ${isMismatch ? 'text-rose-600' : 'text-emerald-600'}">
            ${student.calculatedTotal}
          </td>
      `;

      for (let q = 0; q < this.settings.questionCount; q++) {
        const score = student.scores[q] !== undefined ? student.scores[q] : '-';
        bodyHtml += `
          <td class="px-2 py-3 text-center text-sm">
            <input type="number" min="0" value="${score === '-' ? '' : score}" onchange="app.updateScoreCell('${student.id}', ${q}, this.value)" class="w-12 text-center py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded font-semibold text-slate-800 focus:outline-none transition">
          </td>
        `;
      }

      bodyHtml += `
          <td class="px-4 py-3 text-center text-xs whitespace-nowrap">
            ${statusBadge}
          </td>
          <td class="px-4 py-3 text-right text-xs">
            <button onclick="app.deleteStudent('${student.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition" title="Öğrenciyi Sil">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = bodyHtml;
  }

  updateCell(id, field, value) {
    const student = this.students.find(s => s.id === id);
    if (!student) return;

    const numVal = parseInt(value, 10) || 0;
    student[field] = numVal;

    student.totalsMatch = student.statedTotal === student.calculatedTotal;
    student.status = student.scores.length !== this.settings.questionCount
      ? 'QUESTION_COUNT_MISMATCH'
      : (!student.totalsMatch ? 'TOTAL_MISMATCH' : 'PERFECT');

    if (field === 'studentNo' && this.settings.autoSort) {
      this.sortStudents();
    }

    this.saveToStorage();
    this.renderTable();
    this.updateStats();
  }

  updateScoreCell(id, questionIndex, value) {
    const student = this.students.find(s => s.id === id);
    if (!student) return;

    const numVal = value === '' ? 0 : (parseInt(value, 10) || 0);

    while (student.scores.length <= questionIndex) {
      student.scores.push(0);
    }
    student.scores[questionIndex] = numVal;

    student.calculatedTotal = student.scores.reduce((sum, v) => sum + v, 0);
    student.totalsMatch = student.statedTotal === student.calculatedTotal;
    student.status = student.scores.length !== this.settings.questionCount
      ? 'QUESTION_COUNT_MISMATCH'
      : (!student.totalsMatch ? 'TOTAL_MISMATCH' : 'PERFECT');

    this.saveToStorage();
    this.renderTable();
    this.updateStats();
  }

  deleteStudent(id) {
    this.students = this.students.filter(s => s.id !== id);
    this.saveToStorage();
    this.renderTable();
    this.updateStats();
    this.showToast('Öğrenci tablodan kaldırıldı.', 'info');
  }

  clearAllStudents() {
    if (this.students.length === 0) return;
    if (confirm('Tablodaki tüm öğrenci notlarını silmek istediğinize emin misiniz?')) {
      this.students = [];
      this.currentSlots = [];
      this.renderLiveSlots();
      this.saveToStorage();
      this.renderTable();
      this.updateStats();
      this.showToast('Tüm liste temizlendi.', 'info');
    }
  }

  updateStats() {
    const countEl = document.getElementById('stat-total-students');
    const avgEl = document.getElementById('stat-avg-score');
    const maxEl = document.getElementById('stat-max-score');
    const minEl = document.getElementById('stat-min-score');
    const warnEl = document.getElementById('stat-warning-count');

    const totalStudents = this.students.length;
    let avg = 0;
    let max = 0;
    let min = 0;
    let warnings = 0;

    if (totalStudents > 0) {
      const totals = this.students.map(s => s.calculatedTotal);
      const sum = totals.reduce((a, b) => a + b, 0);
      avg = (sum / totalStudents).toFixed(1);
      max = Math.max(...totals);
      min = Math.min(...totals);
      warnings = this.students.filter(s => s.statedTotal !== s.calculatedTotal || s.scores.length !== this.settings.questionCount).length;
    }

    if (countEl) countEl.textContent = totalStudents;
    if (avgEl) avgEl.textContent = avg;
    if (maxEl) maxEl.textContent = totalStudents > 0 ? max : '-';
    if (minEl) minEl.textContent = totalStudents > 0 ? min : '-';
    if (warnEl) warnEl.textContent = warnings;
  }

  copyScoresOnly() {
    if (this.students.length === 0) {
      this.showToast('Kopyalanacak öğrenci kaydı yok!', 'warning');
      return;
    }

    const lines = this.students.map(s => {
      const scores = [];
      for (let i = 0; i < this.settings.questionCount; i++) {
        scores.push(s.scores[i] !== undefined ? s.scores[i] : 0);
      }
      return scores.join(' ');
    });

    const textToCopy = lines.join('\n');
    this.copyToClipboard(textToCopy, `Sadece Soru Puanları (${this.students.length} öğrenci) panoya kopyalandı!`);
  }

  copyFullDataForEOkul() {
    if (this.students.length === 0) {
      this.showToast('Kopyalanacak öğrenci kaydı yok!', 'warning');
      return;
    }

    const lines = this.students.map(s => {
      const scores = [];
      for (let i = 0; i < this.settings.questionCount; i++) {
        scores.push(s.scores[i] !== undefined ? s.scores[i] : 0);
      }
      return `${s.studentNo}\t${scores.join('\t')}`;
    });

    const textToCopy = lines.join('\n');
    this.copyToClipboard(textToCopy, `e-Okul Formatı (No + Puanlar) panoya kopyalandı!`);
  }

  copyToClipboard(text, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMessage, 'success');
      }).catch(err => {
        this.fallbackCopy(text, successMessage);
      });
    } else {
      this.fallbackCopy(text, successMessage);
    }
  }

  fallbackCopy(text, successMessage) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast(successMessage, 'success');
    } catch (e) {
      this.showToast('Kopyalama başarısız oldu.', 'error');
    }
    document.body.removeChild(ta);
  }

  exportToCsv() {
    if (this.students.length === 0) {
      this.showToast('Dışa aktarılacak veri yok!', 'warning');
      return;
    }

    let csvContent = '\uFEFF';
    let headers = ['Sıra', 'Öğrenci No', 'Söylenen Toplam', 'Hesaplanan Toplam'];
    for (let i = 1; i <= this.settings.questionCount; i++) {
      headers.push(`Soru ${i}`);
    }
    headers.push('Durum');
    csvContent += headers.join(';') + '\n';

    this.students.forEach((s, idx) => {
      const row = [idx + 1, s.studentNo, s.statedTotal, s.calculatedTotal];
      for (let i = 0; i < this.settings.questionCount; i++) {
        row.push(s.scores[i] !== undefined ? s.scores[i] : 0);
      }
      row.push(s.status);
      csvContent += row.join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `e-Okul_Notlar_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast('CSV dosyası başarıyla indirildi!', 'success');
  }

  updateQuestionCount(newCount) {
    const val = Number(newCount);
    if (!Number.isInteger(val) || val < 1 || val > 30) {
      const qCountInput = document.getElementById('setting-question-count');
      if (qCountInput) qCountInput.value = String(this.settings.questionCount);
      this.showToast('Soru sayısı 1 ile 30 arasında tam sayı olmalıdır.', 'warning');
      return;
    }
    this.settings.questionCount = val;
    this.currentSlots = [];
    this.groqSlotStartedAt = 0;

    // Girmeyen öğrencilerin 0 puanlı dizi boyutunu yeni soru sayısına uyarla
    this.students.forEach(s => {
      if (s.isAbsent) {
        s.scores = Array(val).fill(0);
        s.statedTotal = 0;
        s.calculatedTotal = 0;
      }
    });

    this.saveToStorage();
    this.renderSettings();
    this.renderTable();
    this.renderLiveSlots();
    this.updateStats();
    this.updateBookmarkletLink();
    this.showToast(`Sınav soru sayısı ${val} olarak ayarlandı.`, 'info');
  }

  updateBookmarkletLink() {
    const linkEl = document.getElementById('bookmarklet-drag-link');
    const modalLinkEl = document.getElementById('bookmarklet-modal-drag-link');
    const codeArea = document.getElementById('bookmarklet-code-area');

    if (window.BookmarkletGenerator) {
      const rawScript = window.BookmarkletGenerator.getRawScript(this.settings.questionCount);
      if (linkEl) {
        linkEl.href = rawScript;
      }
      if (modalLinkEl) {
        modalLinkEl.href = rawScript;
      }
      if (codeArea) {
        codeArea.value = rawScript;
      }
    }
  }

  downloadBookmarkHtml() {
    if (window.BookmarkletGenerator) {
      const htmlContent = window.BookmarkletGenerator.generateBookmarkHtml(this.settings.questionCount);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'e-Okul-Yer-Imi.html';
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Yer imi dosyası indirildi!', 'success');
    }
  }

  copyBookmarkletCode() {
    if (window.BookmarkletGenerator) {
      const rawScript = window.BookmarkletGenerator.getRawScript(this.settings.questionCount);
      this.copyToClipboard(rawScript, '✅ Yer İmi Kodu Panoya Kopyalandı!');
    }
  }

  renderSettings() {
    const qCountInput = document.getElementById('setting-question-count');
    if (qCountInput) qCountInput.value = this.settings.questionCount;

    const currentQBadge = document.getElementById('current-q-badge');
    if (currentQBadge) currentQBadge.textContent = `${this.settings.questionCount} Soru`;

    const schemaBadge = document.getElementById('schema-q-count-badge');
    if (schemaBadge) schemaBadge.textContent = `Soru Puanları (${this.settings.questionCount} adet)`;

    const formatHint = this.getVoiceScoreFormatHint();
    const livePreview = document.getElementById('speech-live-preview');
    if (livePreview && !this.isListening && !this.isTranscribing && !this.isStartingOneShotRecording) {
      livePreview.textContent = `Kaydı başlatın. ${formatHint} Tam gruplar tabloya eklenir.`;
    }

    const autoSortCheck = document.getElementById('setting-auto-sort');
    if (autoSortCheck) autoSortCheck.checked = this.settings.autoSort;

    const soundCheck = document.getElementById('setting-sound');
    if (soundCheck) soundCheck.checked = this.settings.soundEnabled;

    // Hızlı soru butonlarının aktif/pasif stillerini güncelle (seçili olanın ışığı yansın)
    const activeClasses = ['bg-indigo-600', 'text-white', 'font-bold', 'shadow-sm'];
    const inactiveClasses = ['bg-slate-100', 'text-slate-600', 'font-medium', 'hover:bg-indigo-100', 'hover:text-indigo-700'];

    document.querySelectorAll('[data-q-count]').forEach(btn => {
      const qVal = parseInt(btn.getAttribute('data-q-count'), 10);
      if (qVal === this.settings.questionCount) {
        btn.classList.remove(...inactiveClasses);
        btn.classList.add(...activeClasses);
      } else {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
      }
    });
  }

  logSpeechHistory(text, status) {
    const list = document.getElementById('speech-history-list');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'text-xs p-2 rounded bg-slate-800/80 border border-slate-700/50 flex items-center justify-between gap-2';
    
    const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let badge = `<span class="text-emerald-400 font-mono">✅ Tamam</span>`;
    if (status === 'TOTAL_MISMATCH') {
      badge = `<span class="text-rose-400 font-mono">⚠️ Toplam Farkı</span>`;
    }

    item.innerHTML = `
      <div class="truncate flex-1">
        <span class="text-slate-400 font-mono mr-1">[${time}]</span>
        <span class="text-slate-200">${text}</span>
      </div>
      <div>${badge}</div>
    `;

    list.insertBefore(item, list.firstChild);

    while (list.children.length > 20) {
      list.removeChild(list.lastChild);
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;

    toast.className = 'fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all duration-300 transform translate-y-0 opacity-100 ';
    if (type === 'success') {
      toast.classList.add('bg-emerald-600', 'text-white');
      if (toastIcon) toastIcon.innerHTML = '✓';
    } else if (type === 'warning') {
      toast.classList.add('bg-amber-500', 'text-white');
      if (toastIcon) toastIcon.innerHTML = '⚠️';
    } else if (type === 'error') {
      toast.classList.add('bg-rose-600', 'text-white');
      if (toastIcon) toastIcon.innerHTML = '✕';
    } else {
      toast.classList.add('bg-slate-900', 'text-white');
      if (toastIcon) toastIcon.innerHTML = 'ℹ️';
    }

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
    }, 3500);
  }

  setupEventListeners() {
    const micBtn = document.getElementById('mic-toggle-btn');
    if (micBtn) {
      micBtn.addEventListener('click', () => this.toggleListening());
    }

    const qCountInput = document.getElementById('setting-question-count');
    if (qCountInput) {
      qCountInput.addEventListener('change', (e) => this.updateQuestionCount(e.target.value));
    }

    document.querySelectorAll('[data-q-count]').forEach(btn => {
      btn.addEventListener('click', () => {
        const count = btn.getAttribute('data-q-count');
        this.updateQuestionCount(count);
      });
    });

    const autoSortCheck = document.getElementById('setting-auto-sort');
    if (autoSortCheck) {
      autoSortCheck.addEventListener('change', (e) => {
        this.settings.autoSort = e.target.checked;
        if (this.settings.autoSort) {
          this.sortStudents();
          this.renderTable();
        }
        this.saveToStorage();
      });
    }

    const soundCheck = document.getElementById('setting-sound');
    if (soundCheck) {
      soundCheck.addEventListener('change', (e) => {
        this.settings.soundEnabled = e.target.checked;
        this.saveToStorage();
      });
    }

    const manualForm = document.getElementById('manual-add-form');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('manual-input-text');
        if (input && input.value.trim()) {
          const val = input.value.trim();
          const parsed = TurkishNumberParser.parseSpokenStudent(val, this.settings.questionCount);
          if (parsed && parsed.isLabeled) {
            this.handleSpokenTranscript(val, true);
          } else {
            const nums = TurkishNumberParser.extractNumbers(val);
            if (nums && nums.length > 0) {
              this.feedNumbers(nums);
            }
          }
          input.value = '';
        }
      });
    }

    const absentForm = document.getElementById('absent-add-form');
    if (absentForm) {
      absentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('absent-input-text');
        if (input && input.value.trim()) {
          const nums = TurkishNumberParser.extractNumbers(input.value.trim());
          if (nums && nums.length > 0) {
            this.addAbsentStudents(nums, input.value.trim());
            input.value = '';
          } else {
            this.showToast('Geçerli bir öğrenci numarası bulunamadı.', 'warning');
          }
        }
      });
    }
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new EOkulSpeadApp();
  window.app = app;
});
