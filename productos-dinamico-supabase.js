// Sistema dinámico de productos que carga desde Supabase
class DynamicProductsPage {
    constructor() {
        this.currentLanguage = 'pt';
        this.filters = {
            categories: ['secadores'],
            maxPrice: 200,
            powers: [],
            colors: [],
            types: [],
            technologies: []
        };
        this.allProducts = [];
        this.loadedProducts = false;
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            await this.initializeSupabase();
            await this.loadProductsFromSupabase();
            this.setupEventListeners();
            this.setupPriceRange();
            this.updateDynamicFilters();
            this.applyFilters();
            this.setupLanguageSelector();
        } catch (error) {
            console.error('Error inicializando página:', error);
            this.showErrorMessage();
        }
    }

    async initializeSupabase() {
        // Configuración de Supabase
        const SUPABASE_URL = 'https://fzlvsgjvilompkjmqeoj.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY';
        
        // Verificar que supabase esté disponible
        if (typeof supabase === 'undefined') {
            throw new Error('Supabase no está disponible. Verifica que el script esté cargado.');
        }
        
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase inicializado correctamente');
    }

    async loadProductsFromSupabase() {
        try {
            console.log('🔄 Cargando productos desde múltiples tablas de Supabase...');
            console.log('📊 Cliente Supabase:', this.supabase);
            console.log('🔍 Verificando conexión Supabase...');
            
            if (!this.supabase) {
                throw new Error('Cliente Supabase no inicializado');
            }
            
            // Cargar productos de todas las categorías
            const allProducts = [];
            
            // 1. Cargar secadores
            try {
                const { data: secadores, error: errorSecadores } = await this.supabase
                    .from('secadores')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (errorSecadores) {
                    console.warn('⚠️ Error cargando secadores:', errorSecadores);
                } else {
                    console.log('✅ Secadores cargados:', secadores?.length || 0);
                    if (secadores) {
                        secadores.forEach(product => {
                            allProducts.push({
                                ...product,
                                categoria: 'secadores'
                            });
                        });
                    }
                }
            } catch (err) {
                console.warn('⚠️ Error en tabla secadores:', err);
            }
            
            // 2. Cargar ironing (si existe)
            try {
                const { data: ironing, error: errorIroning } = await this.supabase
                    .from('ironing')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (errorIroning) {
                    console.warn('⚠️ Error cargando ironing:', errorIroning);
                } else {
                    console.log('✅ Ironing cargados:', ironing?.length || 0);
                    if (ironing) {
                        ironing.forEach(product => {
                            allProducts.push({
                                ...product,
                                categoria: 'ironing'
                            });
                        });
                    }
                }
            } catch (err) {
                console.warn('⚠️ Error en tabla ironing:', err);
            }
            
            // 3. Cargar porta_malas (si existe)
            try {
                const { data: portaMalas, error: errorPortaMalas } = await this.supabase
                    .from('porta_malas')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (errorPortaMalas) {
                    console.warn('⚠️ Error cargando porta_malas:', errorPortaMalas);
                } else {
                    console.log('✅ Porta malas cargados:', portaMalas?.length || 0);
                    if (portaMalas) {
                        portaMalas.forEach(product => {
                            allProducts.push({
                                ...product,
                                categoria: 'porta-malas'
                            });
                        });
                    }
                }
            } catch (err) {
                console.warn('⚠️ Error en tabla porta_malas:', err);
            }

            this.allProducts = allProducts;
            this.loadedProducts = true;
            
            console.log('✅ Total productos cargados desde Supabase:', this.allProducts.length);
            console.log('📦 Productos por categoría:', {
                secadores: this.allProducts.filter(p => p.categoria === 'secadores').length,
                ironing: this.allProducts.filter(p => p.categoria === 'ironing').length,
                'porta-malas': this.allProducts.filter(p => p.categoria === 'porta-malas').length
            });
            
            if (this.allProducts.length === 0) {
                this.showLoadingMessage('⚠️ No se encontraron productos en ninguna categoría');
                console.log('⚠️ No se encontraron productos en Supabase');
            } else {
                this.showLoadingMessage(`✅ ${this.allProducts.length} productos cargados de ${new Set(this.allProducts.map(p => p.categoria)).size} categorías`);
                console.log('✅ Productos cargados exitosamente:', this.allProducts);
            }
            
        } catch (error) {
            console.error('❌ Error al cargar productos desde Supabase:', error);
            this.allProducts = [];
            this.loadedProducts = true;
            this.showErrorMessage(`Error: ${error.message}`);
        }
    }

    showLoadingMessage(message) {
        const productsHeader = document.querySelector('.products-header');
        if (productsHeader) {
            productsHeader.innerHTML = `<h2>${message}</h2>`;
        }
    }

    showErrorMessage(customMessage = null) {
        const translations = {
            pt: 'Erro ao carregar produtos. Verifique a conexão com Supabase.',
            es: 'Error al cargar productos. Verifique la conexión con Supabase.',
            en: 'Error loading products. Check Supabase connection.'
        };
        
        const errorMessage = customMessage || translations[this.currentLanguage] || translations.pt;
        this.showLoadingMessage(errorMessage);
        console.error('🚨 Error mostrado al usuario:', errorMessage);
    }

    setupEventListeners() {
        // Filtros de categoría
        document.querySelectorAll('input[type="checkbox"][value="secadores"], input[type="checkbox"][value="ironing"], input[type="checkbox"][value="porta-malas"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleCategoryFilter());
        });

        // Botón limpiar filtros
        const clearButton = document.getElementById('clearFilters');
        if (clearButton) {
            clearButton.addEventListener('click', () => this.clearAllFilters());
        }
    }

    handleCategoryFilter() {
        this.filters.categories = [];
        document.querySelectorAll('input[type="checkbox"][value="secadores"], input[type="checkbox"][value="ironing"], input[type="checkbox"][value="porta-malas"]').forEach(checkbox => {
            if (checkbox.checked) {
                this.filters.categories.push(checkbox.value);
            }
        });
        this.updateDynamicFilters();
        this.applyFilters();
    }

    updateDynamicFilters() {
        // Ocultar todas las secciones de filtros primero
        this.hideAllFilterSections();
        
        // Mostrar solo las secciones relevantes según las categorías seleccionadas
        this.showRelevantFilterSections();
        
        // Actualizar los filtros visibles
        this.updateTypeFilter();
        this.updatePowerFilter();
        this.updateColorFilter();
        this.updateTechnologyFilter();
    }

    hideAllFilterSections() {
        const sections = [
            'powerFilter',
            'colorFilter', 
            'typeFilter',
            'technologyFilter'
        ];
        
        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });
    }

    showRelevantFilterSections() {
        // Mostrar filtros según las categorías seleccionadas
        this.filters.categories.forEach(category => {
            switch(category) {
                case 'secadores':
                    this.showFilterSection('powerFilter');
                    this.showFilterSection('colorFilter');
                    this.showFilterSection('typeFilter');
                    this.showFilterSection('technologyFilter');
                    break;
                case 'ironing':
                    this.showFilterSection('powerFilter');
                    this.showFilterSection('colorFilter');
                    this.showFilterSection('typeFilter');
                    // No mostrar tecnología para ironing
                    break;
                case 'porta-malas':
                    this.showFilterSection('colorFilter');
                    this.showFilterSection('typeFilter');
                    // No mostrar potencia ni tecnología para porta-malas
                    break;
            }
        });
    }

    showFilterSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
        }
    }

    updateTypeFilter() {
        const typeOptions = document.getElementById('typeOptions');
        if (!typeOptions) return;

        const availableTypes = new Set();

        // Obtener tipos disponibles según las categorías seleccionadas
        this.filters.categories.forEach(category => {
            this.allProducts.filter(product => product.categoria === category).forEach(product => {
                // Para secadores usar tipo_instalacion
                if (category === 'secadores' && product.tipo_instalacion && product.tipo_instalacion.trim() !== '') {
                    availableTypes.add(product.tipo_instalacion);
                }
                // Para ironing usar tipo_plancha
                else if (category === 'ironing' && product.tipo_plancha && product.tipo_plancha.trim() !== '') {
                    availableTypes.add(product.tipo_plancha);
                }
                // Para porta-malas usar tipo_estructura
                else if (category === 'porta-malas' && product.tipo_estructura && product.tipo_estructura.trim() !== '') {
                    availableTypes.add(product.tipo_estructura);
                }
            });
        });

        // Si no hay tipos disponibles, ocultar la sección
        if (availableTypes.size === 0) {
            const typeFilter = document.getElementById('typeFilter');
            if (typeFilter) {
                typeFilter.style.display = 'none';
            }
            return;
        }

        // Generar opciones de tipo dinámicamente
        const typeLabels = {
            pt: {
                suelto: 'Suelto',
                pared: 'Pared',
                techo: 'Techo',
                portatil: 'Portátil',
                vertical: 'Vertical',
                horizontal: 'Horizontal',
                compacto: 'Compacto'
            },
            es: {
                suelto: 'Suelto',
                pared: 'Pared',
                techo: 'Techo',
                portatil: 'Portátil',
                vertical: 'Vertical',
                horizontal: 'Horizontal',
                compacto: 'Compacto'
            },
            en: {
                suelto: 'Freestanding',
                pared: 'Wall',
                techo: 'Ceiling',
                portatil: 'Portable',
                vertical: 'Vertical',
                horizontal: 'Horizontal',
                compacto: 'Compact'
            }
        };

        const currentLang = this.currentLanguage;
        const typeOptionsHtml = Array.from(availableTypes).map(type => {
            const label = typeLabels[currentLang]?.[type] || type;
            const isChecked = this.filters.types.includes(type) ? 'checked' : '';
            return `
                <label class="filter-checkbox">
                    <input type="checkbox" value="${type}" ${isChecked}>
                    <span class="checkmark"></span>
                    <span>${label}</span>
                </label>
            `;
        }).join('');

        typeOptions.innerHTML = typeOptionsHtml;

        // Agregar event listeners
        typeOptions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleTypeFilter());
        });
    }

    updatePowerFilter() {
        const powerOptions = document.getElementById('powerOptions');
        if (!powerOptions) return;

        const availablePowers = new Set();

        // Obtener potencias disponibles según las categorías seleccionadas
        this.filters.categories.forEach(category => {
            this.allProducts.filter(product => product.categoria === category).forEach(product => {
                if (product.potencia && product.potencia > 0) {
                    availablePowers.add(product.potencia);
                }
            });
        });

        // Si no hay potencias disponibles, ocultar la sección
        if (availablePowers.size === 0) {
            const powerFilter = document.getElementById('powerFilter');
            if (powerFilter) {
                powerFilter.style.display = 'none';
            }
            return;
        }

        // Ordenar potencias
        const sortedPowers = Array.from(availablePowers).sort((a, b) => a - b);
        
        const powerOptionsHtml = sortedPowers.map(power => {
            const isChecked = this.filters.powers.includes(power) ? 'checked' : '';
            return `
                <label class="filter-checkbox">
                    <input type="checkbox" value="${power}" ${isChecked}>
                    <span class="checkmark"></span>
                    <span>${power}W</span>
                </label>
            `;
        }).join('');

        powerOptions.innerHTML = powerOptionsHtml;

        // Agregar event listeners
        powerOptions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handlePowerFilter());
        });
    }

    updateColorFilter() {
        const colorOptions = document.getElementById('colorOptions');
        if (!colorOptions) return;

        const availableColors = new Set();

        // Obtener colores disponibles según las categorías seleccionadas
        this.filters.categories.forEach(category => {
            this.allProducts.filter(product => product.categoria === category).forEach(product => {
                if (product.color && product.color.trim() !== '') {
                    availableColors.add(product.color);
                }
            });
        });

        // Si no hay colores disponibles, ocultar la sección
        if (availableColors.size === 0) {
            const colorFilter = document.getElementById('colorFilter');
            if (colorFilter) {
                colorFilter.style.display = 'none';
            }
            return;
        }

        const colorOptionsHtml = Array.from(availableColors).map(color => {
            const translatedColor = this.translateColor(color);
            const isChecked = this.filters.colors.includes(color) ? 'checked' : '';
            return `
                <label class="filter-checkbox">
                    <input type="checkbox" value="${color}" ${isChecked}>
                    <span class="checkmark"></span>
                    <span>${translatedColor}</span>
                </label>
            `;
        }).join('');

        colorOptions.innerHTML = colorOptionsHtml;

        // Agregar event listeners
        colorOptions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleColorFilter());
        });
    }

    updateTechnologyFilter() {
        const technologyOptions = document.getElementById('technologyOptions');
        
        // Solo mostrar filtros de tecnología para secadores
        if (!this.filters.categories.includes('secadores')) {
            technologyOptions.innerHTML = '';
            return;
        }

        const technologies = [
            { key: 'tecnologia_ionica', label: { pt: 'Tecnologia Iônica', es: 'Tecnología Iónica', en: 'Ionic Technology' } },
            { key: 'tecnologia_ceramica', label: { pt: 'Tecnologia Cerâmica', es: 'Tecnología Cerámica', en: 'Ceramic Technology' } },
            { key: 'tecnologia_infrarroja', label: { pt: 'Tecnologia Infravermelha', es: 'Tecnología Infrarroja', en: 'Infrared Technology' } },
            { key: 'filtro_aire', label: { pt: 'Filtro de Ar', es: 'Filtro de Aire', en: 'Air Filter' } },
            { key: 'concentrador_aire', label: { pt: 'Concentrador de Ar', es: 'Concentrador de Aire', en: 'Air Concentrator' } },
            { key: 'difusor', label: { pt: 'Difusor', es: 'Difusor', en: 'Diffuser' } }
        ];

        const currentLang = this.currentLanguage;
        const technologyOptionsHtml = technologies.map(tech => {
            const isChecked = this.filters.technologies.includes(tech.key) ? 'checked' : '';
            const label = tech.label[currentLang] || tech.label.pt;
            return `
                <label class="filter-checkbox">
                    <input type="checkbox" value="${tech.key}" ${isChecked}>
                    <span class="checkmark"></span>
                    <span>${label}</span>
                </label>
            `;
        }).join('');

        technologyOptions.innerHTML = technologyOptionsHtml;

        // Agregar event listeners
        technologyOptions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleTechnologyFilter());
        });
    }

    handleTypeFilter() {
        this.filters.types = [];
        document.querySelectorAll('#typeOptions input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.checked) {
                this.filters.types.push(checkbox.value);
            }
        });
        this.applyFilters();
    }

    handlePowerFilter() {
        this.filters.powers = [];
        document.querySelectorAll('#powerOptions input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.checked) {
                this.filters.powers.push(parseInt(checkbox.value));
            }
        });
        this.applyFilters();
    }

    handleColorFilter() {
        this.filters.colors = [];
        document.querySelectorAll('#colorOptions input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.checked) {
                this.filters.colors.push(checkbox.value);
            }
        });
        this.applyFilters();
    }

    handleTechnologyFilter() {
        this.filters.technologies = [];
        document.querySelectorAll('#technologyOptions input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.checked) {
                this.filters.technologies.push(checkbox.value);
            }
        });
        this.applyFilters();
    }

    applyFilters() {
        if (!this.loadedProducts) {
            console.log('⚠️ Productos no cargados aún');
            return;
        }

        console.log('🔄 Aplicando filtros...');
        console.log('📊 Total productos:', this.allProducts.length);
        console.log('🎯 Filtros activos:', this.filters);

        let filteredProducts = this.allProducts.filter(product => {
            // Filtro por categorías
            if (this.filters.categories.length > 0 && !this.filters.categories.includes(product.categoria)) {
                return false;
            }

            // Filtro por precio
            if (product.precio > this.filters.maxPrice) {
                return false;
            }

            // Filtro por potencia
            if (this.filters.powers.length > 0 && !this.filters.powers.includes(product.potencia)) {
                return false;
            }

            // Filtro por color
            if (this.filters.colors.length > 0 && !this.filters.colors.includes(product.color)) {
                return false;
            }

            // Filtro por tecnologías (solo para secadores)
            if (this.filters.technologies.length > 0 && product.categoria === 'secadores') {
                const hasSelectedTechnology = this.filters.technologies.some(tech => product[tech] === true);
                if (!hasSelectedTechnology) {
                    return false;
                }
            }

            // Filtro por tipo según la categoría
            if (this.filters.types.length > 0) {
                let productType = null;
                if (product.categoria === 'secadores') {
                    productType = product.tipo_instalacion;
                } else if (product.categoria === 'ironing') {
                    productType = product.tipo_plancha;
                } else if (product.categoria === 'porta-malas') {
                    productType = product.tipo_estructura;
                }
                
                if (!productType || !this.filters.types.includes(productType)) {
                    return false;
                }
            }

            return true;
        });

        console.log('✅ Productos filtrados:', filteredProducts.length, filteredProducts);
        this.displayProducts(filteredProducts);
    }

    displayProducts(products) {
        const productsContainer = document.getElementById('products-grid');
        console.log('🔍 Contenedor de productos:', productsContainer);
        console.log('📦 Productos a mostrar:', products.length, products);
        
        if (!productsContainer) {
            console.error('❌ No se encontró el contenedor #products-grid');
            return;
        }

        if (products.length === 0) {
            const translations = {
                pt: 'Nenhum produto encontrado com os filtros aplicados.',
                es: 'No se encontraron productos con los filtros aplicados.',
                en: 'No products found with the applied filters.'
            };
            productsContainer.innerHTML = `<div class="no-products">${translations[this.currentLanguage] || translations.pt}</div>`;
            console.log('⚠️ No hay productos para mostrar');
            return;
        }

        const productsHtml = products.map(product => this.createProductCard(product)).join('');
        console.log('🎨 HTML generado:', productsHtml);
        productsContainer.innerHTML = productsHtml;
        console.log('✅ Productos mostrados en el contenedor');
    }

    createProductCard(product) {
        const badgeHtml = product.badge ? `<span class="badge badge--accent" style="position:absolute;left:16px;top:16px;">${product.badge}</span>` : '';
        
        // Obtener especificaciones según la categoría usando el sistema de traducción
        let specs = [];
        if (product.categoria === 'secadores') {
            if (product.potencia) specs.push(`${product.potencia}W`);
            if (product.color) {
                const translatedColor = window.translationSystem ? 
                    window.translationSystem.translateColor(product.color) : 
                    this.translateColor(product.color);
                specs.push(translatedColor);
            }
        } else if (product.categoria === 'ironing') {
            if (product.potencia) specs.push(`${product.potencia}W`);
            if (product.tipo_plancha) {
                const translatedType = window.translationSystem ? 
                    window.translationSystem.translateType(product.tipo_plancha) : 
                    product.tipo_plancha;
                specs.push(translatedType);
            }
        } else if (product.categoria === 'porta-malas') {
            if (product.capacidad) specs.push(`${product.capacidad}L`);
            if (product.tipo_material) {
                const translatedMaterial = window.translationSystem ? 
                    window.translationSystem.translateType(product.tipo_material) : 
                    product.tipo_material;
                specs.push(translatedMaterial);
            }
        }
        
        // Traducir botones
        const addButtonText = window.translationSystem ? 
            window.translationSystem.translateUI('agregar') : 'Añadir';
        const detailsButtonText = window.translationSystem ? 
            window.translationSystem.translateUI('ver_detalles') : 'Detalles';
        
        return `
            <article class="card product-card" data-product-id="${product.id}">
                <div class="media" onclick="window.location.href='producto-detalle.html?id=${product.id}'" style="cursor: pointer;">
                    <img src="${product.foto}" alt="${product.nombre}" onerror="this.src='secador.png'">
                    ${badgeHtml}
                </div>

                <div style="padding:12px">
                    <h3 class="title" onclick="window.location.href='producto-detalle.html?id=${product.id}'" style="cursor: pointer;">${product.nombre}</h3>
                    <div class="meta">
                        ${specs.map(spec => `<span class="badge">${spec}</span>`).join('')}
                    </div>
                    <div style="margin-top:8px;font-size:1.1rem;color:var(--brand-gold);">€${product.precio}</div>
                    <div style="margin-top:8px">
                        <button class="btn btn-primary" onclick="event.stopPropagation(); addToCart(${JSON.stringify(product).replace(/"/g, '&quot;')})">${addButtonText}</button>
                        <button class="btn btn-secondary" onclick="event.stopPropagation(); window.location.href='producto-detalle.html?id=${product.id}'">${detailsButtonText}</button>
                    </div>
                </div>
            </article>
        `;
    }

    translateColor(color) {
        const colorTranslations = {
            pt: {
                black: 'Preto',
                white: 'Branco',
                silver: 'Prata',
                pink: 'Rosa',
                blue: 'Azul',
                red: 'Vermelho',
                green: 'Verde',
                yellow: 'Amarelo'
            },
            es: {
                black: 'Negro',
                white: 'Blanco',
                silver: 'Plata',
                pink: 'Rosa',
                blue: 'Azul',
                red: 'Rojo',
                green: 'Verde',
                yellow: 'Amarillo'
            },
            en: {
                black: 'Black',
                white: 'White',
                silver: 'Silver',
                pink: 'Pink',
                blue: 'Blue',
                red: 'Red',
                green: 'Green',
                yellow: 'Yellow'
            }
        };
        
        return colorTranslations[this.currentLanguage]?.[color] || color;
    }

    setupPriceRange() {
        const priceRange = document.getElementById('priceSlider') || document.getElementById('priceRange');
        const priceValue = document.getElementById('priceValue');
        
        if (!priceRange || !priceValue) return;

        // Calcular precio máximo de todos los productos
        const maxPrice = this.allProducts.length > 0 ? Math.max(...this.allProducts.map(p => p.precio)) : 200;
        
        priceRange.max = Math.ceil(maxPrice);
        priceRange.value = Math.ceil(maxPrice);
        
        // Actualizar valor inicial
        this.updatePriceValue(Math.ceil(maxPrice));

        // Resetear filtros
        this.filters = {
            categories: ['secadores'],
            maxPrice: Math.ceil(maxPrice),
            powers: [],
            colors: [],
            types: [],
            technologies: []
        };

        // Agregar event listener para el slider
        priceRange.addEventListener('input', () => {
            const value = priceRange.value;
            this.updatePriceValue(value);
            this.filters.maxPrice = parseInt(value);
            this.applyFilters();
        });

        this.updateDynamicFilters();
        this.applyFilters();
    }

    updatePriceValue(value) {
        const priceValue = document.getElementById('priceValue');
        if (!priceValue) return;

        const translations = {
            pt: `Até €${value}`,
            es: `Hasta €${value}`,
            en: `Up to €${value}`
        };
        priceValue.textContent = translations[this.currentLanguage];
    }

    clearAllFilters() {
        // Resetear categorías a secadores por defecto
        this.filters = {
            categories: ['secadores'],
            maxPrice: this.filters.maxPrice,
            powers: [],
            colors: [],
            types: [],
            technologies: []
        };

        // Desmarcar todos los checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Marcar secadores por defecto
        const secadoresCheckbox = document.querySelector('input[type="checkbox"][value="secadores"]');
        if (secadoresCheckbox) {
            secadoresCheckbox.checked = true;
        }

        this.updateDynamicFilters();
        this.applyFilters();
    }

    setupLanguageSelector() {
        const flagButtons = document.querySelectorAll('.flag-btn');
        flagButtons.forEach(button => {
            button.addEventListener('click', () => {
                const lang = button.getAttribute('data-lang');
                this.changeLanguage(lang);
            });
        });
    }

    changeLanguage(lang) {
        this.currentLanguage = lang;
        
        // Actualizar botones de idioma
        document.querySelectorAll('.flag-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-lang="${lang}"]`).classList.add('active');
        
        // Actualizar sistema de traducción
        if (window.translationSystem) {
            window.translationSystem.setLanguage(lang);
        }
        
        // Actualizar filtros dinámicos
        this.updateDynamicFilters();
        
        // Actualizar títulos de filtros dinámicos
        this.updateFilterTitles(lang);
        
        // Aplicar filtros
        this.applyFilters();
    }

    updateFilterTitles(lang) {
        const translations = {
            pt: {
                power: 'Potência',
                color: 'Cor',
                type: 'Tipo',
                technology: 'Tecnologia',
                upTo: 'Até'
            },
            es: {
                power: 'Potencia',
                color: 'Color',
                type: 'Tipo',
                technology: 'Tecnología',
                upTo: 'Hasta'
            },
            en: {
                power: 'Power',
                color: 'Color',
                type: 'Type',
                technology: 'Technology',
                upTo: 'Up to'
            }
        };

        const t = translations[lang] || translations.pt;

        // Actualizar títulos de filtros dinámicos
        const powerTitle = document.getElementById('power-title');
        const colorTitle = document.getElementById('color-title');
        const typeTitle = document.getElementById('type-title');
        const technologyTitle = document.getElementById('technology-title');

        if (powerTitle) powerTitle.textContent = t.power;
        if (colorTitle) colorTitle.textContent = t.color;
        if (typeTitle) typeTitle.textContent = t.type;
        if (technologyTitle) technologyTitle.textContent = t.technology;

        // Actualizar valor del precio
        const priceSlider = document.getElementById('priceSlider') || document.getElementById('priceRange');
        if (priceSlider) {
            const currentValue = priceSlider.value || '200';
            this.updatePriceValue(currentValue);
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.productManager = new DynamicProductsPage();
});