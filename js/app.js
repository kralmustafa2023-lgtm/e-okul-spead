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

    // Gerçek zamanlı ses görselleştirici
    this.audioContext = null;
    this.audioAnalyser = null;
    this.micStream = null;
    this.animFrameId = null;

    // AKTİF OKUNAN ÖĞRENCİNİN CANLI KUTUCUKLARI (SLOTS)
    // [OkulNo, ToplamPuan, Soru1, Soru2, Soru3, Soru4]
    this.currentSlots = [];

    this.init();
  }

  init() {
    this.loadFromStorage();
    this.setupSpeechRecognition();
    this.renderSettings();
    this.renderTable();
    this.renderLiveSlots();
    this.updateStats();
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

  // --- SES TANIMA (SPEECH RECOGNITION) ---
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
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'tr-TR';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateMicUI(true);
      this.initAudioVisualizer();
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isListening) {
              try { this.recognition.start(); } catch(err){}
            }
          }, 200);
        }
      } else {
        this.updateMicUI(false);
        this.stopAudioVisualizer();
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        this.showToast('Mikrofon izni verilmedi! Lütfen kilit simgesinden mikrofon iznini açın.', 'error');
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

      const livePreview = document.getElementById('speech-live-preview');
      if (livePreview) {
        livePreview.textContent = (finalSegment || interimSegment || 'Sizi dinliyorum...').trim();
      }

      // KESİNLİKLE SADECE 'isFinal' OLAN KESİNLEŞMİŞ SESLERİ İŞLE (Sıfır Tekrar Garantisi!)
      if (finalSegment.trim()) {
        const numbers = TurkishNumberParser.extractNumbers(finalSegment);
        if (numbers && numbers.length > 0) {
          this.feedNumbers(numbers);
        }
      }
    };
  }

  // --- CANLI SLOT BESLEYİCİ (SLOT FEEDER) ---
  feedNumbers(numbers) {
    if (!numbers || numbers.length === 0) return;

    const neededTotal = 2 + this.settings.questionCount; // 1 No + 1 Toplam + Sorular

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
  renderLiveSlots() {
    const container = document.getElementById('live-slots-container');
    if (!container) return;

    const totalSlots = 2 + this.settings.questionCount;
    let html = '';

    // Okul No Kutusu
    const noVal = this.currentSlots[0] !== undefined ? this.currentSlots[0] : '';
    html += `
      <div class="flex flex-col items-center">
        <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">Okul No</span>
        <div class="w-14 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${noVal !== '' ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/30 scale-105' : 'bg-slate-800/80 text-slate-500 border-slate-700'}">
          ${noVal !== '' ? noVal : '?'}
        </div>
      </div>
    `;

    // Toplam Puan Kutusu
    const totVal = this.currentSlots[1] !== undefined ? this.currentSlots[1] : '';
    html += `
      <div class="flex flex-col items-center">
        <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">Toplam</span>
        <div class="w-14 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${totVal !== '' ? 'bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-500/30 scale-105' : 'bg-slate-800/80 text-slate-500 border-slate-700'}">
          ${totVal !== '' ? totVal : '?'}
        </div>
      </div>
    `;

    // Soru Puanları Kutuları
    for (let q = 0; q < this.settings.questionCount; q++) {
      const qVal = this.currentSlots[2 + q] !== undefined ? this.currentSlots[2 + q] : '';
      html += `
        <div class="flex flex-col items-center">
          <span class="text-[10px] uppercase font-bold text-slate-400 mb-1">S${q + 1}</span>
          <div class="w-12 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-sm border-2 transition-all ${qVal !== '' ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/30 scale-105' : 'bg-slate-800/80 text-slate-500 border-slate-700'}">
            ${qVal !== '' ? qVal : '-'}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  toggleListening() {
    if (!this.speechSupported) {
      this.showToast('Mikrofon desteği bulunamadı. Google Chrome kullanın.', 'error');
      return;
    }

    if (this.isListening) {
      this.isListening = false;
      try {
        this.recognition.stop();
      } catch (e) {}
      this.updateMicUI(false);
      this.stopAudioVisualizer();
      this.showToast('Mikrofon duraklatıldı.', 'info');
    } else {
      try {
        this.currentSlots = [];
        this.renderLiveSlots();
        this.recognition.start();
        this.isListening = true;
        this.updateMicUI(true);
        this.showToast('Mikrofon açıldı! Öğrencileri sırayla okuyabilirsiniz.', 'success');
      } catch (e) {
        console.error('Mikrofon başlatılamadı:', e);
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
      if (micStatus) micStatus.textContent = '🟢 Mikrofon Açık & Dinliyor';
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
      if (isCountMismatch) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">⚠️ Eksik Soru</span>`;
      } else if (isMismatch) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800" title="Söylenen (${student.statedTotal}) ile soru toplamı (${student.calculatedTotal}) eşit değil!">❌ Toplam Farkı</span>`;
      }

      bodyHtml += `
        <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 ${isMismatch ? 'bg-rose-50/20' : ''}" data-id="${student.id}">
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
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new EOkulSpeadApp();
  window.app = app;
});
