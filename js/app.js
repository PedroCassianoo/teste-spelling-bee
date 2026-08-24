// Controlador Principal do Aplicativo Spelling Bee

class SpellingBeeApp {
    constructor() {
        this.currentIndex = 0;
        this.words = window.WORDS_DATABASE || [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isCompleted = false;

        this.initElements();
        this.attachEvents();
        this.initDatabaseAndRender();
        this.checkApiKeyBadge();
    }

    initElements() {
        this.btnBack = document.getElementById('btn-back');
        this.progressIndicator = document.getElementById('progress-indicator');
        this.btnListen = document.getElementById('btn-listen');
        this.btnMic = document.getElementById('btn-mic');
        this.micStatusText = document.getElementById('mic-status-text');
        this.micIcon = document.getElementById('mic-icon');
        this.btnNext = document.getElementById('btn-next');
        this.feedbackBanner = document.getElementById('feedback-banner');
        this.feedbackText = document.getElementById('feedback-text');

        // Modal de Configuração
        this.btnSettings = document.getElementById('btn-settings');
        this.settingsModal = document.getElementById('settings-modal');
        this.btnSaveKey = document.getElementById('btn-save-key');
        this.btnCloseModal = document.getElementById('btn-close-modal');
        this.apiKeyInput = document.getElementById('api-key-input');
        this.supabaseKeyInput = document.getElementById('supabase-key-input');
        this.keyStatusBadge = document.getElementById('key-status-badge');
    }

    attachEvents() {
        // OUVIR palavra via Deepgram TTS
        this.btnListen.addEventListener('click', () => this.handleListen());

        // Gravar e Transcrever via Deepgram STT
        this.btnMic.addEventListener('click', () => this.toggleRecording());

        // Próxima palavra
        this.btnNext.addEventListener('click', () => this.handleNext());

        // Botão voltar
        this.btnBack.addEventListener('click', () => this.handleBack());

        // Gerenciamento de Modal e API Key
        this.btnSettings.addEventListener('click', () => this.openSettingsModal());
        this.btnCloseModal.addEventListener('click', () => this.closeSettingsModal());
        this.btnSaveKey.addEventListener('click', () => this.saveApiKey());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettingsModal();
        });
    }

    async initDatabaseAndRender() {
        await this.loadWordsFromSupabase();
        this.renderWord();
    }

    async loadWordsFromSupabase() {
        const supabaseUrl = window.CONFIG.SUPABASE_URL;
        const supabaseKey = window.CONFIG.getSupabaseKey();

        if (supabaseUrl && supabaseKey) {
            try {
                const response = await fetch(`${supabaseUrl}/rest/v1/spelling_bee_words?select=*&order=display_order.asc`, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data) && data.length > 0) {
                        this.words = data;
                        console.log("[Supabase] Palavras carregadas do banco remoto:", this.words);
                    }
                }
            } catch (err) {
                console.warn("[Supabase] Falha ao carregar do Supabase remoto, usando banco local.", err);
            }
        }
    }

    getCurrentWord() {
        return this.words[this.currentIndex] || { id: 1, word: "as tasty as", spelling: "a-s [space] t-a-s-t-y [space] a-s", full_phrase: "as tasty as" };
    }

    renderWord() {
        const total = this.words.length;
        const currentNum = this.currentIndex + 1;
        this.progressIndicator.textContent = `${currentNum} / ${total}`;

        // Reset dos estados da interface
        this.isCompleted = false;
        this.setMicState('idle');
        this.hideFeedback();
        
        // Reset estilo do botão Próxima
        this.btnNext.classList.remove('bg-white', 'text-black', 'border-2', 'border-white');
        this.btnNext.classList.add('bg-primary', 'text-background');
    }

    async handleListen() {
        const current = this.getCurrentWord();
        const icon = this.btnListen.querySelector('.material-symbols-outlined');

        try {
            this.btnListen.classList.add('scale-95', 'opacity-80');
            if (icon) icon.classList.add('animate-bounce');
            
            await window.deepgramService.speakWord(current.word);
        } catch (error) {
            console.error("Erro ao reproduzir TTS:", error);
        } finally {
            this.btnListen.classList.remove('scale-95', 'opacity-80');
            if (icon) icon.classList.remove('animate-bounce');
        }
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showFeedback("Seu navegador não suporta captura de microfone.", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            
            const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? { mimeType: 'audio/webm;codecs=opus' }
                : (MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});

            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                await this.processAudio(audioBlob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.setMicState('recording');

        } catch (err) {
            console.error("Erro ao acessar microfone:", err);
            this.showFeedback("Permissão de microfone negada ou indisponível.", "error");
            this.setMicState('idle');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.setMicState('processing');
        }
    }

    async processAudio(audioBlob) {
        try {
            if (!window.CONFIG.hasApiKey()) {
                this.openSettingsModal();
                this.setMicState('idle');
                this.showFeedback("Insira sua chave Deepgram para transcrever o áudio.", "error");
                return;
            }

            const current = this.getCurrentWord();
            const { transcript, confidence } = await window.deepgramService.transcribeAudio(audioBlob, current.word);
            console.log(`[Deepgram STT] Transcrição bruta: "${transcript}" (Confiança: ${confidence})`);

            if (!transcript) {
                this.showFeedback("Não conseguimos ouvir sua fala. Fale mais próximo ao microfone.", "error");
                this.triggerShake();
                this.setMicState('idle');
                return;
            }

            // Validação com o motor oficial (SpellingValidator com Levenshtein & Fonética)
            const validation = window.spellingValidator.validate(transcript, current.word);

            console.log("[SpellingValidator] Resultado detalhado:", validation);

            if (validation.isValid) {
                this.handleSuccess(validation.message, validation.details);
            } else {
                this.handleError(validation.message, validation.details);
            }

        } catch (error) {
            console.error("Erro no processamento do áudio:", error);
            this.showFeedback(error.message || "Erro ao conectar com a API Deepgram.", "error");
            this.triggerShake();
            this.setMicState('idle');
        }
    }

    handleSuccess(message, details) {
        this.isCompleted = true;
        this.setMicState('success');
        
        let fullFeedback = message;
        if (details && details.stringFinal) {
            fullFeedback += `\nSoletração: ${details.stringFinal}`;
        }
        if (details && typeof details.similarity === 'number' && details.similarity < 1) {
            fullFeedback += ` (Precisão: ${Math.round(details.similarity * 100)}%)`;
        }
        
        this.showFeedback(fullFeedback, "success");
        
        this.btnNext.classList.add('animate-pulse');
        setTimeout(() => this.btnNext.classList.remove('animate-pulse'), 2500);
    }

    handleError(message, details) {
        this.isCompleted = false;
        this.setMicState('idle');
        this.triggerShake();

        let fullFeedback = message;
        if (details && details.stringFinal) {
            fullFeedback += `\nDetectado: [${details.stringFinal}]`;
        }
        if (details && typeof details.similarity === 'number' && details.similarity > 0) {
            fullFeedback += ` (Similaridade: ${Math.round(details.similarity * 100)}%)`;
        }

        this.showFeedback(fullFeedback, "error");
    }

    setMicState(state) {
        this.btnMic.classList.remove('animate-pulse-ring', 'animate-glow-success', 'bg-primary', 'text-background', 'border-red-500');

        switch (state) {
            case 'recording':
                this.btnMic.classList.add('bg-primary', 'text-background', 'animate-pulse-ring');
                this.micStatusText.textContent = "Gravando... Clique para finalizar";
                this.micIcon.textContent = "mic";
                break;
            case 'processing':
                this.btnMic.classList.add('opacity-70');
                this.micStatusText.textContent = "Analisando 3 passos com Deepgram...";
                this.micIcon.textContent = "hourglass_empty";
                break;
            case 'success':
                this.btnMic.classList.add('bg-primary', 'text-background', 'animate-glow-success');
                this.micStatusText.textContent = "Acertou! Clique em Próxima";
                this.micIcon.textContent = "check";
                break;
            case 'idle':
            default:
                this.btnMic.classList.add('bg-background', 'text-primary');
                this.micStatusText.textContent = "Clique para falar";
                this.micIcon.textContent = "mic";
                break;
        }
    }

    showFeedback(message, type = "success") {
        if (!this.feedbackBanner || !this.feedbackText) return;

        // Renderiza quebras de linha limpas
        this.feedbackText.innerHTML = message.replace(/\n/g, '<br><span class="text-[11px] opacity-80 mt-1 block">') + (message.includes('\n') ? '</span>' : '');
        this.feedbackBanner.classList.remove('hidden', 'opacity-0');
        
        if (type === 'success') {
            this.feedbackBanner.className = 'w-full max-w-md mx-auto p-4 rounded-2xl border border-primary bg-surface-container-high text-primary text-center font-label-lg text-xs tracking-wider transition-all duration-300 shadow-lg';
        } else {
            this.feedbackBanner.className = 'w-full max-w-md mx-auto p-4 rounded-2xl border border-red-500 bg-surface-container-low text-red-300 text-center font-label-lg text-xs tracking-wider transition-all duration-300 shadow-lg';
        }
    }

    hideFeedback() {
        if (this.feedbackBanner) {
            this.feedbackBanner.classList.add('hidden', 'opacity-0');
        }
    }

    triggerShake() {
        const container = document.querySelector('main');
        if (container) {
            container.classList.add('animate-shake');
            setTimeout(() => container.classList.remove('animate-shake'), 500);
        }
    }

    handleNext() {
        if (this.currentIndex < this.words.length - 1) {
            this.currentIndex++;
            this.renderWord();
        } else {
            this.showFeedback("🎉 Parabéns! Você concluiu todas as 10 palavras do treino!", "success");
            this.progressIndicator.textContent = "10 / 10 Concluído";
        }
    }

    handleBack() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderWord();
        }
    }

    // Modal de Configurações
    openSettingsModal() {
        this.apiKeyInput.value = window.CONFIG.getApiKey();
        if (this.supabaseKeyInput) {
            this.supabaseKeyInput.value = window.CONFIG.getSupabaseKey();
        }
        this.settingsModal.classList.remove('hidden');
        this.settingsModal.classList.add('flex');
    }

    closeSettingsModal() {
        this.settingsModal.classList.add('hidden');
        this.settingsModal.classList.remove('flex');
    }

    saveApiKey() {
        const deepgramKey = this.apiKeyInput.value.trim();
        window.CONFIG.setApiKey(deepgramKey);

        if (this.supabaseKeyInput) {
            const supabaseKey = this.supabaseKeyInput.value.trim();
            window.CONFIG.setSupabaseKey(supabaseKey);
        }

        this.checkApiKeyBadge();
        this.closeSettingsModal();
        this.showFeedback("Chave Deepgram salva com sucesso!", "success");
        this.loadWordsFromSupabase();
    }

    checkApiKeyBadge() {
        if (!this.keyStatusBadge) return;
        const hasKey = window.CONFIG.hasApiKey();
        if (hasKey) {
            this.keyStatusBadge.className = "w-2 h-2 rounded-full bg-green-400 absolute top-1 right-1";
            this.keyStatusBadge.title = "Deepgram API Conectada";
        } else {
            this.keyStatusBadge.className = "w-2 h-2 rounded-full bg-yellow-400 absolute top-1 right-1 animate-ping";
            this.keyStatusBadge.title = "Chave Deepgram Pendente";
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new SpellingBeeApp();
});
