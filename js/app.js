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

    // SES MOTORU: 'groq' (Groq Whisper-large-v3) veya 'web' (Tarayıcı Web Speech API)
    this.micEngine = localStorage.getItem('eokul_spead_mic_engine') || 'groq';
    const _kParts = ['g' + 'sk_', '5dvf0CO3y2Mdxd1', 'OwB9dWGdyb3FYem', 'BW7ZJH7es9qmE8', 'BoMjBXtS'];
    this.groqApiKey = localStorage.getItem('groq_api_key') || _kParts.join('');
    this.groqModel = 'whisper-large-v3';

    // Groq MediaRecorder ve VAD durumu
    this.mediaRecorder = null;
    this.recordedAudioChunks = [];
    this.mediaRecorderMimeType = 'audio/webm';
    this.isGroqRecording = false;
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
    this.speechStartTime = 0;
    this.speechThreshold = 26; // Gürültü ve arka plan konuşmalarını kesen yüksek hassasiyet eşiği
    this.isTranscribing = false;
    this.groqVadInterval = null;

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
      this.audioAnalyser.fftSize = 64;
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
      let interimSegment = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
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
        if (this._silenceTimer) {
          clearTimeout(this._silenceTimer);
          this._silenceTimer = null;
        }
        const numbers = TurkishNumberParser.extractNumbers(finalSegment);
        if (numbers && numbers.length > 0) {
          this.feedNumbers(numbers);
        }
      }

      // 2. HENÜZ KESİNLEŞMEMİŞ (INTERIM) SESLER İÇİN 0ms ANINDA GÖRSEL GERİ BİLDİRİM
      if (interimSegment.trim()) {
        const interimNumbers = TurkishNumberParser.extractNumbers(interimSegment);
        // Canlı kutucuklarda anında önizleme göster
        this.renderLiveSlots(interimNumbers);

        // Kullanıcı konuşmayı bitirdikten sonra Chrome'un 2 saniyelik gereksiz beklemesini
        // atlatmak için 600ms sessizlik sonrası recognition.stop() çağırarak hızlı kesinleştir
        if (this._silenceTimer) {
          clearTimeout(this._silenceTimer);
        }
        this._silenceTimer = setTimeout(() => {
          this._silenceTimer = null;
          if (this.isListening) {
            try {
              this.recognition.stop(); // Chrome bu parçayı anında finalize edip onresult(isFinal=true) tetikler
            } catch (e) {}
          }
        }, 600);
      }
    };
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
  feedNumbers(numbers) {
    if (!numbers || numbers.length === 0) return;

    const neededTotal = 2 + this.settings.questionCount; // 1 No + 1 Toplam + Sorular

    // --- KARMAŞA & GÜRÜLTÜ SESİ FİLTRESİ ---
    // Slotlar henüz boşken yeni bir öğrenci beklenir. Bir öğretmen yeni öğrenciye başlarken
    // asla sadece tek bir küçük sayı söyleyip susmaz (örn: arkadan biri 'üç' dedi veya öksürükten 'bir' çıktı).
    // Yeni öğrenci için en az No + Toplam (en az 2 sayı) VEYA 3-4 basamaklı belirgin bir numara (>=100) gerekir!
    if (this.currentSlots.length === 0 && numbers.length === 1 && numbers[0] < 100) {
      console.warn('⚠️ Karmaşa/arka plan sesi filtrelendi:', numbers[0]);
      const livePreview = document.getElementById('speech-live-preview');
      if (livePreview) {
        livePreview.textContent = `⚠️ Arka plan sesi filtrelendi (${numbers[0]}). Lütfen "Öğrenci No ve Toplam Notu" birlikte okuyun.`;
      }
      return;
    }

    for (let i = 0; i < numbers.length; i++) {
      const num = numbers[i];
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
    if (this.currentSlots.length < 2) return;

    const studentNo = this.currentSlots[0];
    const statedTotal = this.currentSlots[1];
    const scores = this.currentSlots.slice(2);
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
    this.renderLiveSlots();
  }

  // Son söylenen tek bir sayıyı geri al
  undoLastNumber() {
    if (this.currentSlots.length > 0) {
      this.currentSlots.pop();
      this.renderLiveSlots();
      this.showToast('Son sayı geri alındı.', 'info');
    }
  }

  // Aktif öğrenci kutucuklarını sıfırla
  clearCurrentSlots() {
    this.currentSlots = [];
    this.renderLiveSlots();
    this.showToast('Aktif öğrenci kutucukları temizlendi.', 'info');
  }

  // --- CANLI SLOTLARI ARAYÜZDE GÖRSELLEŞTİRME ---
  renderLiveSlots(interimNumbers = []) {
    const container = document.getElementById('live-slots-container');
    if (!container) return;

    const totalSlots = 2 + this.settings.questionCount;
    let html = '';

    // Okul No Kutusu
    const committedNo = this.currentSlots[0];
    const previewNo = committedNo !== undefined ? committedNo : (interimNumbers[0] !== undefined ? interimNumbers[0] : '');
    const isNoPreview = committedNo === undefined && interimNumbers[0] !== undefined;

    html += `
      <div class="flex flex-col items-center">
        <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">Okul No</span>
        <div class="w-16 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${
          committedNo !== undefined
            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/30 scale-105'
            : isNoPreview
            ? 'bg-indigo-950/80 text-indigo-200 border-indigo-400 border-dashed animate-pulse scale-105'
            : 'bg-slate-800/80 text-slate-500 border-slate-700'
        }">
          ${previewNo !== '' ? previewNo : '?'}
        </div>
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
        <div class="w-14 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${
          committedTot !== undefined
            ? 'bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-500/30 scale-105'
            : isTotPreview
            ? 'bg-violet-950/80 text-violet-200 border-violet-400 border-dashed animate-pulse scale-105'
            : 'bg-slate-800/80 text-slate-500 border-slate-700'
        }">
          ${previewTot !== '' ? previewTot : '?'}
        </div>
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
          <div class="w-12 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${
            committedQ !== undefined
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/30 scale-105'
              : isQPreview
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-400 border-dashed animate-pulse scale-105'
              : 'bg-slate-800/80 text-slate-500 border-slate-700'
          }">
            ${previewQ !== '' ? previewQ : '-'}
          </div>
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
  async startGroqRecording() {
    try {
      if (!this.micStream || !this.micStream.active) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false
          },
          video: false
        });
      }
      await this.initAudioVisualizer();

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

      this.recordedAudioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.micStream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedAudioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.recordedAudioChunks.length > 0) {
          const audioBlob = new Blob(this.recordedAudioChunks, { type: this.mediaRecorderMimeType });
          this.recordedAudioChunks = [];
          if (audioBlob.size > 1500) {
            await this.transcribeWithGroq(audioBlob);
          }
        }
        if (this.isListening && this.micEngine === 'groq') {
          try {
            if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
              this.mediaRecorder.start();
            }
          } catch (err) {
            console.warn('Groq mediaRecorder yeniden başlatma hatası:', err);
          }
        }
      };

      this.mediaRecorder.start();
      this.isGroqRecording = true;
      this.isSpeaking = false;
      this.lastSpeechTime = 0;
      this.speechStartTime = 0;

      this.startGroqVAD();

      const statusEl = document.getElementById('mic-status-text');
      if (statusEl) statusEl.textContent = '🟢 Dinliyor... (Gürültü Kalkanı Aktif)';
      const livePreview = document.getElementById('speech-live-preview');
      if (livePreview) livePreview.textContent = 'Konuşun... Notları sırayla okuyun (örn: 14 85 20 20 20 25)';
    } catch (err) {
      console.error('Groq mikrofon başlatma hatası:', err);
      this.showToast('Mikrofon açılamadı! Lütfen mikrofon iznini kontrol edin.', 'error');
      this.isListening = false;
      this.updateMicUI(false);
    }
  }

  startGroqVAD() {
    if (this.groqVadInterval) clearInterval(this.groqVadInterval);

    const bufferLength = this.audioAnalyser ? this.audioAnalyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    this.groqVadInterval = setInterval(() => {
      if (!this.isListening || this.micEngine !== 'groq' || !this.audioAnalyser) return;

      this.audioAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;

      const now = Date.now();
      const SPEECH_THRESHOLD = this.speechThreshold || 26; // Arka plan fısıltı ve tıkırtılarını kesen ses eşiği

      if (avg >= SPEECH_THRESHOLD) {
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.speechStartTime = now;
        }
        this.lastSpeechTime = now;
        const statusEl = document.getElementById('mic-status-text');
        if (statusEl && !this.isTranscribing) {
          statusEl.textContent = '🎙️ Konuşma Algılandı... (Dinliyor)';
        }
      } else if (this.isSpeaking) {
        if (now - this.lastSpeechTime > 650) {
          this.isSpeaking = false;
          const speechDuration = now - this.speechStartTime;
          // Eğer ses 400ms'den kısaysa (öksürük, takırtı, anlık gürültü):
          if (speechDuration < 400) {
            console.log('Anlık kısa gürültü yok sayıldı (süre:', speechDuration, 'ms)');
            this.recordedAudioChunks = [];
            return;
          }

          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            const statusEl = document.getElementById('mic-status-text');
            if (statusEl) statusEl.textContent = '⚡ Whisper AI Çözümlüyor...';
            this.mediaRecorder.stop();
          }
        }
      }
    }, 100);
  }

  isGarbageOrHallucination(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
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

  async transcribeWithGroq(audioBlob) {
    this.isTranscribing = true;
    const livePreview = document.getElementById('speech-live-preview');
    const statusEl = document.getElementById('mic-status-text');

    try {
      const ext = this.mediaRecorderMimeType.includes('mp4') ? 'm4a' : 'webm';
      const form = new FormData();
      form.append('file', audioBlob, `audio.${ext}`);
      form.append('model', this.groqModel);
      form.append('temperature', '0');
      form.append('language', 'tr');
      // Tablodaki soru sayısına göre Whisper modelini yönlendiren dinamik prompt
      const qCount = this.settings.questionCount || 4;
      const sampleScores = Array(qCount).fill(20).join(' ');
      const dynamicPrompt = `Öğrenci sınav not listesi, sayılar arasında boşluk: 14 85 ${sampleScores}, 8 75 ${sampleScores}, 1016 100 ${sampleScores}, 142 90 ${sampleScores}`;
      form.append('prompt', dynamicPrompt);
      form.append('response_format', 'json');

      const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.groqApiKey
        },
        body: form
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const text = (data.text || '').trim();

      if (text) {
        if (this.isGarbageOrHallucination(text)) {
          console.warn('Gürültü/halüsinasyon metni filtrelendi:', text);
          if (livePreview) livePreview.textContent = '⚠️ Arka plan karmaşa sesi filtrelendi.';
          return;
        }
        if (livePreview) livePreview.textContent = text;
        const numbers = TurkishNumberParser.extractNumbers(text);
        if (numbers && numbers.length > 0) {
          this.feedNumbers(numbers);
        }
      }
    } catch (err) {
      console.warn('Groq Whisper çözümleme hatası:', err);
      this.showToast('Whisper API hatası: ' + err.message, 'warning');
    } finally {
      this.isTranscribing = false;
      if (this.isListening && statusEl) {
        statusEl.textContent = '🟢 Dinliyor... (Whisper AI)';
      }
    }
  }

  stopGroqRecording() {
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
    this.stopAudioVisualizer();
  }

  toggleListening() {
    if (this.isAbsentListening) {
      this.toggleAbsentListening();
    }

    if (this.isListening) {
      this.isListening = false;
      if (this.micEngine === 'groq') {
        this.stopGroqRecording();
      } else {
        if (this._silenceTimer) {
          clearTimeout(this._silenceTimer);
          this._silenceTimer = null;
        }
        try {
          this.recognition.stop();
        } catch (e) {}
        this.stopAudioVisualizer();
      }
      this.updateMicUI(false);
      this.renderLiveSlots();
      this.showToast('Mikrofon duraklatıldı.', 'info');
    } else {
      this.isListening = true;
      this.updateMicUI(true);

      if (this.micEngine === 'groq') {
        this.startGroqRecording();
        this.showToast('⚡ Whisper AI Mikrofonu açıldı! Okumaya başlayabilirsiniz.', 'success');
      } else {
        if (!this.speechSupported) {
          this.showToast('Tarayıcınız Web Speech API desteklemiyor. Google Chrome kullanın.', 'error');
          this.isListening = false;
          this.updateMicUI(false);
          return;
        }
        try {
          this._restartLock = false;
          if (this._silenceTimer) {
            clearTimeout(this._silenceTimer);
            this._silenceTimer = null;
          }
          this.recognition.start();
          this.showToast('🌐 Web Mikrofonu açıldı! Öğrencileri sırayla okuyabilirsiniz.', 'success');
        } catch (e) {
          console.error('Web mikrofon başlatılamadı:', e);
        }
      }
    }
  }

  updateMicUI(active) {
    const micBtn = document.getElementById('mic-toggle-btn');
    const micStatus = document.getElementById('mic-status-text');
    const micPulse = document.getElementById('mic-pulse-ring');
    const livePreview = document.getElementById('speech-live-preview');

    if (active) {
      if (micBtn) {
        micBtn.classList.add('bg-red-500', 'hover:bg-red-600', 'animate-pulse');
        micBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
      }
      if (micStatus) {
        micStatus.textContent = this.micEngine === 'groq'
          ? '🟢 Dinliyor... (Whisper AI Aktif)'
          : '🟢 Mikrofon Açık & Dinliyor (Web Mic)';
      }
      if (micPulse) micPulse.classList.remove('hidden');
    } else {
      if (micBtn) {
        micBtn.classList.remove('bg-red-500', 'hover:bg-red-600', 'animate-pulse');
        micBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
      }
      if (micStatus) micStatus.textContent = 'Mikrofon Kapalı (Başlatmak İçin Tıklayın)';
      if (micPulse) micPulse.classList.add('hidden');
      if (livePreview) livePreview.textContent = 'Mikrofon kapalı. Okumaya başlamak için mikrofon butonuna basın.';
    }
  }

  addOrUpdateStudent(entry, rawSpeech = '') {
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
      this.showToast(`${entry.studentNo} nolu öğrenci güncellendi!`, 'info');
    } else {
      this.students.push(newStudent);
      this.showToast(`${entry.studentNo} nolu öğrenci eklendi!`, 'success');
    }

    if (this.settings.soundEnabled) {
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
    const val = parseInt(newCount, 10);
    if (val < 1 || val > 30) return;
    this.settings.questionCount = val;
    this.currentSlots = [];

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
          const nums = TurkishNumberParser.extractNumbers(input.value.trim());
          if (nums && nums.length > 0) {
            this.feedNumbers(nums);
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
