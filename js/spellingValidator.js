// Motor de Validação do Spelling Bee Contest (Regras Red Balloon)
// Regra dos Três Passos (Palavra -> Soletração com SPACE/DOUBLE -> Palavra)

class SpellingValidator {
    constructor() {
        // Mapeamento fonético abrangente das letras em inglês geradas por STT
        this.LETTER_MAP = {
            'a': ['a', 'ay', 'ei', 'ey', 'hey'],
            'b': ['b', 'be', 'bee'],
            'c': ['c', 'see', 'sea', 'si'],
            'd': ['d', 'de', 'dee'],
            'e': ['e', 'ee'],
            'f': ['f', 'ef', 'eff', 'if'],
            'g': ['g', 'gee', 'ji'],
            'h': ['h', 'aitch', 'ach', 'eight', 'eitch', 'hache'],
            'i': ['i', 'eye', 'aye', 'ai'],
            'j': ['j', 'jay', 'jei'],
            'k': ['k', 'kay', 'kei'],
            'l': ['l', 'el', 'ell'],
            'm': ['m', 'em'],
            'n': ['n', 'en', 'an', 'and'],
            'o': ['o', 'oh', 'ou'],
            'p': ['p', 'pe', 'pee', 'pi'],
            'q': ['q', 'cue', 'queue', 'kyu'],
            'r': ['r', 'ar', 'are', 'our'],
            's': ['s', 'es', 'ess'],
            't': ['t', 'te', 'tee', 'tea', 'ti'],
            'u': ['u', 'you', 'yu'],
            'v': ['v', 've', 'vee', 'vi'],
            'w': ['w', 'double u', 'double-u', 'double you', 'doubleyou', 'dabliu'],
            'x': ['x', 'ex', 'axe'],
            'y': ['y', 'why', 'wai', 'uai'],
            'z': ['z', 'zee', 'zed', 'zi']
        };

        // Tokens aceitos para o comando SPACE
        this.SPACE_TOKENS = ['space', 'blank', 'pace', 'place', 'escape', 'espace'];
    }

    /**
     * Valida a transcrição do aluno contra a palavra/expressão esperada
     * @param {string} rawTranscript - Texto transcrito pela Deepgram
     * @param {string} targetWord - Palavra ou frase alvo (ex: "as tasty as", "happy", "sweeter than")
     */
    validate(rawTranscript, targetWord) {
        if (!rawTranscript || !rawTranscript.trim()) {
            return {
                isValid: false,
                reason: 'NO_SPEECH',
                message: 'Não conseguimos ouvir nada. Fale próximo ao microfone.',
                details: {}
            };
        }

        const transcript = rawTranscript.trim().toLowerCase();
        const target = targetWord.trim().toLowerCase();
        const targetWordsList = target.split(/\s+/);
        const hasSpaceRequirement = targetWordsList.length > 1;

        // Normalização de tokens falados
        let tokens = this._tokenize(transcript);

        // 1. Verificar Passo 1 (Palavra inicial dita)
        const initialCheck = this._extractInitialTarget(tokens, target);
        tokens = initialCheck.remainingTokens;

        // 2. Verificar Passo 3 (Palavra final dita)
        const finalCheck = this._extractFinalTarget(tokens, target);
        tokens = finalCheck.remainingTokens;

        // 3. Verificar Passo 2 (Soletração no miolo com SPACE e DOUBLE)
        const spellingCheck = this._validateSpellingTokens(tokens, target, hasSpaceRequirement);

        const hasInitialWord = initialCheck.found;
        const hasFinalWord = finalCheck.found;
        const isSpellingValid = spellingCheck.isValid;

        // Avaliação do status global
        const isFullyValid = isSpellingValid && (hasInitialWord || hasFinalWord || spellingCheck.exactSpellingMatch);

        let feedbackMessage = '';
        let feedbackType = 'success';

        if (isFullyValid) {
            if (hasInitialWord && hasFinalWord) {
                feedbackMessage = `🎉 Perfeito! Você cumpriu os 3 passos: Palavra ➔ Soletração ➔ Palavra!`;
            } else if (hasInitialWord || hasFinalWord) {
                feedbackMessage = `✨ Excelente soletração! Dica: Lembre-se de sempre dizer a palavra no início e no final.`;
            } else {
                feedbackMessage = `✅ Soletração correta! Lembre-se da regra dos 3 passos (Palavra ➔ Soletração ➔ Palavra).`;
            }
        } else {
            feedbackType = 'error';
            if (spellingCheck.missingSpace) {
                feedbackMessage = `⚠️ Você esqueceu de falar "SPACE" entre as palavras da expressão!`;
            } else if (spellingCheck.spellingError) {
                feedbackMessage = `❌ Erro na soletração: ${spellingCheck.errorDetail || 'Verifique as letras e tente novamente.'}`;
            } else if (!hasInitialWord && !hasFinalWord) {
                feedbackMessage = `⚠️ Lembre-se da regra dos 3 passos: Diga a palavra, soletre e repita a palavra!`;
            } else {
                feedbackMessage = `Tente novamente. Palavra esperada: "${targetWord.toUpperCase()}".`;
            }
        }

        return {
            isValid: isFullyValid,
            message: feedbackMessage,
            type: feedbackType,
            details: {
                hasInitialWord,
                hasFinalWord,
                isSpellingValid,
                transcript: rawTranscript,
                expected: targetWord,
                spellingFeedback: spellingCheck
            }
        };
    }

    _tokenize(text) {
        // Substitui traços e pontuações por espaços
        const clean = text.replace(/[-–—.,!?:;"]/g, ' ');
        return clean.split(/\s+/).filter(t => t.length > 0);
    }

    _extractInitialTarget(tokens, target) {
        const targetWords = target.split(/\s+/);
        if (tokens.length >= targetWords.length) {
            const candidate = tokens.slice(0, targetWords.length).join(' ');
            if (this._fuzzyMatch(candidate, target)) {
                return { found: true, remainingTokens: tokens.slice(targetWords.length) };
            }
        }
        return { found: false, remainingTokens: tokens };
    }

    _extractFinalTarget(tokens, target) {
        const targetWords = target.split(/\s+/);
        if (tokens.length >= targetWords.length) {
            const candidate = tokens.slice(tokens.length - targetWords.length).join(' ');
            if (this._fuzzyMatch(candidate, target)) {
                return { found: true, remainingTokens: tokens.slice(0, tokens.length - targetWords.length) };
            }
        }
        return { found: false, remainingTokens: tokens };
    }

    _validateSpellingTokens(tokens, target, hasSpaceRequirement) {
        // Monta a sequência esperada de letras e 'SPACE'
        const expectedSequence = [];
        const words = target.split(/\s+/);

        for (let wIdx = 0; wIdx < words.length; wIdx++) {
            const word = words[wIdx];
            for (let i = 0; i < word.length; i++) {
                expectedSequence.push(word[i]);
            }
            if (wIdx < words.length - 1) {
                expectedSequence.push('SPACE');
            }
        }

        // Converte os tokens falados em letras correspondentes
        const parsedLetters = [];
        let i = 0;
        let usedSpaceToken = false;

        while (i < tokens.length) {
            const token = tokens[i];
            const nextToken = tokens[i + 1] || '';

            // Checagem de DOUBLE <LETTER>
            if (token === 'double' && nextToken) {
                const char = this._identifyLetter(nextToken);
                if (char) {
                    parsedLetters.push(char);
                    parsedLetters.push(char);
                    i += 2;
                    continue;
                }
            }

            // Checagem de SPACE
            if (this.SPACE_TOKENS.includes(token)) {
                parsedLetters.push('SPACE');
                usedSpaceToken = true;
                i++;
                continue;
            }

            // Checagem de letra individual
            const letter = this._identifyLetter(token);
            if (letter) {
                parsedLetters.push(letter);
            } else {
                // Se o token for uma palavra curta ou soletração compacta
                for (const ch of token) {
                    if (ch >= 'a' && ch <= 'z') parsedLetters.push(ch);
                }
            }
            i++;
        }

        // Checagem de espaço obrigatório
        if (hasSpaceRequirement && !usedSpaceToken && parsedLetters.includes('SPACE') === false) {
            // Verifica se o aluno soletrou todas as letras mas esqueceu o space
            const lettersOnlyExpected = expectedSequence.filter(x => x !== 'SPACE').join('');
            const lettersOnlyParsed = parsedLetters.filter(x => x !== 'SPACE').join('');
            if (lettersOnlyExpected === lettersOnlyParsed) {
                return { isValid: false, missingSpace: true, spellingError: true, errorDetail: 'Esqueceu de dizer "SPACE".' };
            }
        }

        // Comparação com a sequência esperada (permitindo com ou sem o token explícito de SPACE se tolerante)
        const parsedStr = parsedLetters.join('');
        const expectedStr = expectedSequence.join('');
        const parsedNoSpace = parsedLetters.filter(x => x !== 'SPACE').join('');
        const expectedNoSpace = expectedSequence.filter(x => x !== 'SPACE').join('');

        const exactMatch = (parsedStr === expectedStr);
        const matchNoSpace = (parsedNoSpace === expectedNoSpace);

        if (exactMatch || matchNoSpace) {
            return {
                isValid: true,
                exactSpellingMatch: exactMatch,
                parsedLetters: parsedLetters
            };
        }

        return {
            isValid: false,
            spellingError: true,
            errorDetail: `Letras identificadas: ${parsedLetters.join(' - ').toUpperCase() || '(nenhuma)'}`,
            parsedLetters: parsedLetters
        };
    }

    _identifyLetter(token) {
        const clean = token.toLowerCase().trim();
        for (const [letter, phoneticList] of Object.entries(this.LETTER_MAP)) {
            if (clean === letter || phoneticList.includes(clean)) {
                return letter;
            }
        }
        return null;
    }

    _fuzzyMatch(spoken, target) {
        const s = spoken.replace(/[^a-z]/g, '');
        const t = target.replace(/[^a-z]/g, '');
        return s === t || s.includes(t) || t.includes(s);
    }
}

window.spellingValidator = new SpellingValidator();
