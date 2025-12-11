// Configuración de campos por categoría (dinámico)
const categoryFieldsConfig = {
    secadores: [
        { id: 'potencia', label: 'Potencia (W)', type: 'number', placeholder: 'Ej. 1800', required: true },
        { id: 'color', label: 'Color', type: 'text', placeholder: 'Ej. negro, blanco', required: true },
        { id: 'garantia', label: 'Garantía (años)', type: 'number', placeholder: 'Ej. 2', required: true },
        { id: 'tecnologia_iones', label: 'Tecnología de iones', type: 'select', options: [{value: '', label: 'Selecciona...'}, {value: 'si', label: 'Sí'}, {value: 'no', label: 'No'}], required: true },
        { id: 'difusor', label: 'Difusor', type: 'select', options: [{value: '', label: 'Selecciona...'}, {value: 'si', label: 'Sí'}, {value: 'no', label: 'No'}], required: true },
        { id: 'niveles_temperatura', label: 'Niveles de temperatura', type: 'text', placeholder: 'Ej. 3 niveles', required: true },
        { id: 'niveles_velocidad', label: 'Niveles de velocidad de flujo de aire', type: 'text', placeholder: 'Ej. 2 velocidades', required: true },
        { id: 'aire_frio_caliente', label: 'Aire frío y caliente o aire caliente solamente', type: 'select', options: [{value: '', label: 'Selecciona...'}, {value: 'frio_caliente', label: 'Aire frío y caliente'}, {value: 'solo_caliente', label: 'Aire caliente solamente'}], required: true },
        { id: 'filtro', label: 'Filtro', type: 'select', options: [{value: '', label: 'Selecciona...'}, {value: 'si', label: 'Sí'}, {value: 'no', label: 'No'}, {value: 'removible', label: 'Sí, removible'}], required: true }
    ],
    planchas: [
        { id: 'potencia', label: 'Potencia (W)', type: 'number', placeholder: 'Ej. 1800', required: true },
        { id: 'color', label: 'Color', type: 'text', placeholder: 'Ej. negro, blanco', required: true },
        { id: 'garantia', label: 'Garantía (años)', type: 'number', placeholder: 'Ej. 2', required: true },
        { id: 'vapor_seco', label: 'A vapor o seco', type: 'select', options: [{value: '', label: 'Selecciona...'}, {value: 'vapor', label: 'A vapor'}, {value: 'seco', label: 'Seco'}, {value: 'ambos', label: 'Ambos'}], required: true },
        { id: 'dimensiones', label: 'Dimensiones (largo × ancho × altura en cm)', type: 'text', placeholder: 'Ej. 12 × 20 × 5', required: true }
    ],
    'tablas-planchar': [
        { id: 'color', label: 'Color', type: 'text', placeholder: 'Ej. negro, blanco', required: true },
        { id: 'garantia', label: 'Garantía (años)', type: 'number', placeholder: 'Ej. 2', required: true },
        { id: 'dimensiones', label: 'Dimensiones', type: 'text', placeholder: 'Ej. 120 × 40 × 95 cm', required: true }
    ],
    'porta-malas': [
        { id: 'color', label: 'Color', type: 'text', placeholder: 'Ej. negro, plata', required: true },
        { id: 'garantia', label: 'Garantía (años)', type: 'number', placeholder: 'Ej. 2', required: true },
        { id: 'dimensiones', label: 'Dimensiones', type: 'text', placeholder: 'Ej. 80 × 50 × 30 cm', required: true },
        { id: 'material', label: 'Material', type: 'text', placeholder: 'Ej. Aluminio, Acero', required: true }
    ]
};

let supabaseClient = null;
let brandSuggestions = [];
let variants = {
    base: {
        name: '',
        tiers: [{ minQty: '', maxQty: '', price: '' }]
    }
};
let variantCounter = 0; // Contador para IDs únicos de variantes
let customCategories = {}; // Categorías personalizadas cargadas desde Supabase
let editingCategoryId = null; // ID de categoría que se está editando
// categoryFields se declara más abajo para evitar conflictos

// Variable global para el modo actual
let currentMode = 'new'; // 'new', 'edit', 'duplicate'
let selectedProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Detectar modo desde URL
    const urlParams = new URLSearchParams(window.location.search);
    currentMode = urlParams.get('mode') || 'new';
    
    console.log('🔍 Modo detectado:', currentMode);
    
    await initSupabase();
    loadBrandSuggestions();
    loadCustomCategories();
    
    // Configurar event listener para el select de tipo de campo en el formulario de categorías
    const fieldTypeSelect = document.getElementById('newFieldType');
    if (fieldTypeSelect) {
        fieldTypeSelect.addEventListener('change', function() {
            const optionsContainer = document.getElementById('newFieldOptionsContainer');
            if (this.value === 'select') {
                optionsContainer.style.display = 'block';
                if (document.getElementById('newFieldOptionsList').children.length === 0) {
                    addNewFieldOption();
                }
            } else {
                optionsContainer.style.display = 'none';
            }
        });
    }
    
    // Configurar interfaz según el modo INMEDIATAMENTE
    setupModeInterface();
    
    // Verificación adicional para modo 'new' después de un pequeño delay
    setTimeout(() => {
        if (currentMode === 'new') {
            const form = document.getElementById('productForm');
            const selector = document.getElementById('mode-selector');
            
            console.log('🔍 Verificando formulario para modo new...');
            console.log('Form encontrado:', !!form);
            
            if (form) {
                // Forzar visibilidad del formulario
                form.style.display = 'block';
                form.style.visibility = 'visible';
                form.style.opacity = '1';
                form.style.height = 'auto';
                form.style.overflow = 'visible';
                console.log('✅ Formulario forzado a visible para modo new');
                console.log('Estilos aplicados:', {
                    display: form.style.display,
                    visibility: form.style.visibility,
                    opacity: form.style.opacity
                });
                
                // Asegurar que las variantes se rendericen
                setTimeout(() => {
                    if (!variants.base || !variants.base.tiers || variants.base.tiers.length === 0) {
                        variants.base = {
                            name: '',
                            tiers: [{ minQty: '', maxQty: '', price: '' }]
                        };
                    }
                    renderVariants();
                    console.log('✅ Variantes renderizadas');
                }, 200);
            } else {
                console.error('❌ Formulario no encontrado después del delay');
            }
            
            if (selector) {
                selector.style.display = 'none';
            }
        }
    }, 300);
    
    // Verificar si se debe abrir el modal de subcategorías
    const openSubcategoryModal = urlParams.get('openSubcategoryModal');
    const categoryId = urlParams.get('categoryId');
    
    if (openSubcategoryModal === 'true' && categoryId) {
        // Esperar a que se carguen las categorías del home
        setTimeout(async () => {
            // Cargar categorías del home si no están cargadas
            if (!homeCategories || homeCategories.length === 0) {
                try {
                    const { data, error } = await supabaseClient
                        .from('home_categories')
                        .select('*')
                        .eq('is_active', true)
                        .order('orden', { ascending: true });
                    
                    if (!error && data) {
                        homeCategories = data;
                    }
                } catch (err) {
                    console.error('Error cargando categorías:', err);
                }
            }
            
            currentCategoryForSubcategories = categoryId;
            const cat = homeCategories.find(c => c.id === categoryId);
            if (cat) {
                const modalTitle = document.getElementById('subcategoryModalTitle');
                if (modalTitle) {
                    modalTitle.textContent = `Crear Subcategoría - ${cat.nombre_es}`;
                }
                const subcategoryModal = document.getElementById('subcategoryModal');
                if (subcategoryModal) {
                    subcategoryModal.classList.add('active');
                    showCreateSubcategoryForm();
                }
            }
            // Limpiar parámetros de la URL
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[?&]openSubcategoryModal=[^&]*&?|[?&]categoryId=[^&]*&?/g, '').replace(/^&/, '?'));
        }, 1500);
    }
    
    // Escuchar cambios de idioma para actualizar categorías
    window.addEventListener('languageChanged', () => {
        loadCustomCategories();
    });
    
    // Cargar productos si es necesario para editar o duplicar
    if (currentMode === 'edit' || currentMode === 'duplicate') {
        await loadAllProducts();
        renderProductsList();
    }
    setupCategoryChange();
    renderVariants();
});

async function initSupabase() {
  try {
    if (window.universalSupabase) {
      supabaseClient = await window.universalSupabase.getClient();
        } else if (typeof supabase !== 'undefined') {
            const SUPABASE_URL = 'https://fzlvsgjvilompkjmqeoj.supabase.co';
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY';
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { persistSession: false }
            });
        }
        console.log('✅ Supabase inicializado');
    } catch (error) {
        showAlert('Error al inicializar Supabase: ' + error.message, 'error');
        console.error(error);
    }
}

async function loadBrandSuggestions() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient
            .from('products')
            .select('brand')
            .not('brand', 'is', null)
            .not('brand', 'eq', '');
        
        brandSuggestions = [...new Set((data || []).map(r => r.brand).filter(Boolean))].sort();
        
        const datalist = document.getElementById('marcas');
        datalist.innerHTML = brandSuggestions.map(b => `<option value="${b}">`).join('');
        
        // Asignar datalist al campo de marca
        document.getElementById('marca').setAttribute('list', 'marcas');
  } catch (error) {
        console.error('Error cargando marcas:', error);
    }
}

function setupCategoryChange() {
    const categoriaSelect = document.getElementById('categoria');
    
    // Ejecutar al cargar si ya hay una categoría seleccionada
    if (categoriaSelect.value) {
        const categoria = categoriaSelect.value;
        renderCategoryFields(categoria).catch(err => console.error('Error renderizando campos:', err));
    }
    
    categoriaSelect.addEventListener('change', async () => {
        const categoria = categoriaSelect.value;
        await renderCategoryFields(categoria);
        
        // Limpiar campos específicos anteriores al cambiar de categoría
        const previousFields = document.querySelectorAll('#categoryFields .form-group');
        previousFields.forEach(field => {
            const input = field.querySelector('input, select');
            if (input) {
                input.value = '';
            }
        });
    });
}


// Variables globales para subcategorías
let subcategories = [];
let editingSubcategoryId = null;
let currentCategoryForSubcategories = null;

async function loadCustomCategories() {
    if (!supabaseClient) return;
    
    const select = document.getElementById('categoria');
    if (!select) return;
    
    // Limpiar opciones existentes excepto la primera
    select.innerHTML = '<option value="">Selecciona una categoría</option>';
    
    try {
        // Cargar categorías desde home_categories (solo activas)
        const { data, error } = await supabaseClient
            .from('home_categories')
            .select('*')
            .eq('is_active', true)
            .order('orden', { ascending: true });
        
        if (error) {
            console.error('Error cargando categorías del home:', error);
            select.innerHTML = '<option value="">Error al cargar categorías</option>';
            return;
        }
        
        if (data && data.length > 0) {
            const currentLang = localStorage.getItem('language') || 'pt';
            
            data.forEach(cat => {
                // Obtener nombre según idioma
                const nombre = currentLang === 'es' ? cat.nombre_es : 
                              currentLang === 'pt' ? cat.nombre_pt : 
                              cat.nombre_es;
                
                // Crear valor de categoría (normalizado)
                const categoryValue = cat.nombre_es.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '');
                
                // Agregar al dropdown
                const option = document.createElement('option');
                option.value = categoryValue;
                option.textContent = nombre;
                option.setAttribute('data-category-id', cat.id);
                option.setAttribute('data-category-name', cat.nombre_es);
                select.appendChild(option);
            });
            
            console.log('✅ Categorías del home cargadas:', data.length);
        } else {
            select.innerHTML = '<option value="">No hay categorías disponibles</option>';
            console.warn('⚠️ No se encontraron categorías activas');
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
        select.innerHTML = '<option value="">Error al cargar categorías</option>';
    }
}

// Función auxiliar para cargar subcategorías (usada solo en gestión de categorías del home)
async function loadSubcategories(categoryId) {
    if (!supabaseClient || !categoryId) return [];
    
    try {
        const { data, error } = await supabaseClient
            .from('subcategorias')
            .select('*')
            .eq('categoria_padre_id', categoryId)
            .eq('is_active', true)
            .order('orden', { ascending: true });
        
        if (error) {
            console.error('Error cargando subcategorías:', error);
            return [];
        }
        
        subcategories = data || [];
        console.log('✅ Subcategorías cargadas:', subcategories.length);
        return subcategories;
    } catch (error) {
        console.error('Error cargando subcategorías:', error);
        return [];
    }
}

async function renderCategoryFields(categoria) {
    const container = document.getElementById('categoryFields');
    const title = document.getElementById('categoryFieldsTitle');
    
    if (!container) {
        console.error('❌ No se encontró el contenedor categoryFields');
        return;
    }
    
    // Limpiar campos anteriores
    container.innerHTML = '<p style="color: #6b7280; grid-column: 1 / -1;">Cargando campos...</p>';
    
    // Actualizar título
    const categoryNames = {
        'secadores': 'Secadores',
        'planchas': 'Planchas',
        'tablas-planchar': 'Tablas de planchar',
        'porta-malas': 'Porta-malas'
    };
    
    // Incluir categorías personalizadas
    Object.keys(customCategories).forEach(id => {
        categoryNames[id] = customCategories[id].name;
    });
    
    if (!categoria) {
        if (title) title.textContent = 'Filtros';
        container.innerHTML = '<p style="color: #6b7280; grid-column: 1 / -1;">Selecciona una categoría para ver los filtros disponibles</p>';
        return;
    }
    
    if (title) title.textContent = `Filtros - ${categoryNames[categoria] || categoria}`;
    
    // Primero intentar cargar campos desde la base de datos (category_fields)
    let fields = [];
    
    if (supabaseClient) {
        try {
            // Obtener el ID de la categoría desde el select
            const categoriaSelect = document.getElementById('categoria');
            if (categoriaSelect) {
                const selectedOption = categoriaSelect.options[categoriaSelect.selectedIndex];
                const categoryId = selectedOption.getAttribute('data-category-id');
                
                if (categoryId) {
                    // Cargar campos desde category_fields
                    const { data, error } = await supabaseClient
                        .from('category_fields')
                        .select('*')
                        .eq('categoria_id', categoryId)
                        .order('orden', { ascending: true });
                    
                    if (!error && data && data.length > 0) {
                        // Convertir campos de la BD al formato esperado
                        const currentLang = localStorage.getItem('language') || 'pt';
                        fields = data.map(field => {
                            const label = currentLang === 'es' ? field.label_es : field.label_pt;
                            const placeholder = currentLang === 'es' ? (field.placeholder_es || '') : (field.placeholder_pt || '');
                            
                            const fieldObj = {
                                id: field.field_id,
                                label: label,
                                type: field.field_type,
                                placeholder: placeholder,
                                required: field.is_required || false
                            };
                            
                            // Si es select, agregar opciones
                            if (field.field_type === 'select' && field.options && Array.isArray(field.options)) {
                                fieldObj.options = field.options.map(opt => ({
                                    value: opt.value,
                                    label: currentLang === 'es' ? opt.label_es : opt.label_pt
                                }));
                            }
                            
                            return fieldObj;
                        });
                        
                        console.log('✅ Campos cargados desde BD:', fields.length);
                    }
                }
            }
        } catch (error) {
            console.error('Error cargando campos desde BD:', error);
        }
    }
    
    // Si no hay campos en BD, usar los predefinidos
    if (fields.length === 0) {
        fields = categoryFieldsConfig[categoria] || [];
        
        // Si es una categoría personalizada, usar sus campos
        if (customCategories[categoria]) {
            fields = customCategories[categoria].fields || [];
        }
    }
    
    if (fields.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; grid-column: 1 / -1;">No hay filtros configurados para esta categoría. Ve a "Categorías del Home" y gestiona los campos de esta categoría.</p>';
        return;
    }
    
    // Renderizar cada campo según su tipo
    fields.forEach(field => {
        // Campos numéricos solo necesitan una versión (ej: potencia)
        if (field.type === 'number') {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'form-group';
            
            const label = document.createElement('label');
            label.setAttribute('for', field.id);
            if (field.required) {
                label.className = 'required';
            }
            label.textContent = field.label;
            fieldDiv.appendChild(label);
            
            const input = document.createElement('input');
            input.type = 'number';
            input.id = field.id;
            input.name = field.id;
            input.placeholder = field.placeholder || '';
            if (field.required) {
                input.setAttribute('required', 'required');
            }
            
            fieldDiv.appendChild(input);
            container.appendChild(fieldDiv);
        } else {
            // Campos especiales: garantía y dimensiones solo en un idioma
            const singleLanguageFields = ['garantia', 'dimensiones'];
            
            if (singleLanguageFields.includes(field.id)) {
                // Solo una versión para garantía y dimensiones
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'form-group';
                
                const label = document.createElement('label');
                label.setAttribute('for', field.id);
                if (field.required) {
                    label.className = 'required';
                }
                label.textContent = field.label;
                fieldDiv.appendChild(label);
                
                let input;
                if (field.type === 'number') {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.id = field.id;
                    input.name = field.id;
                    input.placeholder = field.placeholder || '';
                    if (field.required) {
                        input.setAttribute('required', 'required');
                    }
                } else {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.id = field.id;
                    input.name = field.id;
                    input.placeholder = field.placeholder || '';
                    if (field.required) {
                        input.setAttribute('required', 'required');
                    }
                }
                
                fieldDiv.appendChild(input);
                container.appendChild(fieldDiv);
            } else {
                // Otros campos de texto y select necesitan versión ES y PT
                
                // Versión Español
                const fieldDivEs = document.createElement('div');
                fieldDivEs.className = 'form-group';
                
                const labelEs = document.createElement('label');
                labelEs.setAttribute('for', field.id + '_es');
                if (field.required) {
                    labelEs.className = 'required';
                }
                labelEs.textContent = field.label + ' (Español)';
                fieldDivEs.appendChild(labelEs);
                
                let inputEs;
                
                if (field.type === 'select') {
                    inputEs = document.createElement('select');
                    inputEs.id = field.id + '_es';
                    inputEs.name = field.id + '_es';
                    if (field.required) {
                        inputEs.setAttribute('required', 'required');
                    }
                    
                    // Agregar opciones
                    field.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = typeof opt === 'string' ? opt : opt.value;
                        option.textContent = typeof opt === 'string' ? opt : opt.label;
                        inputEs.appendChild(option);
                    });
                } else {
                    inputEs = document.createElement('input');
                    inputEs.type = 'text';
                    inputEs.id = field.id + '_es';
                    inputEs.name = field.id + '_es';
                    inputEs.placeholder = (field.placeholder || '') + ' (ES)';
                    if (field.required) {
                        inputEs.setAttribute('required', 'required');
                    }
                }
                
                fieldDivEs.appendChild(inputEs);
                container.appendChild(fieldDivEs);
                
                // Versión Portugués
                const fieldDivPt = document.createElement('div');
                fieldDivPt.className = 'form-group';
                
                const labelPt = document.createElement('label');
                labelPt.setAttribute('for', field.id + '_pt');
                labelPt.textContent = field.label + ' (Português)';
                fieldDivPt.appendChild(labelPt);
                
                let inputPt;
                
                if (field.type === 'select') {
                    inputPt = document.createElement('select');
                    inputPt.id = field.id + '_pt';
                    inputPt.name = field.id + '_pt';
                    
                    // Agregar opciones traducidas al portugués
                    const ptTranslations = {
                        'si': 'Sim',
                        'no': 'Não',
                        'removible': 'Removível',
                        'frio_caliente': 'Ar frio e quente',
                        'solo_caliente': 'Apenas ar quente',
                        'vapor': 'A vapor',
                        'seco': 'Seco',
                        'ambos': 'Ambos'
                    };
                    
                    field.options.forEach(opt => {
                        const option = document.createElement('option');
                        const optValue = typeof opt === 'string' ? opt : opt.value;
                        option.value = optValue;
                        const optLabel = typeof opt === 'string' ? opt : opt.label;
                        option.textContent = ptTranslations[optValue] || optLabel;
                        inputPt.appendChild(option);
                    });
                } else {
                    inputPt = document.createElement('input');
                    inputPt.type = 'text';
                    inputPt.id = field.id + '_pt';
                    inputPt.name = field.id + '_pt';
                    inputPt.placeholder = (field.placeholder || '') + ' (PT)';
                }
                
                fieldDivPt.appendChild(inputPt);
                container.appendChild(fieldDivPt);
            }
        }
    });
}

function renderVariants() {
    const container = document.getElementById('variantsContainer');
    if (!container) {
        console.warn('⚠️ No se encontró variantsContainer');
        return;
    }
    
    console.log('🔄 Renderizando variantes...');
    
    let html = '';
    
    // Renderizar variante base
    html += `
        <div class="variant-section" data-variant-id="base">
            <div class="variant-header">
                <h3>Precio Base (Sin variante)</h3>
            </div>
            <div id="basePriceTiers" class="price-tiers-container">
                ${renderPriceTiersForVariant('base')}
            </div>
            <button type="button" class="btn btn-add" onclick="addPriceTier('base')">
                <i class="fas fa-plus"></i> Agregar Escalón de Precio
            </button>
        </div>
    `;
    
    // Renderizar variantes personalizadas
    Object.keys(variants).forEach(variantId => {
        if (variantId === 'base') return;
        
        const variant = variants[variantId];
        if (!variant) return;
        
        html += `
            <div class="variant-section" data-variant-id="${variantId}">
                <div class="variant-header">
                    <input type="text" placeholder="Nombre de la variante (ej: Logo en 1 gomo)" 
                           value="${variant.name || ''}" 
                           onchange="variants['${variantId}'].name = this.value"
                           style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-weight: 600;">
                    <button type="button" class="btn btn-danger" onclick="removeVariant('${variantId}')" style="margin-left: 10px;">
                        <i class="fas fa-trash"></i> Eliminar Variante
                    </button>
                </div>
                <div id="${variantId}PriceTiers" class="price-tiers-container">
                    ${renderPriceTiersForVariant(variantId)}
                </div>
                <button type="button" class="btn btn-add" onclick="addPriceTier('${variantId}')">
                    <i class="fas fa-plus"></i> Agregar Escalón de Precio
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderPriceTiersForVariant(variantId) {
    const variant = variants[variantId];
    if (!variant || !variant.tiers) return '';
    const tiers = variant.tiers || [];
    return tiers.map((tier, index) => `
        <div class="price-tier">
            <input type="number" placeholder="Cantidad mín" value="${tier.minQty || ''}" min="0"
                   onchange="variants['${variantId}'].tiers[${index}].minQty = this.value">
            <input type="number" placeholder="Cantidad máx" value="${tier.maxQty || ''}" min="0"
                   onchange="variants['${variantId}'].tiers[${index}].maxQty = this.value">
            <input type="number" step="0.01" placeholder="Precio €" value="${tier.price || ''}" required
                   onchange="variants['${variantId}'].tiers[${index}].price = this.value">
            ${tiers.length > 1 ? `
                <button type="button" class="btn btn-danger" onclick="removePriceTier('${variantId}', ${index})">
                    <i class="fas fa-trash"></i>
                </button>
            ` : '<div></div>'}
        </div>
    `).join('');
}

function addPriceTier(variantId) {
    if (!variants[variantId]) {
        variants[variantId] = { name: '', tiers: [] };
    }
    if (!variants[variantId].tiers) {
        variants[variantId].tiers = [];
    }
    variants[variantId].tiers.push({ minQty: '', maxQty: '', price: '' });
    renderVariants();
}

function removePriceTier(variantId, index) {
    if (variants[variantId] && variants[variantId].tiers && variants[variantId].tiers.length > 1) {
        variants[variantId].tiers.splice(index, 1);
        renderVariants();
    }
}

function addVariant() {
    const variantId = 'variant_' + (++variantCounter);
    variants[variantId] = {
        name: '',
        tiers: [{ minQty: '', maxQty: '', price: '' }]
    };
    renderVariants();
}

function removeVariant(variantId) {
    if (variantId === 'base') {
        alert('No se puede eliminar la variante base');
        return;
    }
    if (confirm('¿Estás seguro de que quieres eliminar esta variante?')) {
        delete variants[variantId];
        renderVariants();
    }
}

function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

function resetForm() {
    if (confirm('¿Estás seguro de que quieres limpiar todo el formulario?')) {
        document.getElementById('productForm').reset();
        variants = {
            base: {
                name: '',
                tiers: [{ minQty: '', maxQty: '', price: '' }]
            }
        };
        variantCounter = 0;
        renderVariants();
        document.getElementById('categoryFields').innerHTML = '<p style="color: #6b7280;">Selecciona una categoría para ver los campos específicos</p>';
    }
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!supabaseClient) {
        showAlert('Error: Supabase no está inicializado', 'error');
        return;
    }
    
    const formData = new FormData(e.target);
    const categoria = formData.get('categoria');
    const categoryFields = categoryFieldsConfig[categoria] || [];
    
    // Validar escalones de precio de la variante base
    const baseTiers = variants.base?.tiers || [];
    if (baseTiers.length === 0 || baseTiers.some(t => !t.price || !t.minQty)) {
        showAlert('Error: Debes completar al menos un escalón de precio base con precio y cantidad mínima', 'error');
        return;
    }
    
    // Obtener campos: primero de config estática, luego de categorías personalizadas
    let fields = categoryFieldsConfig[categoria] || [];
    
    // Si es una categoría personalizada, usar sus campos
    if (customCategories[categoria]) {
        fields = customCategories[categoria].fields || [];
    }
    
    // Columnas que existen en la tabla products
    const validColumns = {
        'potencia': true,
        'color': true,
        'tipo': true
    };
    
    // Construir objeto de datos con solo columnas válidas
    const productData = {
        nombre: formData.get('modelo') || '', // Usar el campo modelo como nombre
        categoria: categoria,
        brand: formData.get('marca') || null,
        badge: formData.get('badgeEs') || formData.get('badgePt') || null, // Usar badge ES, si no existe usar PT
        descripcion_es: formData.get('descripcionEs') || null,
        descripcion_pt: formData.get('descripcionPt') || null,
        foto: formData.get('foto'),
        foto_2: formData.get('foto2') || null,
        ficha_tecnica: formData.get('fichaTecnica') || null,
        plazo_entrega: formData.get('plazoEntrega') || null,
        precio: parseFloat(baseTiers[0].price) || 0,
        price_tiers: baseTiers.length > 0 ? baseTiers.map(tier => ({
            min_qty: tier.minQty ? parseInt(tier.minQty) : null,
            max_qty: tier.maxQty ? parseInt(tier.maxQty) : null,
            price: tier.price ? parseFloat(tier.price) : null,
            currency: 'EUR'
        })).filter(tier => tier.min_qty !== null && tier.price !== null) : [],
        variants: Object.keys(variants).filter(id => id !== 'base').map(variantId => {
            const variant = variants[variantId];
            return {
                name: variant.name || '',
                price_tiers: (variant.tiers || []).map(tier => ({
                    min_qty: tier.minQty ? parseInt(tier.minQty) : null,
                    max_qty: tier.maxQty ? parseInt(tier.maxQty) : null,
                    price: tier.price ? parseFloat(tier.price) : null,
                    currency: 'EUR'
                })).filter(tier => tier.min_qty !== null && tier.price !== null)
            };
        }).filter(v => v.name && v.price_tiers && v.price_tiers.length > 0)
    };
    
    // Agregar visible_en_catalogo siempre (por defecto true si no existe el checkbox)
    const visibleEnCatalogoCheckbox = document.getElementById('visibleEnCatalogo');
    if (visibleEnCatalogoCheckbox) {
        productData.visible_en_catalogo = visibleEnCatalogoCheckbox.checked;
        console.log('📋 Checkbox encontrado. visible_en_catalogo será guardado como:', productData.visible_en_catalogo);
        console.log('📋 Estado del checkbox:', visibleEnCatalogoCheckbox.checked ? 'MARCADO (true)' : 'DESMARCADO (false)');
    } else {
        productData.visible_en_catalogo = true; // Por defecto true si no existe el checkbox
        console.log('⚠️ Checkbox no encontrado, usando valor por defecto: true');
    }
    
    // Recolectar todos los campos específicos de categoría (ES y PT)
    const categorySpecificData = {};
    const caracteristicasLines = [];
    
    fields.forEach(field => {
        // Campos especiales: garantía y dimensiones solo en un idioma
        const singleLanguageFields = ['garantia', 'dimensiones'];
        
        if (singleLanguageFields.includes(field.id)) {
            // Solo una versión para garantía y dimensiones
            const value = formData.get(field.id);
            if (!value) return;
            
            if (field.id === 'garantia') {
                // Garantía siempre en años
                categorySpecificData[field.id] = parseFloat(value);
                caracteristicasLines.push(`${field.label}: ${value} años`);
            } else {
                // Dimensiones
                categorySpecificData[field.id] = value;
                caracteristicasLines.push(`${field.label}: ${value} cm`);
            }
        } else if (field.type === 'number') {
            // Campos numéricos solo tienen una versión
            const value = formData.get(field.id);
            if (!value) return;
            
            // Si es una columna válida, guardarla directamente
            if (validColumns[field.id]) {
                productData[field.id] = parseFloat(value);
            } else {
                categorySpecificData[field.id] = parseFloat(value);
            }
            
            caracteristicasLines.push(`${field.label}: ${value}`);
        } else {
            // Campos de texto y select tienen versión ES y PT
            const valueEs = formData.get(field.id + '_es');
            const valuePt = formData.get(field.id + '_pt');
            
            if (valueEs) {
                categorySpecificData[field.id + '_es'] = valueEs;
                caracteristicasLines.push(`${field.label} (ES): ${valueEs}`);
            }
            
            if (valuePt) {
                categorySpecificData[field.id + '_pt'] = valuePt;
                caracteristicasLines.push(`${field.label} (PT): ${valuePt}`);
            }
            
            // Para columnas válidas como color, guardar solo la versión ES
            if (validColumns[field.id] && valueEs) {
                productData[field.id] = valueEs;
            }
        }
    });
    
    // Guardar todo en el campo "Carateristicas" (formato: línea por línea para campos + JSON para datos estructurados)
    let caracteristicasText = caracteristicasLines.join('\n');
    
    // Si hay datos estructurados adicionales, agregarlos como JSON
    if (Object.keys(categorySpecificData).length > 0) {
        caracteristicasText += '\n\n[DATOS ESTRUCTURADOS]\n' + JSON.stringify(categorySpecificData, null, 2);
    }
    
    productData.caracteristicas = caracteristicasText || null;
    
    try {
        let result;
        
        // Si estamos editando, actualizar; si no, insertar
        if (window.editingProductId) {
            console.log('🔄 Actualizando producto con ID:', window.editingProductId);
            console.log('📦 Datos a actualizar:', JSON.stringify(productData, null, 2));
            console.log('👁️ visible_en_catalogo:', productData.visible_en_catalogo);
            
            // Intentar actualizar con todos los campos
            try {
                const { data, error } = await supabaseClient
                    .from('products')
                    .update(productData)
                    .eq('id', window.editingProductId)
                    .select();
                
                if (error) {
                    console.error('❌ Error en update:', error);
                    console.error('📋 Código de error:', error.code);
                    console.error('📋 Mensaje:', error.message);
                    
                    // Si el error es por una columna que no existe, intentar sin ese campo
                    if (error.code === '42703' || error.message.includes('column') || error.message.includes('does not exist')) {
                        console.log('⚠️ El campo visible_en_catalogo no existe en la BD. Ejecuta el script SQL primero.');
                        console.log('⚠️ Intentando actualizar sin campo visible_en_catalogo...');
                        const productDataWithoutVisible = { ...productData };
                        delete productDataWithoutVisible.visible_en_catalogo;
                        
                        const { data: retryData, error: retryError } = await supabaseClient
                            .from('products')
                            .update(productDataWithoutVisible)
                            .eq('id', window.editingProductId)
                            .select();
                        
                        if (retryError) {
                            console.error('❌ Error en reintento:', retryError);
                            throw retryError;
                        }
                        
                        if (!retryData || retryData.length === 0) {
                            // Si aún no hay datos, verificar que el producto existe
                            const { data: verifyData } = await supabaseClient
                                .from('products')
                                .select('id')
                                .eq('id', window.editingProductId)
                                .maybeSingle();
                            
                            if (verifyData) {
                                // El producto existe, el update funcionó pero no devolvió datos
                                result = { id: window.editingProductId, ...productDataWithoutVisible };
                                showAlert(`✅ Producto actualizado (sin campo visible_en_catalogo - ejecuta el script SQL)`, 'success');
                            } else {
                                throw new Error(`No se encontró el producto con ID: ${window.editingProductId}`);
                            }
                        } else {
                            result = retryData[0];
                            showAlert(`✅ Producto actualizado (sin campo visible_en_catalogo - ejecuta el script SQL)`, 'success');
                        }
                    } else {
                        throw error;
                    }
                } else {
                    if (!data || data.length === 0) {
                        // El update funcionó pero no devolvió datos (puede ser por RLS)
                        // Verificar que el producto existe y se actualizó
                        const { data: verifyData } = await supabaseClient
                            .from('products')
                            .select('id, nombre')
                            .eq('id', window.editingProductId)
                            .maybeSingle();
                        
                        if (verifyData) {
                            result = verifyData;
                            showAlert(`✅ Producto actualizado correctamente (ID: ${result.id})`, 'success');
                        } else {
                            throw new Error('No se pudo verificar la actualización del producto.');
                        }
                    } else {
                        result = data[0];
                        console.log('✅ Producto actualizado. visible_en_catalogo guardado como:', result.visible_en_catalogo);
                        showAlert(`✅ Producto actualizado correctamente (ID: ${result.id})`, 'success');
                    }
                }
            } catch (updateError) {
                console.error('❌ Error completo en actualización:', updateError);
                throw updateError;
            }
        } else {
        const { data, error } = await supabaseClient
            .from('products')
            .insert(productData)
            .select()
                .maybeSingle();
            
            if (error) {
                console.error('Error en insert:', error);
                console.error('ProductData enviado:', JSON.stringify(productData, null, 2));
                throw error;
            }
            
            if (!data) {
                throw new Error('No se pudo crear el producto. No se devolvieron datos.');
            }
            
            result = data;
            showAlert(`✅ Producto guardado correctamente (ID: ${result.id})`, 'success');
        }
        
        setTimeout(() => {
            resetForm();
            window.editingProductId = null;
            // Si veníamos de editar/duplicar, volver al selector
            if (currentMode === 'edit' || currentMode === 'duplicate') {
                document.getElementById('mode-selector').style.display = 'block';
                document.getElementById('productForm').style.display = 'none';
                renderProductsList();
            }
        }, 2000);
    } catch (error) {
        console.error('❌ Error completo:', error);
        console.error('📋 Detalles del error:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
        });
        showAlert('Error al guardar: ' + error.message, 'error');
    }
});

// ==================== CONFIGURACIÓN DE MODO ====================

/**
 * Configurar interfaz según el modo
 */
function setupModeInterface() {
    const modeSelector = document.getElementById('mode-selector');
    const productForm = document.getElementById('productForm');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    
    const translations = {
        pt: {
            newTitle: 'Criar Novo Produto',
            newSubtitle: 'Complete as informações do produto de acordo com sua categoria',
            editTitle: 'Editar Produto',
            editSubtitle: 'Selecione o produto que deseja editar',
            duplicateTitle: 'Criar Produto a partir de Outro',
            duplicateSubtitle: 'Selecione o produto que deseja usar como base',
            selectorTitle: 'Selecionar Produto',
            searchPlaceholder: 'Buscar produto...',
            back: 'Voltar',
            catalog: 'Catálogo'
        },
        es: {
            newTitle: 'Crear Nuevo Producto',
            newSubtitle: 'Completa la información del producto según su categoría',
            editTitle: 'Editar Producto',
            editSubtitle: 'Selecciona el producto que deseas editar',
            duplicateTitle: 'Crear Producto desde Otro',
            duplicateSubtitle: 'Selecciona el producto que deseas usar como base',
            selectorTitle: 'Seleccionar Producto',
            searchPlaceholder: 'Buscar producto...',
            back: 'Volver',
            catalog: 'Catálogo'
        },
        en: {
            newTitle: 'Create New Product',
            newSubtitle: 'Complete the product information according to its category',
            editTitle: 'Edit Product',
            editSubtitle: 'Select the product you want to edit',
            duplicateTitle: 'Create Product from Another',
            duplicateSubtitle: 'Select the product you want to use as base',
            selectorTitle: 'Select Product',
            searchPlaceholder: 'Search product...',
            back: 'Back',
            catalog: 'Catalog'
        }
    };
    
    const lang = localStorage.getItem('language') || 'pt';
    const t = translations[lang] || translations.pt;
    
    if (currentMode === 'edit' || currentMode === 'duplicate') {
        // Mostrar selector de productos
        if (modeSelector) {
            modeSelector.style.display = 'block';
            modeSelector.style.visibility = 'visible';
        }
        if (productForm) {
            productForm.style.display = 'none';
        }
        
        if (currentMode === 'edit') {
            if (pageTitle) pageTitle.textContent = t.editTitle;
            if (pageSubtitle) pageSubtitle.textContent = t.editSubtitle;
        } else {
            if (pageTitle) pageTitle.textContent = t.duplicateTitle;
            if (pageSubtitle) pageSubtitle.textContent = t.duplicateSubtitle;
        }
        
        const selectorTitle = document.getElementById('selector-title');
        if (selectorTitle) selectorTitle.textContent = t.selectorTitle;
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.placeholder = t.searchPlaceholder;
        }
        
        const backText = document.getElementById('back-text');
        const catalogText = document.getElementById('catalog-text');
        if (backText) backText.textContent = t.back;
        if (catalogText) catalogText.textContent = t.catalog;
    } else {
        // Mostrar formulario normal (modo 'new')
        if (modeSelector) {
            modeSelector.style.display = 'none';
        }
        if (productForm) {
            // Asegurar que el formulario esté visible
            productForm.style.display = 'block';
            productForm.style.visibility = 'visible';
            productForm.style.opacity = '1';
            productForm.style.height = 'auto';
            productForm.style.overflow = 'visible';
            console.log('✅ Formulario de producto mostrado para modo:', currentMode);
            
            // Inicializar variantes si no existen
            if (!variants.base || !variants.base.tiers || variants.base.tiers.length === 0) {
                variants.base = {
                    name: '',
                    tiers: [{ minQty: '', maxQty: '', price: '' }]
                };
            }
            
            // Renderizar variantes inmediatamente
            renderVariants();
        } else {
            console.error('❌ No se encontró el elemento productForm');
        }
        if (pageTitle) pageTitle.textContent = t.newTitle;
        if (pageSubtitle) pageSubtitle.textContent = t.newSubtitle;
    }
    
    // Cargar productos si es necesario para editar o duplicar
    if (currentMode === 'edit' || currentMode === 'duplicate') {
        loadAllProducts();
    }
}

/**
 * Cargar todos los productos para selección
 */
async function loadAllProducts() {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('id, nombre, categoria, brand, foto')
            .order('nombre', { ascending: true });
        
        if (error) throw error;
        
        allProducts = data || [];
        renderProductsList();
    } catch (error) {
        console.error('Error cargando productos:', error);
        showAlert('Error al cargar productos: ' + error.message, 'error');
    }
}

/**
 * Renderizar lista de productos
 */
function renderProductsList(filter = '') {
    const productsList = document.getElementById('products-list');
    if (!productsList) return;
    
    const filtered = allProducts.filter(p => {
        const search = filter.toLowerCase();
        return (p.nombre && p.nombre.toLowerCase().includes(search)) ||
               (p.brand && p.brand.toLowerCase().includes(search)) ||
               (p.categoria && p.categoria.toLowerCase().includes(search));
    });
    
    if (filtered.length === 0) {
        productsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No se encontraron productos</p>';
        return;
    }
    
    productsList.innerHTML = filtered.map(product => `
        <div class="product-item" style="display: flex; align-items: center; gap: 15px; padding: 15px; border: 1px solid var(--bg-gray-200); border-radius: 8px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s;" 
             onclick="selectProduct(${product.id})"
             onmouseover="this.style.backgroundColor='var(--bg-gray-50)'"
             onmouseout="this.style.backgroundColor='var(--bg-white)'">
            <img src="${product.foto || 'secador.png'}" alt="${product.nombre}" 
                 style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; background: var(--bg-gray-100);"
                 onerror="this.src='secador.png'">
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${product.nombre || 'Sin nombre'}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    ${product.brand ? product.brand + ' • ' : ''}${product.categoria || 'Sin categoría'}
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color: var(--text-secondary);"></i>
        </div>
    `).join('');
}

/**
 * Seleccionar producto para editar o duplicar
 */
window.selectProduct = async function(productId) {
    selectedProductId = productId;
    
    if (currentMode === 'edit') {
        // Cargar producto para editar
        await loadProductForEdit(productId);
    } else if (currentMode === 'duplicate') {
        // Cargar producto para duplicar
        await loadProductForDuplicate(productId);
    }
};

/**
 * Cargar producto para editar
 */
window.loadProductForEdit = async function(productId) {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();
        
        if (error) throw error;
        
        // Llenar formulario con datos del producto
        fillFormWithProduct(data);
        
        // Mostrar formulario y ocultar selector
        const modeSelector = document.getElementById('mode-selector');
        const productForm = document.getElementById('productForm');
        if (modeSelector) modeSelector.style.display = 'none';
        if (productForm) productForm.style.display = 'block';
        
        // Cambiar título
        const lang = localStorage.getItem('language') || 'pt';
        const editTitle = lang === 'es' ? 'Editar Producto' : lang === 'pt' ? 'Editar Produto' : 'Edit Product';
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = editTitle;
        
        // Guardar ID para actualizar en lugar de insertar
        window.editingProductId = productId;
        
        // Mostrar botón de eliminar
        const deleteBtn = document.getElementById('deleteProductBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-block';
            updateDeleteButtonText();
        }
        
    } catch (error) {
        console.error('Error cargando producto:', error);
        showAlert('Error al cargar producto: ' + error.message, 'error');
    }
};

/**
 * Cargar producto para duplicar
 */
window.loadProductForDuplicate = async function(productId) {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();
        
        if (error) throw error;
        
        // Llenar formulario con datos del producto (pero sin ID)
        fillFormWithProduct(data, true);
        
        // Mostrar formulario y ocultar selector
        const modeSelector = document.getElementById('mode-selector');
        const productForm = document.getElementById('productForm');
        if (modeSelector) modeSelector.style.display = 'none';
        if (productForm) productForm.style.display = 'block';
        
        // Cambiar título
        const lang = localStorage.getItem('language') || 'pt';
        const duplicateTitle = lang === 'es' ? 'Crear Producto desde Otro' : lang === 'pt' ? 'Criar Produto a partir de Outro' : 'Create Product from Another';
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = duplicateTitle;
        
        // No guardar ID (será un nuevo producto)
        window.editingProductId = null;
        
        // Ocultar botón de eliminar
        const deleteBtn = document.getElementById('deleteProductBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error cargando producto:', error);
        showAlert('Error al cargar producto: ' + error.message, 'error');
    }
};

/**
 * Llenar formulario con datos del producto
 */
function fillFormWithProduct(product, isDuplicate = false) {
    // Limpiar formulario primero
    resetForm();
    
    // Llenar campos básicos
    const modeloField = document.getElementById('modelo');
    if (modeloField && product.nombre) {
        modeloField.value = isDuplicate ? product.nombre + ' (Copia)' : product.nombre;
    }
    const marcaField = document.getElementById('marca');
    if (marcaField && product.brand) marcaField.value = product.brand;
    const categoriaField = document.getElementById('categoria');
    if (categoriaField && product.categoria) {
        // Si la categoría tiene formato "categoria:subcategoria", separarla
        const categoriaParts = product.categoria.split(':');
        categoriaField.value = categoriaParts[0];
        categoriaField.dispatchEvent(new Event('change'));
        
    }
    const badgeField = document.getElementById('badgeEs');
    if (badgeField && product.badge) badgeField.value = product.badge;
    const descEsField = document.getElementById('descripcionEs');
    if (descEsField && product.descripcion_es) descEsField.value = product.descripcion_es;
    const descPtField = document.getElementById('descripcionPt');
    if (descPtField && product.descripcion_pt) descPtField.value = product.descripcion_pt;
    const fotoField = document.getElementById('foto');
    if (fotoField && product.foto) fotoField.value = product.foto;
    const foto2Field = document.getElementById('foto2');
    if (foto2Field && product.foto_2) foto2Field.value = product.foto_2;
    const fichaField = document.getElementById('fichaTecnica');
    if (fichaField && product.ficha_tecnica) fichaField.value = product.ficha_tecnica;
    const plazoField = document.getElementById('plazoEntrega');
    if (plazoField && product.plazo_entrega) plazoField.value = product.plazo_entrega;
    const visibleEnCatalogoField = document.getElementById('visibleEnCatalogo');
    if (visibleEnCatalogoField) {
        // Por defecto true si no existe el campo (para productos antiguos)
        visibleEnCatalogoField.checked = product.visible_en_catalogo !== false;
    }
    
    // Cargar campos específicos de categoría después de un pequeño delay
    setTimeout(async () => {
        fillCategoryFields(product);
        // Renderizar campos de la categoría
        if (product.categoria) {
            await renderCategoryFields(product.categoria);
        }
    }, 200);
    
    // Cargar price_tiers y variantes
    if (product.price_tiers && Array.isArray(product.price_tiers) && product.price_tiers.length > 0) {
        setTimeout(() => {
            loadPriceTiers(product.price_tiers, 'base');
        }, 300);
    }
    
    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        setTimeout(() => {
            product.variants.forEach((variant, index) => {
                if (index === 0) {
                    addVariant();
                }
                setTimeout(() => {
                    const variantIds = Object.keys(variants).filter(id => id !== 'base');
                    if (variantIds.length > index) {
                        const variantId = variantIds[index];
                        if (variantId && variant.price_tiers) {
                            loadPriceTiers(variant.price_tiers, variantId);
                            if (variants[variantId]) {
                                variants[variantId].name = variant.name || '';
                            }
                        }
                    }
                    renderVariants();
                }, 100);
            });
        }, 400);
    }
}

/**
 * Llenar campos específicos de categoría
 */
function fillCategoryFields(product) {
    // Llenar campos comunes
    const potenciaField = document.getElementById('potencia');
    if (potenciaField && product.potencia) potenciaField.value = product.potencia;
    const colorField = document.getElementById('color');
    if (colorField && product.color) colorField.value = product.color;
    const tipoField = document.getElementById('tipo');
    if (tipoField && product.tipo) tipoField.value = product.tipo;
    
    // Llenar campos desde características si existen
    if (product.caracteristicas) {
        // Intentar parsear datos estructurados
        try {
            const structuredMatch = product.caracteristicas.match(/\[DATOS ESTRUCTURADOS\]([\s\S]*)/);
            if (structuredMatch) {
                const structuredData = JSON.parse(structuredMatch[1]);
                Object.keys(structuredData).forEach(key => {
                    const field = document.getElementById(key);
                    if (field) {
                        field.value = structuredData[key];
                    }
                });
            }
        } catch (e) {
            console.error('Error parseando datos estructurados:', e);
        }
    }
}

/**
 * Cargar price tiers en el formulario
 */
function loadPriceTiers(priceTiers, variantId) {
    if (!priceTiers || priceTiers.length === 0) return;
    
    const variant = variants[variantId];
    if (!variant) {
        variants[variantId] = { name: '', tiers: [] };
    }
    
    variants[variantId].tiers = priceTiers.map(tier => ({
        minQty: tier.min_qty || '',
        maxQty: tier.max_qty || '',
        price: tier.price || ''
    }));
    
    // Renderizar los tiers
    renderVariants();
}

// Event listener para búsqueda de productos
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            renderProductsList(e.target.value);
        });
    }
});

/**
 * Función para eliminar producto de la base de datos
 */
window.deleteProduct = async function() {
    if (!window.editingProductId) {
        showAlert('Error: No hay producto seleccionado para eliminar', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showAlert('Error: Supabase no está inicializado', 'error');
        return;
    }
    
    // Obtener idioma actual para las traducciones
    const lang = localStorage.getItem('language') || 'pt';
    const translations = {
        pt: {
            confirmTitle: 'Confirmar Eliminação',
            confirmMessage: 'Tem certeza de que deseja eliminar este produto? Esta ação não pode ser desfeita.',
            confirm: 'Eliminar',
            cancel: 'Cancelar',
            success: 'Produto eliminado com sucesso',
            error: 'Erro ao eliminar produto'
        },
        es: {
            confirmTitle: 'Confirmar Eliminación',
            confirmMessage: '¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.',
            confirm: 'Eliminar',
            cancel: 'Cancelar',
            success: 'Producto eliminado correctamente',
            error: 'Error al eliminar producto'
        },
        en: {
            confirmTitle: 'Confirm Deletion',
            confirmMessage: 'Are you sure you want to delete this product? This action cannot be undone.',
            confirm: 'Delete',
            cancel: 'Cancel',
            success: 'Product deleted successfully',
            error: 'Error deleting product'
        }
    };
    
    const t = translations[lang] || translations.pt;
    
    // Mostrar confirmación
    const confirmed = confirm(t.confirmMessage);
    if (!confirmed) {
        return;
    }
    
    try {
        const productIdToDelete = window.editingProductId;
        
        if (!productIdToDelete) {
            throw new Error('No hay ID de producto para eliminar');
        }
        
        console.log('🗑️ Intentando eliminar producto con ID:', productIdToDelete);
        console.log('🔍 Cliente Supabase:', supabaseClient ? 'Inicializado' : 'No inicializado');
        
        // Verificar que el producto existe antes de eliminar
        const { data: productExists, error: checkError } = await supabaseClient
            .from('products')
            .select('id, nombre')
            .eq('id', productIdToDelete)
            .single();
        
        if (checkError) {
            console.error('❌ Error al verificar producto:', checkError);
            // Si el error es que no existe, continuar con la eliminación de todos modos
            if (checkError.code !== 'PGRST116') {
                throw new Error(`Error al verificar producto: ${checkError.message}`);
            }
        }
        
        if (productExists) {
            console.log('✅ Producto encontrado:', productExists);
        } else {
            console.log('⚠️ Producto no encontrado, pero continuando con eliminación');
        }
        
        // Eliminar el producto
        console.log('🔄 Ejecutando DELETE en Supabase...');
        
        // Intentar eliminación con .select() para confirmar
        const { data: deletedData, error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', productIdToDelete)
            .select();
        
        if (error) {
            console.error('❌ Error en la eliminación:', error);
            console.error('❌ Código de error:', error.code);
            console.error('❌ Mensaje de error:', error.message);
            console.error('❌ Detalles completos:', JSON.stringify(error, null, 2));
            
            // Mensaje de error más descriptivo
            let errorMessage = error.message || 'Error desconocido';
            let showInstructions = false;
            
            if (error.code === '42501') {
                errorMessage = 'No tienes permisos para eliminar productos. El problema es la configuración de Row Level Security (RLS) en Supabase.';
                showInstructions = true;
            } else if (error.code === 'PGRST116') {
                errorMessage = 'El producto no existe o ya fue eliminado.';
            } else if (error.message && (error.message.includes('permission') || error.message.includes('policy') || error.message.includes('row-level security'))) {
                errorMessage = 'Error de permisos: Las políticas RLS (Row Level Security) están bloqueando la eliminación.';
                showInstructions = true;
            } else if (error.message && error.message.includes('JWT')) {
                errorMessage = 'Error de autenticación: Verifica que la clave de API de Supabase sea correcta.';
            }
            
            if (showInstructions) {
                const instructions = `\n\nPara solucionar este problema:\n1. Ve a tu proyecto en Supabase\n2. Abre el SQL Editor\n3. Ejecuta este comando:\n\nCREATE POLICY "Allow delete for all" ON products\n    FOR DELETE\n    USING (true);\n\nO consulta el archivo supabase-enable-delete.sql en tu proyecto.`;
                console.error('📋 Instrucciones:', instructions);
                errorMessage += instructions;
            }
            
            throw new Error(errorMessage);
        }
        
        // Verificar que se eliminó algo
        if (!deletedData || deletedData.length === 0) {
            console.warn('⚠️ No se eliminó ningún registro. El producto puede no existir.');
            // No lanzar error, puede que ya esté eliminado
        } else {
            console.log('✅ Producto eliminado exitosamente:', deletedData);
        }
        
        console.log('✅ Respuesta de eliminación:', deletedData);
        
        // Verificar que realmente se eliminó (esperar un momento para que se propague)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: verifyData, error: verifyError } = await supabaseClient
            .from('products')
            .select('id')
            .eq('id', productIdToDelete)
            .maybeSingle();
        
        if (verifyData) {
            console.warn('⚠️ El producto todavía existe después de la eliminación');
            // No lanzar error aquí, puede ser un problema de caché
            console.log('⚠️ Continuando de todos modos...');
        } else {
            console.log('✅ Confirmado: El producto fue eliminado correctamente');
        }
        
        showAlert(`✅ ${t.success}`, 'success');
        
        // Limpiar formulario y ocultar botón de eliminar
        resetForm();
        window.editingProductId = null;
        const deleteBtn = document.getElementById('deleteProductBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
        
        // Recargar la lista de productos para que el eliminado no aparezca
        console.log('🔄 Recargando lista de productos...');
        await loadAllProducts();
        console.log('✅ Lista de productos recargada');
        
        // Si veníamos de editar, volver al selector con la lista actualizada
        if (currentMode === 'edit') {
            // Ocultar formulario y mostrar selector
            const modeSelector = document.getElementById('mode-selector');
            const productForm = document.getElementById('productForm');
            if (modeSelector) modeSelector.style.display = 'block';
            if (productForm) productForm.style.display = 'none';
            
            // Renderizar lista actualizada (sin el producto eliminado)
            renderProductsList();
            console.log('✅ Lista renderizada sin el producto eliminado');
        } else {
            // Si no, redirigir al selector
            setTimeout(() => {
                window.location.href = 'selector-productos.html';
            }, 1500);
        }
    } catch (error) {
        console.error('❌ Error eliminando producto:', error);
        showAlert(`${t.error}: ${error.message}`, 'error');
    }
};

/**
 * Actualizar texto del botón de eliminar según el idioma
 */
function updateDeleteButtonText() {
    const lang = localStorage.getItem('language') || 'pt';
    const translations = {
        pt: 'Eliminar Produto',
        es: 'Eliminar Producto',
        en: 'Delete Product'
    };
    
    const deleteText = document.getElementById('delete-text');
    if (deleteText) {
        deleteText.textContent = translations[lang] || translations.pt;
    }
}

// ==================== GESTIÓN DE CATEGORÍAS ====================

function openCategoryManager() {
    document.getElementById('categoryModal').classList.add('active');
    loadCategoryList();
}

function closeCategoryManager() {
    document.getElementById('categoryModal').classList.remove('active');
    cancelCategoryEdit();
}

async function loadCategoryList() {
    const container = document.getElementById('categoryList');
    
    const defaultCats = [
        { id: 'secadores', name: 'Secadores', isDefault: true },
        { id: 'planchas', name: 'Planchas', isDefault: true },
        { id: 'tablas-planchar', name: 'Tablas de planchar', isDefault: true },
        { id: 'porta-malas', name: 'Porta-malas', isDefault: true }
    ];
    
    let html = '<h3 style="margin-bottom: 15px;">Categorías Predefinidas</h3>';
    defaultCats.forEach(cat => {
        html += `
            <div class="category-item">
                <div>
                    <div class="category-item-name">${cat.name}</div>
                    <small style="color: #6b7280;">ID: ${cat.id}</small>
                </div>
                <div class="category-item-actions">
                    <span style="color: #6b7280; padding: 5px 10px; background: #e5e7eb; border-radius: 4px;">Predefinida</span>
                </div>
            </div>
        `;
    });
    
    if (Object.keys(customCategories).length > 0) {
        html += '<h3 style="margin-top: 30px; margin-bottom: 15px;">Categorías Personalizadas</h3>';
        Object.keys(customCategories).forEach(id => {
            const cat = customCategories[id];
            html += `
                <div class="category-item">
                    <div>
                        <div class="category-item-name">${cat.name}</div>
                        <small style="color: #6b7280;">ID: ${id}</small>
                        <small style="color: #6b7280; display: block;">${cat.fields.length} campo(s)</small>
                    </div>
                    <div class="category-item-actions">
                        <button class="btn btn-secondary" onclick="editCategory('${id}')" style="padding: 8px 16px;">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-danger" onclick="deleteCategory('${id}')" style="padding: 8px 16px;">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
}

function showCreateCategoryForm() {
    editingCategoryId = null;
    categoryFields = [];
    document.getElementById('categoryFormTitle').textContent = 'Nueva Categoría';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryId').disabled = false;
    document.getElementById('categoryFieldsEditor').innerHTML = '<p style="color: #6b7280;">No hay campos agregados. Haz clic en "Agregar Campo" para comenzar.</p>';
    document.getElementById('categoryFormSection').style.display = 'block';
    document.getElementById('categoryList').style.display = 'none';
}

function cancelCategoryEdit() {
    editingCategoryId = null;
    categoryFields = [];
    document.getElementById('categoryFormSection').style.display = 'none';
    document.getElementById('categoryList').style.display = 'block';
}

function addFieldToCategory() {
    categoryFields.push({
        id: '',
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
        options: []
    });
    renderCategoryFieldsEditor();
}

function removeFieldFromCategory(index) {
    categoryFields.splice(index, 1);
    renderCategoryFieldsEditor();
}

function renderCategoryFieldsEditor() {
    const container = document.getElementById('categoryFieldsEditor');
    
    if (categoryFields.length === 0) {
        container.innerHTML = '<p style="color: #6b7280;">No hay campos agregados. Haz clic en "Agregar Campo" para comenzar.</p>';
        return;
    }
    
    container.innerHTML = categoryFields.map((field, index) => {
        const optionsHtml = field.type === 'select' ? `
            <div style="margin-top: 5px;">
                <small style="color: #6b7280;">Opciones (separadas por coma):</small>
                <input type="text" placeholder="Ej. Sí, No, Ambos" 
                       value="${(field.options || []).join(', ')}"
                       onchange="categoryFields[${index}].options = this.value.split(',').map(o => o.trim()).filter(Boolean)">
            </div>
        ` : '';
        
        return `
            <div class="field-editor">
                <div class="field-editor-header">
                    <strong>Campo ${index + 1}</strong>
                    <button type="button" class="btn btn-danger" onclick="removeFieldFromCategory(${index})" style="padding: 5px 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="field-row">
                    <div>
                        <label>Nombre del campo *</label>
                        <input type="text" placeholder="Ej. Color" 
                               value="${field.label || ''}"
                               onchange="categoryFields[${index}].label = this.value" required>
                    </div>
                    <div>
                        <label>ID (sin espacios) *</label>
                        <input type="text" placeholder="Ej. color" 
                               value="${field.id || ''}"
                               pattern="[a-z0-9_]+"
                               onchange="categoryFields[${index}].id = this.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')" required>
                    </div>
                    <div>
                        <label>Tipo *</label>
                        <select onchange="categoryFields[${index}].type = this.value; renderCategoryFieldsEditor()">
                            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Texto</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>Número</option>
                            <option value="select" ${field.type === 'select' ? 'selected' : ''}>Select</option>
                        </select>
                    </div>
                    <div style="display: flex; align-items: flex-end;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" ${field.required ? 'checked' : ''} 
                                   onchange="categoryFields[${index}].required = this.checked">
                            Requerido
                        </label>
    </div>
    </div>
                ${field.type !== 'select' ? `
                    <div style="margin-top: 5px;">
                        <label>Placeholder</label>
                        <input type="text" placeholder="Ej. negro, blanco" 
                               value="${field.placeholder || ''}"
                               onchange="categoryFields[${index}].placeholder = this.value">
    </div>
                ` : ''}
                ${optionsHtml}
    </div>
  `;
    }).join('');
}

function editCategory(categoryId) {
    const cat = customCategories[categoryId];
    if (!cat) return;
    
    editingCategoryId = categoryId;
    document.getElementById('categoryFormTitle').textContent = `Editar: ${cat.name}`;
    document.getElementById('categoryName').value = cat.name;
    document.getElementById('categoryId').value = categoryId;
    document.getElementById('categoryId').disabled = true;
    
    categoryFields = JSON.parse(JSON.stringify(cat.fields));
    renderCategoryFieldsEditor();
    
    document.getElementById('categoryFormSection').style.display = 'block';
    document.getElementById('categoryList').style.display = 'none';
}

async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const id = editingCategoryId || document.getElementById('categoryId').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    if (!name || !id) {
        alert('Debes completar el nombre y el ID de la categoría');
        return;
    }
    
    if (categoryFields.length === 0) {
        alert('Debes agregar al menos un campo a la categoría');
    return;
  }

    for (let i = 0; i < categoryFields.length; i++) {
        const field = categoryFields[i];
        if (!field.id || !field.label) {
            alert(`El campo ${i + 1} debe tener un ID y un nombre`);
            return;
        }
        if (field.type === 'select' && (!field.options || field.options.length === 0)) {
            alert(`El campo "${field.label}" debe tener opciones definidas`);
            return;
        }
    }
    
    const fieldsToSave = categoryFields.map(field => {
        const fieldData = {
            id: field.id,
            label: field.label,
            type: field.type,
            required: field.required || false
        };
        
        if (field.type !== 'select') {
            fieldData.placeholder = field.placeholder || '';
        } else {
            fieldData.options = field.options.map(opt => ({
                value: opt.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                label: opt
            }));
            fieldData.options.unshift({ value: '', label: 'Selecciona...' });
        }
        
        return fieldData;
    });
    
    try {
        const categoryData = {
            id: id,
            name: name,
            fields: fieldsToSave
        };
        
        if (editingCategoryId) {
            const { error } = await supabaseClient
                .from('product_categories')
                .update(categoryData)
                .eq('id', id);
            
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('product_categories')
                .insert(categoryData);
            
            if (error) throw error;
        }
        
        customCategories[id] = {
            name: name,
            fields: fieldsToSave
        };
        
        const select = document.getElementById('categoria');
        if (!editingCategoryId) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            select.appendChild(option);
        } else {
            const option = select.querySelector(`option[value="${id}"]`);
            if (option) option.textContent = name;
        }
        
        alert('✅ Categoría guardada correctamente');
        cancelCategoryEdit();
        loadCategoryList();
  } catch (error) {
        console.error('Error guardando categoría:', error);
        alert('Error al guardar: ' + error.message);
    }
}

async function deleteCategory(categoryId) {
    if (!confirm(`¿Estás seguro de que quieres eliminar la categoría "${customCategories[categoryId].name}"?`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('product_categories')
            .delete()
            .eq('id', categoryId);
        
        if (error) throw error;
        
        delete customCategories[categoryId];
        
        const select = document.getElementById('categoria');
        const option = select.querySelector(`option[value="${categoryId}"]`);
        if (option) option.remove();
        
        alert('✅ Categoría eliminada');
        loadCategoryList();
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        alert('Error al eliminar: ' + error.message);
    }
}

// ============================================
// GESTIÓN DE CATEGORÍAS DEL HOME
// ============================================

let editingHomeCategoryId = null;
let homeCategories = [];
let categoryFieldsInForm = []; // Campos que se están agregando en el formulario de categoría

async function openHomeCategoryManager() {
    document.getElementById('homeCategoryModal').classList.add('active');
    
    // Asegurar que el botón de subcategorías esté visible
    const btn = document.getElementById('createSubcategoryFromHomeBtn');
    if (btn) {
        btn.style.display = 'inline-flex';
    }
    
    await loadHomeCategoryList();
    
    // Verificar si hay categoría "Personalizados" para configurar el botón
    updateCreateSubcategoryButtonVisibility();
}

function updateCreateSubcategoryButtonVisibility() {
    const btn = document.getElementById('createSubcategoryFromHomeBtn');
    if (!btn) {
        console.warn('⚠️ Botón createSubcategoryFromHomeBtn no encontrado');
        return;
    }
    
    // Buscar categoría "Personalizados" en las categorías cargadas
    const personalizadosCategory = homeCategories.find(cat => {
        const nombreEsLower = (cat.nombre_es || '').toLowerCase().trim();
        const nombrePtLower = (cat.nombre_pt || '').toLowerCase().trim();
        return nombreEsLower.includes('personalizado') || nombrePtLower.includes('personalizado');
    });
    
    // El botón SIEMPRE está visible
    btn.style.display = 'inline-flex';
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    
    if (personalizadosCategory) {
        btn.setAttribute('data-category-id', personalizadosCategory.id);
        btn.setAttribute('data-category-name', personalizadosCategory.nombre_es);
        btn.style.cursor = 'pointer';
        btn.disabled = false;
        console.log('✅ Botón de subcategoría configurado para:', personalizadosCategory.nombre_es);
    } else {
        btn.removeAttribute('data-category-id');
        btn.removeAttribute('data-category-name');
        btn.style.cursor = 'pointer';
        btn.disabled = false; // Permitir clic para mostrar mensaje
        console.log('⚠️ No se encontró categoría Personalizados, pero el botón está visible');
    }
}

window.openCreateSubcategoryFromHomeManager = function() {
    const btn = document.getElementById('createSubcategoryFromHomeBtn');
    if (!btn) {
        console.error('❌ Botón createSubcategoryFromHomeBtn no encontrado');
        return;
    }
    
    // Buscar categoría "Personalizados" si no está en el botón
    let categoryId = btn.getAttribute('data-category-id');
    let categoryName = btn.getAttribute('data-category-name') || 'Personalizados';
    
    if (!categoryId) {
        // Buscar en las categorías cargadas
        const personalizadosCategory = homeCategories.find(cat => {
            const nombreEsLower = (cat.nombre_es || '').toLowerCase().trim();
            const nombrePtLower = (cat.nombre_pt || '').toLowerCase().trim();
            return nombreEsLower.includes('personalizado') || nombrePtLower.includes('personalizado');
        });
        
        if (personalizadosCategory) {
            categoryId = personalizadosCategory.id;
            categoryName = personalizadosCategory.nombre_es;
            btn.setAttribute('data-category-id', categoryId);
            btn.setAttribute('data-category-name', categoryName);
        } else {
            alert('No se encontró la categoría "Personalizados". Por favor, créala primero en "Categorías del Home".');
            return;
        }
    }
    
    currentCategoryForSubcategories = categoryId;
    
    // Abrir el modal de subcategorías
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Crear Subcategoría - ${categoryName}`;
    }
    
    const subcategoryModal = document.getElementById('subcategoryModal');
    if (subcategoryModal) {
        subcategoryModal.classList.add('active');
        showCreateSubcategoryForm();
    } else {
        console.error('❌ Modal de subcategorías no encontrado');
    }
}

window.openCreateSubcategoryFromCategoryForm = function() {
    const btn = document.getElementById('createSubcategoryFromFormBtn');
    if (!btn) return;
    
    const categoryId = btn.getAttribute('data-category-id');
    const categoryName = btn.getAttribute('data-category-name') || 'Personalizados';
    
    if (!categoryId) {
        alert('Esta categoría no permite subcategorías. Solo la categoría "Personalizados" puede tener subcategorías.');
        return;
    }
    
    currentCategoryForSubcategories = categoryId;
    
    // Abrir el modal de subcategorías
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Crear Subcategoría - ${categoryName}`;
    }
    
    document.getElementById('subcategoryModal').classList.add('active');
    showCreateSubcategoryForm();
}

function closeHomeCategoryManager() {
    document.getElementById('homeCategoryModal').classList.remove('active');
    cancelHomeCategoryEdit();
}

async function loadHomeCategoryList() {
    const container = document.getElementById('homeCategoryList');
    container.innerHTML = '<p>Cargando categorías...</p>';
    
    try {
        const { data, error } = await supabaseClient
            .from('home_categories')
            .select('*')
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        homeCategories = data || [];
        
        // Actualizar visibilidad del botón de crear subcategoría
        updateCreateSubcategoryButtonVisibility();
        
        if (homeCategories.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay categorías del home creadas aún.</p>';
            return;
        }
        
        let html = '<div style="display: grid; gap: 15px;">';
        homeCategories.forEach(cat => {
            const activeBadge = cat.is_active ? 
                '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Activa</span>' :
                '<span style="background: #6b7280; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Inactiva</span>';
            
            // Verificar si es "Personalizados" para mostrar el botón de subcategorías
            const nombreEsLower = (cat.nombre_es || '').toLowerCase().trim();
            const nombrePtLower = (cat.nombre_pt || '').toLowerCase().trim();
            
            const isPersonalizados = nombreEsLower.includes('personalizado') || 
                                    nombrePtLower.includes('personalizado');
            
            const subcategoryButton = isPersonalizados ? `
                <button class="btn btn-primary" onclick="toggleSubcategoriesForCategory('${cat.id}')" style="padding: 8px 16px; margin-right: 5px;">
                    <i class="fas fa-tags"></i> <span id="subcat-toggle-${cat.id}">Ver Subcategorías</span>
                </button>
            ` : '';
            
            // Contenedor para subcategorías (inicialmente oculto)
            const subcategoriesContainer = isPersonalizados ? `
                <div id="subcategories-${cat.id}" style="display: none; margin-top: 15px; padding: 15px; background: #f0f4f8; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="margin: 0; color: #1d3557;">Subcategorías de ${cat.nombre_es}</h4>
                        <button class="btn btn-primary" onclick="showCreateSubcategoryFormForCategory('${cat.id}', '${cat.nombre_es}')" style="padding: 6px 12px; font-size: 0.875rem;">
                            <i class="fas fa-plus"></i> Crear Subcategoría
                        </button>
                    </div>
                    <div id="subcategories-list-${cat.id}">
                        <p style="color: #6b7280; text-align: center;">Cargando subcategorías...</p>
                    </div>
                </div>
            ` : '';
            
            html += `
                <div class="category-item" style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px;">
                                ${cat.foto ? `<img src="${cat.foto}" alt="${cat.nombre_es}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 6px;">` : ''}
                                <div>
                                    <div style="font-weight: 600; color: #1d3557; margin-bottom: 4px;">
                                        ${cat.nombre_es} / ${cat.nombre_pt}
                                    </div>
                                    <div style="font-size: 0.875rem; color: #6b7280;">
                                        Orden: ${cat.orden} | ${activeBadge}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            ${subcategoryButton}
                            <button class="btn btn-secondary" onclick="editHomeCategory('${cat.id}')" style="padding: 8px 16px;">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-danger" onclick="deleteHomeCategory('${cat.id}')" style="padding: 8px 16px;">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </div>
                    </div>
                    ${subcategoriesContainer}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error cargando categorías del home:', error);
        container.innerHTML = `<p style="color: #ef4444;">Error al cargar: ${error.message}</p>`;
    }
}

function showCreateHomeCategoryForm() {
    editingHomeCategoryId = null;
    categoryFieldsInForm = []; // Limpiar campos
    
    // Mostrar el formulario primero
    const formSection = document.getElementById('homeCategoryFormSection');
    const categoryList = document.getElementById('homeCategoryList');
    const filtersSection = document.getElementById('categoryFiltersSection');
    
    if (formSection) {
        formSection.style.display = 'block';
        formSection.style.visibility = 'visible';
        console.log('✅ Formulario de categoría mostrado');
        
        // Inmediatamente después de mostrar el formulario, forzar la visibilidad de la sección de filtros
        setTimeout(() => {
            const filtersSectionCheck = document.getElementById('categoryFiltersSection');
            if (filtersSectionCheck) {
                filtersSectionCheck.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; background: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 2px solid #e2e8f0;';
                console.log('✅ Sección de filtros forzada a visible inmediatamente');
            } else {
                console.error('❌ No se encontró categoryFiltersSection después de mostrar el formulario');
            }
        }, 50);
    }
    
    if (categoryList) {
        categoryList.style.display = 'none';
    }
    
    // Llenar campos básicos
    document.getElementById('homeCategoryFormTitle').textContent = 'Nueva Categoría Home';
    document.getElementById('homeCategoryNameEs').value = '';
    document.getElementById('homeCategoryNamePt').value = '';
    document.getElementById('homeCategoryFoto').value = '';
    document.getElementById('homeCategoryOrden').value = homeCategories.length;
    document.getElementById('homeCategoryActive').checked = true;
    
    // Esperar un momento para que el DOM se actualice antes de acceder a los elementos de filtros
    setTimeout(() => {
        // FORZAR que la sección de filtros esté visible SIEMPRE
        const filtersSection = document.getElementById('categoryFiltersSection');
        if (filtersSection) {
            // Forzar visibilidad con múltiples métodos
            filtersSection.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; background: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 2px solid #e2e8f0;';
            filtersSection.style.display = 'block';
            filtersSection.style.visibility = 'visible';
            filtersSection.style.opacity = '1';
            console.log('✅ Sección de filtros encontrada y forzada a visible');
        } else {
            console.error('❌ NO se encontró categoryFiltersSection');
            // Intentar buscar por selector
            const filtersSectionFallback = document.querySelector('#homeCategoryFormSection #categoryFiltersSection');
            if (filtersSectionFallback) {
                filtersSectionFallback.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important;';
                console.log('✅ Sección de filtros encontrada por fallback y forzada a visible');
            } else {
                console.error('❌ No se encontró la sección de filtros en ningún lugar');
            }
        }
        
        // Limpiar formulario de campos
        const newFieldId = document.getElementById('newFieldId');
        const newFieldType = document.getElementById('newFieldType');
        const newFieldLabelEs = document.getElementById('newFieldLabelEs');
        const newFieldLabelPt = document.getElementById('newFieldLabelPt');
        const newFieldPlaceholderEs = document.getElementById('newFieldPlaceholderEs');
        const newFieldPlaceholderPt = document.getElementById('newFieldPlaceholderPt');
        const newFieldRequired = document.getElementById('newFieldRequired');
        const newFieldOrden = document.getElementById('newFieldOrden');
        const newFieldOptionsContainer = document.getElementById('newFieldOptionsContainer');
        const newFieldOptionsList = document.getElementById('newFieldOptionsList');
        
        console.log('🔍 Elementos de filtros:', {
            newFieldId: !!newFieldId,
            newFieldType: !!newFieldType,
            newFieldLabelEs: !!newFieldLabelEs,
            newFieldLabelPt: !!newFieldLabelPt,
            filtersSection: !!filtersSection
        });
        
        if (newFieldId) {
            newFieldId.value = '';
            newFieldId.disabled = false;
        }
        if (newFieldLabelEs) newFieldLabelEs.value = '';
        if (newFieldLabelPt) newFieldLabelPt.value = '';
        if (newFieldPlaceholderEs) newFieldPlaceholderEs.value = '';
        if (newFieldPlaceholderPt) newFieldPlaceholderPt.value = '';
        if (newFieldType) newFieldType.value = 'text';
        if (newFieldRequired) newFieldRequired.checked = false;
        if (newFieldOrden) newFieldOrden.value = 0;
        if (newFieldOptionsContainer) newFieldOptionsContainer.style.display = 'none';
        if (newFieldOptionsList) newFieldOptionsList.innerHTML = '';
        
        // Configurar event listener para el select de tipo de campo
        if (newFieldType) {
            // Remover listener anterior si existe
            const newFieldTypeClone = newFieldType.cloneNode(true);
            newFieldType.parentNode.replaceChild(newFieldTypeClone, newFieldType);
            
            // Agregar nuevo listener
            const updatedFieldType = document.getElementById('newFieldType');
            if (updatedFieldType) {
                updatedFieldType.addEventListener('change', function() {
                    const optionsContainer = document.getElementById('newFieldOptionsContainer');
                    if (this.value === 'select') {
                        if (optionsContainer) optionsContainer.style.display = 'block';
                        const optionsList = document.getElementById('newFieldOptionsList');
                        if (optionsList && optionsList.children.length === 0) {
                            addNewFieldOption();
                        }
                    } else {
                        if (optionsContainer) optionsContainer.style.display = 'none';
                    }
                });
            }
        }
        
        // Limpiar y renderizar campos del formulario
        renderCategoryFieldsInForm();
    }, 200);
    
    // Mostrar botón de gestionar campos (aunque esté deshabilitado hasta guardar)
    const manageFieldsBtn = document.getElementById('manageCategoryFieldsBtn');
    if (manageFieldsBtn) {
        manageFieldsBtn.style.display = 'inline-flex';
        manageFieldsBtn.disabled = true;
        manageFieldsBtn.title = 'Guarda la categoría primero para gestionar sus campos';
    }
}

function editHomeCategory(categoryId) {
    const cat = homeCategories.find(c => c.id === categoryId);
    if (!cat) return;
    
    editingHomeCategoryId = categoryId;
    document.getElementById('homeCategoryFormTitle').textContent = `Editar: ${cat.nombre_es}`;
    document.getElementById('homeCategoryNameEs').value = cat.nombre_es || '';
    document.getElementById('homeCategoryNamePt').value = cat.nombre_pt || '';
    document.getElementById('homeCategoryFoto').value = cat.foto || '';
    document.getElementById('homeCategoryOrden').value = cat.orden || 0;
    document.getElementById('homeCategoryActive').checked = cat.is_active !== false;
    document.getElementById('homeCategoryFormSection').style.display = 'block';
    document.getElementById('homeCategoryList').style.display = 'none';
    
    // FORZAR que la sección de filtros esté visible SIEMPRE al editar
    setTimeout(() => {
        const filtersSection = document.getElementById('categoryFiltersSection');
        if (filtersSection) {
            filtersSection.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; background: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 2px solid #e2e8f0;';
            filtersSection.style.display = 'block';
            filtersSection.style.visibility = 'visible';
            console.log('✅ Sección de filtros forzada a visible en edición');
        }
    }, 100);
    
    // Cargar campos existentes de la categoría
    setTimeout(async () => {
        await loadCategoryFieldsForEdit(categoryId);
        renderCategoryFieldsInForm();
    }, 200);
    
    // Mostrar y habilitar botón de gestionar campos
    const manageFieldsBtn = document.getElementById('manageCategoryFieldsBtn');
    if (manageFieldsBtn) {
        manageFieldsBtn.style.display = 'inline-flex';
        manageFieldsBtn.disabled = false;
        manageFieldsBtn.title = 'Gestionar campos/filtros de esta categoría';
    }
    
    // Mostrar botón de crear subcategoría solo si es "Personalizados"
    const createSubcategoryBtn = document.getElementById('createSubcategoryFromFormBtn');
    if (createSubcategoryBtn) {
        const nombreEsLower = (cat.nombre_es || '').toLowerCase().trim();
        const nombrePtLower = (cat.nombre_pt || '').toLowerCase().trim();
        const isPersonalizados = nombreEsLower.includes('personalizado') || nombrePtLower.includes('personalizado');
        
        if (isPersonalizados) {
            createSubcategoryBtn.style.display = 'inline-flex';
            createSubcategoryBtn.setAttribute('data-category-id', categoryId);
            createSubcategoryBtn.setAttribute('data-category-name', cat.nombre_es);
            currentCategoryForSubcategories = categoryId;
        } else {
            createSubcategoryBtn.style.display = 'none';
            createSubcategoryBtn.removeAttribute('data-category-id');
        }
    }
}

function cancelHomeCategoryEdit() {
    editingHomeCategoryId = null;
    categoryFieldsInForm = [];
    document.getElementById('homeCategoryFormSection').style.display = 'none';
    document.getElementById('homeCategoryList').style.display = 'block';
}

// Función auxiliar para cargar campos existentes al editar
async function loadCategoryFieldsForEdit(categoryId) {
    if (!window.universalSupabase) return;
    
    try {
        const supabase = await window.universalSupabase.getClient();
        const { data: fields, error } = await supabase
            .from('category_fields')
            .select('*')
            .eq('categoria_id', categoryId)
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        if (fields && fields.length > 0) {
            categoryFieldsInForm = fields.map(field => ({
                field_id: field.field_id,
                label_es: field.label_es,
                label_pt: field.label_pt,
                field_type: field.field_type,
                placeholder_es: field.placeholder_es || '',
                placeholder_pt: field.placeholder_pt || '',
                options: field.options || [],
                is_required: field.is_required || false,
                orden: field.orden || 0
            }));
        } else {
            categoryFieldsInForm = [];
        }
    } catch (error) {
        console.error('Error cargando campos de la categoría:', error);
        categoryFieldsInForm = [];
    }
}

async function saveHomeCategory() {
    const nombreEs = document.getElementById('homeCategoryNameEs').value.trim();
    const nombrePt = document.getElementById('homeCategoryNamePt').value.trim();
    const foto = document.getElementById('homeCategoryFoto').value.trim();
    const orden = parseInt(document.getElementById('homeCategoryOrden').value) || 0;
    const isActive = document.getElementById('homeCategoryActive').checked;
    
    if (!nombreEs || !nombrePt || !foto) {
        alert('Debes completar el nombre en ambos idiomas y la foto');
        return;
    }
    
    try {
        const categoryData = {
            nombre_es: nombreEs,
            nombre_pt: nombrePt,
            foto: foto,
            orden: orden,
            is_active: isActive
        };
        
        // Debug: mostrar qué datos se están guardando
        console.log('💾 Guardando categoría con datos:', categoryData);
        console.log('📸 URL de foto que se guardará:', foto);
        
        let savedCategoryId = null;
        
        if (editingHomeCategoryId) {
            const { error } = await supabaseClient
                .from('home_categories')
                .update(categoryData)
                .eq('id', editingHomeCategoryId);
            
            if (error) throw error;
            savedCategoryId = editingHomeCategoryId;
            console.log('✅ Categoría actualizada en Supabase');
            alert('✅ Categoría del home actualizada correctamente');
        } else {
            const { data, error } = await supabaseClient
                .from('home_categories')
                .insert(categoryData)
                .select()
                .single();
            
            if (error) throw error;
            savedCategoryId = data.id;
            editingHomeCategoryId = savedCategoryId; // Guardar el ID para poder gestionar campos
            console.log('✅ Categoría creada en Supabase con ID:', savedCategoryId);
            alert('✅ Categoría del home creada correctamente. Ahora puedes gestionar sus campos/filtros.');
        }
        
        // Habilitar botón de gestionar campos después de guardar
        const manageFieldsBtn = document.getElementById('manageCategoryFieldsBtn');
        if (manageFieldsBtn && savedCategoryId) {
            manageFieldsBtn.disabled = false;
            manageFieldsBtn.title = 'Gestionar campos/filtros de esta categoría';
            console.log('✅ Botón de gestionar campos habilitado');
        }
        
        // No cancelar la edición para que el usuario pueda gestionar campos inmediatamente
        // cancelHomeCategoryEdit();
        await loadHomeCategoryList();
    } catch (error) {
        console.error('Error guardando categoría del home:', error);
        alert('Error al guardar: ' + error.message);
    }
}

// ============================================
// FUNCIONES PARA GESTIONAR SUBCATEGORÍAS
// ============================================

window.openSubcategoryManager = function() {
    if (!currentCategoryForSubcategories) {
        alert('Primero debes seleccionar una categoría que tenga subcategorías (ej: Personalizados)');
        return;
    }
    
    // Obtener el nombre de la categoría padre
    const categoriaSelect = document.getElementById('categoria');
    const selectedOption = categoriaSelect.options[categoriaSelect.selectedIndex];
    const categoryName = selectedOption.getAttribute('data-category-name') || 'Personalizados';
    
    openSubcategoryManagerForCategory(currentCategoryForSubcategories, categoryName);
}

window.toggleSubcategoriesForCategory = async function(categoryId) {
    const container = document.getElementById(`subcategories-${categoryId}`);
    const toggleText = document.getElementById(`subcat-toggle-${categoryId}`);
    
    if (!container) return;
    
    if (container.style.display === 'none' || !container.style.display) {
        // Mostrar y cargar subcategorías
        container.style.display = 'block';
        if (toggleText) toggleText.textContent = 'Ocultar Subcategorías';
        
        // Cargar subcategorías para esta categoría
        await loadSubcategoriesForCategory(categoryId);
    } else {
        // Ocultar
        container.style.display = 'none';
        if (toggleText) toggleText.textContent = 'Ver Subcategorías';
    }
}

async function loadSubcategoriesForCategory(categoryId) {
    const listContainer = document.getElementById(`subcategories-list-${categoryId}`);
    if (!listContainer || !supabaseClient) return;
    
    listContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">Cargando subcategorías...</p>';
    
    try {
        const { data, error } = await supabaseClient
            .from('subcategorias')
            .select('*')
            .eq('categoria_padre_id', categoryId)
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        const subcats = data || [];
        
        if (subcats.length === 0) {
            listContainer.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay subcategorías creadas aún.</p>';
            return;
        }
        
        const currentLang = localStorage.getItem('language') || 'pt';
        
        let html = '<div style="display: grid; gap: 10px;">';
        subcats.forEach(subcat => {
            const nombre = currentLang === 'es' ? subcat.nombre_es : 
                          currentLang === 'pt' ? subcat.nombre_pt : 
                          subcat.nombre_es;
            
            const activeBadge = subcat.is_active ? 
                '<span style="background: #10b981; color: white; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Activa</span>' :
                '<span style="background: #6b7280; color: white; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Inactiva</span>';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1d3557; margin-bottom: 4px;">
                            ${nombre}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            Orden: ${subcat.orden} | ${activeBadge}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="editSubcategoryInCategory('${subcat.id}', '${categoryId}')" style="background: #6b7280; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button onclick="deleteSubcategoryInCategory('${subcat.id}', '${categoryId}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listContainer.innerHTML = html;
    } catch (error) {
        console.error('Error cargando subcategorías:', error);
        listContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar: ${error.message}</p>`;
    }
}

window.showCreateSubcategoryFormForCategory = function(categoryId, categoryName) {
    currentCategoryForSubcategories = categoryId;
    
    // Abrir el modal de subcategorías
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Crear Subcategoría - ${categoryName}`;
    }
    
    document.getElementById('subcategoryModal').classList.add('active');
    showCreateSubcategoryForm();
}

window.editSubcategoryInCategory = function(subcategoryId, categoryId) {
    currentCategoryForSubcategories = categoryId;
    
    // Cargar subcategorías primero
    loadSubcategories(categoryId).then(() => {
        editSubcategory(subcategoryId);
        
        // Abrir el modal
        const subcat = subcategories.find(s => s.id === subcategoryId);
        if (subcat) {
            const modalTitle = document.getElementById('subcategoryModalTitle');
            if (modalTitle) {
                // Obtener nombre de la categoría padre
                const cat = homeCategories.find(c => c.id === categoryId);
                const categoryName = cat ? cat.nombre_es : 'Personalizados';
                modalTitle.textContent = `Editar Subcategoría - ${categoryName}`;
            }
        }
        
        document.getElementById('subcategoryModal').classList.add('active');
    });
}

window.deleteSubcategoryInCategory = async function(subcategoryId, categoryId) {
    if (!supabaseClient) {
        alert('Error: No se pudo conectar con la base de datos');
        return;
    }

    // Cargar subcategorías para obtener el nombre
    await loadSubcategories(categoryId);
    const subcat = subcategories.find(s => s.id === subcategoryId);
    if (!subcat) return;
    
    if (!confirm(`¿Estás seguro de que quieres eliminar la subcategoría "${subcat.nombre_es}"?`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('subcategorias')
            .delete()
            .eq('id', subcategoryId);
        
        if (error) throw error;
        
        alert('✅ Subcategoría eliminada');
        // Recargar la lista de subcategorías en el contenedor
        await loadSubcategoriesForCategory(categoryId);
    } catch (error) {
        console.error('Error eliminando subcategoría:', error);
        alert('Error al eliminar: ' + error.message);
    }
}

window.toggleSubcategoriesForCategory = async function(categoryId) {
    const container = document.getElementById(`subcategories-${categoryId}`);
    const toggleText = document.getElementById(`subcat-toggle-${categoryId}`);
    
    if (!container) return;
    
    if (container.style.display === 'none' || !container.style.display) {
        // Mostrar y cargar subcategorías
        container.style.display = 'block';
        if (toggleText) toggleText.textContent = 'Ocultar Subcategorías';
        
        // Cargar subcategorías para esta categoría
        await loadSubcategoriesForCategory(categoryId);
    } else {
        // Ocultar
        container.style.display = 'none';
        if (toggleText) toggleText.textContent = 'Ver Subcategorías';
    }
}

async function loadSubcategoriesForCategory(categoryId) {
    const listContainer = document.getElementById(`subcategories-list-${categoryId}`);
    if (!listContainer || !supabaseClient) return;
    
    listContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">Cargando subcategorías...</p>';
    
    try {
        const { data, error } = await supabaseClient
            .from('subcategorias')
            .select('*')
            .eq('categoria_padre_id', categoryId)
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        const subcats = data || [];
        
        if (subcats.length === 0) {
            listContainer.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay subcategorías creadas aún.</p>';
            return;
        }
        
        const currentLang = localStorage.getItem('language') || 'pt';
        
        let html = '<div style="display: grid; gap: 10px;">';
        subcats.forEach(subcat => {
            const nombre = currentLang === 'es' ? subcat.nombre_es : 
                          currentLang === 'pt' ? subcat.nombre_pt : 
                          subcat.nombre_es;
            
            const activeBadge = subcat.is_active ? 
                '<span style="background: #10b981; color: white; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Activa</span>' :
                '<span style="background: #6b7280; color: white; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Inactiva</span>';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1d3557; margin-bottom: 4px;">
                            ${nombre}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            Orden: ${subcat.orden} | ${activeBadge}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="editSubcategoryInCategory('${subcat.id}', '${categoryId}')" style="background: #6b7280; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button onclick="deleteSubcategoryInCategory('${subcat.id}', '${categoryId}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listContainer.innerHTML = html;
    } catch (error) {
        console.error('Error cargando subcategorías:', error);
        listContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar: ${error.message}</p>`;
    }
}

window.showCreateSubcategoryFormForCategory = function(categoryId, categoryName) {
    currentCategoryForSubcategories = categoryId;
    
    // Abrir el modal de subcategorías
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Crear Subcategoría - ${categoryName}`;
    }
    
    document.getElementById('subcategoryModal').classList.add('active');
    showCreateSubcategoryForm();
}

window.openSubcategoryManagerForCategory = function(categoryId, categoryName) {
    currentCategoryForSubcategories = categoryId;
    
    // Actualizar título del modal
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Gestionar Subcategorías - ${categoryName}`;
    }
    
    // Cerrar el modal de categorías del home si está abierto
    const homeCategoryModal = document.getElementById('homeCategoryModal');
    if (homeCategoryModal && homeCategoryModal.classList.contains('active')) {
        homeCategoryModal.classList.remove('active');
    }
    
    // Abrir el modal de subcategorías
    document.getElementById('subcategoryModal').classList.add('active');
    loadSubcategoryList();
}

window.closeSubcategoryManager = function() {
    document.getElementById('subcategoryModal').classList.remove('active');
    cancelSubcategoryEdit();
}

async function loadSubcategoryList() {
    const container = document.getElementById('subcategoryList');
    if (!container || !currentCategoryForSubcategories) return;
    
    container.innerHTML = '<p>Cargando subcategorías...</p>';
    
    try {
        const { data, error } = await supabaseClient
            .from('subcategorias')
            .select('*')
            .eq('categoria_id', currentCategoryForSubcategories)
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        subcategories = data || [];
        
        if (subcategories.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay subcategorías creadas aún.</p>';
            return;
        }
        
        const currentLang = localStorage.getItem('language') || 'pt';
        
        let html = '<div style="display: grid; gap: 15px;">';
        subcategories.forEach(subcat => {
            const nombre = currentLang === 'es' ? subcat.nombre_es : 
                          currentLang === 'pt' ? subcat.nombre_pt : 
                          subcat.nombre_es;
            
            const activeBadge = subcat.is_active ? 
                '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Activa</span>' :
                '<span style="background: #6b7280; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Inactiva</span>';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1d3557; margin-bottom: 4px;">
                            ${nombre}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            Orden: ${subcat.orden} | ${activeBadge}
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="editSubcategory('${subcat.id}')" style="background: #6b7280; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button onclick="deleteSubcategory('${subcat.id}')" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error cargando subcategorías:', error);
        container.innerHTML = `<p style="color: #ef4444;">Error al cargar: ${error.message}</p>`;
    }
}

window.showCreateSubcategoryForm = function() {
    // Si no hay categoría seleccionada, intentar obtenerla del botón o buscar "Personalizados"
    if (!currentCategoryForSubcategories) {
        const btn = document.getElementById('createSubcategoryFromHomeBtn');
        if (btn) {
            const categoryId = btn.getAttribute('data-category-id');
            if (categoryId) {
                currentCategoryForSubcategories = categoryId;
            }
        }
        
        // Si aún no hay, buscar "Personalizados" en las categorías cargadas
        if (!currentCategoryForSubcategories) {
            const personalizadosCategory = homeCategories.find(cat => {
                const nombreEsLower = (cat.nombre_es || '').toLowerCase().trim();
                const nombrePtLower = (cat.nombre_pt || '').toLowerCase().trim();
                return nombreEsLower.includes('personalizado') || nombrePtLower.includes('personalizado');
            });
            
            if (personalizadosCategory) {
                currentCategoryForSubcategories = personalizadosCategory.id;
            } else {
                alert('No se encontró la categoría "Personalizados". Por favor, créala primero en "Categorías del Home".');
                return;
            }
        }
    }
    
    // Asegurar que el modal esté abierto
    const modal = document.getElementById('subcategoryModal');
    if (!modal) {
        console.error('❌ Modal de subcategorías no encontrado');
        return;
    }
    
    if (!modal.classList.contains('active')) {
        modal.classList.add('active');
    }
    
    // Obtener el nombre de la categoría padre
    let categoryName = 'Personalizados';
    const btn = document.getElementById('createSubcategoryFromHomeBtn');
    if (btn) {
        const name = btn.getAttribute('data-category-name');
        if (name) categoryName = name;
    } else {
        const cat = homeCategories.find(c => c.id === currentCategoryForSubcategories);
        if (cat) categoryName = cat.nombre_es;
    }
    
    // Actualizar título del modal
    const modalTitle = document.getElementById('subcategoryModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `Crear Subcategoría - ${categoryName}`;
    }
    
    // Cargar lista de subcategorías si no está cargada
    loadSubcategoryList();
    
    editingSubcategoryId = null;
    document.getElementById('subcategoryFormTitle').textContent = 'Nueva Subcategoría';
    document.getElementById('subcategoryNameEs').value = '';
    document.getElementById('subcategoryNamePt').value = '';
    document.getElementById('subcategoryOrden').value = subcategories.length || 0;
    document.getElementById('subcategoryActive').checked = true;
    document.getElementById('subcategoryFormSection').style.display = 'block';
    document.getElementById('subcategoryList').style.display = 'none';
}

window.cancelSubcategoryEdit = function() {
    editingSubcategoryId = null;
    document.getElementById('subcategoryFormSection').style.display = 'none';
    document.getElementById('subcategoryList').style.display = 'block';
}

window.editSubcategory = function(subcategoryId) {
    const subcat = subcategories.find(s => s.id === subcategoryId);
    if (!subcat) return;
    
    editingSubcategoryId = subcategoryId;
    document.getElementById('subcategoryFormTitle').textContent = `Editar: ${subcat.nombre_es}`;
    document.getElementById('subcategoryNameEs').value = subcat.nombre_es || '';
    document.getElementById('subcategoryNamePt').value = subcat.nombre_pt || '';
    document.getElementById('subcategoryOrden').value = subcat.orden || 0;
    document.getElementById('subcategoryActive').checked = subcat.is_active !== false;
    document.getElementById('subcategoryFormSection').style.display = 'block';
    document.getElementById('subcategoryList').style.display = 'none';
}

window.saveSubcategory = async function() {
    if (!supabaseClient || !currentCategoryForSubcategories) {
        alert('Error: No se pudo conectar con la base de datos');
        return;
    }

    const nombreEs = document.getElementById('subcategoryNameEs').value.trim();
    const nombrePt = document.getElementById('subcategoryNamePt').value.trim();
    const orden = parseInt(document.getElementById('subcategoryOrden').value) || 0;
    const isActive = document.getElementById('subcategoryActive').checked;
    
    if (!nombreEs || !nombrePt) {
        alert('Debes completar el nombre en ambos idiomas');
        return;
    }
    
    try {
        const subcategoryData = {
            categoria_padre_id: currentCategoryForSubcategories,
            nombre_es: nombreEs,
            nombre_pt: nombrePt,
            orden: orden,
            is_active: isActive
        };
        
        if (editingSubcategoryId) {
            const { error } = await supabaseClient
                .from('subcategorias')
                .update(subcategoryData)
                .eq('id', editingSubcategoryId);
            
            if (error) throw error;
            alert('✅ Subcategoría actualizada correctamente');
        } else {
            const { error } = await supabaseClient
                .from('subcategorias')
                .insert(subcategoryData);
            
            if (error) throw error;
            alert('✅ Subcategoría creada correctamente');
        }
        
        cancelSubcategoryEdit();
        await loadSubcategoryList();
        // Recargar subcategorías en el formulario si está abierto
        if (currentCategoryForSubcategories) {
            loadSubcategories(currentCategoryForSubcategories);
        }
    } catch (error) {
        console.error('Error guardando subcategoría:', error);
        alert('Error al guardar: ' + error.message);
    }
}

window.deleteSubcategory = async function(subcategoryId) {
    if (!supabaseClient) {
        alert('Error: No se pudo conectar con la base de datos');
        return;
    }

    const subcat = subcategories.find(s => s.id === subcategoryId);
    if (!subcat) return;
    
    if (!confirm(`¿Estás seguro de que quieres eliminar la subcategoría "${subcat.nombre_es}"?`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('subcategorias')
            .delete()
            .eq('id', subcategoryId);
        
        if (error) throw error;
        
        alert('✅ Subcategoría eliminada');
        await loadSubcategoryList();
        // Recargar subcategorías en el formulario si está abierto
        if (currentCategoryForSubcategories) {
            loadSubcategories(currentCategoryForSubcategories);
        }
    } catch (error) {
        console.error('Error eliminando subcategoría:', error);
        alert('Error al eliminar: ' + error.message);
    }
}

async function deleteHomeCategory(categoryId) {
    const cat = homeCategories.find(c => c.id === categoryId);
    if (!cat) return;
    
    if (!confirm(`¿Estás seguro de que quieres eliminar la categoría "${cat.nombre_es}"?`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('home_categories')
            .delete()
            .eq('id', categoryId);
        
        if (error) throw error;
        
        alert('✅ Categoría del home eliminada');
        await loadHomeCategoryList();
    } catch (error) {
        console.error('Error eliminando categoría del home:', error);
        alert('Error al eliminar: ' + error.message);
    }
}

// Función para crear la tabla (ejecutar desde consola del navegador)
window.createCategoryTable = async function() {
    if (!supabaseClient) {
        console.error('Supabase no está inicializado');
        return;
    }
    
    const sql = `
        CREATE TABLE IF NOT EXISTS product_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_product_categories_id ON product_categories(id);
    `;
    
    console.log('⚠️ Esta función debe ejecutarse en el SQL Editor de Supabase:');
    console.log(sql);
    console.log('\nO abre la consola de Supabase y ejecuta el SQL manualmente.');
};

// ============================================
// GESTIÓN DE CAMPOS/FILTROS DE CATEGORÍAS
// ============================================

let currentCategoryForFields = null; // ID de la categoría para la que se están gestionando campos
let editingCategoryFieldId = null; // ID del campo que se está editando
let categoryFieldsList = []; // Lista de campos de la categoría actual

async function openCategoryFieldsManager() {
    if (!editingHomeCategoryId) {
        alert('Primero debes guardar la categoría antes de gestionar sus campos.');
        return;
    }
    
    currentCategoryForFields = editingHomeCategoryId;
    const cat = homeCategories.find(c => c.id === editingHomeCategoryId);
    const modalTitle = document.getElementById('categoryFieldsModalTitle');
    if (modalTitle && cat) {
        modalTitle.textContent = `Gestionar Campos/Filtros - ${cat.nombre_es}`;
    }
    
    document.getElementById('categoryFieldsModal').classList.add('active');
    await loadCategoryFieldsList();
}

function closeCategoryFieldsManager() {
    document.getElementById('categoryFieldsModal').classList.remove('active');
    cancelCategoryFieldEdit();
    currentCategoryForFields = null;
}

async function loadCategoryFieldsList() {
    const container = document.getElementById('categoryFieldsList');
    container.innerHTML = '<p>Cargando campos...</p>';
    
    if (!supabaseClient || !currentCategoryForFields) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('category_fields')
            .select('*')
            .eq('categoria_id', currentCategoryForFields)
            .order('orden', { ascending: true });
        
        if (error) throw error;
        
        categoryFieldsList = data || [];
        
        if (categoryFieldsList.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay campos definidos para esta categoría. Crea el primero haciendo clic en "Crear Nuevo Campo".</p>';
            return;
        }
        
        let html = '<div style="display: grid; gap: 15px;">';
        categoryFieldsList.forEach(field => {
            const typeLabels = {
                'text': 'Texto',
                'number': 'Número',
                'select': 'Select',
                'textarea': 'Área de texto'
            };
            
            const requiredBadge = field.is_required ? 
                '<span style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Obligatorio</span>' :
                '<span style="background: #6b7280; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Opcional</span>';
            
            html += `
                <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #1d3557; margin-bottom: 4px;">
                                ${field.label_es} / ${field.label_pt}
                            </div>
                            <div style="font-size: 0.875rem; color: #6b7280;">
                                ID: <code>${field.field_id}</code> | Tipo: ${typeLabels[field.field_type] || field.field_type} | Orden: ${field.orden} | ${requiredBadge}
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-secondary" onclick="editCategoryField('${field.id}')" style="padding: 8px 16px;">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-danger" onclick="deleteCategoryField('${field.id}')" style="padding: 8px 16px;">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error cargando campos:', error);
        container.innerHTML = `<p style="color: #ef4444;">Error al cargar: ${error.message}</p>`;
    }
}

function showCreateCategoryFieldForm() {
    editingCategoryFieldId = null;
    document.getElementById('categoryFieldFormTitle').textContent = 'Nuevo Campo';
    document.getElementById('categoryFieldId').value = '';
    document.getElementById('categoryFieldId').disabled = false;
    document.getElementById('categoryFieldLabelEs').value = '';
    document.getElementById('categoryFieldLabelPt').value = '';
    document.getElementById('categoryFieldType').value = 'text';
    document.getElementById('categoryFieldPlaceholderEs').value = '';
    document.getElementById('categoryFieldPlaceholderPt').value = '';
    document.getElementById('categoryFieldRequired').checked = false;
    document.getElementById('categoryFieldOrden').value = categoryFieldsList.length;
    document.getElementById('fieldOptionsContainer').innerHTML = '';
    toggleFieldOptions();
    document.getElementById('categoryFieldFormSection').style.display = 'block';
    document.getElementById('categoryFieldsList').style.display = 'none';
}

function cancelCategoryFieldEdit() {
    editingCategoryFieldId = null;
    document.getElementById('categoryFieldFormSection').style.display = 'none';
    document.getElementById('categoryFieldsList').style.display = 'block';
}

async function editCategoryField(fieldId) {
    const field = categoryFieldsList.find(f => f.id === fieldId);
    if (!field) return;
    
    editingCategoryFieldId = fieldId;
    document.getElementById('categoryFieldFormTitle').textContent = `Editar: ${field.label_es}`;
    document.getElementById('categoryFieldId').value = field.field_id;
    document.getElementById('categoryFieldId').disabled = true; // No permitir cambiar el ID
    document.getElementById('categoryFieldLabelEs').value = field.label_es || '';
    document.getElementById('categoryFieldLabelPt').value = field.label_pt || '';
    document.getElementById('categoryFieldType').value = field.field_type || 'text';
    document.getElementById('categoryFieldPlaceholderEs').value = field.placeholder_es || '';
    document.getElementById('categoryFieldPlaceholderPt').value = field.placeholder_pt || '';
    document.getElementById('categoryFieldRequired').checked = field.is_required || false;
    document.getElementById('categoryFieldOrden').value = field.orden || 0;
    
    // Cargar opciones si es tipo select
    if (field.field_type === 'select' && field.options && Array.isArray(field.options)) {
        const container = document.getElementById('fieldOptionsContainer');
        container.innerHTML = '';
        field.options.forEach(option => {
            addFieldOption(option.value || '', option.label_es || '', option.label_pt || '');
        });
    } else {
        document.getElementById('fieldOptionsContainer').innerHTML = '';
    }
    
    toggleFieldOptions();
    document.getElementById('categoryFieldFormSection').style.display = 'block';
    document.getElementById('categoryFieldsList').style.display = 'none';
}

async function saveCategoryField() {
    if (!supabaseClient || !currentCategoryForFields) return;
    
    const fieldId = document.getElementById('categoryFieldId').value.trim().toLowerCase().replace(/\s+/g, '_');
    const labelEs = document.getElementById('categoryFieldLabelEs').value.trim();
    const labelPt = document.getElementById('categoryFieldLabelPt').value.trim();
    const fieldType = document.getElementById('categoryFieldType').value;
    const placeholderEs = document.getElementById('categoryFieldPlaceholderEs').value.trim();
    const placeholderPt = document.getElementById('categoryFieldPlaceholderPt').value.trim();
    const isRequired = document.getElementById('categoryFieldRequired').checked;
    const orden = parseInt(document.getElementById('categoryFieldOrden').value) || 0;
    
    if (!fieldId || !labelEs || !labelPt || !fieldType) {
        alert('Debes completar el ID del campo, las etiquetas y el tipo de campo');
        return;
    }
    
    // Validar formato del ID
    if (!/^[a-z0-9_]+$/.test(fieldId)) {
        alert('El ID del campo solo puede contener letras minúsculas, números y guiones bajos');
        return;
    }
    
    // Obtener opciones si es tipo select
    let options = [];
    if (fieldType === 'select') {
        const optionRows = document.querySelectorAll('.field-option-row');
        options = Array.from(optionRows).map(row => {
            const value = row.querySelector('.option-value').value.trim();
            const labelEs = row.querySelector('.option-label-es').value.trim();
            const labelPt = row.querySelector('.option-label-pt').value.trim();
            if (value && labelEs && labelPt) {
                return { value, label_es: labelEs, label_pt: labelPt };
            }
            return null;
        }).filter(opt => opt !== null);
        
        if (options.length === 0) {
            alert('Debes agregar al menos una opción para campos tipo Select');
            return;
        }
    }
    
    try {
        const fieldData = {
            categoria_id: currentCategoryForFields,
            field_id: fieldId,
            label_es: labelEs,
            label_pt: labelPt,
            field_type: fieldType,
            placeholder_es: placeholderEs || null,
            placeholder_pt: placeholderPt || null,
            options: options.length > 0 ? options : null,
            is_required: isRequired,
            orden: orden
        };
        
        if (editingCategoryFieldId) {
            // Actualizar campo existente
            const { error } = await supabaseClient
                .from('category_fields')
                .update(fieldData)
                .eq('id', editingCategoryFieldId);
            
            if (error) throw error;
            alert('Campo actualizado correctamente');
        } else {
            // Crear nuevo campo
            const { error } = await supabaseClient
                .from('category_fields')
                .insert(fieldData);
            
            if (error) throw error;
            alert('Campo creado correctamente');
        }
        
        cancelCategoryFieldEdit();
        await loadCategoryFieldsList();
    } catch (error) {
        console.error('Error guardando campo:', error);
        alert('Error al guardar campo: ' + error.message);
    }
}

async function deleteCategoryField(fieldId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este campo?')) return;
    
    if (!supabaseClient) return;
    
    try {
        const { error } = await supabaseClient
            .from('category_fields')
            .delete()
            .eq('id', fieldId);
        
        if (error) throw error;
        
        alert('Campo eliminado correctamente');
        await loadCategoryFieldsList();
    } catch (error) {
        console.error('Error eliminando campo:', error);
        alert('Error al eliminar campo: ' + error.message);
    }
}

function toggleFieldOptions() {
    const fieldType = document.getElementById('categoryFieldType').value;
    const optionsGroup = document.getElementById('fieldOptionsGroup');
    const placeholderEsGroup = document.getElementById('fieldPlaceholderEsGroup');
    const placeholderPtGroup = document.getElementById('fieldPlaceholderPtGroup');
    
    if (fieldType === 'select') {
        optionsGroup.style.display = 'block';
        placeholderEsGroup.style.display = 'none';
        placeholderPtGroup.style.display = 'none';
        
        // Si no hay opciones, agregar una por defecto
        if (document.getElementById('fieldOptionsContainer').children.length === 0) {
            addFieldOption();
        }
    } else {
        optionsGroup.style.display = 'none';
        placeholderEsGroup.style.display = 'block';
        placeholderPtGroup.style.display = 'block';
    }
}

function addFieldOption(value = '', labelEs = '', labelPt = '') {
    const container = document.getElementById('fieldOptionsContainer');
    const row = document.createElement('div');
    row.className = 'field-option-row';
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: end;';
    
    row.innerHTML = `
        <input type="text" class="option-value" placeholder="Valor (ej: si, no)" value="${value}" style="flex: 1;">
        <input type="text" class="option-label-es" placeholder="Etiqueta ES" value="${labelEs}" style="flex: 1;">
        <input type="text" class="option-label-pt" placeholder="Etiqueta PT" value="${labelPt}" style="flex: 1;">
        <button type="button" class="btn btn-danger" onclick="removeFieldOption(this)" style="padding: 8px 12px;">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(row);
}

function removeFieldOption(button) {
    button.closest('.field-option-row').remove();
}

// ============================================
// GESTIÓN DE CAMPOS EN EL FORMULARIO DE CATEGORÍAS
// ============================================

function addCategoryFieldToForm() {
    categoryFieldsInForm.push({
        field_id: '',
        label_es: '',
        label_pt: '',
        field_type: 'text',
        placeholder_es: '',
        placeholder_pt: '',
        options: [],
        is_required: false,
        orden: categoryFieldsInForm.length
    });
    renderCategoryFieldsInForm();
}

function removeCategoryFieldFromForm(index) {
    if (confirm('¿Estás seguro de que deseas eliminar este campo?')) {
        categoryFieldsInForm.splice(index, 1);
        renderCategoryFieldsInForm();
    }
}

window.addNewFieldOption = function() {
    const container = document.getElementById('newFieldOptionsList');
    if (!container) return;
    
    const optionDiv = document.createElement('div');
    optionDiv.className = 'field-option-row';
    optionDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 15px; align-items: center; margin-bottom: 15px; padding: 15px; background: #f9fafb; border-radius: 8px; border: 2px solid #e5e7eb;';
    
    optionDiv.innerHTML = `
        <input type="text" class="new-option-value" placeholder="Valor (ej: si, no)" 
               style="padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
               onfocus="this.style.borderColor='#1d3557';" 
               onblur="this.style.borderColor='#d1d5db';">
        <input type="text" class="new-option-label-es" placeholder="Etiqueta ES" 
               style="padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
               onfocus="this.style.borderColor='#1d3557';" 
               onblur="this.style.borderColor='#d1d5db';">
        <input type="text" class="new-option-label-pt" placeholder="Etiqueta PT" 
               style="padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
               onfocus="this.style.borderColor='#1d3557';" 
               onblur="this.style.borderColor='#d1d5db';">
        <button type="button" class="btn btn-danger" onclick="removeNewFieldOption(this)" 
                style="padding: 10px 15px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; transition: background 0.2s;"
                onmouseover="this.style.background='#dc2626';" 
                onmouseout="this.style.background='#ef4444';">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(optionDiv);
}

window.removeNewFieldOption = function(button) {
    button.closest('.field-option-row').remove();
}

window.addFieldToCategoryForm = function() {
    const fieldId = document.getElementById('newFieldId').value.trim().toLowerCase().replace(/\s+/g, '_');
    const labelEs = document.getElementById('newFieldLabelEs').value.trim();
    const labelPt = document.getElementById('newFieldLabelPt').value.trim();
    const fieldType = document.getElementById('newFieldType').value;
    const placeholderEs = document.getElementById('newFieldPlaceholderEs').value.trim();
    const placeholderPt = document.getElementById('newFieldPlaceholderPt').value.trim();
    const isRequired = document.getElementById('newFieldRequired').checked;
    const orden = parseInt(document.getElementById('newFieldOrden').value) || categoryFieldsInForm.length;
    
    // Validaciones
    if (!fieldId || !labelEs || !labelPt) {
        alert('Debes completar el ID del campo y las etiquetas en ambos idiomas');
        return;
    }
    
    // Validar formato del ID
    if (!/^[a-z0-9_]+$/.test(fieldId)) {
        alert('El ID del campo solo puede contener letras minúsculas, números y guiones bajos');
        return;
    }
    
    // Verificar que no exista ya un campo con ese ID
    if (categoryFieldsInForm.some(f => f.field_id === fieldId)) {
        alert('Ya existe un campo con ese ID. Por favor, usa otro ID.');
        return;
    }
    
    // Obtener opciones si es tipo select
    let options = [];
    if (fieldType === 'select') {
        const optionRows = document.querySelectorAll('#newFieldOptionsList .field-option-row');
        options = Array.from(optionRows).map(row => {
            const value = row.querySelector('.new-option-value').value.trim();
            const labelEs = row.querySelector('.new-option-label-es').value.trim();
            const labelPt = row.querySelector('.new-option-label-pt').value.trim();
            if (value && labelEs && labelPt) {
                return { value, label_es: labelEs, label_pt: labelPt };
            }
            return null;
        }).filter(opt => opt !== null);
        
        if (options.length === 0) {
            alert('Para campos tipo Select, debes agregar al menos una opción');
            return;
        }
    }
    
    // Agregar el campo a la lista
    categoryFieldsInForm.push({
        field_id: fieldId,
        label_es: labelEs,
        label_pt: labelPt,
        field_type: fieldType,
        placeholder_es: placeholderEs || null,
        placeholder_pt: placeholderPt || null,
        options: options,
        is_required: isRequired,
        orden: orden
    });
    
    // Limpiar el formulario
    document.getElementById('newFieldId').value = '';
    document.getElementById('newFieldId').disabled = false;
    document.getElementById('newFieldLabelEs').value = '';
    document.getElementById('newFieldLabelPt').value = '';
    document.getElementById('newFieldPlaceholderEs').value = '';
    document.getElementById('newFieldPlaceholderPt').value = '';
    document.getElementById('newFieldType').value = 'text';
    document.getElementById('newFieldRequired').checked = false;
    document.getElementById('newFieldOrden').value = categoryFieldsInForm.length;
    document.getElementById('newFieldOptionsContainer').style.display = 'none';
    document.getElementById('newFieldOptionsList').innerHTML = '';
    
    // Renderizar la lista actualizada
    renderCategoryFieldsInForm();
    
    alert('✅ Filtro agregado correctamente');
}

window.editCategoryFieldInFormSimple = function(index) {
    const field = categoryFieldsInForm[index];
    if (!field) return;
    
    // Llenar el formulario con los datos del campo
    document.getElementById('newFieldId').value = field.field_id;
    document.getElementById('newFieldId').disabled = true; // No permitir cambiar el ID
    document.getElementById('newFieldLabelEs').value = field.label_es;
    document.getElementById('newFieldLabelPt').value = field.label_pt;
    document.getElementById('newFieldType').value = field.field_type;
    document.getElementById('newFieldPlaceholderEs').value = field.placeholder_es || '';
    document.getElementById('newFieldPlaceholderPt').value = field.placeholder_pt || '';
    document.getElementById('newFieldRequired').checked = field.is_required || false;
    document.getElementById('newFieldOrden').value = field.orden || index;
    
    // Cargar opciones si es tipo select
    if (field.field_type === 'select' && field.options && field.options.length > 0) {
        const container = document.getElementById('newFieldOptionsList');
        container.innerHTML = '';
        field.options.forEach(opt => {
            addNewFieldOption();
            const rows = container.querySelectorAll('.field-option-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.new-option-value').value = opt.value || '';
            lastRow.querySelector('.new-option-label-es').value = opt.label_es || '';
            lastRow.querySelector('.new-option-label-pt').value = opt.label_pt || '';
        });
        document.getElementById('newFieldOptionsContainer').style.display = 'block';
    } else {
        document.getElementById('newFieldOptionsContainer').style.display = 'none';
        document.getElementById('newFieldOptionsList').innerHTML = '';
    }
    
    // Eliminar el campo de la lista (se volverá a agregar al guardar)
    categoryFieldsInForm.splice(index, 1);
    renderCategoryFieldsInForm();
    
    // Scroll al formulario
    document.getElementById('newFieldId').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderCategoryFieldsInForm() {
    const container = document.getElementById('categoryFieldsFormContainer');
    if (!container) return;
    
    if (categoryFieldsInForm.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay campos agregados. Haz clic en "Agregar Campo" para comenzar.</p>';
        return;
    }
    
    let html = '<div style="display: grid; gap: 15px;">';
    categoryFieldsInForm.forEach((field, index) => {
        const typeLabels = {
            'text': 'Texto',
            'number': 'Número',
            'select': 'Select',
            'textarea': 'Área de texto'
        };
        
        html += `
            <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1d3557; margin-bottom: 8px;">
                            Campo ${index + 1}: ${field.label_es || '(Sin nombre)'} / ${field.label_pt || '(Sin nome)'}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            ID: <code>${field.field_id || '(sin ID)'}</code> | Tipo: ${typeLabels[field.field_type] || field.field_type} | Orden: ${field.orden}
                            ${field.is_required ? ' | <span style="color: #ef4444;">Obligatorio</span>' : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" class="btn btn-secondary" onclick="editCategoryFieldInForm(${index})" style="padding: 6px 12px; font-size: 0.875rem;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-danger" onclick="removeCategoryFieldFromForm(${index})" style="padding: 6px 12px; font-size: 0.875rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function editCategoryFieldInForm(index) {
    const field = categoryFieldsInForm[index];
    if (!field) return;
    
    // Abrir modal de edición de campo con los datos prellenados
    editingCategoryFieldId = field.id || null;
    currentCategoryForFields = editingHomeCategoryId; // Usar el ID de la categoría si existe
    
    // Llenar el formulario del modal
    document.getElementById('categoryFieldFormTitle').textContent = field.id ? `Editar Campo: ${field.label_es}` : `Editar Campo ${index + 1}`;
    document.getElementById('categoryFieldId').value = field.field_id || '';
    document.getElementById('categoryFieldId').disabled = !!field.id; // No permitir cambiar ID si ya existe
    document.getElementById('categoryFieldLabelEs').value = field.label_es || '';
    document.getElementById('categoryFieldLabelPt').value = field.label_pt || '';
    document.getElementById('categoryFieldType').value = field.field_type || 'text';
    document.getElementById('categoryFieldPlaceholderEs').value = field.placeholder_es || '';
    document.getElementById('categoryFieldPlaceholderPt').value = field.placeholder_pt || '';
    document.getElementById('categoryFieldRequired').checked = field.is_required || false;
    document.getElementById('categoryFieldOrden').value = field.orden || index;
    
    // Cargar opciones si es tipo select
    if (field.field_type === 'select' && field.options && Array.isArray(field.options)) {
        const container = document.getElementById('fieldOptionsContainer');
        container.innerHTML = '';
        field.options.forEach(opt => {
            addFieldOption(opt.value || '', opt.label_es || '', opt.label_pt || '');
        });
    } else {
        document.getElementById('fieldOptionsContainer').innerHTML = '';
    }
    
    toggleFieldOptions();
    
    // Abrir modal de campos
    document.getElementById('categoryFieldsModal').classList.add('active');
    document.getElementById('categoryFieldFormSection').style.display = 'block';
    document.getElementById('categoryFieldsList').style.display = 'none';
    
    // Guardar el índice para actualizar el campo correcto
    window.editingFieldIndex = index;
}

// Modificar saveCategoryField para que también actualice categoryFieldsInForm
const originalSaveCategoryField = window.saveCategoryField;
window.saveCategoryField = async function() {
    // Si estamos editando desde el formulario de categoría (no desde el modal de gestión)
    if (window.editingFieldIndex !== undefined) {
        const fieldId = document.getElementById('categoryFieldId').value.trim().toLowerCase().replace(/\s+/g, '_');
        const labelEs = document.getElementById('categoryFieldLabelEs').value.trim();
        const labelPt = document.getElementById('categoryFieldLabelPt').value.trim();
        const fieldType = document.getElementById('categoryFieldType').value;
        const placeholderEs = document.getElementById('categoryFieldPlaceholderEs').value.trim();
        const placeholderPt = document.getElementById('categoryFieldPlaceholderPt').value.trim();
        const isRequired = document.getElementById('categoryFieldRequired').checked;
        const orden = parseInt(document.getElementById('categoryFieldOrden').value) || 0;
        
        if (!fieldId || !labelEs || !labelPt || !fieldType) {
            alert('Debes completar el ID del campo, las etiquetas y el tipo de campo');
            return;
        }
        
        // Validar formato del ID
        if (!/^[a-z0-9_]+$/.test(fieldId)) {
            alert('El ID del campo solo puede contener letras minúsculas, números y guiones bajos');
            return;
        }
        
        // Obtener opciones si es tipo select
        let options = [];
        if (fieldType === 'select') {
            const optionRows = document.querySelectorAll('.field-option-row');
            options = Array.from(optionRows).map(row => {
                const value = row.querySelector('.option-value').value.trim();
                const labelEs = row.querySelector('.option-label-es').value.trim();
                const labelPt = row.querySelector('.option-label-pt').value.trim();
                if (value && labelEs && labelPt) {
                    return { value, label_es: labelEs, label_pt: labelPt };
                }
                return null;
            }).filter(opt => opt !== null);
            
            if (options.length === 0) {
                alert('Debes agregar al menos una opción para campos tipo Select');
                return;
            }
        }
        
        // Actualizar el campo en categoryFieldsInForm
        const fieldData = {
            field_id: fieldId,
            label_es: labelEs,
            label_pt: labelPt,
            field_type: fieldType,
            placeholder_es: placeholderEs || null,
            placeholder_pt: placeholderPt || null,
            options: options.length > 0 ? options : [],
            is_required: isRequired,
            orden: orden
        };
        
        // Si el campo ya tiene ID, mantenerlo
        if (categoryFieldsInForm[window.editingFieldIndex].id) {
            fieldData.id = categoryFieldsInForm[window.editingFieldIndex].id;
        }
        
        categoryFieldsInForm[window.editingFieldIndex] = fieldData;
        renderCategoryFieldsInForm();
        
        // Cerrar modal
        document.getElementById('categoryFieldsModal').classList.remove('active');
        document.getElementById('categoryFieldFormSection').style.display = 'none';
        delete window.editingFieldIndex;
        
        alert('Campo actualizado en el formulario');
        return;
    }
    
    // Si no, usar la función original
    if (originalSaveCategoryField) {
        return originalSaveCategoryField();
    }
};

// ============================================
// GESTIÓN DE CAMPOS EN EL FORMULARIO DE CATEGORÍAS
// ============================================

function addCategoryFieldToForm() {
    categoryFieldsInForm.push({
        field_id: '',
        label_es: '',
        label_pt: '',
        field_type: 'text',
        placeholder_es: '',
        placeholder_pt: '',
        options: [],
        is_required: false,
        orden: categoryFieldsInForm.length
    });
    renderCategoryFieldsInForm();
}

function removeCategoryFieldFromForm(index) {
    categoryFieldsInForm.splice(index, 1);
    renderCategoryFieldsInForm();
}

function renderCategoryFieldsInForm() {
    const container = document.getElementById('categoryFieldsFormContainer');
    if (!container) return;
    
    if (categoryFieldsInForm.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No hay campos agregados. Haz clic en "Agregar Campo" para comenzar.</p>';
        return;
    }
    
    let html = '<div style="display: grid; gap: 15px;">';
    categoryFieldsInForm.forEach((field, index) => {
        const typeLabels = {
            'text': 'Texto',
            'number': 'Número',
            'select': 'Select',
            'textarea': 'Área de texto'
        };
        
        html += `
            <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1d3557; margin-bottom: 8px;">
                            Campo ${index + 1}: ${field.label_es || '(Sin nombre)'} / ${field.label_pt || '(Sin nome)'}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            ID: <code>${field.field_id || '(sin ID)'}</code> | Tipo: ${typeLabels[field.field_type] || field.field_type} | Orden: ${field.orden}
                            ${field.is_required ? ' | <span style="color: #ef4444;">Obligatorio</span>' : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" class="btn btn-secondary" onclick="editCategoryFieldInForm(${index})" style="padding: 6px 12px; font-size: 0.875rem;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-danger" onclick="removeCategoryFieldFromForm(${index})" style="padding: 6px 12px; font-size: 0.875rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function editCategoryFieldInForm(index) {
    const field = categoryFieldsInForm[index];
    if (!field) return;
    
    // Abrir modal de edición de campo con los datos prellenados
    editingCategoryFieldId = field.id || null;
    currentCategoryForFields = editingHomeCategoryId; // Usar el ID de la categoría si existe
    
    // Llenar el formulario del modal
    document.getElementById('categoryFieldFormTitle').textContent = field.id ? `Editar Campo: ${field.label_es}` : `Editar Campo ${index + 1}`;
    document.getElementById('categoryFieldId').value = field.field_id || '';
    document.getElementById('categoryFieldId').disabled = !!field.id; // No permitir cambiar ID si ya existe
    document.getElementById('categoryFieldLabelEs').value = field.label_es || '';
    document.getElementById('categoryFieldLabelPt').value = field.label_pt || '';
    document.getElementById('categoryFieldType').value = field.field_type || 'text';
    document.getElementById('categoryFieldPlaceholderEs').value = field.placeholder_es || '';
    document.getElementById('categoryFieldPlaceholderPt').value = field.placeholder_pt || '';
    document.getElementById('categoryFieldRequired').checked = field.is_required || false;
    document.getElementById('categoryFieldOrden').value = field.orden || index;
    
    // Cargar opciones si es tipo select
    if (field.field_type === 'select' && field.options && Array.isArray(field.options)) {
        const container = document.getElementById('fieldOptionsContainer');
        container.innerHTML = '';
        field.options.forEach(opt => {
            addFieldOption(opt.value || '', opt.label_es || '', opt.label_pt || '');
        });
    } else {
        document.getElementById('fieldOptionsContainer').innerHTML = '';
    }
    
    toggleFieldOptions();
    
    // Abrir modal de campos
    document.getElementById('categoryFieldsModal').classList.add('active');
    document.getElementById('categoryFieldFormSection').style.display = 'block';
    document.getElementById('categoryFieldsList').style.display = 'none';
    
    // Guardar el índice para actualizar el campo correcto
    window.editingFieldIndex = index;
}

// Esta función ya está definida arriba (línea 3303), no duplicar
