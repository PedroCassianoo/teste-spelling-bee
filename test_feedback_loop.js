// test_feedback_loop.js
// Testes automatizados para a Fase 4: Feedback Loop & Alinhamento de Letras

const SpellingValidator = require('./js/spellingValidator.js');
const { buildKeywordsParaRodada } = require('./build-deepgram-keywords.js');

console.log("==================================================================");
console.log("    TESTES AUTOMATIZADOS - FASE 4: FEEDBACK LOOP & ALINHAMENTO    ");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function assert(description, condition, extraInfo = '') {
    if (condition) {
        console.log(`  ✅ [PASS] ${description}`);
        passed++;
    } else {
        console.error(`  ❌ [FAIL] ${description} ${extraInfo}`);
        failed++;
    }
}

const validator = new SpellingValidator();

// -----------------------------------------------------------------------------
// 1. Teste de Alinhamento Letra a Letra para Acerto Completo
// -----------------------------------------------------------------------------
console.log("--- 1. Alinhamento Letra a Letra (Acerto Completo: 'taught') ---");
{
    const res = validator.validate("taught t a u g h t taught", "taught");
    assert("Validação de 'taught' é válida", res.isValid === true);
    assert("Retorna array de alinhamento", Array.isArray(res.alinhamento) && res.alinhamento.length === 6);

    const alinhamento = res.alinhamento || [];
    assert("Posição 0 (T) bateu", alinhamento[0]?.esperado === 'T' && alinhamento[0]?.bateu === true);
    assert("Posição 1 (A) bateu", alinhamento[1]?.esperado === 'A' && alinhamento[1]?.bateu === true);
    assert("Posição 2 (U) bateu", alinhamento[2]?.esperado === 'U' && alinhamento[2]?.bateu === true);
    assert("Posição 3 (G) bateu", alinhamento[3]?.esperado === 'G' && alinhamento[3]?.bateu === true);
    assert("Posição 4 (H) bateu", alinhamento[4]?.esperado === 'H' && alinhamento[4]?.bateu === true);
    assert("Posição 5 (T) bateu", alinhamento[5]?.esperado === 'T' && alinhamento[5]?.bateu === true);
}

// -----------------------------------------------------------------------------
// 2. Teste de Alinhamento Letra a Letra com Divergência Específica (Ex: 'apple' com 'kay')
// -----------------------------------------------------------------------------
console.log("\n--- 2. Alinhamento com Divergência Específica ('apple' com 'kay' na 2ª letra) ---");
{
    const res = validator.validate("apple ay kay pee el i apple", "apple");
    const alinhamento = res.alinhamento || [];
    
    assert("Alinhamento gerado possui 5 itens", alinhamento.length === 5);
    assert("Posição 0 (A): esperado 'A', token_ouvido 'ay', bateu true", 
        alinhamento[0]?.esperado === 'A' && alinhamento[0]?.token_ouvido === 'ay' && alinhamento[0]?.bateu === true);
    assert("Posição 1 (P): esperado 'P', token_ouvido 'kay', bateu false", 
        alinhamento[1]?.esperado === 'P' && alinhamento[1]?.token_ouvido === 'kay' && alinhamento[1]?.bateu === false);
    assert("Posição 2 (P): esperado 'P', token_ouvido 'pee', bateu true", 
        alinhamento[2]?.esperado === 'P' && alinhamento[2]?.token_ouvido === 'pee' && alinhamento[2]?.bateu === true);
    assert("Posição 3 (L): esperado 'L', token_ouvido 'el', bateu true", 
        alinhamento[3]?.esperado === 'L' && alinhamento[3]?.token_ouvido === 'el' && alinhamento[3]?.bateu === true);
    assert("Posição 4 (E): esperado 'E', token_ouvido 'i', bateu true", 
        alinhamento[4]?.esperado === 'E' && alinhamento[4]?.token_ouvido === 'i' && alinhamento[4]?.bateu === true);
}

// -----------------------------------------------------------------------------
// 3. Teste de Alinhamento com Expressão Composta & Comando SPACE ('as tasty as')
// -----------------------------------------------------------------------------
console.log("\n--- 3. Alinhamento em Expressão Composta ('as tasty as') ---");
{
    const res = validator.validate("as tasty as a s space t a s t y space a s as tasty as", "as tasty as");
    assert("Validação de 'as tasty as' é válida", res.isValid === true);

    const alinhamento = res.alinhamento || [];
    const spaces = alinhamento.filter(item => item.esperado === 'SPACE');
    assert("Identificou exatamente 2 comandos SPACE", spaces.length === 2);
    assert("Tipo do comando SPACE é 'comando'", spaces[0]?.tipo === 'comando' && spaces[0]?.bateu === true);
}

// -----------------------------------------------------------------------------
// 4. Teste de Conversão e Carga do Formato da Tabela Supabase para o Dicionário
// -----------------------------------------------------------------------------
console.log("\n--- 4. Carga do Dicionário a partir das Linhas da Tabela Supabase ---");
{
    const mockSupabaseRows = [
        { chave: 'A', tipo: 'letra', variantes: ['a', 'ay', 'ah', 'ei_custom'] },
        { chave: '0', tipo: 'digito', variantes: ['0', 'zero', 'oh'] },
        { chave: 'SPACE', tipo: 'comando', variantes: ['space', 'spice', 'pace'] },
        { chave: 'AS', tipo: 'fusao_bigrama', variantes: ['as'] },
        { chave: 'M', tipo: 'confusao_acustica', variantes: ['N'] }
    ];

    const dictData = {
        letters: {},
        digits: {},
        commands: {},
        bigram_fusions: {},
        acoustic_confusions: {}
    };

    for (const row of mockSupabaseRows) {
        if (row.tipo === 'letra') dictData.letters[row.chave] = row.variantes;
        else if (row.tipo === 'digito') dictData.digits[row.chave] = row.variantes;
        else if (row.tipo === 'comando') dictData.commands[row.chave] = row.variantes;
        else if (row.tipo === 'fusao_bigrama') dictData.bigram_fusions[row.chave] = row.variantes;
        else if (row.tipo === 'confusao_acustica') dictData.acoustic_confusions[row.chave] = row.variantes;
    }

    const testValidator = new SpellingValidator();
    testValidator.loadDictionary(dictData);

    assert("Reconhece a nova variante 'ei_custom' como letra A", testValidator.DICIONARIO['ei_custom'] === 'A');
    assert("Reconhece comando SPACE", testValidator.DICIONARIO['space'] === 'SPACE');
}

// -----------------------------------------------------------------------------
// 5. Teste da Lógica de Promoção da Fila de Sugestões (Threshold = 3)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Simulação da Fila de Sugestões (Promoção com 3 Ocorrências) ---");
{
    const THRESHOLD = 3;
    const sugestoesStore = new Map();
    const dicionarioStore = {
        'P': ['p', 'pee', 'pea', 'pe']
    };

    function simularOcorrencia(chave, variante, iaDecisao) {
        if (iaDecisao !== 'FALHA_SISTEMA') return null;
        
        const key = `${chave}:${variante}`;
        let item = sugestoesStore.get(key);
        if (!item) {
            item = { chave, variante, ocorrencias: 1, promovido: false };
        } else {
            item.ocorrencias += 1;
        }

        if (item.ocorrencias >= THRESHOLD && !item.promovido) {
            item.promovido = true;
            if (!dicionarioStore[chave].includes(variante)) {
                dicionarioStore[chave].push(variante);
            }
        }

        sugestoesStore.set(key, item);
        return item;
    }

    // 1ª ocorrência
    const o1 = simularOcorrencia('P', 'pii', 'FALHA_SISTEMA');
    assert("1ª ocorrência registrada (ocorrencias = 1, não promovido)", o1.ocorrencias === 1 && o1.promovido === false);
    assert("Dicionário ainda não contém 'pii'", !dicionarioStore['P'].includes('pii'));

    // 2ª ocorrência
    const o2 = simularOcorrencia('P', 'pii', 'FALHA_SISTEMA');
    assert("2ª ocorrência registrada (ocorrencias = 2, não promovido)", o2.ocorrencias === 2 && o2.promovido === false);
    assert("Dicionário ainda não contém 'pii'", !dicionarioStore['P'].includes('pii'));

    // 3ª ocorrência -> Promoção Automática
    const o3 = simularOcorrencia('P', 'pii', 'FALHA_SISTEMA');
    assert("3ª ocorrência dispara promoção (ocorrencias = 3, promovido = true)", o3.ocorrencias === 3 && o3.promovido === true);
    assert("Dicionário foi atualizado e agora contém 'pii'", dicionarioStore['P'].includes('pii'));
}

console.log("\n==================================================================");
console.log(` RESULTADO FINAL: ${passed} passaram, ${failed} falharam.`);
console.log("==================================================================");

if (failed > 0) {
    process.exit(1);
}
