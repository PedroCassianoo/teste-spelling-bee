// Configurações do Sistema, Deepgram e Supabase

const CONFIG = {
    // Chave da API Deepgram (TTS/STT)
    DEEPGRAM_API_KEY: '',
    
    // Modelos padrão da Deepgram
    TTS_MODEL: 'aura-asteria-en',
    STT_MODEL: 'nova-2',
    LANGUAGE: 'en',

    // Configurações do Supabase
    SUPABASE_URL: 'https://huposeqxiumvexadrylt.supabase.co',
    SUPABASE_ANON_KEY: '',

    // Deepgram Key Management
    getApiKey() {
        return localStorage.getItem('DEEPGRAM_API_KEY') || this.DEEPGRAM_API_KEY || '';
    },
    setApiKey(key) {
        if (key && key.trim() !== '') {
            localStorage.setItem('DEEPGRAM_API_KEY', key.trim());
        } else {
            localStorage.removeItem('DEEPGRAM_API_KEY');
        }
    },
    hasApiKey() {
        return Boolean(this.getApiKey() && this.getApiKey().trim().length > 0);
    },

    // Supabase Anon Key Management
    getSupabaseKey() {
        return localStorage.getItem('SUPABASE_ANON_KEY') || this.SUPABASE_ANON_KEY || '';
    },
    setSupabaseKey(key) {
        if (key && key.trim() !== '') {
            localStorage.setItem('SUPABASE_ANON_KEY', key.trim());
        } else {
            localStorage.removeItem('SUPABASE_ANON_KEY');
        }
    }
};

window.CONFIG = CONFIG;
