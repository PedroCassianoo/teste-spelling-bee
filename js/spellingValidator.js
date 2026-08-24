/**
 * Motor de Validação Fonética e Fuzzy Matching do Spelling Bee
 * 
 * Integra:
 * 1. Pipeline estrito de 4 passos com isolamento de bordas via Regex (Trim Target).
 * 2. Algoritmo de Distância de Levenshtein (Fuzzy Matching com threshold de 85%).
 * 3. Validação Fonética (Soundex, Metaphone e Matriz de Confusão Acústica).
 */

class SpellingValidator {
    constructor() {
        // =========================================================================
        // DICIONÁRIO OFICIAL DE NORMALIZAÇÃO FONÉTICA (DE-PARA)
        // =========================================================================
        this.DICIONARIO = {
            // A
            'a': 'A', 'ah': 'A', 'aye': 'A', 'eight': 'A', 'ay': 'A', 'ei': 'A', 'eigh': 'A', 'hey': 'A',
            // B
            'be': 'B', 'bee': 'B', 'b': 'B',
            // C
            'see': 'C', 'sea': 'C', 'si': 'C', 'c': 'C', 'ce': 'C',
            // D
            'de': 'D', 'di': 'D', 'thee': 'D', 'd': 'D', 'dee': 'D',
            // E
            'i': 'E', 'he': 'E', 'e': 'E', 'ee': 'E', 'ea': 'E',
            // F
            'ef': 'F', 'half': 'F', 'if': 'F', 'f': 'F', 'eff': 'F', 'off': 'F',
            // G
            'jee': 'G', 'gee': 'G', 'g': 'G', 'ji': 'G', 'gi': 'G',
            // H
            'aitch': 'H', 'age': 'H', 'eight': 'H', 'h': 'H', 'ach': 'H', 'eitch': 'H', 'hache': 'H', 'each': 'H', 'edge': 'H', 'etch': 'H',
            // I
            'eye': 'I', 'aye': 'I', 'ah': 'I', 'i': 'I', 'ai': 'I',
            // J
            'jay': 'J', 'hey': 'J', 'j': 'J', 'jei': 'J', 'joy': 'J',
            // K
            'kay': 'K', 'ok': 'K', 'k': 'K', 'kei': 'K', 'ca': 'K',
            // L
            'el': 'L', 'hell': 'L', 'l': 'L', 'ell': 'L', 'al': 'L',
            // M
            'em': 'M', 'am': 'M', 'm': 'M',
            // N
            'en': 'N', 'an': 'N', 'and': 'N', 'in': 'N', 'n': 'N', 'un': 'N',
            // O
            'oh': 'O', 'owe': 'O', 'zero': 'O', 'o': 'O', 'ou': 'O', 'or': 'O',
            // P
            'pe': 'P', 'pee': 'P', 'pea': 'P', 'p': 'P', 'pi': 'P',
            // Q
            'queue': 'Q', 'cue': 'Q', 'q': 'Q', 'kyu': 'Q', 'cute': 'Q',
            // R
            'are': 'R', 'our': 'R', 'ar': 'R', 'r': 'R', 'er': 'R',
            // S (Confusões críticas resolvidas pelo isolamento do miolo)
            'as': 'S', 'is': 'S', 'yes': 'S', 'ass': 'S', 'es': 'S', 's': 'S', 'ess': 'S', 'us': 'S',
            // T
            'tea': 'T', 'tee': 'T', 'ti': 'T', 't': 'T', 'to': 'T',
            // U
            'you': 'U', 'yu': 'U', 'u': 'U', 'ew': 'U',
            // V
            've': 'V', 'vee': 'V', 'v': 'V', 'vi': 'V',
            // W
            'double you': 'W', 'double u': 'W', 'double-u': 'W', 'doubleyou': 'W', 'w': 'W', 'dabliu': 'W',
            // X
            'ex': 'X', 'axe': 'X', 'x': 'X', 'ax': 'X',
            // Y
            'why': 'Y', 'wai': 'Y', 'y': 'Y', 'uai': 'Y', 'wire': 'Y',
            // Z
            'zee': 'Z', 'zed': 'Z', 'z': 'Z', 'zi': 'Z', 'set': 'Z',

            // Comandos Especiais
            'space': 'SPACE', 'pace': 'SPACE', 'spice': 'SPACE', 'base': 'SPACE', 'spay': 'SPACE', 'blank': 'SPACE', 'place': 'SPACE', 'places': 'SPACE',
            'double': 'DOUBLE', 'buble': 'DOUBLE', 'dabble': 'DOUBLE', 'bobble': 'DOUBLE', '2': 'DOUBLE', 'two': 'DOUBLE'
        };

        // Nomes canônicos falados de cada letra em inglês para análise fonética
        this.LETTER_SPOKEN_NAMES = {
            'A': 'ay', 'B': 'bee', 'C': 'see', 'D': 'dee', 'E': 'ee',
            'F': 'eff', 'G': 'gee', 'H': 'aitch', 'I': 'eye', 'J': 'jay',
            'K': 'kay', 'L': 'ell', 'M': 'em', 'N': 'en', 'O': 'oh',
            'P': 'pee', 'Q': 'cue', 'R': 'ar', 'S': 'ess', 'T': 'tee',
            'U': 'you', 'V': 'vee', 'W': 'double you', 'X': 'ex', 'Y': 'why', 'Z': 'zee',
            'SPACE': 'space', 'DOUBLE': 'double'
        };

        // Matriz de Pares Acusticamente Confundíveis (Custo reduzido em substituição)
        this.ACOUSTIC_CONFUSIONS = new Set([
            'H-A', 'A-H',
            'M-N', 'N-M',
            'B-V', 'V-B', 'B-P', 'P-B', 'V-P', 'P-V',
            'T-D', 'D-T',
            'S-C', 'C-S', 'S-Z', 'Z-S', 'C-Z', 'Z-C',
            'K-Q', 'Q-K',
            'G-J', 'J-G',
            'F-S', 'S-F', 'F-V', 'V-F',
            'E-I', 'I-E',
            'U-O', 'O-U', 'U-W', 'W-U'
        ]);

        this.DEFAULT_SIMILARITY_THRESHOLD = 0.85; // 85% de similaridade mínima para aprovação
    }

    // =========================================================================
    // ALGORITMOS DE ANÁLISE FONÉTICA (SOUNDEX & METAPHONE)
    // =========================================================================

    /**
     * Algoritmo Soundex para palavras em inglês
     * Converte uma palavra em código fonético de 4 caracteres (ex: A320)
     */
    soundex(word) {
        if (!word || typeof word !== 'string') return '';
        const clean = word.toUpperCase().replace(/[^A-Z]/g, '');
        if (clean.length === 0) return '';

        const mapping = {
            'B': '1', 'F': '1', 'P': '1', 'V': '1',
            'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
            'D': '3', 'T': '3',
            'L': '4',
            'M': '5', 'N': '5',
            'R': '6'
        };

        let result = clean[0];
        let lastCode = mapping[clean[0]] || '0';

        for (let i = 1; i < clean.length; i++) {
            const char = clean[i];
            const code = mapping[char] || '0';

            if (code !== '0' && code !== lastCode) {
                result += code;
                lastCode = code;
            } else if (code === '0') {
                lastCode = '0';
            }

            if (result.length === 4) break;
        }

        return result.padEnd(4, '0');
    }

    /**
     * Algoritmo Metaphone simplificado para fonética inglesa de nomes de letras
     */
    metaphone(word) {
        if (!word || typeof word !== 'string') return '';
        let str = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!str) return '';

        // Simplificação inicial
        if (str.startsWith('kn') || str.startsWith('gn') || str.startsWith('pn') || str.startsWith('ps') || str.startsWith('wr')) {
            str = str.slice(1);
        }

        let meta = '';
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const next = str[i + 1] || '';
            const prev = str[i - 1] || '';

            if (c === 'b' && i === str.length - 1 && prev === 'm') continue; // silent B in dumb
            if (c === 'c') {
                if (next === 'h') { meta += 'X'; i++; continue; }
                if ('eiy'.includes(next)) { meta += 'S'; continue; }
                meta += 'K';
                continue;
            }
            if (c === 'd') {
                if (next === 'g' && 'eiy'.includes(str[i + 2] || '')) { meta += 'J'; i += 2; continue; }
                meta += 'T';
                continue;
            }
            if (c === 'g') {
                if (next === 'h' && i === str.length - 2) continue;
                if ('eiy'.includes(next)) { meta += 'J'; continue; }
                meta += 'K';
                continue;
            }
            if (c === 'h') {
                if ('aeiou'.includes(next) || i === 0) meta += 'H';
                continue;
            }
            if (c === 'p' && next === 'h') { meta += 'F'; i++; continue; }
            if (c === 's' && next === 'h') { meta += 'X'; i++; continue; }
            if (c === 't') {
                if (next === 'h') { meta += '0'; i++; continue; }
                if (next === 'c' && str[i + 2] === 'h') { meta += 'X'; i += 2; continue; }
                meta += 'T';
                continue;
            }
            if (c === 'v') { meta += 'F'; continue; }
            if (c === 'x') { meta += 'KS'; continue; }
            if (c === 'z') { meta += 'S'; continue; }
            if ('bfjklmnr'.includes(c)) { meta += c.toUpperCase(); continue; }
            if ('aeiou'.includes(c) && i === 0) { meta += c.toUpperCase(); continue; }
        }

        return meta;
    }

    // =========================================================================
    // ALGORITMO DE DISTÂNCIA DE LEVENSHTEIN & MATRIZ ACÚSTICA PONDERADA
    // =========================================================================

    /**
     * Calcula o custo de substituição acústica entre dois tokens de letras
     */
    _getAcousticSubstitutionCost(t1, t2) {
        if (t1 === t2) return 0.0;
        
        // Se ambos são letras e formam par de confusão acústica clássica
        const pair = `${t1}-${t2}`;
        if (this.ACOUSTIC_CONFUSIONS.has(pair)) {
            return 0.2; // Penalidade mínima para gêmeos acústicos (H vs A, M vs N, etc.)
        }

        // Se os nomes fonéticos falados possuem mesmo Soundex ou Metaphone
        const name1 = this.LETTER_SPOKEN_NAMES[t1] || t1;
        const name2 = this.LETTER_SPOKEN_NAMES[t2] || t2;
        if (this.soundex(name1) === this.soundex(name2) || this.metaphone(name1) === this.metaphone(name2)) {
            return 0.25;
        }

        return 1.0;
    }

    /**
     * Calcula a Distância de Levenshtein Ponderada Foneticamente entre arrays de tokens
     * @param {Array<string>} detected 
     * @param {Array<string>} target 
     * @returns {number} Distância de edição ponderada
     */
    weightedLevenshteinDistance(detected, target) {
        const m = detected.length;
        const n = target.length;

        if (m === 0) return n;
        if (n === 0) return m;

        const dp = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = this._getAcousticSubstitutionCost(detected[i - 1], target[j - 1]);
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1.0,           // Deleção
                    dp[i][j - 1] + 1.0,           // Inserção
                    dp[i - 1][j - 1] + cost       // Substituição ponderada
                );
            }
        }

        return dp[m][n];
    }

    /**
     * Distância padrão de Levenshtein (strings ou arrays)
     */
    levenshteinDistance(s1, s2) {
        const arr1 = Array.isArray(s1) ? s1 : s1.split('');
        const arr2 = Array.isArray(s2) ? s2 : s2.split('');
        const m = arr1.length;
        const n = arr2.length;

        if (m === 0) return n;
        if (n === 0) return m;

        const prev = new Int32Array(n + 1);
        const curr = new Int32Array(n + 1);

        for (let j = 0; j <= n; j++) prev[j] = j;

        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = arr1[i - 1] === arr2[j - 1] ? 0 : 1;
                curr[j] = Math.min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + cost
                );
            }
            prev.set(curr);
        }

        return curr[n];
    }

    /**
     * Calcula similaridade de Levenshtein entre duas strings de palavras completas
     * @param {string} str1 
     * @param {string} str2 
     * @returns {number} Similaridade de 0.0 a 1.0
     */
    calculateWordSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        
        if (s1 === s2) return 1.0;
        if (s1.includes(s2)) return 0.95; // O prefixo/sufixo contém a frase alvo completa

        const maxLen = Math.max(s1.length, s2.length);
        if (maxLen === 0) return 1.0;

        const dist = this.levenshteinDistance(s1, s2);
        return Math.max(0, 1 - (dist / maxLen));
    }

    /**
     * Tokeniza rastreando os índices de origem em rawWords e diferenciando palavras inteiras de letras
     * @param {string} rawText 
     * @returns {{ rawWords: Array<string>, tokens: Array<string>, wordIndices: Array<{ startWord: number, endWord: number, isWholeWord: boolean }> }}
     */
    tokenizeWithIndices(rawText) {
        if (!rawText || typeof rawText !== 'string') return { rawWords: [], tokens: [], wordIndices: [] };
        const cleanStr = (str) => str.toLowerCase().replace(/[-–—.,!?:;"]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleaned = cleanStr(rawText);
        const rawWords = cleaned.split(/\s+/).filter(t => t.length > 0);
        
        const tokens = [];
        const wordIndices = [];
        let i = 0;

        while (i < rawWords.length) {
            const token = rawWords[i];
            const nextToken = rawWords[i + 1] || '';
            const compoundToken = `${token} ${nextToken}`.trim();

            // 1. Tratar "double you" / "double u" -> 'W'
            if (this.DICIONARIO[compoundToken] === 'W') {
                tokens.push('W');
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                i += 2;
                continue;
            }

            // 2. Tratar comando DOUBLE + [Letra] (ex: "double" + "tea" -> "T", "T")
            if (this.DICIONARIO[token] === 'DOUBLE' && nextToken) {
                const mappedLetter = this.DICIONARIO[nextToken] || nextToken.toUpperCase();
                tokens.push(mappedLetter);
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                tokens.push(mappedLetter);
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                i += 2;
                continue;
            }

            // 3. Aplicação do Dicionário De-Para no Token
            if (this.DICIONARIO[token]) {
                tokens.push(this.DICIONARIO[token]);
                wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
            } else if (token.length === 1) {
                tokens.push(token.toUpperCase());
                wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
            } else {
                // É uma palavra inteira (não é letra isolada nem comando de soletração)
                // Fallback fonético para possíveis nomes de letras
                let matchedLetter = null;
                const tokenSound = this.soundex(token);
                const tokenMeta = this.metaphone(token);

                for (const [letra, spoken] of Object.entries(this.LETTER_SPOKEN_NAMES)) {
                    if (this.soundex(spoken) === tokenSound || this.metaphone(spoken) === tokenMeta) {
                        matchedLetter = letra;
                        break;
                    }
                }

                if (matchedLetter) {
                    tokens.push(matchedLetter);
                    wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
                } else {
                    // Palavra inteira pronunciada
                    for (const ch of token) {
                        const mappedCh = this.DICIONARIO[ch] || ch.toUpperCase();
                        tokens.push(mappedCh);
                        wordIndices.push({ startWord: i, endWord: i, isWholeWord: true });
                    }
                }
            }
            i++;
        }

        return { rawWords, tokens, wordIndices };
    }

    /**
     * Tokeniza e mapeia foneticamente todo o fluxo transcrito pelo STT (compatibilidade retroativa)
     * @param {string} rawText 
     * @returns {Array<string>} Tokens normalizados
     */
    tokenize(rawText) {
        return this.tokenizeWithIndices(rawText).tokens;
    }

    /**
     * Calcula a similaridade fonética normalizada entre 0.0 (0%) e 1.0 (100%)
     */
    calculateSimilarity(detectedTokens, targetTokens) {
        const maxLen = Math.max(detectedTokens.length, targetTokens.length);
        if (maxLen === 0) return 1.0;

        // Similaridade Fonética Ponderada nos Tokens (considerando matriz acústica e SPACE)
        const weightedDist = this.weightedLevenshteinDistance(detectedTokens, targetTokens);
        return Math.max(0, 1 - (weightedDist / maxLen));
    }

    // =========================================================================
    // VALIDAÇÃO ESTRITA DO SPELLING BEE (PALAVRA + SOLETRAÇÃO + PALAVRA)
    // =========================================================================

    /**
     * Validação Rigorosa do Spelling Bee via Fatiamento por Âncora
     * @param {string} transcricaoStt - Retorno bruto do STT (Deepgram)
     * @param {string} palavraAlvo - Palavra/Frase alvo do gabarito (ex: "as tasty as", "taught")
     * @param {Object} [options] - Opções de validação (threshold de soletração: 0.85, bordas: 0.70)
     */
    validate(transcricaoStt, palavraAlvo, options = {}) {
        const threshold = typeof options.threshold === 'number' ? options.threshold : this.DEFAULT_SIMILARITY_THRESHOLD;
        const edgeThreshold = typeof options.edgeThreshold === 'number' ? options.edgeThreshold : 0.70;

        if (!transcricaoStt || !transcricaoStt.trim()) {
            return {
                isValid: false,
                isFullyCompliant: false,
                reason: 'NO_SPEECH',
                message: 'Não conseguimos capturar sua voz. Fale próximo ao microfone.',
                details: {}
            };
        }

        const cleanStr = (str) => str.toLowerCase().replace(/[-–—.,!?:;"]/g, ' ').replace(/\s+/g, ' ').trim();
        const rawText = cleanStr(transcricaoStt);
        const target = cleanStr(palavraAlvo);

        // 1. Tokenização com rastreamento de índices de palavras
        const { rawWords, tokens, wordIndices } = this.tokenizeWithIndices(rawText);
        const gabaritoArray = this._buildGabarito(palavraAlvo);
        const stringGabarito = gabaritoArray.join(' - ');

        const targetWords = palavraAlvo.trim().split(/\s+/);
        const hasSpaceRequirement = targetWords.length > 1;
        const noSpaceExpected = gabaritoArray.filter(x => x !== 'SPACE').join('');

        // 2. ENCONTRAR TODOS OS CANDIDATOS A ÂNCORA DE SOLETRAÇÃO (Miolo)
        const targetLen = gabaritoArray.length;
        const minWindow = Math.max(1, targetLen - (hasSpaceRequirement ? 4 : 2));
        const maxWindow = Math.min(tokens.length, targetLen + 2);

        let candidates = [];
        let missingSpaceCandidate = null;

        // Varre todas as janelas possíveis
        for (let w = minWindow; w <= maxWindow; w++) {
            for (let i = 0; i <= tokens.length - w; i++) {
                const windowSlice = tokens.slice(i, i + w);
                const windowIndices = wordIndices.slice(i, i + w);

                // Uma janela de soletração NÃO pode conter palavras inteiras pronunciadas (isWholeWord)
                const containsWholeWords = windowIndices.some(idx => idx.isWholeWord);
                if (containsWholeWords && rawWords.length > 1) {
                    continue;
                }

                const sim = this.calculateSimilarity(windowSlice, gabaritoArray);
                const startWord = wordIndices[i]?.startWord ?? 0;
                const endWord = wordIndices[i + w - 1]?.endWord ?? rawWords.length - 1;

                // Verifica se é uma soletração correta mas sem SPACE
                const noSpaceMatched = windowSlice.filter(x => x !== 'SPACE').join('');
                const matchNoSpace = (noSpaceMatched === noSpaceExpected);
                if (hasSpaceRequirement && !windowSlice.includes('SPACE') && matchNoSpace) {
                    missingSpaceCandidate = {
                        startIndex: i,
                        endIndex: i + w,
                        matchedTokens: windowSlice,
                        similarity: sim
                    };
                }

                if (sim >= threshold) {
                    const prefixWords = rawWords.slice(0, startWord);
                    const suffixWords = rawWords.slice(endWord + 1);
                    const prefixText = prefixWords.join(' ').trim();
                    const suffixText = suffixWords.join(' ').trim();

                    const prefixSim = prefixText ? this.calculateWordSimilarity(prefixText, target) : 0;
                    const suffixSim = suffixText ? this.calculateWordSimilarity(suffixText, target) : 0;

                    let totalScore = sim * 100;
                    if (prefixSim >= edgeThreshold) totalScore += 30;
                    if (suffixSim >= edgeThreshold) totalScore += 30;

                    candidates.push({
                        startIndex: i,
                        endIndex: i + w,
                        matchedTokens: windowSlice,
                        similarity: sim,
                        startWord,
                        endWord,
                        prefixText,
                        suffixText,
                        prefixSim,
                        suffixSim,
                        totalScore
                    });
                }
            }
        }

        // Se encontrou candidato com falta de SPACE e nenhum candidato completo
        if (candidates.length === 0 && missingSpaceCandidate) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: missingSpaceCandidate.similarity,
                type: 'error',
                reason: 'MISSING_SPACE',
                message: `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`,
                details: {
                    similarity: missingSpaceCandidate.similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: missingSpaceCandidate.matchedTokens,
                    stringFinal: missingSpaceCandidate.matchedTokens.join(' - '),
                    stringGabarito: stringGabarito
                }
            };
        }

        // Se nenhum candidato de soletração atingiu o threshold (85%)
        if (candidates.length === 0) {
            let bestSim = 0;
            let bestWindow = tokens;
            for (let w = minWindow; w <= maxWindow; w++) {
                for (let i = 0; i <= tokens.length - w; i++) {
                    const slice = tokens.slice(i, i + w);
                    const s = this.calculateSimilarity(slice, gabaritoArray);
                    if (s > bestSim) {
                        bestSim = s;
                        bestWindow = slice;
                    }
                }
            }

            const pct = Math.round(bestSim * 100);
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: bestSim,
                type: 'error',
                reason: 'SPELLING_ERROR',
                message: `❌ Erro na soletração (Similaridade: ${pct}%). Esperado: [${stringGabarito}]`,
                details: {
                    similarity: bestSim,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: bestWindow,
                    stringFinal: bestWindow.join(' - '),
                    stringGabarito: stringGabarito
                }
            };
        }

        // Ordena os candidatos pela maior pontuação total (melhor encaixe de soletração + bordas)
        candidates.sort((a, b) => b.totalScore - a.totalScore);
        const bestCandidate = candidates[0];

        const {
            matchedTokens,
            similarity,
            prefixText,
            suffixText,
            prefixSim,
            suffixSim
        } = bestCandidate;

        const stringFinalExtraida = matchedTokens.join(' - ');

        // 3. VERIFICAÇÃO DE ESPAÇO EM EXPRESSÕES COMPOSTAS
        const noSpaceMatched = matchedTokens.filter(x => x !== 'SPACE').join('');
        const matchNoSpace = (noSpaceMatched === noSpaceExpected);
        const missingSpaceDetected = hasSpaceRequirement && !matchedTokens.includes('SPACE') && matchNoSpace;

        if (missingSpaceDetected) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_SPACE',
                message: `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`,
                details: {
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito
                }
            };
        }

        // 4. FATIAMENTO POR ÂNCORA & VERIFICAÇÃO DAS BORDAS (Prefixo e Sufixo >= 70%)
        const temInicio = prefixText.length > 0 && prefixSim >= edgeThreshold;
        const temFim = suffixText.length > 0 && suffixSim >= edgeThreshold;

        // 5. REGRAS DE NEGÓCIO ESTRITAS (Bloqueios Obrigatórios dos 3 Passos)
        if (!temInicio && !temFim) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_BOTH_WORDS',
                message: `❌ Reprovado: Você esqueceu de falar a palavra no início e no final.`,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito
                }
            };
        }

        if (!temInicio) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_INITIAL_WORD',
                message: `❌ Reprovado: Faltou falar a palavra antes de soletrar.`,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito
                }
            };
        }

        if (!temFim) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_FINAL_WORD',
                message: `❌ Reprovado: Faltou falar a palavra para finalizar.`,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito
                }
            };
        }

        // 6. APROVAÇÃO 100% RIGOROSA (Palavra + Soletração + Palavra)
        return {
            isValid: true,
            isFullyCompliant: true,
            similarity: similarity,
            type: 'success',
            reason: 'APPROVED_3_STEPS',
            message: `🎉 Perfeito! Executou os 3 passos rigorosamente: Palavra ➔ Soletração ➔ Palavra!`,
            details: {
                temInicio,
                temFim,
                prefixText,
                suffixText,
                prefixSim,
                suffixSim,
                similarity: similarity,
                textoOriginal: rawText,
                arrayLetrasDetectadas: tokens,
                arrayLetrasCasadas: matchedTokens,
                stringFinal: stringFinalExtraida,
                stringGabarito: stringGabarito
            }
        };
    }

    _buildGabarito(palavraAlvo) {
        const words = palavraAlvo.trim().split(/\s+/);
        const gabarito = [];

        for (let wIdx = 0; wIdx < words.length; wIdx++) {
            const word = words[wIdx].replace(/[^a-zA-Z]/g, '');
            for (let cIdx = 0; cIdx < word.length; cIdx++) {
                gabarito.push(word[cIdx].toUpperCase());
            }
            if (wIdx < words.length - 1) {
                gabarito.push('SPACE');
            }
        }
        return gabarito;
    }
}

if (typeof window !== 'undefined') {
    window.SpellingValidator = SpellingValidator;
    window.spellingValidator = new SpellingValidator();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpellingValidator;
}
