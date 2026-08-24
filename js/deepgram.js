// Módulo de integração com a API Deepgram (TTS & STT)

class DeepgramService {
    constructor() {
        this.audioCache = new Map(); // Cache de áudios TTS gerados
        this.currentAudio = null;
    }

    /**
     * Reproduz o áudio de uma palavra usando Deepgram TTS (Aura)
     * @param {string} text - Palavra ou texto a ser falado
     * @returns {Promise<void>}
     */
    async speakWord(text) {
        const apiKey = window.CONFIG.getApiKey();

        // Se não houver chave configurada, usa fallback nativo (SpeechSynthesis)
        if (!apiKey) {
            console.warn("[Deepgram] Chave API não configurada. Usando síntese de voz nativa do navegador como fallback.");
            return this._nativeSpeechSynthesis(text);
        }

        // Interrompe áudio anterior se estiver tocando
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }

        // Verifica no cache
        const cleanText = text.trim().toLowerCase();
        if (this.audioCache.has(cleanText)) {
            const cachedUrl = this.audioCache.get(cleanText);
            return this._playAudioUrl(cachedUrl);
        }

        const model = window.CONFIG.TTS_MODEL || 'aura-asteria-en';
        const url = `https://api.deepgram.com/v1/speak?model=${model}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.err_msg || `Falha no TTS Deepgram (Status ${response.status})`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            this.audioCache.set(cleanText, audioUrl);

            return this._playAudioUrl(audioUrl);
        } catch (error) {
            console.error("[Deepgram TTS Error]:", error);
            // Fallback sutil em caso de erro na rede ou chave inválida
            console.info("[Deepgram] Recorrendo ao fallback nativo.");
            return this._nativeSpeechSynthesis(text);
        }
    }

    /**
     * Transcreve um Blob de áudio gravado do microfone usando Deepgram STT (Nova-2)
     * @param {Blob} audioBlob - Áudio gravado em formato WebM ou WAV
     * @returns {Promise<{transcript: string, confidence: number}>}
     */
    async transcribeAudio(audioBlob) {
        const apiKey = window.CONFIG.getApiKey();

        if (!apiKey) {
            throw new Error("Chave da API Deepgram não configurada. Por favor, configure sua chave no botão de opções no canto superior direito.");
        }

        const model = window.CONFIG.STT_MODEL || 'nova-2';
        const lang = window.CONFIG.LANGUAGE || 'en';
        const url = `https://api.deepgram.com/v1/listen?model=${model}&language=${lang}&smart_format=true&punctuate=false`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': audioBlob.type || 'audio/webm'
            },
            body: audioBlob
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.err_msg || `Erro na transcrição Deepgram (Status ${response.status})`);
        }

        const result = await response.json();
        const alternatives = result?.results?.channels?.[0]?.alternatives?.[0];
        
        return {
            transcript: (alternatives?.transcript || "").trim(),
            confidence: alternatives?.confidence || 0
        };
    }

    /**
     * Reproduz uma URL de áudio
     */
    _playAudioUrl(audioUrl) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);
            this.currentAudio = audio;
            audio.onended = () => resolve();
            audio.onerror = (e) => reject(e);
            audio.play().catch(reject);
        });
    }

    /**
     * Fallback para navegadores sem chave Deepgram
     */
    _nativeSpeechSynthesis(text) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) {
                resolve();
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
        });
    }
}

window.deepgramService = new DeepgramService();
