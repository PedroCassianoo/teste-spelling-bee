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
    /**
     * Transcreve um Blob de áudio gravado do microfone usando Deepgram STT (Nova-2)
     * Injeta contexto prévio (Hinting / Keywords Boosting) para priorizar o gabarito.
     * @param {Blob} audioBlob - Áudio gravado em formato WebM ou WAV
     * @param {string|Object} [targetContext] - Palavra ou objeto da rodada atual para injeção de gabarito
     * @returns {Promise<{transcript: string, confidence: number}>}
     */
    async transcribeAudio(audioBlob, targetContext = '') {
        const apiKey = window.CONFIG.getApiKey();

        if (!apiKey) {
            throw new Error("Chave da API Deepgram não configurada. Por favor, configure sua chave no botão de opções no canto superior direito.");
        }

        const model = window.CONFIG.STT_MODEL || 'nova-2';
        const lang = window.CONFIG.LANGUAGE || 'en';
        
        // Constrói os parâmetros da requisição STT com foco em Keywords da rodada (Fase 2: Cabresto)
        const params = new URLSearchParams();
        const rawTarget = typeof targetContext === 'string' 
            ? targetContext 
            : (targetContext?.word || targetContext?.full_phrase || '');

        if (rawTarget) {
            const buildFn = (typeof window !== 'undefined' && typeof window.buildKeywordsParaRodada === 'function')
                ? window.buildKeywordsParaRodada
                : this._buildKeywordsParaRodada.bind(this);

            const keywords = buildFn(rawTarget);
            console.log(`[Deepgram STT] Injetando ${keywords.length} keywords para "${rawTarget}":`, keywords);
            keywords.forEach(termo => params.append('keywords', termo));
        }

        params.append('model', model);
        params.append('language', lang);
        params.append('punctuate', 'false');
        params.append('smart_format', 'true');

        const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

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
     * Fallback interno caso build-deepgram-keywords.js não esteja disponível
     */
    _buildKeywordsParaRodada(palavraAlvo) {
        if (typeof window !== 'undefined' && typeof window.buildKeywordsParaRodada === 'function') {
            return window.buildKeywordsParaRodada(palavraAlvo);
        }

        const MAX_VARIANTES_POR_LETRA = 3;
        const PESO_LETRA = 2;
        const PESO_PALAVRA_ALVO = 3;
        const PESO_COMANDO = 2;

        const dict = (typeof window !== 'undefined' && window.spellingValidator && window.spellingValidator.dicionarioData)
            ? window.spellingValidator.dicionarioData
            : {};

        const cleanTarget = String(palavraAlvo || '').trim();
        if (!cleanTarget) return [];

        const termos = [];
        termos.push(`${cleanTarget}:${PESO_PALAVRA_ALVO}`);

        const letras = [...new Set(cleanTarget.toUpperCase().match(/[A-Z]/g) || [])];
        for (const letra of letras) {
            const variantes = (dict.letters?.[letra] || []).slice(0, MAX_VARIANTES_POR_LETRA);
            for (const v of variantes) {
                if (v.includes(' ')) continue;
                termos.push(`${v}:${PESO_LETRA}`);
            }
        }

        if (/\s/.test(cleanTarget)) {
            const spaceVars = (dict.commands?.SPACE || ["space", "spice", "pace"]).slice(0, 3);
            for (const v of spaceVars) termos.push(`${v}:${PESO_COMANDO}`);
        }

        if (/([a-z0-9])\1/i.test(cleanTarget)) {
            const doubleVars = (dict.commands?.DOUBLE || ["double", "buble", "bubble"]).slice(0, 3);
            for (const v of doubleVars) termos.push(`${v}:${PESO_COMANDO}`);
        }

        return termos;
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
