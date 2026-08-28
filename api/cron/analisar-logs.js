// api/cron/analisar-logs.js
// Fase 4: Feedback Loop Automatizado — Cron Job Serverless Vercel
// Analisa logs de erro de spelling com o Gemini ("Juiz Fonético") e promove novas variantes ao atingir 3 ocorrências.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PROMOTION_THRESHOLD = parseInt(process.env.PROMOTION_THRESHOLD || '3', 10);

/**
 * Executa requisição REST ao Supabase
 */
async function supabaseFetch(endpoint, options = {}) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
        throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados nas variáveis de ambiente.");
    }

    const url = `${supabaseUrl}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro Supabase (${response.status} em ${endpoint}): ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

/**
 * Consulta a API do Gemini com saída JSON estruturada
 */
async function classificarComGemini(divergencia) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada.");
    }

    const systemPrompt = `Você é um analista fonético revisando falhas de um motor de reconhecimento de voz (Deepgram) num app de spelling bee em inglês. O aluno é brasileiro, aprendendo inglês.

Você recebe a letra que o aluno deveria ter dito e o token que o motor transcreveu para aquele mesmo instante de fala. Decida:

- FALHA_SISTEMA: o token é uma forma foneticamente plausível de o motor "ouvir" essa letra (nome da letra, homófono, letra crua mal transcrita). O aluno provavelmente disse a letra certa.
- ERRO_ALUNO: o token é foneticamente improvável pra essa letra. O aluno provavelmente disse outra coisa.`;

    const userContent = `Letra esperada: ${divergencia.esperado}
Token transcrito: "${divergencia.token_ouvido}"
Contexto da rodada: palavra "${divergencia.palavra_alvo}"`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: `${systemPrompt}\n\n${userContent}` }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    classificacao: {
                        type: "STRING",
                        enum: ["FALHA_SISTEMA", "ERRO_ALUNO"]
                    },
                    confianca: {
                        type: "STRING",
                        enum: ["alta", "media", "baixa"]
                    },
                    justificativa: {
                        type: "STRING"
                    }
                },
                required: ["classificacao", "confianca", "justificativa"]
            }
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro Gemini API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
        throw new Error("Resposta vazia da API do Gemini.");
    }

    return JSON.parse(candidateText);
}

/**
 * Processa a fila de sugestões e promove se atingir o limiar (ex: 3 ocorrências)
 */
async function registrarOuPromoverSugestao(divergencia, iaResult) {
    const chave = String(divergencia.esperado).trim();
    const variante = String(divergencia.token_ouvido).toLowerCase().trim();
    const tipo = divergencia.tipo || 'letra';

    if (!chave || !variante) return null;

    // 1. Verifica se a sugestão já existe na tabela
    const existing = await supabaseFetch(`dicionario_sugestoes?chave=eq.${encodeURIComponent(chave)}&variante_sugerida=eq.${encodeURIComponent(variante)}&select=*`);

    let sugestao = existing && existing.length > 0 ? existing[0] : null;
    let novaContagem = 1;
    let foiPromovido = false;

    if (sugestao) {
        novaContagem = (sugestao.ocorrencias || 1) + 1;
        foiPromovido = sugestao.promovido;

        // Se atingiu o threshold e ainda não foi promovido
        if (novaContagem >= PROMOTION_THRESHOLD && !foiPromovido) {
            await promoverParaDicionario(chave, tipo, variante);
            foiPromovido = true;
        }

        await supabaseFetch(`dicionario_sugestoes?id=eq.${sugestao.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                ocorrencias: novaContagem,
                promovido: foiPromovido,
                promovido_em: foiPromovido ? new Date().toISOString() : null,
                classificacao_ia: iaResult.classificacao,
                justificativa_ia: iaResult.justificativa
            })
        });
    } else {
        // Primeira ocorrência registrada
        if (PROMOTION_THRESHOLD <= 1) {
            await promoverParaDicionario(chave, tipo, variante);
            foiPromovido = true;
        }

        await supabaseFetch('dicionario_sugestoes', {
            method: 'POST',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                log_id: divergencia.logId || null,
                chave: chave,
                variante_sugerida: variante,
                classificacao_ia: iaResult.classificacao,
                justificativa_ia: iaResult.justificativa,
                ocorrencias: novaContagem,
                promovido: foiPromovido,
                promovido_em: foiPromovido ? new Date().toISOString() : null
            })
        });
    }

    return { chave, variante, ocorrencias: novaContagem, promovido: foiPromovido };
}

/**
 * Adiciona a variante aprovada à tabela dicionario_fonetico
 */
async function promoverParaDicionario(chave, tipo, novaVariante) {
    const rows = await supabaseFetch(`dicionario_fonetico?chave=eq.${encodeURIComponent(chave)}&tipo=eq.${encodeURIComponent(tipo)}&select=*`);
    
    if (rows && rows.length > 0) {
        const item = rows[0];
        const variantesAtuais = Array.isArray(item.variantes) ? item.variantes : [];

        if (!variantesAtuais.includes(novaVariante)) {
            const novasVariantes = [...variantesAtuais, novaVariante];
            await supabaseFetch(`dicionario_fonetico?chave=eq.${encodeURIComponent(chave)}&tipo=eq.${encodeURIComponent(tipo)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    variantes: novasVariantes,
                    atualizado_em: new Date().toISOString()
                })
            });
            console.log(`[Feedback Loop] Variante "${novaVariante}" promovida com sucesso para a chave "${chave}" (${tipo})!`);
        }
    } else {
        // Se a chave não existir na tabela, cria novo registro
        await supabaseFetch('dicionario_fonetico', {
            method: 'POST',
            body: JSON.stringify({
                chave: chave,
                tipo: tipo,
                variantes: [novaVariante],
                atualizado_em: new Date().toISOString()
            })
        });
        console.log(`[Feedback Loop] Nova chave "${chave}" (${tipo}) criada com variante "${novaVariante}"!`);
    }
}

/**
 * Executa o loop de análise do cron
 */
async function executarAnaliseDeLogs() {
    // 1. Busca até 20 logs de erro pendentes
    const pendentes = await supabaseFetch('logs_spelling?resultado=eq.erro&status_analise=eq.pendente&order=criado_em.asc&limit=20&select=*');

    if (!pendentes || pendentes.length === 0) {
        return { status: 'sem_dados', message: 'Nenhum log de erro pendente para processar.' };
    }

    // 2. Extrai divergências posição a posição
    const divergencias = [];
    for (const log of pendentes) {
        const alinhamento = Array.isArray(log.alinhamento) ? log.alinhamento : [];
        for (const item of alinhamento) {
            if (!item.bateu && item.token_ouvido && item.token_ouvido.trim()) {
                divergencias.push({
                    logId: log.id,
                    palavra_alvo: log.palavra_alvo,
                    esperado: item.esperado,
                    tipo: item.tipo || 'letra',
                    token_ouvido: item.token_ouvido
                });
            }
        }
    }

    if (divergencias.length === 0) {
        // Atualiza logs para analisados mesmo sem divergências explícitas
        const ids = pendentes.map(l => l.id);
        await supabaseFetch(`logs_spelling?id=in.(${ids.join(',')})`, {
            method: 'PATCH',
            body: JSON.stringify({ status_analise: 'analisado' })
        });
        return { status: 'concluido', logsProcessados: pendentes.length, divergenciasAnalisadas: 0, promocoes: [] };
    }

    // 3. Paraleliza chamadas ao Gemini em lotes de até 5
    const BATCH_SIZE = 5;
    const classificacoes = [];
    for (let i = 0; i < divergencias.length; i += BATCH_SIZE) {
        const slice = divergencias.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(slice.map(d => classificarComGemini(d)));
        classificacoes.push(...batchResults);
    }

    // 4. Processa os vereditos da IA
    const promocoes = [];
    for (let i = 0; i < classificacoes.length; i++) {
        const res = classificacoes[i];
        const divergencia = divergencias[i];

        if (res.status === 'fulfilled' && res.value) {
            const iaResult = res.value;
            if (iaResult.classificacao === 'FALHA_SISTEMA') {
                const info = await registrarOuPromoverSugestao(divergencia, iaResult);
                if (info) promocoes.push(info);
            }
        } else {
            console.error(`[Feedback Loop] Falha ao analisar divergência "${divergencia.esperado}" vs "${divergencia.token_ouvido}":`, res.reason);
        }
    }

    // 5. Marca os logs como analisados
    const ids = pendentes.map(l => l.id);
    await supabaseFetch(`logs_spelling?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        body: JSON.stringify({ status_analise: 'analisado' })
    });

    return {
        status: 'concluido',
        logsProcessados: pendentes.length,
        divergenciasAnalisadas: divergencias.length,
        promocoesRealizadas: promocoes
    };
}

/**
 * Handler Vercel Serverless (suporta tanto Web Request quanto Node req/res)
 */
export async function GET(request) {
    try {
        const authHeader = request?.headers?.get ? request.headers.get('authorization') : request?.headers?.authorization;
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const resultado = await executarAnaliseDeLogs();
        return new Response(JSON.stringify(resultado), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("[Cron Analisar Logs] Erro na execução:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Fallback compatível com runtime padrão Node.js do Vercel
export default async function handler(req, res) {
    try {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const resultado = await executarAnaliseDeLogs();
        return res.status(200).json(resultado);
    } catch (error) {
        console.error("[Cron Analisar Logs Node] Erro na execução:", error);
        return res.status(500).json({ error: error.message });
    }
}
