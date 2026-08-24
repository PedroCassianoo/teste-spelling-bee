/**
 * Motor de Validação Fonética do Spelling Bee
 * Baseado na documentação oficial: docs/spelling_bee_rules_normalization.md
 * 
 * Executa as 3 etapas de isolamento:
 * 1. Recorte das Extremidades (Trim Target inicial e final)
 * 2. Aplicação do Dicionário De-Para no Miolo (Parsing de STT Alucinações)
 * 3. Comparação de Gabarito (Target Canonical Spelling)
 */

class SpellingValidator {
    constructor() {
        // Dicionário Fonético Oficial De-Para (Tabela 2 do Documento)
        this.PHONETIC_DICTIONARY = {
            'A': ['a', 'ah', 'aye', 'eight', 'ay', 'ei'],
            'B': ['be', 'bee', 'b'],
            'C': ['see', 'sea', 'si', 'c'],
            'D': ['de', 'di', 'thee', 'd', 'dee'],
            'E': ['i', 'he', 'e', 'ee'],
            'F': ['ef', 'half', 'if', 'f', 'eff'],
            'G': ['jee', 'gee', 'g', 'ji'],
            'H': ['aitch', 'age', 'eight', 'h', 'ach', 'eitch', 'hache'],
            'I': ['eye', 'aye', 'ah', 'i'],
            'J': ['jay', 'hey', 'j', 'jei'],
            'K': ['kay', 'ok', 'k', 'kei'],
            'L': ['el', 'hell', 'l', 'ell'],
            'M': ['em', 'am', 'm'],
            'N': ['en', 'an', 'and', 'in', 'n'],
            'O': ['oh', 'owe', 'zero', 'o', 'ou'],
            'P': ['pe', 'pee', 'pea', 'p', 'pi'],
            'Q': ['queue', 'cue', 'q', 'kyu'],
            'R': ['are', 'our', 'ar', 'r'],
            'S': ['as', 'is', 'yes', 'ass', 'es', 's', 'ess'],
            'T': ['tea', 'tee', 'ti', 't'],
            'U': ['you', 'yu', 'u'],
            'V': ['ve', 'vee', 'v', 'vi'],
            'W': ['double you', 'double u', 'double-u', 'w', 'doubleyou', 'dabliu'],
            'X': ['ex', 'axe', 'x'],
            'Y': ['why', 'wai', 'y', 'uai'],
            'Z': ['zee', 'zed', 'c', 'z', 'zi']
        };

        // Comandos Especiais da Tabela 2
        this.SPACE_COMMANDS = ['space', 'pace', 'spice', 'base', 'spay', 'blank'];
        this.DOUBLE_COMMANDS = ['double', 'buble', 'dabble', 'bobble'];
    }

    /**
     * Valida a transcrição bruta do STT contra a palavra/expressão esperada
     * @param {string} rawTranscript - Transcrição bruta vinda da API Deepgram
     * @param {string} targetPhrase - Frase ou palavra alvo (ex: "as tasty as", "happy", "taught")
     */
    validate(rawTranscript, targetPhrase) {
        if (!rawTranscript || !rawTranscript.trim()) {
            return {
                isValid: false,
                reason: 'NO_SPEECH',
                message: 'Não conseguimos ouvir sua fala. Fale próximo ao microfone.',
                details: {}
            };
        }

        const raw = rawTranscript.trim().toLowerCase();
        const target = targetPhrase.trim().toLowerCase();
        const targetWords = target.split(/\s+/);
        const hasSpaceRequirement = targetWords.length > 1;

        // Limpeza básica mantendo as palavras
        const tokens = this._tokenize(raw);

        // =========================================================================
        // PASSO 1: Recorte das Extremidades (Trim Target)
        // =========================================================================
        const trimResult = this._trimTargetExtremities(tokens, targetWords);
        const hasInitialWord = trimResult.hasInitial;
        const hasFinalWord = trimResult.hasFinal;
        const middleTokens = trimResult.middleTokens;

        // =========================================================================
        // PASSO 2: Aplicação do Dicionário no Miolo (Parsing)
        // =========================================================================
        const parsedSequence = this._parseMiddleTokens(middleTokens);

        // =========================================================================
        // PASSO 3: Comparação de Gabarito
        // =========================================================================
        const expectedSequence = this._buildCanonicalSequence(targetWords);
        const comparison = this._compareSequences(parsedSequence, expectedSequence, hasSpaceRequirement);

        // Avaliação global com base nos 3 passos do Spelling Bee
        const isSpellingCorrect = comparison.isMatch;
        const isFullyCompliant = isSpellingCorrect && hasInitialWord && hasFinalWord;
        const isValid = isSpellingCorrect; // Aceita se soletração estiver correta, informando dicas

        let message = '';
        let type = 'success';

        if (isFullyCompliant) {
            message = `🎉 Perfeito! Você cumpriu com maestria os 3 passos: Palavra ➔ Soletração ➔ Palavra!`;
        } else if (isSpellingCorrect) {
            if (!hasInitialWord && !hasFinalWord) {
                message = `✅ Soletração perfeita! Lembre-se da regra de ouro: diga a palavra no início e no fim.`;
            } else if (!hasInitialWord) {
                message = `✅ Soletração correta! Lembre-se de dizer a palavra antes de começar a soletrar.`;
            } else {
                message = `✅ Soletração correta! Lembre-se de repetir a palavra após terminar de soletrar.`;
            }
        } else {
            type = 'error';
            if (comparison.missingSpace) {
                message = `⚠️ Você esqueceu de falar "SPACE" para separar as palavras!`;
            } else if (comparison.errorDetail) {
                message = `❌ ${comparison.errorDetail}`;
            } else {
                message = `❌ Soletração incorreta. Esperado: "${expectedSequence.join(' - ')}"`;
            }
        }

        return {
            isValid: isValid,
            isFullyCompliant: isFullyCompliant,
            type: type,
            message: message,
            details: {
                hasInitialWord,
                hasFinalWord,
                parsedSpelling: parsedSequence.join(' - '),
                expectedSpelling: expectedSequence.join(' - '),
                rawTranscript: rawTranscript,
                comparison: comparison
            }
        };
    }

    _tokenize(text) {
        // Normaliza caracteres mantendo apenas letras e separadores
        const clean = text.replace(/[-–—.,!?:;"]/g, ' ').toLowerCase();
        return clean.split(/\s+/).filter(t => t.length > 0);
    }

    /**
     * Passo 1: Recorta a primeira e a última menção da frase alvo
     */
    _trimTargetExtremities(tokens, targetWords) {
        let currentTokens = [...tokens];
        let hasInitial = false;
        let hasFinal = false;

        const targetLen = targetWords.length;
        const targetStr = targetWords.join(' ');

        // Checagem Inicial
        if (currentTokens.length >= targetLen) {
            const head = currentTokens.slice(0, targetLen).join(' ');
            if (this._fuzzyTargetMatch(head, targetStr)) {
                hasInitial = true;
                currentTokens = currentTokens.slice(targetLen);
            }
        }

        // Checagem Final
        if (currentTokens.length >= targetLen) {
            const tail = currentTokens.slice(currentTokens.length - targetLen).join(' ');
            if (this._fuzzyTargetMatch(tail, targetStr)) {
                hasFinal = true;
                currentTokens = currentTokens.slice(0, currentTokens.length - targetLen);
            }
        }

        return {
            hasInitial,
            hasFinal,
            middleTokens: currentTokens
        };
    }

    /**
     * Passo 2: Aplicação do dicionário De-Para termo a termo no miolo
     */
    _parseMiddleTokens(tokens) {
        const result = [];
        let i = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            const nextToken = tokens[i + 1] || '';
            const twoTokens = `${token} ${nextToken}`.trim();

            // 1. Tratar "double you" / "double u" -> 'W'
            if (twoTokens === 'double you' || twoTokens === 'double u' || twoTokens === 'double-u') {
                result.push('W');
                i += 2;
                continue;
            }

            // 2. Tratar comando DOUBLE + [Letra] (ex: "double" + "tea" -> "TT")
            if (this.DOUBLE_COMMANDS.includes(token) && nextToken) {
                const letter = this._mapTokenToLetter(nextToken);
                if (letter) {
                    result.push(letter);
                    result.push(letter);
                    i += 2;
                    continue;
                }
            }

            // 3. Tratar comando SPACE
            if (this.SPACE_COMMANDS.includes(token)) {
                result.push('SPACE');
                i++;
                continue;
            }

            // 4. Mapeamento termo a termo via Dicionário Fonético
            const letter = this._mapTokenToLetter(token);
            if (letter) {
                result.push(letter);
            } else {
                // Caso a API tenha agrupado caracteres soltos (ex: "cat" soletrado muito rápido)
                for (const char of token) {
                    const mappedChar = this._mapTokenToLetter(char);
                    if (mappedChar) {
                        result.push(mappedChar);
                    }
                }
            }
            i++;
        }

        return result;
    }

    /**
     * Passo 3: Monta a sequência canônica esperada (letras + SPACE)
     */
    _buildCanonicalSequence(targetWords) {
        const expected = [];
        for (let wIdx = 0; wIdx < targetWords.length; wIdx++) {
            const word = targetWords[wIdx];
            for (let cIdx = 0; cIdx < word.length; cIdx++) {
                expected.push(word[cIdx].toUpperCase());
            }
            if (wIdx < targetWords.length - 1) {
                expected.push('SPACE');
            }
        }
        return expected;
    }

    /**
     * Passo 3: Compara a sequência gerada com o gabarito
     */
    _compareSequences(parsedSeq, expectedSeq, hasSpaceRequirement) {
        const parsedStr = parsedSeq.join(' ');
        const expectedStr = expectedSeq.join(' ');

        // 1. Casamento exato com SPACE
        if (parsedStr === expectedStr) {
            return { isMatch: true };
        }

        // 2. Checagem de esquecimento do SPACE
        const parsedNoSpace = parsedSeq.filter(x => x !== 'SPACE').join(' ');
        const expectedNoSpace = expectedSeq.filter(x => x !== 'SPACE').join(' ');

        if (hasSpaceRequirement && parsedNoSpace === expectedNoSpace && !parsedSeq.includes('SPACE')) {
            return {
                isMatch: false,
                missingSpace: true,
                errorDetail: 'Você esqueceu de falar "SPACE" para separar as palavras!'
            };
        }

        // 3. Casamento tolerante (se não era estritamente obrigatório)
        if (parsedNoSpace === expectedNoSpace) {
            return { isMatch: true };
        }

        // 4. Identificação da primeira letra divergente para feedback detalhado
        let errorDetail = '';
        for (let i = 0; i < Math.max(parsedSeq.length, expectedSeq.length); i++) {
            const expectedChar = expectedSeq[i];
            const parsedChar = parsedSeq[i];

            if (expectedChar !== parsedChar) {
                if (!parsedChar) {
                    errorDetail = `Faltou soletrar a partir de "${expectedChar}".`;
                } else if (!expectedChar) {
                    errorDetail = `Letras a mais após o final: "${parsedChar}".`;
                } else {
                    errorDetail = `Identificado "${parsedChar}", mas o correto era "${expectedChar}".`;
                }
                break;
            }
        }

        return {
            isMatch: false,
            errorDetail: errorDetail || `Soletração obtida: [${parsedSeq.join(' - ')}]`
        };
    }

    _mapTokenToLetter(token) {
        const clean = token.toLowerCase().trim();
        for (const [letter, variations] of Object.entries(this.PHONETIC_DICTIONARY)) {
            if (clean === letter.toLowerCase() || variations.includes(clean)) {
                return letter;
            }
        }
        return null;
    }

    _fuzzyTargetMatch(candidate, target) {
        const c = candidate.replace(/[^a-z0-9]/g, '');
        const t = target.replace(/[^a-z0-9]/g, '');
        return c === t || c.includes(t) || t.includes(c);
    }
}

window.spellingValidator = new SpellingValidator();
