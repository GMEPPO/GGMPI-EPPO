/**
 * 🔧 CONFIGURACIÓN UNIVERSAL DE SUPABASE
 * 
 * Este archivo proporciona una configuración robusta de Supabase
 * que funciona en todos los entornos: local, Netlify, y otras plataformas.
 */

function readEnvVariable(key) {
    try {
        // Entornos con process.env (Netlify, Node, etc.)
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            return process.env[key];
        }

        // Variables inyectadas manualmente en window
        if (typeof window !== 'undefined' && window && window[key]) {
            return window[key];
        }

        // Variables agrupadas en window.__ENV__ u objetos similares
        if (typeof window !== 'undefined' && window && window.__ENV__ && window.__ENV__[key]) {
            return window.__ENV__[key];
        }
    } catch (error) {
        console.warn('No se pudo leer la variable de entorno', key, error);
    }
    return null;
}

// Configuración base de Supabase
if (typeof window.SUPABASE_CONFIG === 'undefined') {
    window.SUPABASE_CONFIG = {
        url: readEnvVariable('VITE_SUPABASE_URL') || 'https://fzlvsgjvilompkjmqeoj.supabase.co',
        anonKey:
            readEnvVariable('VITE_SUPABASE_ANON_KEY') ||
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY'
    };
}
// Usar window.SUPABASE_CONFIG directamente o crear variable solo si no existe
var SUPABASE_CONFIG = window.SUPABASE_CONFIG;

/**
 * 🔧 Cliente Supabase con configuración optimizada
 */
// Evitar redeclaración si la clase ya existe
if (typeof UniversalSupabaseClient === 'undefined') {
    var UniversalSupabaseClient = class UniversalSupabaseClient {
    constructor() {
        this.client = null;
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 segundo
    }

    /**
     * Inicializar cliente Supabase
     */
    async initialize() {
        try {
            // Verificar que Supabase esté disponible
            if (typeof supabase === 'undefined') {
                throw new Error('Script de Supabase no está cargado. Asegúrate de incluir: <script src="https://unpkg.com/@supabase/supabase-js@2"></script>');
            }

            // Crear cliente con configuración optimizada
            this.client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
                auth: {
                    persistSession: false, // No persistir sesión para mejor compatibilidad
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                },
                global: {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                },
                db: {
                    schema: 'public'
                },
                realtime: {
                    enabled: false // Deshabilitar realtime para mejor rendimiento
                }
            });

            // Test de conexión
            await this.testConnection();
            
            this.isInitialized = true;
            console.log('✅ Cliente Supabase inicializado correctamente');
            console.log('🔗 URL:', SUPABASE_CONFIG.url);
            console.log('🔑 API Key:', SUPABASE_CONFIG.anonKey.substring(0, 20) + '...');
            
            return this.client;
            
        } catch (error) {
            console.error('❌ Error inicializando Supabase:', error);
            throw error;
        }
    }

    /**
     * Test de conexión básica
     */
    async testConnection() {
        try {
            // Test de conexión usando la tabla 'products' que siempre debe existir
            const { data, error } = await this.client
                .from('products')
                .select('id')
                .limit(1);

            if (error) {
                throw new Error(`Error de conexión: ${error.message}`);
            }

            console.log('✅ Test de conexión exitoso');
            return true;
            
        } catch (error) {
            console.error('❌ Test de conexión falló:', error);
            throw error;
        }
    }

    /**
     * Obtener cliente (inicializar si es necesario)
     */
    async getClient() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.client;
    }

    /**
     * Cargar productos con reintentos automáticos
     * Ahora usa solo la tabla 'products' unificada
     */
    async loadProducts() {
        const client = await this.getClient();
        const allProducts = [];

        try {
            console.log(`🔄 Cargando productos de tabla: products`);
            
            const { data, error } = await client
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.warn(`⚠️ Error en tabla products:`, error);
                // Reintentar si no hemos alcanzado el máximo
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`🔄 Reintentando (${this.retryCount}/${this.maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
                    return this.loadProducts();
                }
                return allProducts;
            }

            if (data && data.length > 0) {
                // Los productos ya tienen su categoría en el campo 'category' o 'categoria'
                data.forEach(product => {
                    allProducts.push({
                        ...product,
                        categoria: product.category || product.categoria || 'general'
                    });
                });
                
                console.log(`✅ products: ${data.length} productos cargados`);
            } else {
                console.log(`ℹ️ products: Sin productos`);
            }
            
        } catch (error) {
            console.error(`❌ Error cargando products:`, error);
            
            // Reintentar si no hemos alcanzado el máximo
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🔄 Reintentando (${this.retryCount}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
                return this.loadProducts();
            }
        }

        console.log(`✅ Total productos cargados: ${allProducts.length}`);
        return allProducts;
    }

    /**
     * Obtener información de configuración
     */
    getConfig() {
        return {
            url: SUPABASE_CONFIG.url,
            anonKey: SUPABASE_CONFIG.anonKey.substring(0, 20) + '...',
            isInitialized: this.isInitialized,
            retryCount: this.retryCount
        };
    }
    }; // Fin de la clase
} // Fin del if

// Crear instancia solo si no existe
if (typeof universalSupabase === 'undefined') {
    var universalSupabase = new UniversalSupabaseClient();
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UniversalSupabaseClient, universalSupabase, SUPABASE_CONFIG };
}

// Exportar para uso en navegador
if (typeof window !== 'undefined') {
    if (typeof window.UniversalSupabaseClient === 'undefined') {
        window.UniversalSupabaseClient = UniversalSupabaseClient;
    }
    if (typeof window.universalSupabase === 'undefined') {
        window.universalSupabase = universalSupabase;
    }
    if (typeof window.SUPABASE_CONFIG === 'undefined') {
        window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    }
}

// Auto-inicializar si estamos en el navegador
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await universalSupabase.initialize();
            console.log('🚀 Supabase auto-inicializado');
        } catch (error) {
            console.error('❌ Error en auto-inicialización:', error);
        }
    });
}

