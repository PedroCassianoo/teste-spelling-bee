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
        
        // Constrói URL base com parâmetros de transcrição
        const urlObj = new URL('https://api.deepgram.com/v1/listen');
        urlObj.searchParams.set('model', model);
        urlObj.searchParams.set('language', lang);
        urlObj.searchParams.set('smart_format', 'true');
        urlObj.searchParams.set('punctuate', 'false');

        // =========================================================================
        // 1. INJEÇÃO DE CONTEXTO (DEEPGRAM HINTING & KEYWORD BOOSTING)
        // =========================================================================
        if (targetContext) {
            const hints = this._generateHintKeywords(targetContext);
            console.log("[Deepgram STT] Injetando Hints/Keywords contextuais:", hints);

            // Injeta keywords com pesos (boost)
            for (const item of hints.keywords) {
                urlObj.searchParams.append('keywords', `${item.keyword}:${item.boost}`);
            }

            // Injeta termos de busca fonética (search)
            for (const sTerm of hints.searchTerms) {
                urlObj.searchParams.append('search', sTerm);
            }
        }

        const response = await fetch(urlObj.toString(), {
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
     * Gera lista de palavras-chave, nomes fonéticos e comandos com boost para o Deepgram
     * @param {string|Object} targetContext - Palavra/Frase alvo
     * @returns {{ keywords: Array<{keyword: string, boost: number}>, searchTerms: Array<string> }}
     */
    _generateHintKeywords(targetContext) {
        const rawTarget = typeof targetContext === 'string' 
            ? targetContext 
            : (targetContext?.word || targetContext?.full_phrase || '');
        
        const cleanTarget = rawTarget.toLowerCase().replace(/[^a-z\s]/g, '').trim();
        if (!cleanTarget) return { keywords: [], searchTerms: [] };

        const keywords = [];
        const searchTerms = [];
        const addedKw = new Set();

        const addKeyword = (kw, boost) => {
            const k = kw.trim().toLowerCase();
            if (k && !addedKw.has(k)) {
                addedKw.add(k);
                keywords.push({ keyword: k, boost: boost });
            }
        };

        // 1. Frase/Palavra alvo completa com peso máximo (boost: 5)
        addKeyword(cleanTarget, 5);
        searchTerms.push(cleanTarget);

        // 2. Palavras individuais da frase (se composta)
        const words = cleanTarget.split(/\s+/).filter(w => w.length > 0);
        for (const w of words) {
            addKeyword(w, 4);
        }

        // 3. Sequência soletrada com espaços
        // Ex: "taught" -> "t a u g h t" | "as tasty as" -> "a s space t a s t y space a s"
        const spelledParts = [];
        for (let i = 0; i < words.length; i++) {
            const letters = words[i].split('');
            spelledParts.push(letters.join(' '));
            if (i < words.length - 1) {
                spelledParts.push('space');
            }
        }
        const spelledSequence = spelledParts.join(' ');
        addKeyword(spelledSequence, 5);
        searchTerms.push(spelledSequence);

        // 4. Comandos especiais essenciais de Spelling Bee (boost: 4)
        addKeyword('space', 4);
        addKeyword('double', 4);

        // 5. Nomes fonéticos das letras presentes na palavra (evita confusões clássicas como aitch, tea, etc.)
        const letterPhoneMap = {
            'a': ['ay', 'aye'],
            'b': ['bee'],
            'c': ['see', 'sea'],
            'd': ['dee'],
            'e': ['ee'],
            'f': ['eff'],
            'g': ['gee', 'jee'],
            'h': ['aitch', 'eight', 'age'],
            'i': ['eye', 'aye'],
            'j': ['jay'],
            'k': ['kay'],
            'l': ['ell', 'el'],
            'm': ['em'],
            'n': ['en'],
            'o': ['oh'],
            'p': ['pee', 'pea'],
            'q': ['cue', 'queue'],
            'r': ['are', 'ar'],
            's': ['ess', 'as'],
            't': ['tea', 'tee'],
            'u': ['you'],
            'v': ['vee'],
            'w': ['double you', 'double u'],
            'x': ['ex'],
            'y': ['why'],
            'z': ['zee', 'zed']
        };

        const uniqueLetters = new Set(cleanTarget.replace(/\s+/g, '').split(''));
        for (const letter of uniqueLetters) {
            addKeyword(letter, 4);
            const phones = letterPhoneMap[letter] || [];
            for (const p of phones) {
                addKeyword(p, 4);
            }
        }

        return { keywords, searchTerms };
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
