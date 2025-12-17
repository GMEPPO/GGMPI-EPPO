/**
 * Sistema de Carrito de Compras - EPPO
 * Maneja la funcionalidad completa del carrito incluyendo agregar categorías
 */

class CartManager {
    constructor() {
        this.cart = this.loadCart();
        this.currentLanguage = localStorage.getItem('language') || 'pt';
        this.allProducts = [];
        this.allCategories = []; // Categorías con nombres en ambos idiomas
        this.selectedProduct = null;
        this.supabase = null;
        this.editingProposalId = null;
        this.editingProposalData = null;
        this.init();
    }

    async init() {
        await this.initializeSupabase();
        await this.loadAllProducts();
        await this.loadCategories(); // Cargar categorías desde Supabase
        
        // Verificar si estamos editando una propuesta
        await this.checkIfEditingProposal();
        
        // Enriquecer items del carrito con datos de la BD si faltan
        this.enrichCartItemsFromDB();
        
        this.setupEventListeners();
        this.renderCart();
        this.updateSummary();
        
        // Actualizar plazos según stock después de cargar
        this.updateDeliveryTimesFromStock();
    }

    async checkIfEditingProposal() {
        // Verificar si hay un parámetro edit en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        
        if (editId) {
            this.editingProposalId = editId;
            
            // Cargar datos de la propuesta desde localStorage o desde Supabase
            const savedData = localStorage.getItem('editing_proposal');
            if (savedData) {
                try {
                    this.editingProposalData = JSON.parse(savedData);
                    await this.loadProposalIntoCart();
                    // Mostrar indicador de edición después de cargar datos
                    this.showEditingIndicator();
                } catch (error) {
                    await this.loadProposalFromSupabase(editId);
                    // Mostrar indicador de edición después de cargar datos
                    this.showEditingIndicator();
                }
            } else {
                await this.loadProposalFromSupabase(editId);
                // Mostrar indicador de edición después de cargar datos
                this.showEditingIndicator();
            }
        }
    }

    async loadProposalFromSupabase(proposalId) {
        if (!this.supabase) {
            // No inicializado
            return;
        }

        try {
            // Cargar propuesta
            const { data: proposal, error: proposalError } = await this.supabase
                .from('presupuestos')
                .select('*')
                .eq('id', proposalId)
                .single();

            if (proposalError) {
                throw proposalError;
            }

            // Cargar artículos
            const { data: articulos, error: articulosError } = await this.supabase
                .from('presupuestos_articulos')
                .select('*')
                .eq('presupuesto_id', proposalId);

            if (articulosError) {
                throw articulosError;
            }

            this.editingProposalData = {
                id: proposal.id,
                nombre_cliente: proposal.nombre_cliente,
                nombre_comercial: proposal.nombre_comercial,
                fecha_inicial: proposal.fecha_inicial,
                estado_propuesta: proposal.estado_propuesta,
                codigo_propuesta: proposal.codigo_propuesta || null,
                numero_cliente: proposal.numero_cliente || '0',
                articulos: articulos || []
            };

            // Cargar productos exclusivos del cliente si existe
            await this.loadClientExclusiveProducts(proposal.nombre_cliente);
            
            // Recargar todos los productos para incluir los exclusivos del cliente
            await this.loadAllProducts();

            await this.loadProposalIntoCart();
        } catch (error) {
            // Error al cargar propuesta
        }
    }

    /**
     * Comparar artículos originales con nuevos y generar lista de cambios
     */
    compareArticlesAndGenerateEdits(articulosOriginales, articulosNuevos) {
        const cambios = [];
        const lang = this.currentLanguage || 'pt';

        // Crear mapas para búsqueda rápida
        const mapaOriginales = new Map();
        articulosOriginales.forEach(art => {
            const key = `${art.nombre_articulo}_${art.referencia_articulo || ''}`;
            if (!mapaOriginales.has(key)) {
                mapaOriginales.set(key, []);
            }
            mapaOriginales.get(key).push(art);
        });

        const mapaNuevos = new Map();
        articulosNuevos.forEach(art => {
            const key = `${art.nombre_articulo}_${art.referencia_articulo || ''}`;
            if (!mapaNuevos.has(key)) {
                mapaNuevos.set(key, []);
            }
            mapaNuevos.get(key).push(art);
        });

        // Detectar productos eliminados
        mapaOriginales.forEach((originales, key) => {
            const nuevos = mapaNuevos.get(key) || [];
            const totalOriginal = originales.reduce((sum, art) => sum + (art.cantidad || 0), 0);
            const totalNuevo = nuevos.reduce((sum, art) => sum + (art.cantidad || 0), 0);

            if (totalNuevo < totalOriginal) {
                const cantidadEliminada = totalOriginal - totalNuevo;
                const articulo = originales[0];
                const mensaje = lang === 'es' ?
                    `Se eliminaron ${cantidadEliminada} unidad(es) de "${articulo.nombre_articulo}"` :
                    lang === 'pt' ?
                    `Foram removidas ${cantidadEliminada} unidade(s) de "${articulo.nombre_articulo}"` :
                    `${cantidadEliminada} unit(s) of "${articulo.nombre_articulo}" were removed`;
                cambios.push({
                    tipo: 'eliminacion',
                    articulo: articulo.nombre_articulo,
                    referencia: articulo.referencia_articulo || '',
                    cantidad_anterior: totalOriginal,
                    cantidad_nueva: totalNuevo,
                    descripcion: mensaje
                });
            } else if (totalNuevo === 0 && totalOriginal > 0) {
                const articulo = originales[0];
                const mensaje = lang === 'es' ?
                    `Se eliminó el producto "${articulo.nombre_articulo}"` :
                    lang === 'pt' ?
                    `O produto "${articulo.nombre_articulo}" foi removido` :
                    `Product "${articulo.nombre_articulo}" was removed`;
                cambios.push({
                    tipo: 'eliminacion',
                    articulo: articulo.nombre_articulo,
                    referencia: articulo.referencia_articulo || '',
                    cantidad_anterior: totalOriginal,
                    cantidad_nueva: 0,
                    descripcion: mensaje
                });
            }
        });

        // Detectar productos agregados y modificaciones
        mapaNuevos.forEach((nuevos, key) => {
            const originales = mapaOriginales.get(key) || [];
            const totalOriginal = originales.reduce((sum, art) => sum + (art.cantidad || 0), 0);
            const totalNuevo = nuevos.reduce((sum, art) => sum + (art.cantidad || 0), 0);

            if (originales.length === 0) {
                // Producto nuevo agregado
                nuevos.forEach(art => {
                    const mensaje = lang === 'es' ?
                        `Se agregó "${art.nombre_articulo}" (Cantidad: ${art.cantidad}, Precio: €${art.precio.toFixed(2)})` :
                        lang === 'pt' ?
                        `Foi adicionado "${art.nombre_articulo}" (Quantidade: ${art.cantidad}, Preço: €${art.precio.toFixed(2)})` :
                        `Added "${art.nombre_articulo}" (Quantity: ${art.cantidad}, Price: €${art.precio.toFixed(2)})`;
                    cambios.push({
                        tipo: 'agregado',
                        articulo: art.nombre_articulo,
                        referencia: art.referencia_articulo || '',
                        cantidad: art.cantidad,
                        precio: art.precio,
                        descripcion: mensaje
                    });
                });
            } else {
                // Comparar cambios en productos existentes
                const artOriginal = originales[0];
                const artNuevo = nuevos[0];

                // Cambio en cantidad
                if (totalNuevo !== totalOriginal) {
                    const mensaje = lang === 'es' ?
                        `Cantidad de "${artOriginal.nombre_articulo}" cambió de ${totalOriginal} a ${totalNuevo}` :
                        lang === 'pt' ?
                        `Quantidade de "${artOriginal.nombre_articulo}" alterou de ${totalOriginal} para ${totalNuevo}` :
                        `Quantity of "${artOriginal.nombre_articulo}" changed from ${totalOriginal} to ${totalNuevo}`;
                    cambios.push({
                        tipo: 'modificacion',
                        articulo: artOriginal.nombre_articulo,
                        referencia: artOriginal.referencia_articulo || '',
                        campo: 'cantidad',
                        valor_anterior: totalOriginal,
                        valor_nuevo: totalNuevo,
                        descripcion: mensaje
                    });
                }

                // Cambio en precio
                const precioOriginal = Number(artOriginal.precio) || 0;
                const precioNuevo = Number(artNuevo.precio) || 0;
                if (Math.abs(precioOriginal - precioNuevo) > 0.01) {
                    const mensaje = lang === 'es' ?
                        `Precio de "${artOriginal.nombre_articulo}" cambió de €${precioOriginal.toFixed(2)} a €${precioNuevo.toFixed(2)}` :
                        lang === 'pt' ?
                        `Preço de "${artOriginal.nombre_articulo}" alterou de €${precioOriginal.toFixed(2)} para €${precioNuevo.toFixed(2)}` :
                        `Price of "${artOriginal.nombre_articulo}" changed from €${precioOriginal.toFixed(2)} to €${precioNuevo.toFixed(2)}`;
                    cambios.push({
                        tipo: 'modificacion',
                        articulo: artOriginal.nombre_articulo,
                        referencia: artOriginal.referencia_articulo || '',
                        campo: 'precio',
                        valor_anterior: precioOriginal,
                        valor_nuevo: precioNuevo,
                        descripcion: mensaje
                    });
                }

                // Cambio en observaciones
                const obsOriginal = (artOriginal.observaciones || '').trim();
                const obsNuevo = (artNuevo.observaciones || '').trim();
                // Normalizar valores vacíos y comparar
                const obsOriginalNormalizado = obsOriginal || '';
                const obsNuevoNormalizado = obsNuevo || '';
                if (obsOriginalNormalizado !== obsNuevoNormalizado) {
                    const mensaje = lang === 'es' ?
                        `Observaciones de "${artOriginal.nombre_articulo}" fueron modificadas` :
                        lang === 'pt' ?
                        `Observações de "${artOriginal.nombre_articulo}" foram alteradas` :
                        `Observations of "${artOriginal.nombre_articulo}" were modified`;
                    cambios.push({
                        tipo: 'modificacion',
                        articulo: artOriginal.nombre_articulo,
                        referencia: artOriginal.referencia_articulo || '',
                        campo: 'observaciones',
                        valor_anterior: obsOriginal || '(sin observaciones)',
                        valor_nuevo: obsNuevo || '(sin observaciones)',
                        descripcion: mensaje
                    });
                }

                // Cambio en personalización
                // Normalizar valores: convertir a minúsculas y manejar valores equivalentes
                const normalizarPersonalizacion = (valor) => {
                    // Manejar null, undefined, o string vacío
                    if (!valor || typeof valor !== 'string') return '';
                    const normalizado = valor.trim().toLowerCase();
                    // Si está vacío después de trim, retornar string vacío
                    if (normalizado === '') return '';
                    // Mapear valores equivalentes a un valor estándar
                    const equivalentes = {
                        'sin personalización': '',
                        'sem personalização': '',
                        'sem personalizacao': '',
                        'no personalization': '',
                        'sem personalizaçao': '', // Variante con ç
                        '': ''
                    };
                    return equivalentes[normalizado] !== undefined ? equivalentes[normalizado] : normalizado;
                };
                
                const persOriginal = artOriginal.tipo_personalizacion ? String(artOriginal.tipo_personalizacion).trim() : '';
                const persNuevo = artNuevo.tipo_personalizacion ? String(artNuevo.tipo_personalizacion).trim() : '';
                const persOriginalNormalizado = normalizarPersonalizacion(persOriginal);
                const persNuevoNormalizado = normalizarPersonalizacion(persNuevo);
                
                // Solo registrar si realmente son diferentes después de normalizar
                if (persOriginalNormalizado !== persNuevoNormalizado) {
                    const mensaje = lang === 'es' ?
                        `Personalización de "${artOriginal.nombre_articulo}" cambió de "${persOriginal || 'Sin personalización'}" a "${persNuevo || 'Sin personalización'}"` :
                        lang === 'pt' ?
                        `Personalização de "${artOriginal.nombre_articulo}" alterou de "${persOriginal || 'Sem personalização'}" para "${persNuevo || 'Sem personalização'}"` :
                        `Personalization of "${artOriginal.nombre_articulo}" changed from "${persOriginal || 'No personalization'}" to "${persNuevo || 'No personalization'}"`;
                    cambios.push({
                        tipo: 'modificacion',
                        articulo: artOriginal.nombre_articulo,
                        referencia: artOriginal.referencia_articulo || '',
                        campo: 'personalizacion',
                        valor_anterior: persOriginal || '(sin personalización)',
                        valor_nuevo: persNuevo || '(sin personalización)',
                        descripcion: mensaje
                    });
                }
            }
        });

        return cambios;
    }

    /**
     * Registrar ediciones de la propuesta en ediciones_propuesta
     */
    async registrarEdicionesPropuesta(proposalId, cambios, usuario) {
        if (!this.supabase) {
            await this.initializeSupabase();
        }

        if (!cambios || cambios.length === 0) {
            return;
        }

        try {
            // Obtener las ediciones actuales
            const { data: proposalData, error: fetchError } = await this.supabase
                .from('presupuestos')
                .select('ediciones_propuesta')
                .eq('id', proposalId)
                .single();

            if (fetchError) {
                return;
            }

            const edicionesActuales = proposalData?.ediciones_propuesta || [];
            const fecha = new Date().toISOString();
            const lang = this.currentLanguage || 'pt';

            // Crear un registro consolidado de todas las ediciones
            const descripcionCompleta = cambios.map(c => c.descripcion).join('; ');
            const titulo = lang === 'es' ?
                `Edición de propuesta - ${cambios.length} cambio(s)` :
                lang === 'pt' ?
                `Edição de proposta - ${cambios.length} alteração(ões)` :
                `Proposal edit - ${cambios.length} change(s)`;

            const nuevoRegistro = {
                fecha: fecha,
                titulo: titulo,
                descripcion: descripcionCompleta,
                cambios: cambios, // Guardar detalles de cada cambio
                usuario: usuario || localStorage.getItem('commercial_name') || 'Sistema'
            };

            const nuevasEdiciones = [...edicionesActuales, nuevoRegistro];

            // Actualizar las ediciones
            const { error: updateError } = await this.supabase
                .from('presupuestos')
                .update({ ediciones_propuesta: nuevasEdiciones })
                .eq('id', proposalId);

            if (updateError) {
                // Error al registrar ediciones, continuar sin interrumpir
            }
        } catch (error) {
            // Error al registrar ediciones, continuar sin interrumpir
        }
    }

    async loadProposalIntoCart() {
        if (!this.editingProposalData || !this.editingProposalData.articulos) {
            return;
        }

        // Limpiar carrito actual
        this.cart = [];
        this.saveCart();

        // Cargar cada artículo en el carrito
        for (const articulo of this.editingProposalData.articulos) {
            // Buscar el producto en la base de datos
            const product = this.allProducts.find(p => 
                String(p.id) === String(articulo.referencia_articulo) || 
                p.nombre === articulo.nombre_articulo
            );

            if (product) {
                // Normalizar cantidad según boxSize si existe
                let quantity = parseInt(articulo.cantidad) || 1;
                if (product.box_size) {
                    const productForNormalization = {
                        id: product.id,
                        boxSize: product.box_size ? Number(product.box_size) : null // Usar boxSize en camelCase
                    };
                    quantity = this.normalizeQuantityForBox(productForNormalization, quantity);
                }
                
                // Agregar producto con datos del artículo
                // Generar un ID único para este item del carrito
                const cartItemId = `cart-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                const cartItem = {
                    id: product.id,
                    cartItemId: cartItemId, // ID único para identificar este item específico en el carrito
                    type: 'product',
                    name: articulo.nombre_articulo || product.nombre,
                    category: product.categoria,
                    price: parseFloat(articulo.precio) || product.precio,
                    basePrice: product.precio,
                    image: product.foto,
                    quantity: quantity,
                    specs: this.getProductSpecs(product),
                    descripcionEs: product.descripcionEs || product.descripcion_es || '',
                    descripcionPt: product.descripcionPt || product.descripcion_pt || '',
                    description: this.currentLanguage === 'es' ? 
                        (product.descripcionEs || product.descripcion_es || '') : 
                        (product.descripcionPt || product.descripcion_pt || ''),
                    referencia: articulo.referencia_articulo || String(product.id),
                    plazoEntrega: articulo.plazo_entrega || product.plazoEntrega || product.plazo_entrega || '',
                    price_tiers: product.price_tiers || [],
                    variants: product.variants || [],
                    selectedVariant: (() => {
                        // Buscar la variante correcta por su nombre (tipo_personalizacion)
                        if (articulo.tipo_personalizacion && 
                            articulo.tipo_personalizacion !== 'Sin personalización' && 
                            articulo.tipo_personalizacion !== 'Sem personalização' && 
                            articulo.tipo_personalizacion !== 'No customization' &&
                            product.variants && 
                            product.variants.length > 0) {
                            // Buscar el índice de la variante que coincida con el nombre guardado
                            const variantIndex = product.variants.findIndex(variant => 
                                variant.name === articulo.tipo_personalizacion ||
                                variant.nombre === articulo.tipo_personalizacion
                            );
                            // Si se encuentra, devolver el índice; si no, devolver null
                            return variantIndex >= 0 ? variantIndex : null;
                        }
                        return null;
                    })(),
                    variantes_referencias: product.variantes_referencias || [],
                    selectedReferenceVariant: (articulo.variante_referencia !== null && articulo.variante_referencia !== undefined) 
                        ? parseInt(articulo.variante_referencia) 
                        : null, // Cargar color seleccionado desde la propuesta
                    observations: articulo.observaciones || '',
                    box_size: product.box_size || null,
                    phc_ref: product.phc_ref || null,
                    logoUrl: articulo.logo_url || null
                };

                this.cart.push(cartItem);
            } else {
                // Si no se encuentra el producto, agregar como pedido especial
                this.cart.push({
                    id: `special-${Date.now()}`,
                    type: 'special',
                    name: articulo.nombre_articulo,
                    category: 'otros',
                    price: parseFloat(articulo.precio) || 0,
                    basePrice: parseFloat(articulo.precio) || 0,
                    quantity: parseInt(articulo.cantidad) || 1,
                    referencia: articulo.referencia_articulo || '',
                    plazoEntrega: articulo.plazo_entrega || '',
                    observations: articulo.observaciones || ''
                });
            }
        }

        this.saveCart();
        this.renderCart();
        this.updateSummary();
        
        // Actualizar plazos según stock
        this.updateDeliveryTimesFromStock();

        // Prellenar formulario con datos de la propuesta
        this.prefillProposalForm();
    }

    /**
     * Cargar productos exclusivos del cliente
     */
    async loadClientExclusiveProducts(clienteNombre) {
        if (!this.supabase || !clienteNombre) {
            return;
        }

        try {
            // Cargar productos asociados a este cliente
            const { data: clientProducts, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('cliente_id', clienteNombre)
                .order('nombre', { ascending: true });

            if (error) {
                return;
            }

            // Agregar productos exclusivos a allProducts
            if (clientProducts && clientProducts.length > 0) {
                // Evitar duplicados
                const existingIds = new Set(this.allProducts.map(p => p.id));
                const newProducts = clientProducts.filter(p => !existingIds.has(p.id));
                this.allProducts = [...this.allProducts, ...newProducts];
            }
        } catch (error) {
            // Error al cargar productos exclusivos, continuar sin interrumpir
        }
    }

    prefillProposalForm() {
        if (!this.editingProposalData) return;

        // Prellenar campos del formulario si existen
        const clientNameInput = document.getElementById('clientNameInput');
        const commercialNameInput = document.getElementById('commercialNameInput');
        const proposalDateInput = document.getElementById('proposalDateInput');

        if (clientNameInput) {
            clientNameInput.value = this.editingProposalData.nombre_cliente || '';
        }
        if (commercialNameInput) {
            commercialNameInput.value = this.editingProposalData.nombre_comercial || '';
        }
        if (proposalDateInput) {
            const fecha = new Date(this.editingProposalData.fecha_inicial);
            proposalDateInput.value = fecha.toISOString().split('T')[0];
            // Configurar fecha: desde hace un mes hasta hoy
            const today = new Date();
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1); // Restar un mes
            const maxDate = today.toISOString().split('T')[0]; // Máximo: hoy
            const minDate = oneMonthAgo.toISOString().split('T')[0]; // Mínimo: hace un mes
            proposalDateInput.setAttribute('max', maxDate);
            proposalDateInput.setAttribute('min', minDate);
        }
        const clientNumberInput = document.getElementById('clientNumberInput');
        if (clientNumberInput) {
            // Si no hay número de cliente o es null, usar "0"
            clientNumberInput.value = this.editingProposalData.numero_cliente || '0';
        }
    }

    showEditingIndicator() {
        // Mostrar botón de productos exclusivos solo si hay propuesta en edición
        const exclusiveBtn = document.getElementById('addExclusiveProductBtn');
        if (exclusiveBtn) {
            if (this.editingProposalData && this.editingProposalData.nombre_cliente) {
                exclusiveBtn.style.display = 'inline-block';
            } else {
                exclusiveBtn.style.display = 'none';
            }
        }
        
        // Crear o actualizar indicador visual en la parte inferior
        let indicator = document.getElementById('editing-proposal-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'editing-proposal-indicator';
            indicator.className = 'editing-indicator';
            document.body.appendChild(indicator);
        }

        // Obtener información de la propuesta
        const proposalId = this.editingProposalId || '';
        const clientName = this.editingProposalData?.nombre_cliente || '';
        
        // Usar código de propuesta si existe, sino usar primeros 8 caracteres del UUID
        const proposalNumber = this.editingProposalData?.codigo_propuesta || 
                              (proposalId ? proposalId.substring(0, 8).toUpperCase() : '');

        let message = '';
        if (this.currentLanguage === 'es') {
            message = `Editando Propuesta #${proposalNumber} - Cliente: ${clientName}`;
        } else if (this.currentLanguage === 'pt') {
            message = `Editando Proposta #${proposalNumber} - Cliente: ${clientName}`;
        } else {
            message = `Editing Proposal #${proposalNumber} - Client: ${clientName}`;
        }
        
        indicator.innerHTML = `
            <div class="editing-indicator-content">
                <i class="fas fa-edit"></i>
                <span>${message}</span>
            </div>
        `;

        // Mostrar información en la barra del carrito
        this.showEditingInfoInCartBar(proposalNumber, clientName);
    }

    showEditingInfoInCartBar(proposalNumber, clientName) {
        const infoContainer = document.getElementById('editing-proposal-info');
        const numberText = document.getElementById('editing-proposal-number-text');
        const clientText = document.getElementById('editing-proposal-client-text');

        if (infoContainer && numberText && clientText) {
            // Mostrar el contenedor
            infoContainer.style.display = 'flex';

            // Configurar textos según idioma
            if (this.currentLanguage === 'es') {
                numberText.textContent = `Propuesta #${proposalNumber}`;
                clientText.textContent = `Cliente: ${clientName}`;
            } else if (this.currentLanguage === 'pt') {
                numberText.textContent = `Proposta #${proposalNumber}`;
                clientText.textContent = `Cliente: ${clientName}`;
            } else {
                numberText.textContent = `Proposal #${proposalNumber}`;
                clientText.textContent = `Client: ${clientName}`;
            }
        }

        // Ocultar botón de crear propuesta cuando se edita
        const generateProposalBtn = document.getElementById('generateProposalBtn');
        if (generateProposalBtn) {
            generateProposalBtn.style.display = 'none';
        }

        // Cambiar texto del botón de enviar propuesta
        const sendProposalBtn = document.getElementById('sendProposalBtn');
        const sendProposalText = document.getElementById('send-proposal-text');
        if (sendProposalBtn && sendProposalText) {
            if (this.currentLanguage === 'es') {
                sendProposalText.textContent = 'Actualizar Propuesta';
            } else if (this.currentLanguage === 'pt') {
                sendProposalText.textContent = 'Atualizar Proposta';
            } else {
                sendProposalText.textContent = 'Update Proposal';
            }
        }
    }

    /**
     * Enriquecer items del carrito con datos de la BD
     */
    enrichCartItemsFromDB() {
        this.cart.forEach(item => {
            if (item.type === 'product') {
                const productFromDB = this.allProducts.find(p => p.id === item.id);
                if (productFromDB) {
                    // Agregar descripciones si no están
                    if (!item.descripcionEs && productFromDB.descripcionEs) {
                        item.descripcionEs = productFromDB.descripcionEs;
                    }
                    if (!item.descripcionPt && productFromDB.descripcionPt) {
                        item.descripcionPt = productFromDB.descripcionPt;
                    }
                    // Agregar plazo de entrega si no está
                    if (!item.plazoEntrega && productFromDB.plazoEntrega) {
                        item.plazoEntrega = productFromDB.plazoEntrega;
                    }
                    // Agregar phc_ref si no está (importante para consulta de stock)
                    if (!item.phc_ref && productFromDB.phc_ref) {
                        item.phc_ref = productFromDB.phc_ref;
                    }
                    // Agregar box_size si no está
                    if (!item.box_size && productFromDB.box_size) {
                        item.box_size = productFromDB.box_size;
                    }
                    // Agregar price_tiers si no están
                    if ((!item.price_tiers || item.price_tiers.length === 0) && productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
                        item.price_tiers = productFromDB.price_tiers;
                        // Recalcular precio según escalones
                        const priceResult = this.getPriceForQuantity(item.price_tiers, item.quantity, item.basePrice || productFromDB.precio || item.price);
                        item.price = priceResult.price;
                        item.minQuantity = priceResult.minQuantity;
                        item.isValidQuantity = priceResult.isValid;
                    } else if (item.price_tiers && item.price_tiers.length > 0) {
                        // Actualizar precio según escalones si existen
                        const priceResult = this.getPriceForQuantity(item.price_tiers, item.quantity, item.basePrice || item.price);
                        item.price = priceResult.price;
                        item.minQuantity = priceResult.minQuantity;
                        item.isValidQuantity = priceResult.isValid;
                    }
                    // Actualizar descripción según idioma actual
                    item.description = this.currentLanguage === 'es' ? 
                        (item.descripcionEs || '') :
                        (item.descripcionPt || item.descripcionEs || '');
                }
            }
        });
        this.saveCart();
    }

    /**
     * Inicializar Supabase
     */
    async initializeSupabase() {
        try {
            // Usar siempre el cliente compartido para evitar múltiples instancias
            if (window.universalSupabase) {
                this.supabase = await window.universalSupabase.getClient();
            } else {
                throw new Error('Supabase no está disponible. Asegúrate de que supabase-config-universal.js se cargue antes.');
            }
        } catch (error) {
            // Error al inicializar
        }
    }

    /**
     * Cargar todos los productos desde Supabase
     */
    async loadAllProducts() {
        if (!this.supabase) {
            // No se pueden cargar productos
            return;
        }

        try {
            // Si NO se está editando una propuesta, excluir productos con cliente_id
            // Solo cargar productos generales (sin cliente asociado)
            let query = this.supabase
                .from('products')
                .select('*');
            
            // Si NO estamos editando una propuesta, excluir productos exclusivos de clientes
            // Solo cargar productos generales (sin cliente asociado) cuando se crea un presupuesto nuevo
            if (!this.editingProposalId && !this.editingProposalData) {
                query = query.is('cliente_id', null);
            }
            // Si estamos editando una propuesta, loadAllProducts cargará todos los productos
            // y luego loadClientExclusiveProducts agregará los exclusivos del cliente
            
            const { data, error } = await query
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            this.allProducts = (data || []).map(product => {
                // Normalizar price_tiers
                let priceTiers = [];
                if (Array.isArray(product.price_tiers)) {
                    priceTiers = product.price_tiers;
                } else if (product.price_tiers) {
                    try {
                        priceTiers = typeof product.price_tiers === 'string' ? JSON.parse(product.price_tiers) : [product.price_tiers];
                    } catch (e) {
                        priceTiers = [];
                    }
                }
                
                // Normalizar variants
                let variants = [];
                if (Array.isArray(product.variants)) {
                    variants = product.variants;
                } else if (product.variants) {
                    try {
                        variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : [];
                    } catch (e) {
                        variants = [];
                    }
                }
                
                // Normalizar variantes_referencias
                let variantesReferencias = [];
                if (Array.isArray(product.variantes_referencias)) {
                    variantesReferencias = product.variantes_referencias;
                } else if (product.variantes_referencias) {
                    try {
                        variantesReferencias = typeof product.variantes_referencias === 'string' ? JSON.parse(product.variantes_referencias) : [];
                    } catch (e) {
                        variantesReferencias = [];
                    }
                }
                
                const nombreEs = product.nombre_es || product.nombreEs || product.modelo || product.nombre || 'Sin nombre';
                const nombrePt = product.nombre_pt || product.nombrePt || '';
                const categoriaId = product.categoria_id || product.category_id || product.categoria_general_id || product.category_general_id || product.categoria_general || product.category_general || product.categoria || product.category || 'sin-categoria';
                const categoriaSlug = typeof categoriaId === 'string' ? categoriaId.toLowerCase() : String(categoriaId).toLowerCase();
                
                return {
                    id: product.id,
                    nombre: nombreEs, // mantener compatibilidad
                    nombre_es: nombreEs,
                    nombre_pt: nombrePt,
                    categoria: categoriaSlug || 'sin-categoria',
                    categoria_id: categoriaId,
                    precio: product.precio !== null && product.precio !== undefined ? Number(product.precio) : 0,
                    foto: product.foto || null,
                    referencia: product.id ? String(product.id) : '',
                    marca: product.marcaEs || product.marca || '',
                    potencia: product.potencia || null,
                    color: product.color || null,
                    tipo: product.tipo || null,
                    descripcionEs: product.descripcion_es || product.descripcionEs || '',
                    descripcionPt: product.descripcion_pt || product.descripcionPt || '',
                    plazoEntrega: product.plazo_entrega || product.plazoEntrega || '',
                    price_tiers: priceTiers,
                    variants: variants,
                    variantes_referencias: variantesReferencias, // Variantes de referencias por color
                    box_size: product.box_size || null, // Incluir box_size
                    phc_ref: product.phc_ref || null, // Incluir phc_ref
                    mercado: product.mercado || 'AMBOS' // Incluir mercado
                };
            });

        } catch (error) {
            this.showNotification('Error al cargar productos para búsqueda', 'error');
        }
    }

    /**
     * Cargar categorías desde Supabase con nombres en ambos idiomas
     */
    async loadCategories() {
        if (!this.supabase) {
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('categorias_geral')
                .select('*');

            if (error) {
                return;
            }

            if (!data || data.length === 0) {
                return;
            }

            const normalizeString = (str) => {
                return (str || '').toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '');
            };

            // Guardar categorías con sus nombres en ambos idiomas
            this.allCategories = (data || []).map(cat => {
                const nombreEs = cat.nombres_es || cat.nombre_es || '';
                const nombrePt = cat.nombres_pt || cat.nombre_pt || '';
                
                return {
                    id: cat.id,
                    nombre_es: nombreEs,
                    nombre_pt: nombrePt,
                    slug: normalizeString(nombreEs),
                    slug_es: normalizeString(nombreEs),
                    slug_pt: normalizeString(nombrePt)
                };
            });
        } catch (error) {
            // Error silencioso
        }
    }

    /**
     * Cargar carrito desde localStorage
     */
    loadCart() {
        const savedCart = localStorage.getItem('eppo_cart');
        if (savedCart) {
            try {
                const cart = JSON.parse(savedCart);
                // Asegurar que todos los items tengan cartItemId (para compatibilidad con items antiguos)
                cart.forEach((item, index) => {
                    if (!item.cartItemId) {
                        // Generar un cartItemId único para items antiguos que no lo tienen
                        item.cartItemId = `cart-item-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    }
                });
                return cart;
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    /**
     * Formatear precio unitario: mostrar hasta 4 decimales si el precio tiene 4 decimales significativos
     * @param {number|string} price - Precio a formatear (puede ser número o string para preservar decimales)
     * @returns {string} - Precio formateado con el número correcto de decimales
     */
    formatUnitPrice(price) {
        if (!price || price === 0) {
            return '0.00';
        }
        
        // Si es string, preservar los decimales originales
        let priceStr = '';
        if (typeof price === 'string') {
            priceStr = price.trim();
        } else {
            // Si es número, usar toFixed(6) para capturar todos los decimales posibles
            priceStr = Number(price).toFixed(6);
        }
        
        const numPrice = Number(price);
        if (isNaN(numPrice)) {
            return '0.00';
        }
        
        // Verificar si el string original tiene decimales
        const decimalIndex = priceStr.indexOf('.');
        if (decimalIndex === -1) {
            // No tiene decimales, mostrar 2
            return numPrice.toFixed(2);
        }
        
        // Obtener la parte decimal del string original
        const decimalPart = priceStr.substring(decimalIndex + 1);
        // Eliminar ceros finales para contar solo decimales significativos
        const significantDecimals = decimalPart.replace(/0+$/, '');
        
        // Si tiene 3 o 4 decimales significativos, mostrar hasta 4
        if (significantDecimals.length >= 3 && significantDecimals.length <= 4) {
            // Mostrar hasta 4 decimales, eliminando ceros finales innecesarios
            const formatted = numPrice.toFixed(4);
            const parts = formatted.split('.');
            if (parts.length === 2) {
                const decimals = parts[1].replace(/0+$/, '');
                // Si después de eliminar ceros quedan menos de 2 decimales, usar 2
                if (decimals.length < 2) {
                    return numPrice.toFixed(2);
                }
                // Si quedan 2, 3 o 4 decimales, mostrarlos
                return parts[0] + '.' + decimals;
            }
            return formatted;
        } else {
            // Mostrar 2 decimales
            return numPrice.toFixed(2);
        }
    }

    /**
     * Formatear total: siempre mostrar 2 decimales
     * @param {number} total - Total a formatear
     * @returns {string} - Total formateado con 2 decimales
     */
    formatTotal(total) {
        if (!total || total === 0) {
            return '0.00';
        }
        
        const numTotal = Number(total);
        if (isNaN(numTotal)) {
            return '0.00';
        }
        
        return numTotal.toFixed(2);
    }

    /**
     * Guardar carrito en localStorage
     */
    saveCart() {
        localStorage.setItem('eppo_cart', JSON.stringify(this.cart));
    }

    /**
     * Agregar producto individual al carrito
     * Siempre crea un nuevo item, permitiendo duplicados para comparar variantes
     */
    addProduct(product, quantity = 1) {
        // Normalizar cantidad según boxSize
        // Crear objeto para normalización con boxSize en camelCase
        const productForNormalization = {
            id: product.id,
            boxSize: product.box_size ? Number(product.box_size) : null
        };
        
        // Convertir quantity a número
        const quantityNum = Number(quantity) || 1;
        
        // Normalizar la cantidad
        let normalizedQuantity = this.normalizeQuantityForBox(productForNormalization, quantityNum);
        
        // Si la cantidad fue ajustada, mostrar aviso
        if (normalizedQuantity !== quantityNum && product.box_size) {
            const lang = this.currentLanguage || 'es';
            const message = lang === 'es' ? 
                `Este producto solo se vende en cajas de ${product.box_size} unidades. La cantidad se ha ajustado a ${normalizedQuantity}.` :
                lang === 'pt' ?
                `Este produto só é vendido em caixas de ${product.box_size} unidades. A quantidade foi ajustada para ${normalizedQuantity}.` :
                `This product is only sold in boxes of ${product.box_size} units. The quantity has been adjusted to ${normalizedQuantity}.`;
            this.showNotification(message, 'info');
        }

        // Obtener descripción según idioma
        const description = this.currentLanguage === 'es' ? 
            (product.descripcionEs || product.descripcion_es || '') :
            (product.descripcionPt || product.descripcion_pt || product.descripcionEs || product.descripcion_es || '');

        // Obtener price_tiers del producto
        let priceTiers = [];
        if (product.price_tiers && Array.isArray(product.price_tiers)) {
            priceTiers = product.price_tiers;
        } else {
            // Buscar en allProducts si no está en el producto
            const productFromDB = this.allProducts.find(p => p.id === product.id);
            if (productFromDB && productFromDB.price_tiers) {
                priceTiers = productFromDB.price_tiers;
            }
        }

        // Calcular precio inicial según escalones usando cantidad normalizada
        const initialPriceResult = this.getPriceForQuantity(priceTiers, normalizedQuantity, product.precio);
        const initialPrice = initialPriceResult.price;

        // Siempre crear un nuevo item (permitir duplicados)
        // Generar un ID único para este item del carrito
        const cartItemId = `cart-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Obtener variantes de referencias (para selección de color)
        let referenceVariants = [];
        if (product.variantes_referencias && Array.isArray(product.variantes_referencias)) {
            referenceVariants = product.variantes_referencias;
        } else {
            // Buscar en allProducts si no está en el producto
            const productFromDB = this.allProducts.find(p => p.id === product.id);
            if (productFromDB && productFromDB.variantes_referencias && Array.isArray(productFromDB.variantes_referencias)) {
                referenceVariants = productFromDB.variantes_referencias;
            }
        }
        
            this.cart.push({
                id: product.id,
            cartItemId: cartItemId, // ID único para identificar este item específico en el carrito
                type: 'product',
                name: product.nombre,
                category: product.categoria,
                price: initialPrice,
                basePrice: product.precio, // Precio base por si no hay escalones
                image: product.foto,
                quantity: normalizedQuantity, // Usar cantidad normalizada
                specs: this.getProductSpecs(product),
                descripcionEs: product.descripcionEs || product.descripcion_es || '',
                descripcionPt: product.descripcionPt || product.descripcion_pt || '',
                description: description,
                referencia: product.id ? String(product.id) : '',
                plazoEntrega: product.plazoEntrega || product.plazo_entrega || '',
                price_tiers: priceTiers.length > 0 ? priceTiers : [], // Asegurar que siempre sea un array
                variants: product.variants || [], // Variantes personalizadas
                selectedVariant: null, // Variante seleccionada (null = base)
            variantes_referencias: referenceVariants, // Variantes de referencias por color
            selectedReferenceVariant: null, // Variante de referencia seleccionada (null = sin seleccionar)
                minQuantity: initialPriceResult.minQuantity,
                isValidQuantity: initialPriceResult.isValid,
                box_size: product.box_size || null, // Guardar box_size
                phc_ref: product.phc_ref || null, // Guardar phc_ref
                observations: '' // Campo para observaciones del usuario
            });
        
        // Guardar inmediatamente para asegurar que price_tiers se guarden
        this.saveCart();

        this.saveCart();
        this.renderCart();
        this.updateSummary();
        this.showNotification('Producto agregado al carrito', 'success');
        
        // Actualizar plazos de entrega según stock (después de renderizar, sin bloquear)
        // Solo actualizar el producto que se acaba de agregar
        // Usar setTimeout para asegurar que el DOM se haya actualizado completamente
        setTimeout(() => {
            this.updateDeliveryTimesFromStock(cartItemId);
        }, 100);
    }

    /**
     * Agregar categoría completa al carrito
     */
    addCategory(category, quantity, notes = '') {
        const categoryItem = {
            id: `category_${category}_${Date.now()}`,
            type: 'category',
            name: this.getCategoryName(category),
            category: category,
            quantity: quantity,
            notes: notes,
            price: 0, // Se calculará basado en productos seleccionados
            image: null // Las imágenes de categoría ahora vienen desde Supabase, no desde archivos locales
        };

        this.cart.push(categoryItem);
        this.saveCart();
        this.renderCart();
        this.updateSummary();
        this.showNotification('Categoría agregada al carrito', 'success');
    }

    // Funciones de cantidad eliminadas - solo usar las funciones "simple" globales

    /**
     * Remover item del carrito
     */
    removeItem(itemId) {
        // Filtrar el item - buscar por cartItemId primero (para items duplicados), luego por id como fallback
        const initialLength = this.cart.length;
        this.cart = this.cart.filter(item => {
            // Si itemId empieza con "cart-item-", es un cartItemId
            if (itemId && itemId.toString().startsWith('cart-item-')) {
                return item.cartItemId !== itemId && String(item.cartItemId) !== String(itemId);
            }
            // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
            const matchesCartItemId = item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId);
            const matchesId = String(item.id) === String(itemId) || item.id === itemId;
            return !matchesCartItemId && !matchesId;
        });
        
        // Solo actualizar si realmente se eliminó un item
        if (this.cart.length < initialLength) {
            this.saveCart();
            this.renderCart();
            this.updateSummary();
            this.showNotification('Producto removido del presupuesto', 'info');
        }
    }

    /**
     * Limpiar todo el carrito
     */
    clearCart() {
        if (this.cart.length === 0) return;
        
        if (confirm('¿Estás seguro de que quieres limpiar todo el carrito?')) {
            this.cart = [];
            this.saveCart();
            this.renderCart();
            this.updateSummary();
            this.showNotification('Carrito limpiado', 'info');
        }
    }

    /**
     * Renderizar encabezados del carrito
     */
    renderCartHeaders() {
        const translations = {
            pt: {
                foto: 'Foto',
                descricao: 'Descrição',
                quantidade: 'Quantidade',
                preco: 'Preço',
                prazoEntrega: 'Prazo de Entrega',
                acoes: 'Ações'
            },
            es: {
                foto: 'Foto',
                descricao: 'Descripción',
                quantidade: 'Cantidad',
                preco: 'Precio',
                prazoEntrega: 'Plazo de Entrega',
                acoes: 'Acciones'
            },
            en: {
                foto: 'Photo',
                descricao: 'Description',
                quantidade: 'Quantity',
                preco: 'Price',
                prazoEntrega: 'Delivery Time',
                acoes: 'Actions'
            }
        };

        const t = translations[this.currentLanguage] || translations.pt;

        return `
            <div class="cart-item-header">
                <div class="cart-header-cell">${t.foto}</div>
                <div class="cart-header-cell">${t.descricao}</div>
                <div class="cart-header-cell">${t.quantidade}</div>
                <div class="cart-header-cell">${t.preco}</div>
                <div class="cart-header-cell">${t.prazoEntrega}</div>
                <div class="cart-header-cell">${t.acoes}</div>
            </div>
        `;
    }

    /**
     * Obtener traducciones para mensajes de stock
     * @returns {Object} Objeto con las traducciones según el idioma actual
     */
    getStockTranslations() {
        const translations = {
            es: {
                enStock: 'En stock',
                unidadesEnStock: 'unidades en stock',
                restantes: 'Restantes',
                plazoEntrega: 'plazo de entrega',
                sujetoConfirmacion: '(sujeto a confirmación en el momento de la adjudicación)'
            },
            pt: {
                enStock: 'Em stock',
                unidadesEnStock: 'unidades em stock',
                restantes: 'Restantes',
                plazoEntrega: 'prazo de entrega',
                sujetoConfirmacion: '(sujeito a confirmação no momento da adjudicação)'
            },
            en: {
                enStock: 'In stock',
                unidadesEnStock: 'units in stock',
                restantes: 'Remaining',
                plazoEntrega: 'delivery time',
                sujetoConfirmacion: '(subject to confirmation at the time of award)'
            }
        };
        return translations[this.currentLanguage] || translations.es;
    }

    /**
     * Actualizar plazos de entrega según stock (después de renderizar)
     * @param {string} specificItemId - Opcional: ID del item específico a actualizar. Si no se proporciona, actualiza todos.
     */
    async updateDeliveryTimesFromStock(specificItemId = null) {
        // Si se especifica un itemId, solo actualizar ese elemento
        let deliveryElements;
        if (specificItemId) {
            // Buscar el elemento específico usando el itemId
            const cartItem = document.querySelector(`.cart-item[data-item-id="${specificItemId}"]`);
            if (cartItem) {
                const deliveryElement = cartItem.querySelector('.delivery-time[data-phc-ref]');
                deliveryElements = deliveryElement ? [deliveryElement] : [];
            } else {
                // Si no se encuentra, intentar buscar de otra manera
                deliveryElements = [];
            }
            
            // IMPORTANTE: Si se especificó un itemId, NO actualizar otros elementos
            if (deliveryElements.length === 0) {
                return Promise.resolve();
            }
        } else {
            // Solo actualizar todos si NO se especificó un itemId específico
            // Esto solo debe ocurrir en la carga inicial o al cargar una propuesta
            deliveryElements = document.querySelectorAll('.delivery-time[data-phc-ref]');
        }
        
        for (const element of deliveryElements) {
            const phcRef = element.getAttribute('data-phc-ref');
            const quantity = parseInt(element.getAttribute('data-quantity') || '1');
            const elementItemId = element.getAttribute('data-item-id');
            
            // Si se especificó un specificItemId, usar ese para buscar el item
            // Si no, usar el itemId del elemento
            const itemIdToUse = specificItemId || elementItemId;
            
            // Obtener el plazo original del item
            // Buscar por cartItemId primero (para items duplicados), luego por id como fallback
            const item = this.cart.find(i => {
                // Si itemIdToUse empieza con "cart-item-", es un cartItemId
                if (itemIdToUse && itemIdToUse.toString().startsWith('cart-item-')) {
                    return i.cartItemId === itemIdToUse || String(i.cartItemId) === String(itemIdToUse);
                }
                // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
                return (i.cartItemId && (String(i.cartItemId) === String(itemIdToUse) || i.cartItemId === itemIdToUse)) ||
                       (String(i.id) === String(itemIdToUse) || i.id === itemIdToUse);
            });
            
            if (!item) {
                continue;
            }
            
            // Si se especificó un specificItemId, usar la cantidad del item encontrado, no la del atributo
            const quantityToUse = specificItemId ? item.quantity : quantity;
            
            // VERIFICAR PRIMERO: Si hay una variante seleccionada con plazo de entrega, usar ese plazo exclusivamente
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                const selectedVariant = item.variants[item.selectedVariant];
                if (selectedVariant && (selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime)) {
                    const variantDeliveryTime = selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime;
                    // Guardar el plazo de variante en el item si no está guardado
                    if (!item.variantDeliveryTime) {
                        item.variantDeliveryTime = variantDeliveryTime;
                        this.saveCart();
                    }
                    // Mostrar el plazo de la variante directamente, sin consultar stock
                    element.innerHTML = '';
                    const span = document.createElement('span');
                    span.textContent = variantDeliveryTime;
                    element.appendChild(span);
                    // Actualizar también el atributo data-quantity
                    element.setAttribute('data-quantity', quantityToUse);
                    // Mantener data-phc-ref aunque no se use stock, para consistencia
                    if (!element.getAttribute('data-phc-ref')) {
                        element.setAttribute('data-phc-ref', item.phc_ref || '');
                    }
                    continue; // Saltar el resto del procesamiento para este item
                }
            }
            
            // Si no hay plazo de variante, proceder con el cálculo normal basado en stock
            // SIEMPRE obtener la referencia PHC desde products.phc_ref para asegurar que sea la correcta
            // Buscar el producto en allProducts (que viene de products) para obtener su phc_ref y plazo de entrega
            // Usar item.id (el ID del producto) para buscar en allProducts, no itemId (que es cartItemId)
            const productFromDB = this.allProducts.find(p => String(p.id) === String(item.id));
            let finalPhcRef = null;
            let plazoNormal = '';
            
            // Obtener referencia PHC: primero productFromDB, luego item.phc_ref como fallback
            if (productFromDB && productFromDB.phc_ref) {
                finalPhcRef = productFromDB.phc_ref;
            } else if (item.phc_ref) {
                finalPhcRef = item.phc_ref;
            }
            
            if (!finalPhcRef) {
                // Sin referencia PHC no podemos consultar stock
                continue;
            }
            
            // Actualizar el item en el carrito con la referencia PHC correcta
            if (item.phc_ref !== finalPhcRef) {
                item.phc_ref = finalPhcRef;
                this.saveCart();
            }
            
            // Actualizar el atributo data-phc-ref en el DOM
            element.setAttribute('data-phc-ref', finalPhcRef);
            
            // Obtener plazo de entrega real: preferir products, luego item
            if (productFromDB) {
                plazoNormal = productFromDB.plazoEntrega || productFromDB.plazo_entrega || item.plazoEntrega || item.plazo_entrega || '';
            } else {
                plazoNormal = item.plazoEntrega || item.plazo_entrega || '';
            }
            
            try {
                const stockDisponible = await this.getStockForProduct(finalPhcRef);
                
                // Si no hay registro en BD (null), mantener plazo normal (no actualizar)
                if (stockDisponible === null) {
                    // Aun así mostrar que el plazo está sujeto a confirmación de stock
                    element.innerHTML = '';
                    const span = document.createElement('span');
                    span.textContent = plazoNormal ? `${plazoNormal} (sujeto a confirmación de stock)` : t.plazoEntrega;
                    element.appendChild(span);
                    continue;
                }
                
                const t = this.getStockTranslations();
                
                // Limpiar contenido anterior para evitar duplicados
                element.innerHTML = '';
                
                // Actualizar también el atributo data-quantity con la cantidad correcta
                element.setAttribute('data-quantity', quantityToUse);
                
                // Si tiene stock suficiente (stock >= cantidad solicitada)
                if (stockDisponible >= quantityToUse) {
                    const span = document.createElement('span');
                    span.style.color = '#10b981';
                    span.style.fontWeight = '600';
                    span.style.display = 'block';
                    span.innerHTML = `${t.enStock}<br><span style="font-size: 0.85em; font-weight: 400;">${t.sujetoConfirmacion}</span>`;
                    element.appendChild(span);
                }
                // Si tiene stock parcial (stock > 0 pero < cantidad solicitada)
                else if (stockDisponible > 0) {
                    const span = document.createElement('span');
                    span.style.color = '#f59e0b';
                    span.style.fontWeight = '600';
                    const restantes = quantityToUse - stockDisponible;
                    span.textContent = `${stockDisponible.toLocaleString()} en stock, restantes ${restantes.toLocaleString()} ${t.plazoEntrega} ${plazoNormal} (sujeto a confirmación de stock)`;
                    element.appendChild(span);
                }
                // Si no tiene stock (stock = 0), mostrar plazo normal
                else {
                    const span = document.createElement('span');
                    span.textContent = plazoNormal ? `${plazoNormal} (sujeto a confirmación de stock)` : t.plazoEntrega;
                    element.appendChild(span);
                }
            } catch (error) {
                // Silenciar errores, mantener plazo normal
            }
        }
    }

    /**
     * Consultar stock disponible desde Supabase
     * Busca la referencia PHC del producto (products.phc_ref) en stock_productos.referencia_phc
     * @param {string} phcRef - Referencia PHC del producto desde products.phc_ref
     * @returns {Promise<number|null>} - Stock disponible o null si no existe
     */
    async getStockForProduct(phcRef) {
        if (!phcRef) {
            return null;
        }
        
        // Normalizar referencia PHC: trim y convertir a mayúsculas para comparación
        const normalizedPhcRef = String(phcRef).trim().toUpperCase();
        
        if (!normalizedPhcRef) {
            return null;
        }
        
        // Asegurar que Supabase esté inicializado
        if (!this.supabase) {
            try {
                await this.initializeSupabase();
            } catch (error) {
                // No se pudo inicializar para consultar stock
                return null;
            }
        }
        
        if (!this.supabase) {
            // No inicializado
            return null;
        }
        
        try {
            // Buscar directamente en stock_productos por referencia_phc
            // La búsqueda se hace normalizando ambas partes para ser insensible a mayúsculas/minúsculas
            const { data: stockRecords, error: fetchError } = await this.supabase
                .from('stock_productos')
                .select('referencia_phc, stock_disponible')
                .ilike('referencia_phc', normalizedPhcRef);
            
            if (fetchError) {
                // No mostrar error si la tabla no existe aún
                if (fetchError.message && fetchError.message.includes('does not exist')) {
                    return null;
                }
                return null;
            }
            
            if (!stockRecords || stockRecords.length === 0) {
                return null;
            }
            
            // Buscar coincidencia normalizada (insensible a mayúsculas/minúsculas y espacios)
            // Comparar products.phc_ref (normalizado) con stock_productos.referencia_phc (normalizado)
            const stockRecord = stockRecords.find(record => {
                if (!record.referencia_phc) return false;
                const recordPhcRef = String(record.referencia_phc).trim().toUpperCase();
                return recordPhcRef === normalizedPhcRef;
            });
            
            if (!stockRecord) {
                return null;
            }
            
            // Retornar stock_disponible de stock_productos
            const stock = Number(stockRecord.stock_disponible);
            const finalStock = isNaN(stock) ? 0 : stock;
            return finalStock;
        } catch (error) {
            // No mostrar error si la tabla no existe
            if (error.message && error.message.includes('does not exist')) {
                return null;
            }
            return null;
        }
    }


    /**
     * Renderizar el carrito
     */
    renderCart(skipStockUpdate = false) {
        const cartItemsContainer = document.getElementById('cartItems');
        
        // Verificar que el contenedor existe antes de usarlo
        if (!cartItemsContainer) {
            return;
        }
        
        if (this.cart.length === 0) {
            cartItemsContainer.innerHTML = this.getEmptyCartHTML();
            return;
        }

        try {
        const headersHTML = this.renderCartHeaders();
            const itemsHTML = this.cart.map(item => {
                try {
                    return this.renderCartItem(item);
                } catch (error) {
                    return ''; // Retornar string vacío si hay error para no romper el renderizado
                }
            }).join('');
        cartItemsContainer.innerHTML = headersHTML + itemsHTML;
            
            // Después de renderizar, actualizar todos los plazos de entrega según stock
            // Esto asegura que todos los productos mantengan su cálculo de stock actualizado
            // skipStockUpdate permite omitir esta actualización cuando se está actualizando un producto específico
            if (!skipStockUpdate) {
                setTimeout(() => {
                    this.updateDeliveryTimesFromStock();
                }, 150);
            }
        } catch (error) {
            cartItemsContainer.innerHTML = '<div style="padding: 20px; color: red;">Error al cargar el carrito. Por favor, recarga la página.</div>';
        }
    }

    /**
     * Renderizar un item del carrito
     */
    renderCartItem(item) {
        // Si es un producto, asegurar que tenga price_tiers y recalcular precio SIEMPRE
        if (item.type === 'product') {
            // Si no tiene price_tiers, intentar obtenerlos de la BD
            if ((!item.price_tiers || item.price_tiers.length === 0) && this.allProducts.length > 0) {
                const productFromDB = this.allProducts.find(p => p.id === item.id);
                if (productFromDB && productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
                    item.price_tiers = productFromDB.price_tiers;
                    if (!item.basePrice) {
                        item.basePrice = productFromDB.precio || item.price || 0;
                    }
                    // Guardar después de cargar price_tiers
                    this.saveCart();
                }
            }
            
            // Determinar qué price_tiers usar: variante seleccionada o base
            let priceTiersToUse = item.price_tiers || [];
            
            // Si hay una variante seleccionada, usar sus price_tiers
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                const selectedVariant = item.variants[item.selectedVariant];
                if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                    priceTiersToUse = selectedVariant.price_tiers;
                }
            }
            
            // SIEMPRE recalcular precio según escalones si existen
            // Esto asegura que el precio se actualice cuando cambia la cantidad o la variante
            if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
                // Usar basePrice si está disponible, sino usar el precio actual como fallback
                const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
                const priceResult = this.getPriceForQuantity(priceTiersToUse, item.quantity, basePriceForCalc);
                item.price = priceResult.price;
                item.minQuantity = priceResult.minQuantity;
                item.isValidQuantity = priceResult.isValid;
            } else {
                // Si no hay escalones, usar precio base
                if (item.basePrice !== undefined && item.basePrice !== null) {
                    item.price = item.basePrice;
                } else {
                    // Intentar obtener precio base de la BD
                    const productFromDB = this.allProducts.find(p => p.id === item.id);
                    if (productFromDB && productFromDB.precio) {
                        item.price = productFromDB.precio;
                        item.basePrice = productFromDB.precio;
                    } else {
                        item.price = item.price || 0;
                    }
                }
                item.minQuantity = null;
                item.isValidQuantity = true;
            }
        }
        
        // Obtener precio unitario (sin multiplicar por cantidad)
        // Asegurar que siempre tengamos un precio válido
        let unitPrice = item.price || 0;
        let minQuantity = null;
        let isValidQuantity = true;
        
        // Si es un producto, recalcular para asegurar que tenemos los valores correctos
        if (item.type === 'product') {
            // Determinar qué price_tiers usar: variante seleccionada o base
            let priceTiersToUse = item.price_tiers || [];
            
            // Si hay una variante seleccionada, usar sus price_tiers
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                const selectedVariant = item.variants[item.selectedVariant];
                if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                    priceTiersToUse = selectedVariant.price_tiers;
                }
            }
            
            // Si hay escalones, recalcular precio y cantidad mínima
            if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
                const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
                const priceResult = this.getPriceForQuantity(priceTiersToUse, item.quantity, basePriceForCalc);
                unitPrice = priceResult.price || 0;
                minQuantity = priceResult.minQuantity !== null && priceResult.minQuantity !== undefined ? Number(priceResult.minQuantity) : null;
                isValidQuantity = priceResult.isValid === true;
                
                // Actualizar el item con los valores calculados
                item.price = unitPrice;
                item.minQuantity = minQuantity;
                item.isValidQuantity = isValidQuantity;
            } else {
                // Si no hay escalones, usar precio base
                if (item.basePrice !== undefined && item.basePrice !== null) {
                    unitPrice = item.basePrice;
                } else {
                    // Intentar obtener precio base de la BD
                    const productFromDB = this.allProducts.find(p => p.id === item.id);
                    if (productFromDB && productFromDB.precio) {
                        unitPrice = productFromDB.precio;
                        item.basePrice = productFromDB.precio;
                    }
                }
                minQuantity = null;
                isValidQuantity = true;
                item.price = unitPrice;
                item.minQuantity = null;
                item.isValidQuantity = true;
            }
        } else {
            // Para otros tipos, usar los valores del item
            minQuantity = item.minQuantity !== undefined && item.minQuantity !== null ? Number(item.minQuantity) : null;
            isValidQuantity = item.isValidQuantity !== undefined ? item.isValidQuantity : true;
        }
        const categoryName = item.type === 'special' ? 
            (this.currentLanguage === 'es' ? 'Pedido Especial' : 
             this.currentLanguage === 'pt' ? 'Pedido Especial' : 
             'Special Order') :
            this.getCategoryName(item.category);
        
        // Obtener descripción según idioma - buscar en la BD si no está en el item
        let description = '';
        if (item.type === 'product') {
            // Si no tiene descripción en el item, intentar obtenerla de la BD
            if (!item.descripcionEs && !item.descripcionPt && !item.description) {
                // Buscar en allProducts
                const productFromDB = this.allProducts.find(p => p.id === item.id);
                if (productFromDB) {
                    description = this.currentLanguage === 'es' ? 
                        (productFromDB.descripcionEs || '') :
                        (productFromDB.descripcionPt || productFromDB.descripcionEs || '');
                }
            } else {
                description = this.currentLanguage === 'es' ? 
                    (item.descripcionEs || item.description || '') :
                    (item.descripcionPt || item.description || item.descripcionEs || '');
            }
        } else if (item.type === 'special') {
            description = item.notes || '';
        } else {
            description = item.notes || '';
        }
        
        // Nombre del producto
        const productName = item.name || '';
        
        // Plazo de entrega
        let plazoEntrega = item.plazoEntrega || item.plazo_entrega || '';
        // Si hay una variante seleccionada con plazo específico, usarlo siempre
        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
            const selectedVariant = item.variants[item.selectedVariant];
            if (selectedVariant && (selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime)) {
                plazoEntrega = selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime;
                // Guardar el plazo de variante en el item para persistir
                item.variantDeliveryTime = plazoEntrega;
            } else if (item.variantDeliveryTime) {
                plazoEntrega = item.variantDeliveryTime;
            }
        } else if (item.variantDeliveryTime) {
            // Si se volvió a la base, limpiar el plazo guardado
            delete item.variantDeliveryTime;
        }
        if (!plazoEntrega && item.type === 'product') {
            // Buscar en la BD si no está en el item
            const productFromDB = this.allProducts.find(p => p.id === item.id);
            if (productFromDB) {
                plazoEntrega = productFromDB.plazoEntrega || '';
            }
        }
        
        // Observaciones (si no existe, inicializar vacío)
        if (!item.observations) {
            item.observations = '';
        }
        
        // Asegurar que itemIdentifier esté definido ANTES de usarlo en variantSelector
        // Usar cartItemId si existe, sino usar item.id como fallback
        let itemIdentifier = item.cartItemId || item.id;
        if (!itemIdentifier) {
            // Si no hay identificador, generar uno temporal
            itemIdentifier = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            item.cartItemId = itemIdentifier;
        }
        itemIdentifier = String(itemIdentifier);
        
        // Obtener variantes del producto y asegurar que tengan price_tiers
        let productVariants = item.variants || [];
        if (!productVariants.length && item.type === 'product') {
            const productFromDB = this.allProducts.find(p => p.id === item.id);
            if (productFromDB && productFromDB.variants && productFromDB.variants.length > 0) {
                productVariants = productFromDB.variants;
                item.variants = productVariants;
            }
        }
        
        // Asegurar que las variantes tengan price_tiers válidos
        if (productVariants.length > 0) {
            productVariants.forEach(variant => {
                if (!variant.price_tiers || !Array.isArray(variant.price_tiers) || variant.price_tiers.length === 0) {
                    // Si la variante no tiene price_tiers, intentar obtenerlos de la BD
                    const productFromDB = this.allProducts.find(p => p.id === item.id);
                    if (productFromDB && productFromDB.variants) {
                        const variantFromDB = productFromDB.variants.find(v => v.name === variant.name);
                        if (variantFromDB && variantFromDB.price_tiers) {
                            variant.price_tiers = variantFromDB.price_tiers;
                        }
                    }
                }
            });
        }
        
        // Inicializar selectedVariant si no existe
        if (item.selectedVariant === undefined) {
            item.selectedVariant = null;
        }
        
        // Obtener variantes de referencias (para selección de color)
        let referenceVariants = [];
        try {
            if (item.variantes_referencias && Array.isArray(item.variantes_referencias)) {
                referenceVariants = item.variantes_referencias;
            } else if (item.type === 'product') {
                try {
                    if (this.allProducts && Array.isArray(this.allProducts) && this.allProducts.length > 0) {
                        const productFromDB = this.allProducts.find(p => p && p.id === item.id);
                        if (productFromDB && productFromDB.variantes_referencias && Array.isArray(productFromDB.variantes_referencias) && productFromDB.variantes_referencias.length > 0) {
                            referenceVariants = productFromDB.variantes_referencias;
                            item.variantes_referencias = referenceVariants;
                        }
                    }
                } catch (dbError) {
                }
            }
        } catch (error) {
            referenceVariants = [];
        }
        
        // Asegurar que siempre sea un array
        if (!Array.isArray(referenceVariants)) {
            referenceVariants = [];
        }
        
        // Inicializar selectedReferenceVariant si no existe
        if (item.selectedReferenceVariant === undefined) {
            item.selectedReferenceVariant = null;
        }
        
        // Renderizar selector de variantes solo si hay variantes
        // itemIdentifier ya está definido arriba
        const variantSelector = productVariants.length > 0 ? `
            <div class="cart-item-variant-selector" style="grid-column: 1 / -1; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--bg-gray-200);">
                <label style="display: block; margin-bottom: 5px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">
                    ${this.currentLanguage === 'es' ? 'Personalizado:' : this.currentLanguage === 'pt' ? 'Personalizado:' : 'Custom:'}
                </label>
                <select class="variant-select" 
                        onchange="changeProductVariant('${String(itemIdentifier).replace(/'/g, "\\'")}', this.value)"
                        style="width: 100%; padding: 8px 12px; border: 1px solid var(--bg-gray-300); border-radius: 6px; background: var(--bg-white); color: var(--text-primary); font-size: 0.875rem; cursor: pointer;">
                    <option value="base" ${item.selectedVariant === null ? 'selected' : ''}>
                        ${this.currentLanguage === 'es' ? 'Sin personalización' : this.currentLanguage === 'pt' ? 'Sem personalização' : 'No customization'}
                    </option>
                    ${productVariants.map((variant, index) => `
                        <option value="${index}" ${item.selectedVariant === index ? 'selected' : ''}>
                            ${variant.name || `Variante ${index + 1}`}
                        </option>
                    `).join('')}
                </select>
            </div>
        ` : '';
        
        // Renderizar campo de subida de logotipo si hay una variante personalizada seleccionada
        let logoUploadField = '';
        if (item.selectedVariant !== null && item.selectedVariant !== undefined) {
            const logoLabel = this.currentLanguage === 'es' ? 'Logotipo:' : this.currentLanguage === 'pt' ? 'Logotipo:' : 'Logo:';
            const logoPlaceholder = this.currentLanguage === 'es' ? 'Subir PDF o imagen del logotipo' : this.currentLanguage === 'pt' ? 'Carregar PDF ou imagem do logotipo' : 'Upload PDF or logo image';
            const logoUploaded = this.currentLanguage === 'es' ? 'Logotipo subido' : this.currentLanguage === 'pt' ? 'Logotipo carregado' : 'Logo uploaded';
            const safeItemId = String(itemIdentifier).replace(/'/g, "\\'");
            const hasLogo = item.logoUrl ? true : false;
            
            logoUploadField = `
            <div class="cart-item-logo-upload" style="grid-column: 1 / -1; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--bg-gray-200);">
                <label style="display: block; margin-bottom: 5px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">
                    ${logoLabel}
                </label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="file" 
                           id="logo-upload-${safeItemId}" 
                           accept=".pdf,.png,.jpg,.jpeg,.svg" 
                           onchange="handleLogoUpload('${safeItemId}', this.files[0])"
                           style="flex: 1; padding: 8px 12px; border: 1px solid var(--bg-gray-300); border-radius: 6px; background: var(--bg-white); color: var(--text-primary); font-size: 0.875rem; cursor: pointer;">
                    ${hasLogo ? `
                        <span style="color: #10b981; font-size: 0.875rem;">
                            <i class="fas fa-check-circle"></i> ${logoUploaded}
                        </span>
                        <button onclick="removeLogo('${safeItemId}')" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
                ${hasLogo && item.logoUrl ? `
                    <div style="margin-top: 8px;">
                        <a href="${item.logoUrl}" target="_blank" style="color: #1d3557; text-decoration: underline; font-size: 0.875rem;">
                            <i class="fas fa-external-link-alt"></i> ${this.currentLanguage === 'es' ? 'Ver logotipo' : this.currentLanguage === 'pt' ? 'Ver logotipo' : 'View logo'}
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
        }
        
        // Renderizar selector de color (variantes de referencias) solo si hay variantes de referencias
        let colorSelector = '';
        if (referenceVariants && Array.isArray(referenceVariants) && referenceVariants.length > 0) {
            try {
                const colorLabel = this.currentLanguage === 'es' ? 'Color:' : this.currentLanguage === 'pt' ? 'Cor:' : 'Color:';
                const selectPlaceholder = this.currentLanguage === 'es' ? 'Seleccionar color...' : this.currentLanguage === 'pt' ? 'Selecionar cor...' : 'Select color...';
                const safeItemId = String(itemIdentifier).replace(/'/g, "\\'");
                
                const options = referenceVariants.map((variant, index) => {
                    const color = (variant && variant.color) ? String(variant.color) : `Color ${index + 1}`;
                    const isSelected = (item.selectedReferenceVariant === index) ? 'selected' : '';
                    return `<option value="${index}" ${isSelected}>${color}</option>`;
                }).join('');
                
                colorSelector = `
            <div class="cart-item-color-selector" style="grid-column: 1 / -1; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--bg-gray-200);">
                <label style="display: block; margin-bottom: 5px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">
                    ${colorLabel}
                </label>
                <select class="color-variant-select" 
                        onchange="changeReferenceVariant('${safeItemId}', this.value)"
                        style="width: 100%; padding: 8px 12px; border: 1px solid var(--bg-gray-300); border-radius: 6px; background: var(--bg-white); color: var(--text-primary); font-size: 0.875rem; cursor: pointer;">
                    <option value="">${selectPlaceholder}</option>
                    ${options}
                </select>
            </div>
        `;
            } catch (error) {
                colorSelector = '';
            }
        }
        
        // Calcular sugerencia de upsell si es un producto
        let upsellSuggestion = null;
        let upsellSuggestionHTML = '';
        if (item.type === 'product') {
            // Determinar qué price_tiers usar: variante seleccionada o base
            let priceTiersToUse = item.price_tiers || [];
            
            // Si hay una variante seleccionada, usar sus price_tiers
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                const selectedVariant = item.variants[item.selectedVariant];
                if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                    priceTiersToUse = selectedVariant.price_tiers;
                }
            }
            
            // Crear objeto producto para la función de sugerencia
            const productForSuggestion = {
                id: item.id,
                name: item.name,
                price_tiers: priceTiersToUse
            };
            
            // Calcular sugerencia
            upsellSuggestion = this.getQuantityUpsellSuggestion(productForSuggestion, item.quantity);
            
            // Generar HTML de sugerencia si existe
            if (upsellSuggestion) {
                // Calcular el ahorro real: lo que costaría al precio actual vs el nuevo precio
                const costWithoutDiscount = upsellSuggestion.newQuantity * upsellSuggestion.currentUnitPrice;
                const costWithDiscount = upsellSuggestion.nextTotal;
                const realSavings = costWithoutDiscount - costWithDiscount;
                const savingsPerUnit = upsellSuggestion.currentUnitPrice - upsellSuggestion.nextUnitPrice;
                const discountPercent = ((savingsPerUnit / upsellSuggestion.currentUnitPrice) * 100).toFixed(0);
                
                const translations = {
                    es: {
                        message: `Si aumentas tu pedido a ${upsellSuggestion.newQuantity} uds, el precio por unidad baja de ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ a ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% descuento). ¡Ahorras ${realSavings.toFixed(2)}€ en total!`,
                        button: 'Aumentar cantidad'
                    },
                    pt: {
                        message: `Se aumentar o seu pedido para ${upsellSuggestion.newQuantity} unid., o preço por unidade baixa de ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ para ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% desconto). Poupa ${realSavings.toFixed(2)}€ no total!`,
                        button: 'Aumentar quantidade'
                    },
                    en: {
                        message: `If you increase your order to ${upsellSuggestion.newQuantity} units, the unit price drops from ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ to ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% discount). You save ${realSavings.toFixed(2)}€ in total!`,
                        button: 'Increase quantity'
                    }
                };
                
                const t = translations[this.currentLanguage] || translations.es;
                
                upsellSuggestionHTML = `
                    <div class="upsell-suggestion" style="grid-column: 1 / -1; margin-top: 10px; padding: 12px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="display: flex; align-items: flex-start; gap: 10px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <i class="fas fa-lightbulb" style="color: #f59e0b; font-size: 1.1rem;"></i>
                                    <strong style="color: #92400e; font-size: 0.9rem;">${this.currentLanguage === 'es' ? 'Oferta especial' : this.currentLanguage === 'pt' ? 'Oferta especial' : 'Special offer'}</strong>
                                </div>
                                <p style="margin: 0; color: #78350f; font-size: 0.875rem; line-height: 1.5;">${t.message}</p>
                            </div>
                            <button onclick="applyUpsellSuggestion('${String(itemIdentifier).replace(/'/g, "\\'")}', ${upsellSuggestion.newQuantity})" 
                                    style="padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.875rem; cursor: pointer; white-space: nowrap; transition: background 0.2s;"
                                    onmouseover="this.style.background='#d97706'" 
                                    onmouseout="this.style.background='#f59e0b'">
                                ${t.button}
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        
        // itemIdentifier ya está definido arriba
        
        return `
            <div class="cart-item" data-item-id="${itemIdentifier}">
                <div class="cart-item-image-container">
                    ${item.image ? 
                        `<img src="${item.image}" alt="${item.name}" class="cart-item-image" style="cursor: pointer;" onclick="showImageModal('${item.image.replace(/'/g, "\\'")}', '${productName.replace(/'/g, "\\'")}')" onerror="this.style.display='none'">` :
                        `<div style="width:80px;height:80px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                            <i class="fas fa-image" style="font-size:1.5rem;color:#9ca3af;"></i>
                        </div>`
                    }
                    <div class="cart-item-name">${productName}</div>
                </div>
                
                <div class="cart-item-description">
                    ${description ? `<div class="product-description-text">${description}</div>` : '<div class="product-description-text" style="color: var(--text-secondary); font-style: italic;">Sin descripción</div>'}
                </div>
                
                ${item.box_size ? 
                    // Si tiene box_size, mostrar input readonly con botones de incremento/decremento
                    `<div style="display: flex; align-items: center; gap: 8px;">
                        <button class="quantity-btn-decrease" onclick="if(window.simpleDecrease){window.simpleDecrease('${String(itemIdentifier).replace(/'/g, "\\'")}')}else{console.error('simpleDecrease no disponible')}" 
                                style="width: 32px; height: 32px; border: 1px solid var(--bg-gray-300); border-radius: 6px; background: var(--bg-white); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 600; transition: all 0.2s;"
                                onmouseover="this.style.background='var(--bg-gray-100)'" 
                                onmouseout="this.style.background='var(--bg-white)'">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="50000" 
                               readonly style="width: 80px; text-align: center; cursor: not-allowed; background: var(--bg-gray-50);">
                        <button class="quantity-btn-increase" onclick="if(window.simpleIncrease){window.simpleIncrease('${String(itemIdentifier).replace(/'/g, "\\'")}')}else{console.error('simpleIncrease no disponible')}" 
                                style="width: 32px; height: 32px; border: 1px solid var(--bg-gray-300); border-radius: 6px; background: var(--bg-white); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 600; transition: all 0.2s;"
                                onmouseover="this.style.background='var(--bg-gray-100)'" 
                                onmouseout="this.style.background='var(--bg-white)'">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>` :
                    // Si no tiene box_size, mostrar input editable normal
                    `<input type="number" class="quantity-input" value="${item.quantity}" min="1" max="50000" 
                           oninput="window.updatePriceOnQuantityChange('${String(itemIdentifier).replace(/'/g, "\\'")}', this.value)" 
                           onblur="simpleSetQuantity('${String(itemIdentifier).replace(/'/g, "\\'")}', this.value)">`
                }
                
                <div class="cart-item-price">
                    ${item.type === 'category' || item.type === 'special' ? 
                        `<div class="cart-item-total">${this.getCategoryPriceText()}</div>` :
                        !isValidQuantity && minQuantity !== null && minQuantity !== undefined ? 
                        `<div class="cart-item-total" style="color: #ef4444; font-weight: 600; font-size: 0.9rem;">
                            ${this.currentLanguage === 'es' ? 
                                `Cantidad mínima: ${minQuantity}` : 
                                this.currentLanguage === 'pt' ? 
                                `Quantidade mínima: ${minQuantity}` :
                                `Minimum quantity: ${minQuantity}`
                            }
                        </div>` :
                        `<div class="cart-item-total" style="cursor: pointer; transition: opacity 0.2s;" onclick="showPriceTiersModal('${String(itemIdentifier).replace(/'/g, "\\'")}', '${productName.replace(/'/g, "\\'")}')" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">€${this.formatUnitPrice(unitPrice)}</div>`
                    }
                </div>
                
                <div class="cart-item-delivery">
                    ${(() => {
                        // Si hay una variante seleccionada con plazo de entrega, usar ese plazo
                        let deliveryTimeToShow = plazoEntrega;
                        let isVariant = false;
                        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                            const selectedVariant = item.variants[item.selectedVariant];
                            if (selectedVariant && (selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime)) {
                                deliveryTimeToShow = selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime;
                                isVariant = true;
                                // Guardar el plazo de variante en el item si no está guardado
                                if (!item.variantDeliveryTime) {
                                    item.variantDeliveryTime = deliveryTimeToShow;
                                }
                            }
                        }
                        // Si no es variante y hay plazo, marcar sujeto a confirmación de stock
                        if (!isVariant && deliveryTimeToShow) {
                            deliveryTimeToShow = `${deliveryTimeToShow} (sujeto a confirmación de stock)`;
                        }
                        return deliveryTimeToShow ? `<div class="delivery-time" data-item-id="${itemIdentifier}" data-phc-ref="${item.phc_ref || ''}" data-quantity="${item.quantity || 1}">${deliveryTimeToShow}</div>` : '<div class="delivery-time" style="color: var(--text-secondary); font-style: italic;">Sin plazo</div>';
                    })()}
                </div>
                
                <div class="cart-item-actions">
                    <button class="remove-item" onclick="simpleRemove('${itemIdentifier}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="observations-btn" onclick="toggleObservations('${itemIdentifier}')" title="Observaciones">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
                ${variantSelector}
                ${logoUploadField}
                ${colorSelector}
                ${upsellSuggestionHTML}
                <div class="cart-item-observations-container" id="observations-${itemIdentifier}" style="display: none;">
                    <textarea class="observations-input" placeholder="Agregar observaciones especiales..." onblur="saveObservations('${itemIdentifier}', this.value)">${item.observations || ''}</textarea>
                </div>
            </div>
        `;
    }

    /**
     * Obtener HTML para carrito vacío
     */
    getEmptyCartHTML() {
        const translations = {
            pt: {
                title: 'Carrinho Vazio',
                text: 'Não há produtos no seu carrinho.',
                button: 'Continuar Comprando'
            },
            es: {
                title: 'Carrito Vacío',
                text: 'No hay productos en tu carrito.',
                button: 'Continuar Comprando'
            },
            en: {
                title: 'Empty Cart',
                text: 'There are no products in your cart.',
                button: 'Continue Shopping'
            }
        };

        const t = translations[this.currentLanguage] || translations.pt;

        return `
            <div class="empty-cart">
                <div class="empty-cart-icon">
                    <i class="fas fa-shopping-cart"></i>
                </div>
                <h2 class="empty-cart-title">${t.title}</h2>
                <p class="empty-cart-text">${t.text}</p>
                <a href="productos-dinamico.html" class="btn-continue-shopping">${t.button}</a>
            </div>
        `;
    }

    /**
     * Actualizar resumen del carrito (ya no se usa pero se mantiene para compatibilidad)
     */
    updateSummary() {
        // El resumen ya no se muestra, pero mantenemos la función por si se necesita en el futuro
    }

    /**
     * Obtener especificaciones del producto
     */
    getProductSpecs(product) {
        const specs = [];
        
        if (product.potencia) specs.push(`${product.potencia}W`);
        if (product.color) {
            const colorName = window.translationSystem ? 
                window.translationSystem.translateColor(product.color) : 
                product.color;
            specs.push(colorName);
        }
        if (product.tipo) {
            const typeName = window.translationSystem ? 
                window.translationSystem.translateType(product.tipo) : 
                product.tipo;
            specs.push(typeName);
        }

        return specs.join(' • ');
    }

    /**
     * Obtener precio según escalones de cantidad
     * Si la cantidad excede el último escalón, usa el último escalón
     */
    getPriceForQuantity(priceTiers, quantity, basePrice = 0) {
        if (!priceTiers || !Array.isArray(priceTiers) || priceTiers.length === 0) {
            return { price: basePrice, minQuantity: null, isValid: true };
        }

        // Usar la misma lógica que en el buscador de productos
        let selectedPrice = Number.isFinite(basePrice) ? Number(basePrice) : 0;

        // Ordenar escalones por cantidad mínima (igual que en el buscador)
        const sortedTiers = [...priceTiers].sort((a, b) => {
            const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
            const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
            return minA - minB;
        });

        // Obtener la cantidad mínima del primer escalón
        const firstTier = sortedTiers[0];
        const minQuantity = firstTier?.min_qty !== null && firstTier?.min_qty !== undefined ? Number(firstTier.min_qty) : null;
        
        // Validar si la cantidad es menor que el mínimo
        const isValid = minQuantity === null || quantity >= minQuantity;

        // Si la cantidad es menor que el mínimo, usar el precio del primer escalón pero marcar como inválido
        // Esto permite mostrar el precio de referencia pero con el mensaje de cantidad mínima
        if (!isValid && minQuantity !== null && firstTier) {
            // Usar el precio del primer escalón como referencia
            const firstTierPrice = firstTier?.price !== null && firstTier?.price !== undefined ? Number(firstTier.price) : null;
            if (firstTierPrice !== null) {
                selectedPrice = firstTierPrice;
            }
        } else {
            // Buscar el escalón correspondiente (igual que en el buscador)
            for (const tier of sortedTiers) {
                if (!tier) continue;
                
                const min = tier.min_qty !== null && tier.min_qty !== undefined ? Number(tier.min_qty) : 0;
                const max = tier.max_qty !== null && tier.max_qty !== undefined ? Number(tier.max_qty) : Infinity;
                const tierPrice = tier.price !== null && tier.price !== undefined ? Number(tier.price) : null;

                if (tierPrice === null) {
                    continue;
                }

                // Si la cantidad está dentro del rango del escalón
                if (quantity >= min && quantity <= max) {
                    selectedPrice = tierPrice;
                    break; // Igual que en el buscador
                }

                // Si la cantidad es mayor o igual al mínimo y no hay máximo (Infinity)
                if (quantity >= min && (tier.max_qty === null || tier.max_qty === undefined)) {
                    selectedPrice = tierPrice;
                }
            }
        }

        // Si la cantidad excede todos los escalones, usar el último escalón
        // Esta es la lógica clave: si pides más que el último escalón, usar el último escalón
        if (sortedTiers.length > 0) {
            const lastTier = sortedTiers[sortedTiers.length - 1];
            const lastTierMax = lastTier?.max_qty !== null && lastTier?.max_qty !== undefined ? Number(lastTier.max_qty) : Infinity;
            const lastTierPrice = lastTier?.price !== null && lastTier?.price !== undefined ? Number(lastTier.price) : null;
            const lastTierMin = lastTier?.min_qty !== null && lastTier?.min_qty !== undefined ? Number(lastTier.min_qty) : 0;
            
            // Si la cantidad es mayor que el máximo del último escalón, usar el precio del último escalón
            if (lastTierMax !== Infinity && quantity > lastTierMax && lastTierPrice !== null) {
                selectedPrice = lastTierPrice;
            } else if (lastTierMax === Infinity && quantity >= lastTierMin && lastTierPrice !== null) {
                // Si el último escalón no tiene máximo, usar su precio si la cantidad es >= su mínimo
                selectedPrice = lastTierPrice;
            }
        }

        // Asegurar que el precio nunca sea null o undefined
        if (selectedPrice === null || selectedPrice === undefined || !Number.isFinite(selectedPrice)) {
            selectedPrice = basePrice || 0;
        }

        return { 
            price: Number(selectedPrice), 
            minQuantity: minQuantity !== null && minQuantity !== undefined ? Number(minQuantity) : null, 
            isValid: isValid === true 
        };
    }

    /**
     * Normalizar cantidad según boxSize del producto
     * @param {Object} product - Producto con estructura { id, boxSize }
     * @param {number} requestedQty - Cantidad solicitada por el usuario
     * @returns {number} - Cantidad normalizada (siempre múltiplo superior de boxSize)
     */
    normalizeQuantityForBox(product, requestedQty) {
        const boxSize = product.boxSize;
        
        if (!boxSize || boxSize <= 0) {
            return requestedQty;
        }
        
        if (requestedQty <= 0) {
            return boxSize;
        }
        
        return Math.ceil(requestedQty / boxSize) * boxSize;
    }

    /**
     * Obtener sugerencia de upsell basada en escalones de precio
     * @param {Object} product - Producto con estructura { id, name, price_tiers }
     * @param {number} quantity - Cantidad seleccionada por el usuario
     * @returns {Object|null} - Sugerencia de upsell o null si no aplica
     */
    getQuantityUpsellSuggestion(product, quantity) {
        // Validar entrada
        if (!product || !product.price_tiers || !Array.isArray(product.price_tiers) || product.price_tiers.length === 0) {
            return null;
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return null;
        }

        // Ordenar escalones por min_qty ascendente
        const sortedTiers = [...product.price_tiers].sort((a, b) => {
            const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
            const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
            return minA - minB;
        });

        // Buscar el escalón actual
        let currentTierIndex = -1;
        let currentTier = null;

        for (let i = 0; i < sortedTiers.length; i++) {
            const tier = sortedTiers[i];
            if (!tier) continue;

            const min = tier.min_qty !== null && tier.min_qty !== undefined ? Number(tier.min_qty) : 0;
            const max = tier.max_qty !== null && tier.max_qty !== undefined ? Number(tier.max_qty) : Infinity;
            const tierPrice = tier.price !== null && tier.price !== undefined ? Number(tier.price) : null;

            if (tierPrice === null) continue;

            // Verificar si la cantidad está en este escalón
            if (quantity >= min && quantity <= max) {
                currentTierIndex = i;
                currentTier = {
                    minQty: min,
                    maxQty: max === Infinity ? null : max,
                    unitPrice: tierPrice
                };
                break;
            }

            // Si no hay máximo y la cantidad es >= mínimo, usar este escalón
            if (max === Infinity && quantity >= min) {
                currentTierIndex = i;
                currentTier = {
                    minQty: min,
                    maxQty: null,
                    unitPrice: tierPrice
                };
                break;
            }
        }

        // Si no se encontró escalón actual, no hay sugerencia
        if (currentTierIndex === -1 || !currentTier) {
            return null;
        }

        // Identificar el siguiente escalón
        const nextTierIndex = currentTierIndex + 1;
        if (nextTierIndex >= sortedTiers.length) {
            return null; // No hay siguiente escalón
        }

        const nextTierRaw = sortedTiers[nextTierIndex];
        if (!nextTierRaw) {
            return null;
        }

        const nextTierMin = nextTierRaw.min_qty !== null && nextTierRaw.min_qty !== undefined ? Number(nextTierRaw.min_qty) : null;
        const nextTierPrice = nextTierRaw.price !== null && nextTierRaw.price !== undefined ? Number(nextTierRaw.price) : null;

        if (nextTierMin === null || nextTierPrice === null) {
            return null;
        }

        const nextTier = {
            minQty: nextTierMin,
            maxQty: nextTierRaw.max_qty !== null && nextTierRaw.max_qty !== undefined ? Number(nextTierRaw.max_qty) : null,
            unitPrice: nextTierPrice
        };

        // Calcular unidades faltantes
        const missing = nextTier.minQty - quantity;

        // Si missing <= 0, no sugerir nada
        if (missing <= 0) {
            return null;
        }

        // Aplicar regla del 10%: solo sugerir si missing <= 0.1 * nextTier.minQty
        if (missing > 0.1 * nextTier.minQty) {
            return null;
        }

        // Solo sugerir si el siguiente escalón tiene un precio por unidad menor
        if (nextTier.unitPrice >= currentTier.unitPrice) {
            return null;
        }

        // Calcular totales
        const currentTotal = quantity * currentTier.unitPrice;
        const nextTotal = nextTier.minQty * nextTier.unitPrice;
        const extraUnits = nextTier.minQty - quantity;
        const diff = nextTotal - currentTotal;

        return {
            extraUnits: extraUnits,
            newQuantity: nextTier.minQty,
            currentTotal: currentTotal,
            nextTotal: nextTotal,
            diff: diff,
            currentUnitPrice: currentTier.unitPrice,
            nextUnitPrice: nextTier.unitPrice
        };
    }

    /**
     * Obtener nombre de categoría traducido
     */
    getCategoryName(category) {
        const translations = {
            pt: {
                'secadores': 'Secadores',
                'ironing': 'Passar a ferro',
                'porta-malas': 'Porta-malas'
            },
            es: {
                'secadores': 'Secadores',
                'ironing': 'Planchado',
                'porta-malas': 'Portamaletas'
            },
            en: {
                'secadores': 'Hair Dryers',
                'ironing': 'Ironing',
                'porta-malas': 'Luggage Racks'
            }
        };

        const t = translations[this.currentLanguage] || translations.pt;
        return t[category] || category;
    }

    // Función getCategoryImage eliminada - ya no se usan imágenes locales de categorías

    /**
     * Obtener texto de precio para categorías
     */
    getCategoryPriceText() {
        const translations = {
            pt: 'Preço sob consulta',
            es: 'Precio a consultar',
            en: 'Price on request'
        };
        return translations[this.currentLanguage] || translations.pt;
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Formulario para agregar categoría
        const addCategoryForm = document.getElementById('addCategoryForm');
        if (addCategoryForm) {
            addCategoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddCategory();
            });
        }

        // Cerrar modal al hacer clic fuera
        const categoryModal = document.getElementById('addCategoryModal');
        if (categoryModal) {
            categoryModal.addEventListener('click', (e) => {
                if (e.target === categoryModal) {
                    this.closeAddCategoryModal();
                }
            });
        }

        // Cerrar modal de productos al hacer clic fuera
        const productModal = document.getElementById('addProductModal');
        if (productModal) {
            productModal.addEventListener('click', (e) => {
                if (e.target === productModal) {
                    closeAddProductModal();
                }
            });
        }

        // Cerrar modal de pedidos especiales al hacer clic fuera
        const specialOrderModal = document.getElementById('addSpecialOrderModal');
        if (specialOrderModal) {
            specialOrderModal.addEventListener('click', (e) => {
                if (e.target === specialOrderModal) {
                    closeAddSpecialOrderModal();
                }
            });
        }

        // Formulario para agregar pedido especial
        const addSpecialOrderForm = document.getElementById('addSpecialOrderForm');
        if (addSpecialOrderForm) {
            addSpecialOrderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                addSpecialOrderToCart();
            });
        }

        // Los controles de cantidad ahora usan onclick directamente en el HTML
    }

    /**
     * Manejar agregar categoría
     */
    handleAddCategory() {
        const category = document.getElementById('categorySelect').value;
        const quantity = parseInt(document.getElementById('quantityInput').value);
        const notes = document.getElementById('notesInput').value;

        if (!category || quantity < 1) {
            this.showNotification('Por favor completa todos los campos requeridos', 'error');
            return;
        }

        this.addCategory(category, quantity, notes);
        this.closeAddCategoryModal();
        
        // Limpiar formulario
        document.getElementById('addCategoryForm').reset();
        document.getElementById('quantityInput').value = 1;
    }

    /**
     * Mostrar notificación
     */
    showNotification(message, type = 'info') {
        // Calcular posición top basada en notificaciones existentes
        const existingNotifications = document.querySelectorAll('.notification-stack');
        let topOffset = 20;
        existingNotifications.forEach(notif => {
            topOffset += notif.offsetHeight + 10;
        });

        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type} notification-stack`;
        notification.style.cssText = `
            position: fixed;
            top: ${topOffset}px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1001;
            font-weight: 500;
            transform: translateX(100%);
            transition: transform 0.3s ease, top 0.3s ease;
            max-width: 350px;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animar entrada
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remover después de 3 segundos
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                document.body.removeChild(notification);
                    // Reposicionar notificaciones restantes
                    this.repositionNotifications();
                }
            }, 300);
        }, 3000);
    }

    /**
     * Reposicionar notificaciones existentes después de eliminar una
     */
    repositionNotifications() {
        const notifications = document.querySelectorAll('.notification-stack');
        let topOffset = 20;
        notifications.forEach(notif => {
            notif.style.top = `${topOffset}px`;
            topOffset += notif.offsetHeight + 10;
        });
    }

    /**
     * Actualizar idioma
     */
    updateLanguage(lang) {
        this.currentLanguage = lang;
        
        // Actualizar descripciones en los items del carrito según el nuevo idioma
        this.cart.forEach(item => {
            if (item.type === 'product') {
                // Si no tiene descripciones, intentar obtenerlas de la BD
                if (!item.descripcionEs && !item.descripcionPt) {
                    const productFromDB = this.allProducts.find(p => p.id === item.id);
                    if (productFromDB) {
                        item.descripcionEs = productFromDB.descripcionEs || '';
                        item.descripcionPt = productFromDB.descripcionPt || '';
                    }
                }
                
                // Actualizar descripción según idioma
                if (item.descripcionEs || item.descripcionPt) {
                    item.description = lang === 'es' ? 
                        (item.descripcionEs || item.descripcion_es || '') :
                        (item.descripcionPt || item.descripcion_pt || item.descripcionEs || item.descripcion_es || '');
                }
                
                // Actualizar plazo de entrega si no está
                if (!item.plazoEntrega && !item.plazo_entrega) {
                    const productFromDB = this.allProducts.find(p => p.id === item.id);
                    if (productFromDB && productFromDB.plazoEntrega) {
                        item.plazoEntrega = productFromDB.plazoEntrega;
                    }
                }
            }
        });
        
        this.saveCart();
        this.renderCart();
        this.updateSummary();
    }

    /**
     * Enviar pedido
     */
    sendOrder() {
        if (this.cart.length === 0) {
            this.showNotification('El carrito está vacío', 'error');
            return;
        }

        // Mostrar confirmación
        const totalItems = this.cart.reduce((total, item) => total + item.quantity, 0);
        const confirmMessage = `¿Estás seguro de que quieres enviar el pedido con ${totalItems} productos?`;
        
        if (confirm(confirmMessage)) {
            // Aquí puedes implementar la lógica para enviar el pedido
            // Por ejemplo, enviar a un servidor, generar PDF, etc.
            this.showNotification('Pedido enviado correctamente', 'success');
            
            // Limpiar el carrito después de enviar
            this.cart = [];
            this.saveCart();
            this.renderCart();
            this.updateSummary();
        }
    }
}

// Funciones globales para el HTML
function openAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Limpiar búsqueda y selección
    const searchInput = document.getElementById('productSearchInput');
    const resultsContainer = document.getElementById('productSearchResults');
    const selectedSection = document.getElementById('selectedProductSection');
    const addBtn = document.getElementById('add-product-btn');
    
    if (searchInput) {
        searchInput.value = '';
        // Remover listeners anteriores
        const newInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newInput, searchInput);
        // Agregar nuevo listener
        document.getElementById('productSearchInput').addEventListener('input', handleProductSearch);
        document.getElementById('productSearchInput').focus();
    }
    
    if (resultsContainer) {
        const placeholderText = document.getElementById('search-placeholder-text')?.textContent || 'Escribe para buscar productos...';
        resultsContainer.innerHTML = `
            <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                <i class="fas fa-search" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                <p id="search-placeholder-text">${placeholderText}</p>
            </div>
        `;
    }
    
    if (selectedSection) {
        selectedSection.style.display = 'none';
    }
    
    if (addBtn) {
        addBtn.disabled = true;
    }
    
    // Mostrar productos exclusivos del cliente si se está editando una propuesta
    const exclusiveSection = document.getElementById('clientExclusiveProductsSection');
    const exclusiveList = document.getElementById('clientExclusiveProductsList');
    if (window.cartManager && window.cartManager.editingProposalData) {
        const clienteNombre = window.cartManager.editingProposalData.nombre_cliente;
        if (clienteNombre && exclusiveSection && exclusiveList) {
            const exclusiveProducts = window.cartManager.allProducts.filter(p => p.cliente_id === clienteNombre);
            if (exclusiveProducts.length > 0) {
                exclusiveList.innerHTML = exclusiveProducts.map(product => {
                    const productId = product.id ? String(product.id).replace(/'/g, "\\'") : '';
                    // Obtener precio: si tiene price_tiers, usar el precio del primer tier, sino usar precio base
                    let precio = product.precio || 0;
                    let precioOriginal = null; // Guardar el precio original como string para preservar decimales
                    if (product.price_tiers && Array.isArray(product.price_tiers) && product.price_tiers.length > 0) {
                        const sortedTiers = [...product.price_tiers].sort((a, b) => {
                            const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
                            const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
                            return minA - minB;
                        });
                        const firstTier = sortedTiers[0];
                        if (firstTier && firstTier.price !== null && firstTier.price !== undefined) {
                            // Guardar el precio original como string para preservar decimales
                            precioOriginal = String(firstTier.price);
                            precio = Number(firstTier.price);
                        }
                    } else {
                        // Si no hay price_tiers, usar el precio base como string
                        precioOriginal = String(product.precio || 0);
                    }
                    const precioFormateado = window.cartManager ? window.cartManager.formatUnitPrice(precioOriginal || precio) : precio.toFixed(2);
                    return `
                        <div class="product-search-item" onclick="window.selectProduct('${productId}')" style="cursor: pointer; background: var(--bg-white); border: 1px solid var(--brand-gold, #C6A15B);">
                            ${product.foto ? 
                                `<img src="${product.foto}" alt="${product.nombre}" class="product-search-item-image" onerror="this.style.display='none'">` :
                                `<div style="width:60px;height:60px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                                    <i class="fas fa-image" style="font-size:1.2rem;color:#9ca3af;"></i>
                                </div>`
                            }
                            <div class="product-search-item-info">
                                <h4 class="product-search-item-name">${product.nombre}</h4>
                                <p class="product-search-item-ref">Ref: ${product.id || product.referencia} | ${product.marca || 'Sin marca'}</p>
                                <span style="font-weight: 700; color: var(--brand-gold, #C6A15B); font-size: 0.95rem;">${precioFormateado} €</span>
                            </div>
                        </div>
                    `;
                }).join('');
                exclusiveSection.style.display = 'block';
            } else {
                exclusiveSection.style.display = 'none';
            }
        } else if (exclusiveSection) {
            exclusiveSection.style.display = 'none';
        }
    } else if (exclusiveSection) {
        exclusiveSection.style.display = 'none';
    }
    
    if (window.cartManager) {
        window.cartManager.selectedProduct = null;
    }
}

function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

/**
 * Abrir modal de productos exclusivos del cliente
 */
function openAddExclusiveProductModal() {
    const modal = document.getElementById('addExclusiveProductModal');
    if (!modal || !window.cartManager || !window.cartManager.editingProposalData) {
        return;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const clienteNombre = window.cartManager.editingProposalData.nombre_cliente;
    const resultsContainer = document.getElementById('exclusiveProductSearchResults');
    const selectedSection = document.getElementById('selectedExclusiveProductSection');
    const addBtn = document.getElementById('add-exclusive-product-btn');
    
    if (!clienteNombre) {
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                    <p>No se encontró información del cliente</p>
                </div>
            `;
        }
        return;
    }
    
    // Cargar productos exclusivos del cliente
    loadExclusiveProducts(clienteNombre);
    
    if (selectedSection) {
        selectedSection.style.display = 'none';
    }
    
    if (addBtn) {
        addBtn.disabled = true;
    }
    
    if (window.cartManager) {
        window.cartManager.selectedProduct = null;
    }
}

/**
 * Cerrar modal de productos exclusivos
 */
function closeAddExclusiveProductModal() {
    const modal = document.getElementById('addExclusiveProductModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

/**
 * Cargar productos exclusivos del cliente directamente desde Supabase
 */
async function loadExclusiveProducts(clienteNombre) {
    const resultsContainer = document.getElementById('exclusiveProductSearchResults');
    if (!resultsContainer || !window.cartManager || !window.cartManager.supabase) {
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                    <p>Error al cargar productos exclusivos</p>
                </div>
            `;
        }
        return;
    }
    
    // Mostrar estado de carga
    resultsContainer.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
            <p>Cargando productos exclusivos...</p>
        </div>
    `;
    
    try {
        // Cargar productos exclusivos directamente desde Supabase
        const { data: exclusiveProducts, error } = await window.cartManager.supabase
            .from('products')
            .select('*')
            .eq('cliente_id', clienteNombre)
            .order('nombre', { ascending: true });
        
        if (error) {
            resultsContainer.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                    <p>Error al cargar productos exclusivos: ${error.message}</p>
                </div>
            `;
            return;
        }
        
        if (!exclusiveProducts || exclusiveProducts.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                    <i class="fas fa-star" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                    <p id="no-exclusive-products-text">No hay productos exclusivos disponibles para este cliente</p>
                </div>
            `;
            return;
        }
        
        
        // Normalizar productos (similar a loadAllProducts)
        const normalizedProducts = exclusiveProducts.map(product => {
            // Normalizar price_tiers
            let priceTiers = [];
            if (Array.isArray(product.price_tiers)) {
                priceTiers = product.price_tiers;
            } else if (product.price_tiers) {
                try {
                    priceTiers = typeof product.price_tiers === 'string' ? JSON.parse(product.price_tiers) : [product.price_tiers];
                } catch (e) {
                    priceTiers = [];
                }
            }
            
            // Normalizar variants
            let variants = [];
            if (Array.isArray(product.variants)) {
                variants = product.variants;
            } else if (product.variants) {
                try {
                    variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : [];
                } catch (e) {
                    variants = [];
                }
            }
            
            return {
                id: product.id,
                nombre: product.modelo || product.nombre || 'Sin nombre',
                categoria: product.categoria || 'sin-categoria',
                precio: product.precio !== null && product.precio !== undefined ? Number(product.precio) : 0,
                foto: product.foto || null,
                referencia: product.id ? String(product.id) : '',
                marca: product.brand || product.marca || '',
                price_tiers: priceTiers,
                variants: variants,
                plazo_entrega: product.plazo_entrega || product.plazoEntrega || '',
                cliente_id: product.cliente_id || null
            };
        });
        
        // Agregar productos normalizados a allProducts si no están ya
        const existingIds = new Set(window.cartManager.allProducts.map(p => p.id));
        const newProducts = normalizedProducts.filter(p => !existingIds.has(p.id));
        window.cartManager.allProducts = [...window.cartManager.allProducts, ...newProducts];
        
        // Mostrar productos exclusivos
        const resultsHTML = normalizedProducts.map(product => {
            const categoryName = window.cartManager ? window.cartManager.getCategoryName(product.categoria) : product.categoria;
            const productId = product.id ? String(product.id).replace(/'/g, "\\'") : '';
            // Obtener precio: si tiene price_tiers, usar el precio del primer tier, sino usar precio base
            let precio = product.precio || 0;
            let precioOriginal = null; // Guardar el precio original como string para preservar decimales
            if (product.price_tiers && Array.isArray(product.price_tiers) && product.price_tiers.length > 0) {
                const sortedTiers = [...product.price_tiers].sort((a, b) => {
                    const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
                    const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
                    return minA - minB;
                });
                const firstTier = sortedTiers[0];
                if (firstTier && firstTier.price !== null && firstTier.price !== undefined) {
                    // Guardar el precio original como string para preservar decimales
                    precioOriginal = String(firstTier.price);
                    precio = Number(firstTier.price);
                }
            } else {
                // Si no hay price_tiers, usar el precio base como string
                precioOriginal = String(product.precio || 0);
            }
            const precioFormateado = window.cartManager ? window.cartManager.formatUnitPrice(precioOriginal || precio) : precio.toFixed(2);
            const plazoEntrega = product.plazo_entrega || product.plazoEntrega || '';
            return `
                <div class="product-search-item" onclick="window.selectExclusiveProduct('${productId}')" style="cursor: pointer; background: var(--bg-white); border: 2px solid var(--brand-gold, #C6A15B); border-radius: var(--radius-md); margin-bottom: var(--space-2); padding: var(--space-3);">
                    ${product.foto ? 
                        `<img src="${product.foto}" alt="${product.nombre}" class="product-search-item-image" onerror="this.style.display='none'">` :
                        `<div style="width:60px;height:60px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                            <i class="fas fa-image" style="font-size:1.2rem;color:#9ca3af;"></i>
                        </div>`
                    }
                    <div class="product-search-item-info">
                        <h4 class="product-search-item-name">${product.nombre}</h4>
                        <p class="product-search-item-ref">Ref: ${product.id || product.referencia} | ${product.marca || 'Sin marca'}</p>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                            <span class="product-search-item-category">${categoryName}</span>
                            <span style="font-weight: 700; color: var(--brand-gold, #C6A15B); font-size: 0.95rem;">${precioFormateado} €</span>
                            ${plazoEntrega ? `<span style="font-size: 0.8rem; color: var(--text-secondary, #6b7280); background: var(--bg-gray-100, #f3f4f6); padding: 2px 8px; border-radius: 4px;"><i class="fas fa-truck" style="margin-right: 4px;"></i>${plazoEntrega}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = resultsHTML;
    } catch (error) {
        resultsContainer.innerHTML = `
            <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                <p>Error al cargar productos exclusivos: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Seleccionar un producto exclusivo
 */
window.selectExclusiveProduct = function(productId) {
    if (!window.cartManager) {
        return;
    }
    
    const product = window.cartManager.allProducts.find(p => {
        const match = p.id === productId || p.id === String(productId) || String(p.id) === String(productId);
        return match;
    });
    
    if (!product) {
        return;
    }
    window.cartManager.selectedProduct = product;
    
    // Mostrar producto seleccionado
    const selectedSection = document.getElementById('selectedExclusiveProductSection');
    const selectedImage = document.getElementById('selectedExclusiveProductImage');
    const selectedName = document.getElementById('selectedExclusiveProductName');
    const selectedRef = document.getElementById('selectedExclusiveProductRef');
    const quantityInput = document.getElementById('exclusiveProductQuantityInput');
    const addBtn = document.getElementById('add-exclusive-product-btn');
    
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }
    
    if (selectedImage) {
        selectedImage.src = product.foto || '';
        selectedImage.alt = product.nombre || '';
    }
    
    if (selectedName) {
        selectedName.textContent = product.nombre || 'Sin nombre';
    }
    
    if (selectedRef) {
        const ref = product.id || product.referencia || 'Sin referencia';
        const marca = product.marca || 'Sin marca';
        selectedRef.textContent = `Ref: ${ref} | ${marca}`;
    }
    
    if (quantityInput) {
        quantityInput.value = 1;
    }
    
    if (addBtn) {
        addBtn.disabled = false;
    }
    
    // Scroll a la sección seleccionada
    if (selectedSection) {
        selectedSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

/**
 * Agregar producto exclusivo seleccionado al carrito
 */
function addSelectedExclusiveProductToCart() {
    if (!window.cartManager || !window.cartManager.selectedProduct) {
        return;
    }
    
    const quantityInput = document.getElementById('exclusiveProductQuantityInput');
    const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
    
    if (quantity < 1) {
        alert('La cantidad debe ser al menos 1');
        return;
    }
    
    // Agregar producto al carrito
    window.cartManager.addProduct(window.cartManager.selectedProduct, quantity);
    
    // Cerrar modal
    closeAddExclusiveProductModal();
    
    // Mostrar notificación
    if (window.cartManager.showNotification) {
        const lang = window.cartManager.currentLanguage || 'pt';
        const message = lang === 'es' ? 
            'Producto exclusivo agregado al presupuesto' : 
            lang === 'pt' ? 
            'Produto exclusivo adicionado ao orçamento' :
            'Exclusive product added to proposal';
        window.cartManager.showNotification(message, 'success');
    }
}

function handleProductSearch(e) {
    try {
    const searchTerm = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('productSearchResults');
    
        if (!resultsContainer || !window.cartManager) {
            console.warn('Buscador: resultsContainer o cartManager no disponible');
            return;
        }
    
    if (searchTerm.length < 2) {
        resultsContainer.innerHTML = `
            <div style="padding: var(--space-4); text-align: center; color: var(--text-secondary);">
                <i class="fas fa-search" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                <p id="search-placeholder-text">Escribe para buscar productos...</p>
            </div>
        `;
        return;
    }
    
    // Helper para normalizar cadenas (sin acentos, minúsculas, guiones)
    // Normalización unificada: pasa a minúsculas, quita acentos, reemplaza espacios por guiones, elimina caracteres especiales
    const normalizeString = (str) => {
        return (str || '').toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
            .replace(/\s+/g, '-') // Reemplazar espacios por guiones
            .replace(/[^a-z0-9-]/g, ''); // Eliminar caracteres que no sean letras, números o guiones
    };

    const searchTermNormalized = normalizeString(searchTerm);

    // Verificar que allProducts esté disponible
    if (!window.cartManager.allProducts || !Array.isArray(window.cartManager.allProducts)) {
        console.warn('Buscador: allProducts no disponible o no es un array');
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                <p>Error: No hay productos disponibles para buscar</p>
            </div>
        `;
        return;
    }
    
    // Filtrar productos
    const filteredProducts = window.cartManager.allProducts.filter(product => {
        if (!product) return false;
        
        // Obtener campos del producto (sin normalizar aún)
        const nombre = product.nombre || '';
        const nombreEs = product.nombre_es || product.nombreEs || '';
        const nombrePt = product.nombre_pt || product.nombrePt || '';
        const referencia = product.referencia || '';
        const marca = product.marca || '';
        const categoria = product.categoria || '';
        const id = product.id ? String(product.id) : '';

        // 1. matchesBasicFields: Buscar en nombre, referencia, marca, id usando normalización
        const matchesBasicFields = (() => {
            const fields = [nombre, nombreEs, nombrePt, referencia, id, marca];
            return fields.some(field => {
                if (!field) return false;
                const fieldNorm = normalizeString(field);
                return fieldNorm.includes(searchTermNormalized);
            });
        })();

        // 2. matchesDirectCategory: Buscar en categoría directa usando normalización
        const matchesDirectCategory = (() => {
            if (!categoria) return false;
            const categoriaNorm = normalizeString(categoria);
            return categoriaNorm.includes(searchTermNormalized);
        })();

        // 3. matchesCategory: Buscar por categoría desde allCategories usando lógica simplificada
        let matchesCategory = false;
        if (
            searchTerm.length >= 2 &&
            window.cartManager &&
            Array.isArray(window.cartManager.allCategories) &&
            window.cartManager.allCategories.length > 0
        ) {
            // Identificar la categoría del producto por prioridad
            const productCategoryId = (
                product.categoria_id ||
                product.category_id ||
                product.categoria_general_id ||
                product.category_general_id ||
                ''
            ).toString().toLowerCase().trim();

            const productCategoriaNorm = normalizeString(product.categoria || '');

            // Buscar la categoría del producto en allCategories
            const categoryOfProduct = window.cartManager.allCategories.find(cat => {
                const catId = (cat.id || '').toString().toLowerCase();
                const catEsNorm = normalizeString(cat.nombre_es || '');
                const catPtNorm = normalizeString(cat.nombre_pt || '');
                const catSlugEsNorm = normalizeString(cat.slug_es || cat.slug || '');
                const catSlugPtNorm = normalizeString(cat.slug_pt || cat.slug || '');

                // Emparejar por ID de categoría
                if (productCategoryId && productCategoryId === catId) return true;

                // Emparejar por slug/nombre normalizado
                if (productCategoriaNorm) {
                    return (
                        productCategoriaNorm === catEsNorm ||
                        productCategoriaNorm === catPtNorm ||
                        productCategoriaNorm === catSlugEsNorm ||
                        productCategoriaNorm === catSlugPtNorm
                    );
                }

                return false;
            });

            // Si encontramos la categoría del producto, verificar si el término de búsqueda coincide con sus nombres
            if (categoryOfProduct) {
                const catEsNorm = normalizeString(categoryOfProduct.nombre_es || '');
                const catPtNorm = normalizeString(categoryOfProduct.nombre_pt || '');
                const catSlugEsNorm = normalizeString(categoryOfProduct.slug_es || categoryOfProduct.slug || '');
                const catSlugPtNorm = normalizeString(categoryOfProduct.slug_pt || categoryOfProduct.slug || '');

                matchesCategory =
                    (catEsNorm && catEsNorm.includes(searchTermNormalized)) ||
                    (catPtNorm && catPtNorm.includes(searchTermNormalized)) ||
                    (catSlugEsNorm && catSlugEsNorm.includes(searchTermNormalized)) ||
                    (catSlugPtNorm && catSlugPtNorm.includes(searchTermNormalized));
            }
        }

        // Retornar true si coincide en campos básicos, categoría directa, o categoría desde Supabase
        return Boolean(matchesBasicFields || matchesDirectCategory || matchesCategory);
    });
    
    // Mostrar resultados
    if (filteredProducts.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                <p>No se encontraron productos</p>
            </div>
        `;
    } else {
        // Función helper para obtener nombres de categoría en ambos idiomas
        const getCategoryNames = (product) => {
            if (!window.cartManager || !window.cartManager.allCategories || !Array.isArray(window.cartManager.allCategories) || window.cartManager.allCategories.length === 0) {
                return { es: product.categoria || '', pt: product.categoria || '' };
            }

            const productCategoryId = (
                product.categoria_id ||
                product.category_id ||
                product.categoria_general_id ||
                product.category_general_id ||
                ''
            ).toString().toLowerCase().trim();

            const productCategoriaNorm = normalizeString(product.categoria || '');
            const productCategoriaLower = (product.categoria || '').toLowerCase().trim();

            // Buscar la categoría del producto en allCategories
            let categoryOfProduct = null;
            
            // Primero intentar por ID
            if (productCategoryId) {
                categoryOfProduct = window.cartManager.allCategories.find(cat => {
                    const catId = (cat.id || '').toString().toLowerCase();
                    return productCategoryId === catId;
                });
            }
            
            // Si no se encontró por ID, intentar por slug/nombre normalizado
            if (!categoryOfProduct && productCategoriaNorm) {
                categoryOfProduct = window.cartManager.allCategories.find(cat => {
                    const catEsNorm = normalizeString(cat.nombre_es || '');
                    const catPtNorm = normalizeString(cat.nombre_pt || '');
                    const catSlugEsNorm = normalizeString(cat.slug_es || cat.slug || '');
                    const catSlugPtNorm = normalizeString(cat.slug_pt || cat.slug || '');
                    
                    return (
                        productCategoriaNorm === catEsNorm ||
                        productCategoriaNorm === catPtNorm ||
                        productCategoriaNorm === catSlugEsNorm ||
                        productCategoriaNorm === catSlugPtNorm
                    );
                });
            }
            
            // También intentar comparar directamente el nombre de la categoría del producto con los nombres de las categorías
            if (!categoryOfProduct && product.categoria) {
                categoryOfProduct = window.cartManager.allCategories.find(cat => {
                    const catEs = (cat.nombre_es || '').toLowerCase().trim();
                    const catPt = (cat.nombre_pt || '').toLowerCase().trim();
                    return (
                        productCategoriaLower === catEs ||
                        productCategoriaLower === catPt ||
                        catEs.includes(productCategoriaLower) ||
                        catPt.includes(productCategoriaLower) ||
                        productCategoriaLower.includes(catEs) ||
                        productCategoriaLower.includes(catPt)
                    );
                });
            }

            if (categoryOfProduct) {
                const nombreEs = categoryOfProduct.nombre_es || '';
                const nombrePt = categoryOfProduct.nombre_pt || '';
                
                // Devolver ambos nombres si están disponibles
                return { 
                    es: nombreEs || product.categoria || '', 
                    pt: nombrePt || product.categoria || '' 
                };
            }

            // Si no se encuentra, devolver el valor original
            return { es: product.categoria || '', pt: product.categoria || '' };
        };

        const resultsHTML = filteredProducts.map(product => {
            const categoryNames = getCategoryNames(product);
            const productId = product.id ? String(product.id).replace(/'/g, "\\'") : '';
            // Obtener precio: si tiene price_tiers, usar el precio del primer tier, sino usar precio base
            let precio = product.precio || 0;
            let precioOriginal = null; // Guardar el precio original como string para preservar decimales
            if (product.price_tiers && Array.isArray(product.price_tiers) && product.price_tiers.length > 0) {
                const sortedTiers = [...product.price_tiers].sort((a, b) => {
                    const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
                    const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
                    return minA - minB;
                });
                const firstTier = sortedTiers[0];
                if (firstTier && firstTier.price !== null && firstTier.price !== undefined) {
                    // Guardar el precio original como string para preservar decimales
                    precioOriginal = String(firstTier.price);
                    precio = Number(firstTier.price);
                }
            } else {
                // Si no hay price_tiers, usar el precio base como string
                precioOriginal = String(product.precio || 0);
            }
            const precioFormateado = window.cartManager ? window.cartManager.formatUnitPrice(precioOriginal || precio) : precio.toFixed(2);
            const plazoEntrega = product.plazo_entrega || product.plazoEntrega || '';
            
            // Mostrar ambos idiomas si ambos están disponibles
            let categoryDisplay = '';
            if (categoryNames.es && categoryNames.pt) {
                // Si son diferentes, mostrar ambos separados por " / "
                if (categoryNames.es !== categoryNames.pt) {
                    categoryDisplay = `${categoryNames.es} / ${categoryNames.pt}`;
                } else {
                    // Si son iguales, mostrar solo uno
                    categoryDisplay = categoryNames.es;
                }
            } else if (categoryNames.es) {
                categoryDisplay = categoryNames.es;
            } else if (categoryNames.pt) {
                categoryDisplay = categoryNames.pt;
            } else {
                categoryDisplay = product.categoria || '';
            }
            
            return `
                <div class="product-search-item" onclick="window.selectProduct('${productId}')" style="cursor: pointer;">
                    ${product.foto ? 
                        `<img src="${product.foto}" alt="${product.nombre}" class="product-search-item-image" onerror="this.style.display='none'">` :
                        `<div style="width:60px;height:60px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                            <i class="fas fa-image" style="font-size:1.2rem;color:#9ca3af;"></i>
                        </div>`
                    }
                    <div class="product-search-item-info">
                        <h4 class="product-search-item-name">${product.nombre}</h4>
                        <p class="product-search-item-ref">Ref: ${product.id || product.referencia} | ${product.marca || 'Sin marca'}</p>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                        <span class="product-search-item-category">${categoryDisplay}</span>
                            <span style="font-weight: 700; color: var(--accent-500, #f59e0b); font-size: 0.95rem;">${precioFormateado} €</span>
                            ${plazoEntrega ? `<span style="font-size: 0.8rem; color: var(--text-secondary, #6b7280); background: var(--bg-gray-100, #f3f4f6); padding: 2px 8px; border-radius: 4px;"><i class="fas fa-truck" style="margin-right: 4px;"></i>${plazoEntrega}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = resultsHTML;
    }
    } catch (error) {
        console.error('Error en handleProductSearch:', error);
        const resultsContainer = document.getElementById('productSearchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.3;"></i>
                    <p>Error al buscar productos. Por favor, recarga la página.</p>
                </div>
            `;
        }
    }
}

function selectProduct(productId) {
    if (!window.cartManager) {
        return;
    }
    
    const product = window.cartManager.allProducts.find(p => {
        const match = p.id === productId || p.id === String(productId) || String(p.id) === String(productId);
        return match;
    });
    
    if (!product) {
        return;
    }
    window.cartManager.selectedProduct = product;
    
    // Mostrar producto seleccionado
    const selectedSection = document.getElementById('selectedProductSection');
    const selectedImage = document.getElementById('selectedProductImage');
    const selectedName = document.getElementById('selectedProductName');
    const selectedRef = document.getElementById('selectedProductRef');
    const addBtn = document.getElementById('add-product-btn');
    const quantityInput = document.getElementById('productQuantityInput');
    
    if (selectedSection && selectedImage && selectedName && selectedRef) {
        if (product.foto) {
            selectedImage.src = product.foto;
        } else {
            selectedImage.style.display = 'none';
        }
        selectedImage.alt = product.nombre;
        selectedName.textContent = product.nombre;
        selectedRef.textContent = `Ref: ${product.id || product.referencia} | ${product.marca || 'Sin marca'}`;
        selectedSection.style.display = 'block';
    }
    
    if (quantityInput) {
        quantityInput.value = 1;
    }
    
    if (addBtn) {
        addBtn.disabled = false;
    }
    
    // Scroll a la sección de selección
    if (selectedSection) {
        selectedSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Asegurar que la función sea global
window.selectProduct = selectProduct;

function addSelectedProductToCart() {
    if (!window.cartManager || !window.cartManager.selectedProduct) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'Por favor selecciona un producto' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'Por favor selecione um produto' :
            'Please select a product';
        window.cartManager?.showNotification(message, 'error');
        return;
    }
    
    const quantityInput = document.getElementById('productQuantityInput');
    const quantity = parseInt(quantityInput?.value || 1);
    
    if (quantity < 1 || quantity > 50000) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'La cantidad debe estar entre 1 y 50000' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'A quantidade deve estar entre 1 e 50000' :
            'Quantity must be between 1 and 50000';
        window.cartManager?.showNotification(message, 'error');
        return;
    }
    
    const product = window.cartManager.selectedProduct;
    
    
        // Agregar al carrito usando el método existente
        window.cartManager.addProduct({
            id: product.id,
            nombre: product.nombre,
            categoria: product.categoria,
            precio: product.precio,
            foto: product.foto,
            potencia: product.potencia,
            color: product.color,
            tipo: product.tipo,
            descripcionEs: product.descripcionEs || product.descripcion_es || '',
            descripcionPt: product.descripcionPt || product.descripcion_pt || '',
            plazoEntrega: product.plazoEntrega || product.plazo_entrega || '',
            price_tiers: product.price_tiers || []
        }, quantity);
    
    // Cerrar modal
    closeAddProductModal();
}

// Asegurar que la función sea global
window.addSelectedProductToCart = addSelectedProductToCart;

// Funciones para observaciones
function toggleObservations(itemId) {
    const container = document.getElementById(`observations-${itemId}`);
    if (container) {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';
        
        // Si se muestra, enfocar el textarea
        if (!isVisible) {
            setTimeout(() => {
                const textarea = container.querySelector('.observations-input');
                if (textarea) {
                    textarea.focus();
                }
            }, 100);
        }
    }
}

function saveObservations(itemId, observations) {
    if (!window.cartManager) return;
    
    // Buscar el item por cartItemId primero (para items duplicados), luego por id como fallback
    const item = window.cartManager.cart.find(item => {
        // Si itemId empieza con "cart-item-", es un cartItemId
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (item) {
        // Guardar las observaciones
        item.observations = observations || '';
        
        // Guardar el carrito inmediatamente
        window.cartManager.saveCart();
        
        // Debug para verificar que se guardó
    } else {
    }
}

// Asegurar que las funciones sean globales
window.toggleObservations = toggleObservations;
window.saveObservations = saveObservations;

// Función para actualizar el precio en tiempo real mientras se escribe
function updatePriceOnQuantityChange(itemId, quantity) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    try {
        // Buscar el item por cartItemId primero (para items duplicados), luego por id como fallback
        const item = window.cartManager.cart.find(item => {
            // Si itemId empieza con "cart-item-", es un cartItemId
            if (itemId && itemId.toString().startsWith('cart-item-')) {
                return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
            }
            // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
            return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
                   (String(item.id) === String(itemId) || item.id === itemId);
        });
        
        if (!item) {
            console.error('Item no encontrado con ID:', itemId, 'Carrito:', window.cartManager.cart);
            return;
        }
        
        if (item.type !== 'product') {
            return; // Solo actualizar para productos
        }
        
        let requestedQuantity = parseInt(quantity) || 1;
        if (requestedQuantity < 1 || requestedQuantity > 50000) {
            return;
        }
        
        // NO normalizar mientras el usuario escribe - solo calcular precio
        // La normalización se hará cuando termine de editar (onblur)
        // Usar la cantidad solicitada para calcular el precio en tiempo real
        const newQuantity = requestedQuantity;
        
        // Si no tiene price_tiers o variants, intentar obtenerlos de la BD
        if ((!item.price_tiers || item.price_tiers.length === 0) || (!item.variants || item.variants.length === 0)) {
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB) {
                if (productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
                    item.price_tiers = productFromDB.price_tiers;
                }
                if (productFromDB.variants && productFromDB.variants.length > 0) {
                    item.variants = productFromDB.variants;
                }
                if (!item.basePrice) {
                    item.basePrice = productFromDB.precio || item.price || 0;
                }
                // Asegurar que box_size esté guardado
                if (!item.box_size && productFromDB.box_size) {
                    item.box_size = productFromDB.box_size;
                }
            }
        }
        
        // Determinar qué price_tiers usar: variante seleccionada o base
        let priceTiersToUse = item.price_tiers || [];
        
        // Si hay una variante seleccionada, usar sus price_tiers
        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
            const selectedVariant = item.variants[item.selectedVariant];
            if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                priceTiersToUse = selectedVariant.price_tiers;
            }
        }
        
        // Calcular precio según escalones (precio unitario) usando los price_tiers correctos
        let newPrice = item.price || 0;
        let minQty = null;
        let isValid = true;
        
        if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
            const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
            const priceResult = window.cartManager.getPriceForQuantity(priceTiersToUse, newQuantity, basePriceForCalc);
            newPrice = priceResult.price;
            minQty = priceResult.minQuantity;
            isValid = priceResult.isValid;
        } else if (item.basePrice !== undefined && item.basePrice !== null) {
            newPrice = item.basePrice;
            minQty = null;
            isValid = true;
        } else {
            // Si no hay precio base ni escalones, intentar obtenerlo de la BD
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB) {
                newPrice = productFromDB.precio || 0;
                item.basePrice = newPrice;
            }
        }
        
        // NO actualizar la cantidad en el item mientras el usuario escribe
        // Solo actualizar el precio para mostrar en tiempo real
        // La cantidad se actualizará cuando termine de editar (onblur)
        item.price = newPrice;
        item.minQuantity = minQty;
        item.isValidQuantity = isValid;
        
        // NO guardar el carrito mientras el usuario escribe
        // Se guardará cuando termine de editar (onblur)
        
        // Actualizar el precio en el DOM inmediatamente (mostrar solo precio unitario o mensaje de cantidad mínima)
        // Buscar el elemento del carrito de manera más robusta
        const allCartItems = document.querySelectorAll('.cart-item');
        let cartItem = null;
        
        for (const cartItemElement of allCartItems) {
            const dataItemId = cartItemElement.getAttribute('data-item-id');
            if (String(dataItemId) === String(itemId) || dataItemId === itemId) {
                cartItem = cartItemElement;
                break;
            }
        }
        
        if (cartItem) {
            // NO actualizar el input mientras el usuario escribe
            // Solo actualizar el precio mostrado
            const priceElement = cartItem.querySelector('.cart-item-total');
            if (priceElement) {
                // Si la cantidad no es válida, mostrar mensaje de cantidad mínima
                if (!isValid && minQty !== null) {
                    const lang = window.cartManager?.currentLanguage || 'es';
                    const message = lang === 'es' ? 
                        `Cantidad mínima: ${minQty}` : 
                        lang === 'pt' ? 
                        `Quantidade mínima: ${minQty}` :
                        `Minimum quantity: ${minQty}`;
                    priceElement.textContent = message;
                    priceElement.style.color = '#ef4444';
                    priceElement.style.fontWeight = '600';
                } else {
                    // Mostrar precio unitario
                    priceElement.textContent = `€${window.cartManager.formatUnitPrice(newPrice)}`;
                    priceElement.style.color = '';
                    priceElement.style.fontWeight = '';
                }
            }
            
            // Actualizar solo la sugerencia de upsell sin re-renderizar todo
            updateUpsellSuggestion(cartItem, item, newQuantity);
        }
    } catch (error) {
        console.error('❌ Error en updatePriceOnQuantityChange:', error);
    }
}

window.updatePriceOnQuantityChange = updatePriceOnQuantityChange;

/**
 * Actualizar solo la sugerencia de upsell sin re-renderizar todo el carrito
 */
function updateUpsellSuggestion(cartItemElement, item, quantity) {
    if (!window.cartManager || !item || item.type !== 'product') {
        return;
    }
    
    try {
        // Determinar qué price_tiers usar: variante seleccionada o base
        let priceTiersToUse = item.price_tiers || [];
        
        // Si hay una variante seleccionada, usar sus price_tiers
        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
            const selectedVariant = item.variants[item.selectedVariant];
            if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                priceTiersToUse = selectedVariant.price_tiers;
            }
        }
        
        // Crear objeto producto para la función de sugerencia
        const productForSuggestion = {
            id: item.id,
            name: item.name,
            price_tiers: priceTiersToUse
        };
        
        // Calcular sugerencia
        const upsellSuggestion = window.cartManager.getQuantityUpsellSuggestion(productForSuggestion, quantity);
        
        // Buscar el elemento de sugerencia existente
        let suggestionElement = cartItemElement.querySelector('.upsell-suggestion');
        
        if (upsellSuggestion) {
            // Calcular el ahorro real: lo que costaría al precio actual vs el nuevo precio
            const costWithoutDiscount = upsellSuggestion.newQuantity * upsellSuggestion.currentUnitPrice;
            const costWithDiscount = upsellSuggestion.nextTotal;
            const realSavings = costWithoutDiscount - costWithDiscount;
            const savingsPerUnit = upsellSuggestion.currentUnitPrice - upsellSuggestion.nextUnitPrice;
            const discountPercent = ((savingsPerUnit / upsellSuggestion.currentUnitPrice) * 100).toFixed(0);
            
            const translations = {
                es: {
                    message: `Si aumentas tu pedido a ${upsellSuggestion.newQuantity} uds, el precio por unidad baja de ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ a ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% descuento). ¡Ahorras ${realSavings.toFixed(2)}€ en total!`,
                    button: 'Aumentar cantidad',
                    title: 'Oferta especial'
                },
                pt: {
                    message: `Se aumentar o seu pedido para ${upsellSuggestion.newQuantity} unid., o preço por unidade baixa de ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ para ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% desconto). Poupa ${realSavings.toFixed(2)}€ no total!`,
                    button: 'Aumentar quantidade',
                    title: 'Oferta especial'
                },
                en: {
                    message: `If you increase your order to ${upsellSuggestion.newQuantity} units, the unit price drops from ${upsellSuggestion.currentUnitPrice.toFixed(2)}€ to ${upsellSuggestion.nextUnitPrice.toFixed(2)}€ (${discountPercent}% discount). You save ${realSavings.toFixed(2)}€ in total!`,
                    button: 'Increase quantity',
                    title: 'Special offer'
                }
            };
            
            const lang = window.cartManager.currentLanguage || 'es';
            const t = translations[lang] || translations.es;
            
            // Obtener itemIdentifier del cartItemElement
            const itemIdentifier = cartItemElement.getAttribute('data-item-id') || item.cartItemId || item.id;
            
            const suggestionHTML = `
                <div class="upsell-suggestion" style="grid-column: 1 / -1; margin-top: 10px; padding: 12px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; align-items: flex-start; gap: 10px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fas fa-lightbulb" style="color: #f59e0b; font-size: 1.1rem;"></i>
                                <strong style="color: #92400e; font-size: 0.9rem;">${t.title}</strong>
                            </div>
                            <p style="margin: 0; color: #78350f; font-size: 0.875rem; line-height: 1.5;">${t.message}</p>
                        </div>
                        <button onclick="applyUpsellSuggestion('${String(itemIdentifier).replace(/'/g, "\\'")}', ${upsellSuggestion.newQuantity})" 
                                style="padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.875rem; cursor: pointer; white-space: nowrap; transition: background 0.2s;"
                                onmouseover="this.style.background='#d97706'" 
                                onmouseout="this.style.background='#f59e0b'">
                            ${t.button}
                        </button>
                    </div>
                </div>
            `;
            
            if (suggestionElement) {
                // Actualizar elemento existente
                suggestionElement.outerHTML = suggestionHTML;
            } else {
                // Insertar nuevo elemento después del selector de variantes o antes del contenedor de observaciones
                const variantSelector = cartItemElement.querySelector('.cart-item-variant-selector');
                const observationsContainer = cartItemElement.querySelector('.cart-item-observations-container');
                
                if (variantSelector) {
                    variantSelector.insertAdjacentHTML('afterend', suggestionHTML);
                } else if (observationsContainer) {
                    observationsContainer.insertAdjacentHTML('beforebegin', suggestionHTML);
                } else {
                    // Si no hay ninguno, insertar al final del cart-item
                    const actionsElement = cartItemElement.querySelector('.cart-item-actions');
                    if (actionsElement) {
                        actionsElement.parentElement.insertAdjacentHTML('afterend', suggestionHTML);
                    }
                }
            }
        } else {
            // Si no hay sugerencia, eliminar el elemento si existe
            if (suggestionElement) {
                suggestionElement.remove();
            }
        }
    } catch (error) {
        console.error('❌ Error actualizando sugerencia de upsell:', error);
    }
}

/**
 * Cambiar la variante seleccionada de un producto
 */
function changeProductVariant(itemId, variantIndex) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    try {
        // Buscar por cartItemId primero (para items duplicados), luego por id como fallback
        const item = window.cartManager.cart.find(item => {
            // Si itemId empieza con "cart-item-", es un cartItemId
            if (itemId && itemId.toString().startsWith('cart-item-')) {
                return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
            }
            // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
            return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
                   (String(item.id) === String(itemId) || item.id === itemId);
        });
        
        if (!item || item.type !== 'product') {
            console.error('Item no encontrado o no es un producto');
            return;
        }
        
        // Cargar variantes si no están en el item
        if (!item.variants || item.variants.length === 0) {
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB && productFromDB.variants && productFromDB.variants.length > 0) {
                item.variants = productFromDB.variants;
            } else {
                console.warn('No hay variantes disponibles para este producto');
                return;
            }
        }
        
        // Establecer la variante seleccionada
        let isPersonalizedVariant = false;
        let variantDeliveryTime = null; // Plazo de entrega de la variante
        if (variantIndex === 'base' || variantIndex === null || variantIndex === '') {
            item.selectedVariant = null;
            // Si se vuelve a la base, limpiar el plazo de entrega de variante
            if (item.variantDeliveryTime) {
                delete item.variantDeliveryTime;
            }
        } else {
            const index = parseInt(variantIndex);
            if (index >= 0 && index < item.variants.length) {
                item.selectedVariant = index;
                isPersonalizedVariant = true; // Se seleccionó una variante personalizada
                // Obtener el plazo de entrega de la variante si existe
                const selectedVariant = item.variants[index];
                if (selectedVariant && (selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime)) {
                    variantDeliveryTime = selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime;
                    item.variantDeliveryTime = variantDeliveryTime; // Guardar en el item
                    // Persistir inmediatamente
                    window.cartManager.saveCart();
                } else {
                    // Si la variante no tiene plazo, limpiar el plazo guardado
                    if (item.variantDeliveryTime) {
                        delete item.variantDeliveryTime;
                        window.cartManager.saveCart();
                    }
                }
            } else {
                console.warn('Índice de variante inválido:', index);
                return;
            }
        }
        
        // Recalcular precio según la variante seleccionada
        let priceTiersToUse = item.price_tiers || [];
        
        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
            const selectedVariant = item.variants[item.selectedVariant];
            if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                priceTiersToUse = selectedVariant.price_tiers;
            }
        }
        
        // Recalcular precio
        let newPrice = item.price || 0;
        let minQty = null;
        let isValid = true;
        
        if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
            const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
            const priceResult = window.cartManager.getPriceForQuantity(priceTiersToUse, item.quantity, basePriceForCalc);
            newPrice = priceResult.price;
            minQty = priceResult.minQuantity;
            isValid = priceResult.isValid;
        } else if (item.basePrice !== undefined && item.basePrice !== null) {
            newPrice = item.basePrice;
            minQty = null;
            isValid = true;
        } else {
            // Si no hay precio base, intentar obtenerlo de la BD
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB && productFromDB.precio) {
                newPrice = productFromDB.precio;
                item.basePrice = productFromDB.precio;
            } else {
                newPrice = newPrice || 0;
            }
            minQty = null;
            isValid = true;
        }
        
        item.price = Number(newPrice) || 0;
        item.minQuantity = minQty !== null && minQty !== undefined ? Number(minQty) : null;
        item.isValidQuantity = isValid === true;
        
        // Guardar y renderizar
        window.cartManager.saveCart();
        // skipStockUpdate=true para evitar que se actualicen todos los plazos ahora
        window.cartManager.renderCart(true);
        
        // Mostrar banner de advertencia si se seleccionó una variante personalizada
        if (isPersonalizedVariant) {
            setTimeout(() => {
                showPersonalizedPriceWarningBanner(itemId);
                // Verificar si hay un logotipo guardado para este cliente
                checkAndSuggestClientLogo(itemId);
            }, 100);
        }
        
        // Actualizar solo el plazo de entrega del producto que cambió de variante
        // Usar cartItemId si existe, sino usar item.id
        const itemIdentifier = item.cartItemId || item.id;
        setTimeout(() => {
            // Si hay un plazo de entrega de variante, actualizarlo directamente sin consultar stock
            if (variantDeliveryTime) {
                const cartItem = document.querySelector(`.cart-item[data-item-id="${itemIdentifier}"]`);
                if (cartItem) {
                    const deliveryElement = cartItem.querySelector('.delivery-time[data-phc-ref]');
                    if (deliveryElement) {
                        deliveryElement.innerHTML = '';
                        const span = document.createElement('span');
                        span.textContent = variantDeliveryTime;
                        deliveryElement.appendChild(span);
                    }
                }
            }
            
            // Actualizar el producto que cambió (solo si no hay plazo de variante)
            if (!variantDeliveryTime) {
                window.cartManager.updateDeliveryTimesFromStock(itemIdentifier).then(() => {
                    // Después de actualizar el producto que cambió, actualizar todos los demás
                    const allDeliveryElements = document.querySelectorAll('.delivery-time[data-phc-ref]');
                    const updatePromises = [];
                    for (const element of allDeliveryElements) {
                        const elementItemId = element.getAttribute('data-item-id');
                        // Solo actualizar si NO es el producto que acabamos de actualizar
                        if (String(elementItemId) !== String(itemIdentifier) && elementItemId !== itemIdentifier) {
                            updatePromises.push(window.cartManager.updateDeliveryTimesFromStock(elementItemId));
                        }
                    }
                    // Ejecutar todas las actualizaciones en paralelo
                    Promise.all(updatePromises).catch(err => {
                        console.error('Error actualizando plazos de entrega:', err);
                    });
                }).catch(err => {
                    console.error('Error actualizando plazo de entrega del producto modificado:', err);
                });
            } else {
                // Si hay plazo de variante, solo actualizar los demás productos
                const allDeliveryElements = document.querySelectorAll('.delivery-time[data-phc-ref]');
                const updatePromises = [];
                for (const element of allDeliveryElements) {
                    const elementItemId = element.getAttribute('data-item-id');
                    // Solo actualizar si NO es el producto que acabamos de actualizar
                    if (String(elementItemId) !== String(itemIdentifier) && elementItemId !== itemIdentifier) {
                        updatePromises.push(window.cartManager.updateDeliveryTimesFromStock(elementItemId));
                    }
                }
                // Ejecutar todas las actualizaciones en paralelo
                Promise.all(updatePromises).catch(err => {
                    console.error('Error actualizando plazos de entrega:', err);
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Error en changeProductVariant:', error);
    }
}

window.changeProductVariant = changeProductVariant;

/**
 * Cambiar variante de referencia (color) seleccionada
 */
function changeReferenceVariant(itemId, variantIndex) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    try {
        // Buscar por cartItemId primero (para items duplicados), luego por id como fallback
        const item = window.cartManager.cart.find(item => {
            // Si itemId empieza con "cart-item-", es un cartItemId
            if (itemId && itemId.toString().startsWith('cart-item-')) {
                return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
            }
            // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
            return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
                   (String(item.id) === String(itemId) || item.id === itemId);
        });
        
        if (!item || item.type !== 'product') {
            console.error('Item no encontrado o no es un producto');
            return;
        }
        
        // Cargar variantes_referencias si no están en el item
        if (!item.variantes_referencias || item.variantes_referencias.length === 0) {
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB && productFromDB.variantes_referencias && productFromDB.variantes_referencias.length > 0) {
                item.variantes_referencias = productFromDB.variantes_referencias;
            } else {
                console.warn('No se encontraron variantes de referencias para el producto');
                return;
            }
        }
        
        // Actualizar selectedReferenceVariant
        if (variantIndex === '' || variantIndex === null || variantIndex === undefined) {
            item.selectedReferenceVariant = null;
        } else {
            const index = parseInt(variantIndex);
            if (index >= 0 && index < item.variantes_referencias.length) {
                item.selectedReferenceVariant = index;
                console.log('✅ Color seleccionado guardado:', {
                    itemId: item.id,
                    itemName: item.name,
                    selectedIndex: index,
                    color: item.variantes_referencias[index]?.color
                });
            } else {
                console.error('Índice de variante de referencia inválido:', index);
                return;
            }
        }
        
        // Guardar carrito
        window.cartManager.saveCart();
        
        // Verificar que se guardó correctamente
        const savedCart = window.cartManager.loadCart();
        const savedItem = savedCart.find(cartItem => 
            (cartItem.cartItemId && cartItem.cartItemId === item.cartItemId) ||
            (String(cartItem.id) === String(item.id) && cartItem.id === item.id)
        );
        if (savedItem) {
            console.log('✅ Verificación: Color guardado en localStorage:', {
                selectedReferenceVariant: savedItem.selectedReferenceVariant
            });
        }
        
        // Re-renderizar el carrito para mostrar el cambio
        window.cartManager.renderCart();
        window.cartManager.updateSummary();
        
    } catch (error) {
        console.error('Error al cambiar variante de referencia:', error);
    }
}

window.changeReferenceVariant = changeReferenceVariant;

function openAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Funciones para pedidos especiales
function openAddSpecialOrderModal() {
    const modal = document.getElementById('addSpecialOrderModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Limpiar formulario
    const form = document.getElementById('addSpecialOrderForm');
    if (form) {
        form.reset();
        const quantityInput = document.getElementById('specialOrderQuantityInput');
        if (quantityInput) {
            quantityInput.value = 1;
        }
    }
}

function closeAddSpecialOrderModal() {
    const modal = document.getElementById('addSpecialOrderModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function addSpecialOrderToCart() {
    const nameInput = document.getElementById('specialOrderNameInput');
    const quantityInput = document.getElementById('specialOrderQuantityInput');
    const notesInput = document.getElementById('specialOrderNotesInput');
    
    if (!nameInput || !quantityInput) return;
    
    const name = nameInput.value.trim();
    const quantity = parseInt(quantityInput.value || 1);
    const notes = notesInput ? notesInput.value.trim() : '';
    
    if (!name) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'Por favor ingresa una descripción del producto' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'Por favor insira uma descrição do produto' :
            'Please enter a product description';
        window.cartManager?.showNotification(message, 'error');
        return;
    }
    
    if (quantity < 1 || quantity > 50000) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'La cantidad debe estar entre 1 y 50000' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'A quantidade deve estar entre 1 e 50000' :
            'Quantity must be between 1 and 50000';
        window.cartManager?.showNotification(message, 'error');
        return;
    }
    
    // Crear producto especial
    const specialProduct = {
        id: `special_${Date.now()}`,
        type: 'special',
        name: name,
        categoria: 'pedido-especial',
        precio: 0, // Precio a consultar
        image: null,
        quantity: quantity,
        notes: notes,
        specs: notes || 'Pedido especial'
    };
    
    // Agregar al carrito
    if (window.cartManager) {
        window.cartManager.cart.push(specialProduct);
        window.cartManager.saveCart();
        window.cartManager.renderCart();
        window.cartManager.updateSummary();
        
        const message = window.cartManager.currentLanguage === 'es' ? 
            'Pedido especial agregado al presupuesto' : 
            window.cartManager.currentLanguage === 'pt' ?
            'Pedido especial adicionado ao orçamento' :
            'Special order added to budget';
        window.cartManager.showNotification(message, 'success');
    } else {
        // Si no hay cartManager, agregar directamente al localStorage
        const cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        cart.push(specialProduct);
        localStorage.setItem('eppo_cart', JSON.stringify(cart));
        location.reload();
    }
    
    // Cerrar modal
    closeAddSpecialOrderModal();
}

// Asegurar que las funciones sean globales
window.openAddSpecialOrderModal = openAddSpecialOrderModal;
window.closeAddSpecialOrderModal = closeAddSpecialOrderModal;
window.addSpecialOrderToCart = addSpecialOrderToCart;

function clearCart() {
    if (window.cartManager) {
        window.cartManager.clearCart();
    }
}

function sendOrder() {
    if (window.cartManager) {
        window.cartManager.sendOrder();
    }
}

// Funciones duplicadas eliminadas - solo usar las funciones "simple"

// FUNCIONES SIMPLES PARA LOS BOTONES DEL CARRITO
// IMPORTANTE: Todas las modificaciones de cantidad deben pasar por simpleSetQuantity
// para asegurar que se normalice correctamente según boxSize
function simpleIncrease(itemId) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    // Buscar el item por cartItemId primero (para items duplicados), luego por id como fallback
    const item = window.cartManager.cart.find(item => {
        // Si itemId empieza con "cart-item-", es un cartItemId
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (!item) {
        console.error('Item no encontrado con ID:', itemId);
        return;
    }
    
    // Si el producto tiene box_size, aumentar en múltiplos de box_size
    if (item.type === 'product') {
        // Asegurar que box_size esté cargado si no está en el item
        if (!item.box_size) {
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB && productFromDB.box_size) {
                item.box_size = productFromDB.box_size;
            }
        }
        
        if (item.box_size) {
            // FORZAR A NÚMERO: asegurar que box_size y quantity sean números
            const boxSize = Number(item.box_size);
            const currentQuantity = Number(item.quantity || boxSize);
            const newQuantity = currentQuantity + boxSize;
            
            console.log(`➕ Aumentando cantidad: itemId=${itemId}, currentQuantity=${currentQuantity}, boxSize=${boxSize}, newQuantity=${newQuantity}`);
            console.log(`📦 Item encontrado:`, item);
            window.simpleSetQuantity(itemId, newQuantity);
            return;
        }
    }
    
    // Si no tiene box_size, aumentar de 1 en 1
    const currentQuantity = Number(item.quantity || 1);
    const newQuantity = currentQuantity + 1;
    simpleSetQuantity(itemId, newQuantity);
}

function simpleDecrease(itemId) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    // Buscar el item por cartItemId primero (para items duplicados), luego por id como fallback
    const item = window.cartManager.cart.find(item => {
        // Si itemId empieza con "cart-item-", es un cartItemId
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (!item) {
        console.error('Item no encontrado con ID:', itemId);
        return;
    }
    
    // Si el producto tiene box_size, disminuir en múltiplos de box_size
    if (item.type === 'product') {
        // Asegurar que box_size esté cargado si no está en el item
        if (!item.box_size) {
            const productFromDB = window.cartManager.allProducts.find(p => {
                return String(p.id) === String(item.id) || p.id === item.id;
            });
            if (productFromDB && productFromDB.box_size) {
                item.box_size = productFromDB.box_size;
            }
        }
        
        if (item.box_size) {
            // FORZAR A NÚMERO: asegurar que box_size y quantity sean números
            const boxSize = Number(item.box_size);
            const currentQuantity = Number(item.quantity || boxSize);
            const newQuantity = Math.max(boxSize, currentQuantity - boxSize);
            
            console.log(`➖ Disminuyendo cantidad: itemId=${itemId}, currentQuantity=${currentQuantity}, boxSize=${boxSize}, newQuantity=${newQuantity}`);
            console.log(`📦 Item encontrado:`, item);
            window.simpleSetQuantity(itemId, newQuantity);
            return;
        }
    }
    
    // Si no tiene box_size, disminuir de 1 en 1
    const currentQuantity = Number(item.quantity || 1);
    if (currentQuantity > 1) {
        const newQuantity = currentQuantity - 1;
        simpleSetQuantity(itemId, newQuantity);
    }
}

// Exportar funciones globalmente
window.simpleIncrease = simpleIncrease;
window.simpleDecrease = simpleDecrease;

function simpleSetQuantity(itemId, quantity) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    try {
        // Buscar el item por cartItemId primero (para items duplicados), luego por id como fallback
        const item = window.cartManager.cart.find(item => {
            // Si itemId empieza con "cart-item-", es un cartItemId
            if (itemId && itemId.toString().startsWith('cart-item-')) {
                return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
            }
            // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
            return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
                   (String(item.id) === String(itemId) || item.id === itemId);
        });
        
        if (!item) {
            console.error('Item no encontrado con ID:', itemId, 'Carrito:', window.cartManager.cart);
            return;
        }
        
        console.log(`🔧 simpleSetQuantity: itemId=${itemId}, quantity=${quantity}, item.quantity actual=${item.quantity}`);
        
        // Convertir el valor a número (manejar comas y puntos decimales)
        const rawValue = String(quantity).replace(",", ".");
        let requestedQuantity = parseFloat(rawValue) || 1;
        if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
            requestedQuantity = 1;
        }
        if (requestedQuantity > 50000) {
            requestedQuantity = 50000;
        }
        
        // Normalizar cantidad según boxSize si es un producto
        let newQuantity = requestedQuantity;
        if (item.type === 'product') {
            // Asegurar que box_size esté cargado
            if (!item.box_size) {
                const productFromDB = window.cartManager.allProducts.find(p => {
                    return String(p.id) === String(item.id) || p.id === item.id;
                });
                if (productFromDB && productFromDB.box_size) {
                    item.box_size = productFromDB.box_size;
                    console.log(`📦 box_size cargado desde BD para producto ${item.id}: ${item.box_size}`);
                } else {
                    console.log(`⚠️ No se encontró box_size para producto ${item.id} en allProducts`);
                }
            }
            
            // Crear objeto producto para normalización con la propiedad correcta (boxSize en camelCase)
            const productForNormalization = {
                id: item.id,
                boxSize: item.box_size ? Number(item.box_size) : null
            };
            
            console.log(`🔍 Normalizando cantidad: requestedQuantity=${requestedQuantity}, boxSize=${productForNormalization.boxSize}`);
            
            // Normalizar la cantidad (siempre múltiplo superior de boxSize)
            // PERO: si la cantidad solicitada ya es un múltiplo exacto de boxSize, no ajustar
            const boxSizeNum = Number(item.box_size);
            const requestedQtyNum = Number(requestedQuantity);
            
            // Verificar si ya es un múltiplo exacto
            if (requestedQtyNum > 0 && requestedQtyNum % boxSizeNum === 0) {
                // Ya es un múltiplo exacto, usar directamente
                newQuantity = requestedQtyNum;
                console.log(`✅ Cantidad ya es múltiplo de boxSize, usando directamente: ${newQuantity}`);
            } else {
                // Normalizar la cantidad (siempre múltiplo superior de boxSize)
                newQuantity = window.cartManager.normalizeQuantityForBox(productForNormalization, requestedQuantity);
                console.log(`✅ Cantidad normalizada: ${requestedQuantity} → ${newQuantity}`);
            }
            
            // Si la cantidad fue ajustada, mostrar aviso (solo si realmente cambió)
            if (newQuantity !== requestedQuantity && item.box_size) {
                const lang = window.cartManager?.currentLanguage || 'es';
                const message = lang === 'es' ? 
                    `Este producto solo se vende en cajas de ${item.box_size} unidades. La cantidad se ha ajustado a ${newQuantity}.` :
                    lang === 'pt' ?
                    `Este produto só é vendido em caixas de ${item.box_size} unidades. A quantidade foi ajustada para ${newQuantity}.` :
                    `This product is only sold in boxes of ${item.box_size} units. The quantity has been adjusted to ${newQuantity}.`;
                window.cartManager.showNotification(message, 'info');
            }
        }
        
        // ACTUALIZAR EL ESTADO: establecer cantidad normalizada en el item
        // Esto es crítico - el input es controlado y usa item.quantity como value
        item.quantity = newQuantity;
        
        // Debug: verificar que se actualizó correctamente
        console.log(`✅ Cantidad actualizada en item: ${requestedQuantity} → ${newQuantity} (item.quantity ahora es: ${item.quantity})`);
        
        // ACTUALIZAR EL INPUT INMEDIATAMENTE antes de cualquier otra operación
        // Esto asegura que el usuario vea la cantidad normalizada de inmediato
        // Usar itemId (que es cartItemId) para encontrar el elemento correcto
        const allCartItemsBefore = document.querySelectorAll('.cart-item');
        for (const cartItemElement of allCartItemsBefore) {
            const dataItemId = cartItemElement.getAttribute('data-item-id');
            // Comparar con el itemId pasado (que es cartItemId) en lugar de item.id
            if (String(dataItemId) === String(itemId) || dataItemId === itemId) {
                const quantityInput = cartItemElement.querySelector('.quantity-input');
                if (quantityInput) {
                    // Actualizar el input inmediatamente con item.quantity (cantidad normalizada)
                    quantityInput.value = item.quantity;
                    console.log(`✅ Input actualizado inmediatamente: ${quantityInput.value}`);
                }
                
                // Actualizar también el atributo data-quantity en el elemento de plazo de entrega
                const deliveryElement = cartItemElement.querySelector('.delivery-time[data-phc-ref]');
                if (deliveryElement) {
                    deliveryElement.setAttribute('data-quantity', item.quantity);
                }
                
                break;
            }
        }
        
        // Si es un producto, actualizar el precio según escalones
        if (item.type === 'product') {
            // Si no tiene price_tiers, intentar obtenerlos de la BD primero
            if (!item.price_tiers || item.price_tiers.length === 0) {
                const productFromDB = window.cartManager.allProducts.find(p => {
                    return String(p.id) === String(item.id) || p.id === item.id;
                });
                if (productFromDB && productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
                    item.price_tiers = productFromDB.price_tiers;
                    if (!item.basePrice) {
                        item.basePrice = productFromDB.precio || item.price || 0;
                    }
                }
            }
            
            // Determinar qué price_tiers usar: variante seleccionada o base
            let priceTiersToUse = item.price_tiers || [];
            
            // Si hay una variante seleccionada, usar sus price_tiers
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                const selectedVariant = item.variants[item.selectedVariant];
                if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                    priceTiersToUse = selectedVariant.price_tiers;
                }
            }
            
            // SIEMPRE recalcular precio según escalones (igual que en el buscador)
            if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
                const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
                const priceResult = window.cartManager.getPriceForQuantity(priceTiersToUse, newQuantity, basePriceForCalc);
                item.price = priceResult.price;
                item.minQuantity = priceResult.minQuantity;
                item.isValidQuantity = priceResult.isValid;
            } else if (item.basePrice !== undefined && item.basePrice !== null) {
                // Si no hay escalones, usar precio base
                item.price = item.basePrice;
                item.minQuantity = null;
                item.isValidQuantity = true;
            }
        }
        
        // Guardar el carrito con la cantidad normalizada
        window.cartManager.saveCart();
        
        // REFRESCAR EL INPUT: Re-renderizar el carrito para que el input muestre la cantidad normalizada
        // El input es controlado (usa item.quantity como value), así que al re-renderizar mostrará item.quantity
        // IMPORTANTE: renderCart() usa item.quantity como value del input, así que mostrará la cantidad normalizada
        // skipStockUpdate=true para evitar que se actualicen todos los plazos ahora
        // Los actualizaremos después de manera selectiva
        window.cartManager.renderCart(true);
        window.cartManager.updateSummary();
        
        // Actualizar mensajes de stock después de cambiar la cantidad
        // Primero actualizar el item específico que cambió
        // Luego actualizar todos los demás para asegurar que mantengan su cálculo de stock
        setTimeout(() => {
            // Actualizar el producto que cambió
            window.cartManager.updateDeliveryTimesFromStock(itemId).then(() => {
                // Después de actualizar el producto que cambió, actualizar todos los demás
                // Esto es necesario porque renderCart() recrea el HTML con el plazo base
                // Actualizar todos los productos EXCEPTO el que acabamos de actualizar
                const allDeliveryElements = document.querySelectorAll('.delivery-time[data-phc-ref]');
                const updatePromises = [];
                for (const element of allDeliveryElements) {
                    const elementItemId = element.getAttribute('data-item-id');
                    // Solo actualizar si NO es el producto que acabamos de actualizar
                    if (String(elementItemId) !== String(itemId) && elementItemId !== itemId) {
                        updatePromises.push(window.cartManager.updateDeliveryTimesFromStock(elementItemId));
                    }
                }
                // Ejecutar todas las actualizaciones en paralelo
                Promise.all(updatePromises).catch(err => {
                    console.error('Error actualizando plazos de entrega:', err);
                });
            }).catch(err => {
                console.error('Error actualizando plazo de entrega del producto modificado:', err);
            });
        }, 100);
        
        // FORZAR ACTUALIZACIÓN DEL INPUT después del render para asegurar que se actualice
        // Esto es crítico: el input DEBE mostrar item.quantity (cantidad normalizada), nunca el valor crudo
        // Usar múltiples intentos para asegurar que se actualice incluso si hay problemas de timing
        const forceInputUpdate = () => {
            const allCartItemsAfter = document.querySelectorAll('.cart-item');
            for (const cartItemElement of allCartItemsAfter) {
                const dataItemId = cartItemElement.getAttribute('data-item-id');
                // Comparar con el itemId pasado (que es cartItemId) en lugar de item.id
                if (String(dataItemId) === String(itemId) || dataItemId === itemId) {
                    // Buscar el input (puede ser readonly si tiene box_size o editable si no)
                    const inputAfter = cartItemElement.querySelector('.quantity-input');
                    if (inputAfter) {
                        // SIEMPRE usar item.quantity como fuente de verdad (ya está normalizado)
                        const normalizedValue = item.quantity;
                        const currentValue = parseInt(inputAfter.value) || 0;
                        // Si el valor del input no coincide con item.quantity, forzar actualización
                        if (currentValue !== normalizedValue) {
                            inputAfter.value = normalizedValue;
                            console.log(`✅ Input actualizado después del render: ${currentValue} → ${normalizedValue}`);
                        }
                    }
                    
                    // Actualizar también el atributo data-quantity en el elemento de plazo de entrega
                    const deliveryElementAfter = cartItemElement.querySelector('.delivery-time[data-phc-ref]');
                    if (deliveryElementAfter) {
                        deliveryElementAfter.setAttribute('data-quantity', item.quantity);
                    }
                    
                    return true;
                }
            }
            return false;
        };
        
        // Intentar actualizar inmediatamente
        forceInputUpdate();
        
        // También intentar después de un pequeño delay por si acaso el render no ha terminado
        setTimeout(() => {
            forceInputUpdate();
        }, 10);
        
        // Y una vez más después de un delay mayor para asegurar
        setTimeout(() => {
            forceInputUpdate();
        }, 100);
        
    } catch (error) {
        console.error('❌ Error en simpleSetQuantity:', error);
    }
}

// Exportar función globalmente
window.simpleSetQuantity = simpleSetQuantity;

/**
 * Aplicar sugerencia de upsell: establecer la cantidad al valor sugerido
 */
function applyUpsellSuggestion(itemId, suggestedQuantity) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    // Usar simpleSetQuantity para establecer la cantidad sugerida
    // Esto recalculará automáticamente el precio y mostrará/ocultará la sugerencia
    simpleSetQuantity(itemId, suggestedQuantity);
}

// Exportar función globalmente
window.applyUpsellSuggestion = applyUpsellSuggestion;

function simpleRemove(itemId) {
    if (!window.cartManager) {
        console.error('cartManager no disponible');
        return;
    }
    
    try {
        // Usar el método removeItem del cartManager que ahora busca por cartItemId
        window.cartManager.removeItem(itemId);
        
    } catch (error) {
        console.error('❌ Error en simpleRemove:', error);
    }
}

window.simpleRemove = simpleRemove;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.cartManager = new CartManager();
});

// Función para agregar producto desde otras páginas
window.addToCart = function(product, quantity = 1) {
    if (window.cartManager) {
        // Usar el método addProduct del cartManager que ya normaliza correctamente
        // Ahora siempre crea un nuevo item (permite duplicados)
        window.cartManager.addProduct(product, quantity);
    } else {
        // Si no estamos en la página del carrito, normalizar manualmente
        const cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');

        // Normalizar cantidad según boxSize si existe
        let normalizedQuantity = Number(quantity) || 1;
        if (product.box_size) {
            const boxSize = Number(product.box_size);
            if (boxSize > 0) {
                // Normalizar al múltiplo superior más cercano
                normalizedQuantity = Math.ceil(normalizedQuantity / boxSize) * boxSize;
                // Si la cantidad fue ajustada, podría mostrar un aviso (opcional)
            }
        }

        // Obtener idioma actual
        const currentLang = localStorage.getItem('language') || 'pt';
        const description = currentLang === 'es' ? 
            (product.descripcionEs || product.descripcion_es || '') :
            (product.descripcionPt || product.descripcion_pt || product.descripcionEs || product.descripcion_es || '');

        // Obtener price_tiers
        const priceTiers = product.price_tiers || [];
        const initialPrice = priceTiers.length > 0 ? 
            (window.cartManager ? window.cartManager.getPriceForQuantity(priceTiers, normalizedQuantity, product.precio).price : product.precio) :
            product.precio;

        // Siempre crear un nuevo item (permitir duplicados)
        // Generar un ID único para este item del carrito
        const cartItemId = `cart-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
            cart.push({
                id: product.id,
            cartItemId: cartItemId, // ID único para identificar este item específico en el carrito
                type: 'product',
                name: product.nombre,
                category: product.categoria,
                price: initialPrice,
                basePrice: product.precio,
                image: product.foto,
                quantity: normalizedQuantity, // Usar cantidad normalizada
                specs: getProductSpecs(product),
                descripcionEs: product.descripcionEs || product.descripcion_es || '',
                descripcionPt: product.descripcionPt || product.descripcion_pt || '',
                description: description,
                referencia: product.id ? String(product.id) : '',
                plazoEntrega: product.plazoEntrega || product.plazo_entrega || '',
                price_tiers: priceTiers,
                box_size: product.box_size || null, // Guardar box_size
                phc_ref: product.phc_ref || null, // Guardar phc_ref
                observations: ''
            });

        localStorage.setItem('eppo_cart', JSON.stringify(cart));
        
        // Mostrar notificación
        showQuickNotification('Producto agregado al carrito');
    }
};

// Función para obtener especificaciones del producto (versión global)
function getProductSpecs(product) {
    const specs = [];
    
    if (product.potencia) specs.push(`${product.potencia}W`);
    if (product.color) {
        const colorName = window.translationSystem ? 
            window.translationSystem.translateColor(product.color) : 
            product.color;
        specs.push(colorName);
    }
    if (product.tipo) {
        const typeName = window.translationSystem ? 
            window.translationSystem.translateType(product.tipo) : 
            product.tipo;
        specs.push(typeName);
    }

    return specs.join(' • ');
}

/**
 * Mostrar banner de advertencia para precios personalizados (similar al banner de oferta especial)
 */
function showPersonalizedPriceWarningBanner(itemId) {
    if (!window.cartManager) return;
    
    const lang = window.cartManager.currentLanguage || 'es';
    
    const messages = {
        es: {
            title: 'Precio sujeto a confirmación',
            message: 'El precio mostrado está sujeto a confirmación después de la recepción del logo.'
        },
        pt: {
            title: 'Preço sujeito a confirmação',
            message: 'O preço mostrado está sujeito a confirmação após a recepção do logotipo.'
        },
        en: {
            title: 'Price subject to confirmation',
            message: 'The displayed price is subject to confirmation after receiving the logo.'
        }
    };
    
    const t = messages[lang] || messages.es;
    
    // Buscar el elemento del carrito
    const cartItemElement = document.querySelector(`.cart-item[data-item-id="${itemId}"]`);
    if (!cartItemElement) {
        // Intentar buscar por cartItemId si itemId empieza con "cart-item-"
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            const allCartItems = document.querySelectorAll('.cart-item');
            for (const item of allCartItems) {
                const itemIdAttr = item.getAttribute('data-item-id');
                if (itemIdAttr === itemId) {
                    cartItemElement = item;
                    break;
                }
            }
        }
    }
    
    if (!cartItemElement) {
        console.warn('No se encontró el elemento del carrito para mostrar el banner');
        return;
    }
    
    // Verificar si ya existe un banner de advertencia
    let warningBanner = cartItemElement.querySelector('.personalized-price-warning-banner');
    
    const bannerHTML = `
        <div class="personalized-price-warning-banner" style="grid-column: 1 / -1; margin-top: 10px; padding: 12px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <i class="fas fa-exclamation-triangle" style="color: #f59e0b; font-size: 1.1rem;"></i>
                        <strong style="color: #92400e; font-size: 0.9rem;">${t.title}</strong>
                    </div>
                    <p style="margin: 0; color: #78350f; font-size: 0.875rem; line-height: 1.5;">${t.message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="padding: 8px 12px; background: #f59e0b; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.875rem; cursor: pointer; white-space: nowrap; transition: background 0.2s;"
                        onmouseover="this.style.background='#d97706'" 
                        onmouseout="this.style.background='#f59e0b'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    if (warningBanner) {
        // Actualizar banner existente
        warningBanner.outerHTML = bannerHTML;
    } else {
        // Insertar después del selector de variantes o antes del contenedor de observaciones
        const variantSelector = cartItemElement.querySelector('.cart-item-variant-selector');
        const observationsContainer = cartItemElement.querySelector('.cart-item-observations-container');
        const existingUpsell = cartItemElement.querySelector('.upsell-suggestion');
        
        if (variantSelector) {
            variantSelector.insertAdjacentHTML('afterend', bannerHTML);
        } else if (observationsContainer) {
            observationsContainer.insertAdjacentHTML('beforebegin', bannerHTML);
        } else if (existingUpsell) {
            existingUpsell.insertAdjacentHTML('afterend', bannerHTML);
        } else {
            // Si no hay ninguno, insertar al final del cart-item
            const actionsElement = cartItemElement.querySelector('.cart-item-actions');
            if (actionsElement) {
                actionsElement.parentElement.insertAdjacentHTML('afterend', bannerHTML);
            }
        }
    }
}

/**
 * Función antigua de popup (mantenida por compatibilidad, pero ya no se usa)
 */
function showPersonalizedPriceWarning() {
    const lang = window.cartManager?.currentLanguage || 'es';
    
    const messages = {
        es: {
            title: 'Precio sujeto a confirmación',
            message: 'El precio mostrado está sujeto a confirmación después de la recepción del logo, ya que el precio puede alterarse si el logo es muy complejo.',
            button: 'Entendido'
        },
        pt: {
            title: 'Preço sujeito a confirmação',
            message: 'O preço mostrado está sujeito a confirmação após a recepção do logotipo, pois o preço pode alterar-se se o logotipo for muito complexo.',
            button: 'Entendido'
        },
        en: {
            title: 'Price subject to confirmation',
            message: 'The displayed price is subject to confirmation after receiving the logo, as the price may change if the logo is very complex.',
            button: 'Understood'
        }
    };
    
    const t = messages[lang] || messages.es;
    
    // Crear el popup
    const popup = document.createElement('div');
    popup.className = 'personalized-price-warning-popup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        padding: 24px;
        max-width: 420px;
        width: 90%;
        z-index: 10000;
        opacity: 0;
        transition: all 0.3s ease;
        border: 2px solid #f59e0b;
    `;
    
    popup.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
            <div style="
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #fef3c7;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            ">
                <i class="fas fa-exclamation-triangle" style="color: #f59e0b; font-size: 20px;"></i>
            </div>
            <div style="flex: 1;">
                <h3 style="
                    margin: 0 0 8px 0;
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: #1f2937;
                ">${t.title}</h3>
                <p style="
                    margin: 0;
                    font-size: 0.875rem;
                    color: #4b5563;
                    line-height: 1.5;
                ">${t.message}</p>
            </div>
        </div>
        <button class="warning-popup-button" style="
            width: 100%;
            padding: 10px 20px;
            background: #f59e0b;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
        ">${t.button}</button>
    `;
    
    // Agregar al body
    document.body.appendChild(popup);
    
    // Overlay oscuro
    const overlay = document.createElement('div');
    overlay.className = 'personalized-price-warning-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    document.body.insertBefore(overlay, popup);
    
    // Animar entrada
    setTimeout(() => {
        overlay.style.opacity = '1';
        popup.style.opacity = '1';
        popup.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 10);
    
    // Función para cerrar
    const closePopup = () => {
        overlay.style.opacity = '0';
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
        }, 300);
    };
    
    // Event listeners
    const button = popup.querySelector('.warning-popup-button');
    button.addEventListener('click', closePopup);
    button.addEventListener('mouseenter', function() {
        this.style.background = '#d97706';
    });
    button.addEventListener('mouseleave', function() {
        this.style.background = '#f59e0b';
    });
    
    overlay.addEventListener('click', closePopup);
    
    // Cerrar con ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closePopup();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Función para mostrar notificación rápida
function showQuickNotification(message) {
    // Calcular posición top basada en notificaciones existentes
    const existingNotifications = document.querySelectorAll('.notification-stack');
    let topOffset = 20;
    existingNotifications.forEach(notif => {
        topOffset += notif.offsetHeight + 10;
    });

    const notification = document.createElement('div');
    notification.className = 'notification-stack';
    notification.style.cssText = `
        position: fixed;
        top: ${topOffset}px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        font-weight: 500;
        transform: translateX(100%);
        transition: transform 0.3s ease, top 0.3s ease;
        max-width: 350px;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
                repositionNotificationsGlobal();
            }
        }, 300);
    }, 3000);
}

// Función global para reposicionar notificaciones
function repositionNotificationsGlobal() {
    const notifications = document.querySelectorAll('.notification-stack');
    let topOffset = 20;
    notifications.forEach(notif => {
        notif.style.top = `${topOffset}px`;
        topOffset += notif.offsetHeight + 10;
    });
}

/**
 * Generar PDF de la propuesta en formato tabla
 */
// Función para abrir el modal de selección de idioma

/**
 * Generar PDF desde una propuesta guardada en Supabase
 */
async function generateProposalPDFFromSavedProposal(proposalId, language = 'pt') {
    if (!window.cartManager || !window.cartManager.supabase) {
        // No disponible
        return;
    }

    try {
        // Cargar la propuesta completa desde Supabase
        const { data: proposal, error: proposalError } = await window.cartManager.supabase
            .from('presupuestos')
            .select('*')
            .eq('id', proposalId)
            .single();

        if (proposalError || !proposal) {
            throw new Error('No se pudo cargar la propuesta desde Supabase');
        }

        // Cargar los artículos de la propuesta
        // Ordenar por created_at para mantener el orden de inserción original, incluso con productos duplicados
        const { data: articulos, error: articulosError } = await window.cartManager.supabase
            .from('presupuestos_articulos')
            .select('*')
            .eq('presupuesto_id', proposalId)
            .order('created_at', { ascending: true });

        if (articulosError) {
            throw new Error('No se pudieron cargar los artículos desde Supabase');
        }

        // Convertir artículos a formato de carrito
        const cartItems = [];
        for (const articulo of articulos || []) {
            // Buscar el producto en allProducts si existe
            const product = window.cartManager.allProducts.find(p => 
                String(p.id) === String(articulo.referencia_articulo)
            );

            if (product) {
                // Obtener variante de referencia (color) seleccionada
                const selectedReferenceVariant = (articulo.variante_referencia !== null && articulo.variante_referencia !== undefined) 
                    ? parseInt(articulo.variante_referencia) 
                    : null;

                // Obtener variantes_referencias del producto
                let variantesReferencias = product.variantes_referencias || [];
                if (variantesReferencias && typeof variantesReferencias === 'string') {
                    try {
                        variantesReferencias = JSON.parse(variantesReferencias);
                    } catch (e) {
                        console.warn('Error parseando variantes_referencias:', e);
                        variantesReferencias = [];
                    }
                }

                cartItems.push({
                    id: product.id,
                    type: 'product',
                    name: articulo.nombre_articulo,
                    quantity: articulo.cantidad,
                    price: articulo.precio,
                    observations: articulo.observaciones || '',
                    referencia: articulo.referencia_articulo,
                    plazoEntrega: articulo.plazo_entrega || '',
                    image: product.foto || null,
                    descripcionEs: product.descripcionEs || '',
                    descripcionPt: product.descripcionPt || '',
                    price_tiers: product.price_tiers || [],
                    variants: product.variants || [],
                    selectedVariant: (() => {
                        // Buscar la variante correcta por su nombre (tipo_personalizacion)
                        if (articulo.tipo_personalizacion && 
                            articulo.tipo_personalizacion !== 'Sin personalización' && 
                            articulo.tipo_personalizacion !== 'Sem personalização' && 
                            articulo.tipo_personalizacion !== 'No customization' &&
                            product.variants && 
                            product.variants.length > 0) {
                            // Buscar el índice de la variante que coincida con el nombre guardado
                            const variantIndex = product.variants.findIndex(variant => 
                                variant.name === articulo.tipo_personalizacion ||
                                variant.nombre === articulo.tipo_personalizacion
                            );
                            // Si se encuentra, devolver el índice; si no, devolver null
                            return variantIndex >= 0 ? variantIndex : null;
                        }
                        return null;
                    })(),
                    selectedReferenceVariant: selectedReferenceVariant, // Color seleccionado
                    variantes_referencias: variantesReferencias, // Variantes de referencia del producto
                    logoUrl: articulo.logo_url || null
                });
            } else {
                // Si no se encuentra el producto, crear un item especial
                cartItems.push({
                    id: articulo.referencia_articulo || `special_${articulo.id}`,
                    type: 'special',
                    name: articulo.nombre_articulo,
                    quantity: articulo.cantidad,
                    price: articulo.precio,
                    observations: articulo.observaciones || '',
                    notes: articulo.observaciones || ''
                });
            }
        }

        // Guardar temporalmente los datos de la propuesta en editingProposalData
        const originalEditingData = window.cartManager.editingProposalData;
        window.cartManager.editingProposalData = {
            id: proposal.id,
            codigo_propuesta: proposal.codigo_propuesta,
            fecha_creacion: proposal.fecha_inicial,
            nombre_cliente: proposal.nombre_cliente,
            nombre_comercial: proposal.nombre_comercial,
            pais: proposal.pais
        };

        // Guardar temporalmente el carrito y reemplazarlo con los artículos de la propuesta
        const originalCart = window.cartManager.cart;
        window.cartManager.cart = cartItems;

        // Determinar el idioma basado en el país de la propuesta
        let pdfLanguage = 'pt'; // Por defecto portugués
        if (proposal.pais === 'España') {
            pdfLanguage = 'es';
        } else if (proposal.pais === 'Portugal') {
            pdfLanguage = 'pt';
        }

        // Generar el PDF con el idioma determinado por el país
        await generateProposalPDF(pdfLanguage, proposal);

        // Restaurar el carrito original
        window.cartManager.cart = originalCart;
        window.cartManager.editingProposalData = originalEditingData;

    } catch (error) {
        console.error('Error generando PDF desde propuesta guardada:', error);
        throw error;
    }
}

/**
 * Pre-procesar todos los logos PDF del carrito, convirtiéndolos a imágenes
 * Esta función se ejecuta ANTES de generar el PDF para optimizar el proceso
 * @param {Array} cartItems - Array de items del carrito
 * @returns {Promise<Object>} - Objeto con las imágenes convertidas indexadas por logoUrl
 */
async function preprocessPdfLogos(cartItems) {
    const pdfLogosMap = {}; // Mapa de URL original -> imagen convertida
    
    // Filtrar items que tienen logos PDF
    const itemsWithPdfLogos = cartItems.filter(item => {
        if (!item.logoUrl || !item.logoUrl.trim()) return false;
        const isPdf = item.logoUrl.toLowerCase().endsWith('.pdf') || 
                     item.logoUrl.toLowerCase().includes('.pdf');
        return isPdf;
    });
    
    if (itemsWithPdfLogos.length === 0) {
        console.log('ℹ️ No hay logos PDF para pre-procesar');
        return pdfLogosMap;
    }
    
    console.log(`🔄 Pre-procesando ${itemsWithPdfLogos.length} logo(s) PDF...`);
    
    // Procesar todos los PDFs en paralelo
    const conversionPromises = itemsWithPdfLogos.map(async (item) => {
        const pdfUrl = item.logoUrl.trim();
        
        // Evitar procesar el mismo PDF múltiples veces
        if (pdfLogosMap[pdfUrl]) {
            console.log('⏭️ Logo PDF ya procesado:', pdfUrl);
            return;
        }
        
        try {
            console.log(`📄 Convirtiendo logo PDF: ${pdfUrl}`);
            const imageData = await convertPdfToImage(pdfUrl);
            
            if (imageData && imageData.length > 0) {
                // Guardar con la URL exacta (sin espacios)
                pdfLogosMap[pdfUrl] = imageData;
                console.log(`✅ Logo PDF convertido exitosamente: ${pdfUrl} (${imageData.length} bytes)`);
            } else {
                console.warn(`⚠️ No se pudo convertir el logo PDF: ${pdfUrl} (imageData es null o vacío)`);
            }
        } catch (error) {
            console.error(`❌ Error procesando logo PDF ${pdfUrl}:`, error);
        }
    });
    
    // Esperar a que todos los PDFs se conviertan
    await Promise.all(conversionPromises);
    
    console.log(`✅ Pre-procesamiento completado. ${Object.keys(pdfLogosMap).length} logo(s) convertido(s)`);
    
    return pdfLogosMap;
}

/**
 * Convertir la primera página de un PDF a imagen (base64)
 * @param {string} pdfUrl - URL del PDF
 * @returns {Promise<string|null>} - Data URL de la imagen o null si falla
 */
async function convertPdfToImage(pdfUrl) {
    try {
        // Esperar a que PDF.js esté disponible (puede tardar en cargar)
        let pdfjs = null;
        let attempts = 0;
        const maxAttempts = 20; // Aumentar intentos
        
        while (!pdfjs && attempts < maxAttempts) {
            // Intentar diferentes formas de acceder a PDF.js
            pdfjs = window.pdfjsLibInstance || window.pdfjsLib || window.pdfjs || 
                   (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
            
            if (!pdfjs) {
                attempts++;
                if (attempts % 5 === 0) { // Log cada 5 intentos
                    console.log(`⏳ Esperando PDF.js... (intento ${attempts}/${maxAttempts})`);
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Esperar 100ms
            }
        }
        
        if (!pdfjs) {
            console.error('❌ PDF.js no está disponible después de esperar. Verifica que el script esté cargado correctamente.');
            console.error('Verificando disponibilidad:', {
                'window.pdfjsLibInstance': typeof window.pdfjsLibInstance,
                'window.pdfjsLib': typeof window.pdfjsLib,
                'window.pdfjs': typeof window.pdfjs,
                'window.pdfjsLibReady': window.pdfjsLibReady,
                'pdfjsLib': typeof pdfjsLib
            });
            return null;
        }
        
        console.log('✅ PDF.js encontrado y disponible');
        
        console.log('📄 Iniciando conversión de PDF a imagen:', pdfUrl);
        console.log('📦 PDF.js disponible:', {
            version: pdfjs.version || 'desconocida',
            hasGetDocument: typeof pdfjs.getDocument === 'function'
        });
        
        // Configurar worker de pdf.js
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            console.log('✅ Worker de PDF.js configurado');
        }
        
        // Cargar el PDF con opciones para manejar CORS
        const loadingTask = pdfjs.getDocument({
            url: pdfUrl,
            withCredentials: false,
            httpHeaders: {}
        });
        
        const pdf = await loadingTask.promise;
        console.log('✅ PDF cargado, número de páginas:', pdf.numPages);
        
        // Obtener la primera página
        const page = await pdf.getPage(1);
        
        // Configurar el viewport con una escala razonable (ajustada para logos pequeños)
        const scale = 1.5; // Escala más pequeña para logos
        const viewport = page.getViewport({ scale: scale });
        
        // Crear canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Renderizar la página en el canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        console.log('✅ PDF renderizado en canvas');
        
        // Convertir canvas a imagen base64
        const imageData = canvas.toDataURL('image/png');
        console.log('✅ PDF convertido a imagen, tamaño:', imageData.length, 'bytes');
        
        return imageData;
    } catch (error) {
        console.error('❌ Error convirtiendo PDF a imagen:', error);
        console.error('Detalles del error:', {
            message: error.message,
            stack: error.stack,
            pdfUrl: pdfUrl
        });
        return null;
    }
}

async function generateProposalPDF(selectedLanguage = null, proposalData = null) {
    // Si se proporciona proposalData, usar esos datos en lugar del carrito actual
    const useProposalData = proposalData !== null;
    
    if (!useProposalData && (!window.cartManager || window.cartManager.cart.length === 0)) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'El presupuesto está vacío' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'O orçamento está vazio' :
            'The budget is empty';
        window.cartManager?.showNotification(message, 'error');
        return;
    }

    // Asegurar que el carrito esté actualizado (recargar desde localStorage)
    // Esto garantiza que tengamos las observaciones más recientes y el color seleccionado
    const savedCart = useProposalData ? window.cartManager.cart : window.cartManager.loadCart();
    if (!useProposalData) {
    window.cartManager.cart = savedCart;
    }
    
    // PRE-PROCESAR LOGOS PDF: Convertir todos los PDFs a imágenes ANTES de generar el PDF
    console.log('🚀 Iniciando pre-procesamiento de logos PDF...');
    const pdfLogosMap = await preprocessPdfLogos(savedCart);
    console.log('✅ Pre-procesamiento de logos completado. Imágenes listas para usar en el PDF.');
    
    // Debug: verificar que las observaciones y colores estén presentes
    console.log('Carrito cargado para PDF:', savedCart.map(item => ({
        id: item.id,
        name: item.name,
        observations: item.observations,
        selectedReferenceVariant: item.selectedReferenceVariant,
        variantes_referencias: item.variantes_referencias ? item.variantes_referencias.length : 0
    })));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const logoHeight = 15; // Altura de los logotipos
    // startY se ajustará después de crear el encabezado
    let startY = logoHeight + 15;
    let currentY = startY;
    const baseRowHeight = 16; // Altura base de cada fila (reducida)
    const minRowHeight = 12; // Altura mínima (reducida)
    const imageSize = 25; // Tamaño de imagen en la tabla (reducido para más información)

    // Traducciones
    const translations = {
        pt: {
            proposal: 'Proposta',
            name: 'Nome',
            photo: 'Foto',
            description: 'Desc.',
            quantity: 'Qtd.',
            unitPrice: 'Preço',
            total: 'Total',
            deliveryTime: 'Prazo',
            personalizedPrice: 'Preço Personalizado',
            personalized: 'Personalizado',
            notes: 'Notas',
            totalProposal: 'Total da Proposta',
            specialOrder: 'Pedido Especial',
            date: 'Data'
        },
        es: {
            proposal: 'Propuesta',
            name: 'Nombre',
            photo: 'Foto',
            description: 'Desc.',
            quantity: 'Cant.',
            unitPrice: 'Precio',
            total: 'Total',
            deliveryTime: 'Plazo',
            personalizedPrice: 'Precio Personalizado',
            personalized: 'Personalizado',
            notes: 'Notas',
            totalProposal: 'Total de la Propuesta',
            specialOrder: 'Pedido Especial',
            date: 'Fecha',
            enStock: 'En stock',
            unidadesEnStock: 'unidades en stock',
            restantes: 'Restantes',
            plazoEntrega: 'plazo de entrega',
            sujetoConfirmacion: '(sujeto a confirmación en el momento de la adjudicación)'
        },
        pt: {
            proposal: 'Proposta',
            name: 'Nome',
            photo: 'Foto',
            description: 'Desc.',
            quantity: 'Qtd.',
            unitPrice: 'Preço',
            total: 'Total',
            deliveryTime: 'Entrega',
            personalizedPrice: 'Preço Personalizado',
            personalized: 'Personalizado',
            notes: 'Notas',
            totalProposal: 'Total da Proposta',
            specialOrder: 'Pedido Especial',
            date: 'Data',
            enStock: 'Em stock',
            unidadesEnStock: 'unidades em stock',
            restantes: 'Restantes',
            plazoEntrega: 'prazo de entrega',
            sujetoConfirmacion: '(sujeito a confirmação no momento da adjudicação)'
        },
        en: {
            proposal: 'Proposal',
            name: 'Name',
            photo: 'Photo',
            description: 'Description',
            quantity: 'Qty.',
            unitPrice: 'Price',
            total: 'Total',
            deliveryTime: 'Delivery',
            personalizedPrice: 'Personalized Price',
            personalized: 'Custom',
            notes: 'Notes',
            totalProposal: 'Proposal Total',
            specialOrder: 'Special Order',
            date: 'Date',
            enStock: 'In stock',
            unidadesEnStock: 'units in stock',
            restantes: 'Remaining',
            plazoEntrega: 'delivery time',
            sujetoConfirmacion: '(subject to confirmation at the time of award)'
        }
    };

    // Determinar el idioma: si hay proposalData con país, usar ese país para determinar el idioma
    // Si no, usar selectedLanguage o el idioma actual del carrito
    let lang = 'pt'; // Por defecto portugués
    
    if (proposalData && proposalData.pais) {
        // Si hay datos de propuesta con país, usar el país para determinar el idioma
        if (proposalData.pais === 'España') {
            lang = 'es';
        } else if (proposalData.pais === 'Portugal') {
            lang = 'pt';
        }
    } else if (selectedLanguage) {
        // Si se especificó un idioma directamente, usarlo
        lang = selectedLanguage;
    } else if (window.cartManager?.editingProposalData?.pais) {
        // Si estamos editando una propuesta, usar el país de la propuesta
        const pais = window.cartManager.editingProposalData.pais;
        if (pais === 'España') {
            lang = 'es';
        } else if (pais === 'Portugal') {
            lang = 'pt';
        }
    } else {
        // Por defecto, usar el idioma actual del carrito
        lang = window.cartManager?.currentLanguage || 'pt';
    }
    
    const t = translations[lang] || translations.pt;

    // Función para cargar logos desde Supabase y agregarlos al PDF
    async function loadAndAddLogosToPDF() {
        try {
            if (!window.cartManager || !window.cartManager.supabase) {
                // No disponible, saltando logos
                return;
            }

            // Cargar logos activos desde Supabase
            const { data: logos, error } = await window.cartManager.supabase
                .from('logos_propuesta')
                .select('tipo, url_imagen')
                .eq('activo', true);

            if (error) {
                // Error cargando logos
                return;
            }

            if (!logos || logos.length === 0) {
                // No se encontraron logos activos
                return;
            }

            const logoLeft = logos.find(l => l.tipo === 'izquierdo');
            const logoRight = logos.find(l => l.tipo === 'derecho');

            const logoTopY = 5; // Posición Y superior
            const logoHeight = 15; // Altura máxima de los logos

            // Función para agregar un logo al PDF
            const addLogoToPDF = (imageUrl, x, y, maxWidth, maxHeight) => {
                return new Promise((resolve) => {
                    if (!imageUrl) {
                        resolve();
                        return;
                    }

                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    img.onload = function() {
                        try {
                            // Crear canvas para convertir a base64
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);

                            // Convertir a base64
                            const imgData = canvas.toDataURL('image/png');

                            // Calcular dimensiones manteniendo proporción
                            let imgWidth = img.width;
                            let imgHeight = img.height;
                            const ratio = imgWidth / imgHeight;

                            // Convertir píxeles a milímetros (jsPDF usa mm)
                            const pxToMm = 0.264583;
                            imgWidth = imgWidth * pxToMm;
                            imgHeight = imgHeight * pxToMm;

                            // Ajustar a maxWidth y maxHeight manteniendo proporción
                            if (imgWidth > maxWidth) {
                                imgWidth = maxWidth;
                                imgHeight = imgWidth / ratio;
                            }
                            if (imgHeight > maxHeight) {
                                imgHeight = maxHeight;
                                imgWidth = imgHeight * ratio;
                            }

                            // Agregar imagen al PDF
                            doc.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
                            console.log('Logo agregado al PDF en posición x:', x, 'y:', y);
                            resolve();
                        } catch (error) {
                            console.error('Error agregando logo al PDF:', error);
                            resolve();
                        }
                    };

                    img.onerror = function() {
                        console.error('Error cargando logo desde:', imageUrl);
                        resolve();
                    };

                    img.src = imageUrl;
                });
            };

            // Cargar y agregar logos
            const promises = [];
            if (logoLeft && logoLeft.url_imagen) {
                promises.push(addLogoToPDF(logoLeft.url_imagen, margin, logoTopY, 50, logoHeight));
            }
            if (logoRight && logoRight.url_imagen) {
                promises.push(addLogoToPDF(logoRight.url_imagen, pageWidth - margin - 50, logoTopY, 50, logoHeight));
            }

            await Promise.all(promises);
            console.log('Logos cargados correctamente');
        } catch (error) {
            console.error('Error en loadAndAddLogosToPDF:', error);
        }
    }

    // Agregar logotipos en la parte superior
    // logoHeight ya está declarado arriba (línea 4157)
    await loadAndAddLogosToPDF();

    // Obtener información de la propuesta
    // Si se proporciona proposalData, usar esos datos; sino usar editingProposalData o valores por defecto
    const proposalCode = proposalData?.codigo_propuesta || window.cartManager?.editingProposalData?.codigo_propuesta || null;
    const proposalDate = proposalData?.fecha_inicial || proposalData?.fecha_creacion || window.cartManager?.editingProposalData?.fecha_creacion || new Date().toISOString();
    const commercialName = proposalData?.nombre_comercial || window.cartManager?.editingProposalData?.nombre_comercial || '';
    const clientName = proposalData?.nombre_cliente || window.cartManager?.editingProposalData?.nombre_cliente || '';
    
    // Formatear fecha según idioma
    const dateObj = new Date(proposalDate);
    const formattedDate = dateObj.toLocaleDateString(
        lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : 'en-US',
        { day: '2-digit', month: '2-digit', year: 'numeric' }
    );
    
    // Crear cuadro con información de la propuesta (todos los datos en una sola fila, con posibilidad de múltiples líneas)
    const titleY = 5 + logoHeight + 8; // Espacio después de los logotipos
    const boxPadding = 6;
    const boxWidth = pageWidth - (margin * 2); // Ancho completo de la página
    const baseBoxHeight = 12; // Altura base (una sola fila)
    const boxX = margin; // Posición X (izquierda)
    const boxY = titleY; // Posición Y
    const lineSpacing = 4; // Espacio entre líneas cuando hay texto dividido
    
    // Texto dentro del cuadro
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const itemSpacing = 25; // Espacio entre cada item (aumentado para mejor legibilidad)
    
    // Etiquetas según idioma
    const labels = {
        pt: {
            proposalNumber: 'Nº Proposta:',
            proposalDate: 'Data Proposta:',
            commercial: 'Comercial:',
            client: 'Cliente:'
        },
        es: {
            proposalNumber: 'Nº Propuesta:',
            proposalDate: 'Fecha Propuesta:',
            commercial: 'Comercial:',
            client: 'Cliente:'
        },
        en: {
            proposalNumber: 'Proposal Nº:',
            proposalDate: 'Proposal Date:',
            commercial: 'Commercial:',
            client: 'Client:'
        }
    };
    
    const l = labels[lang] || labels.pt;
    
    // Calcular el espacio disponible para cada item
    const totalItems = 4;
    const totalSpacing = itemSpacing * (totalItems - 1);
    // Calcular el ancho disponible para los items (todo el ancho menos padding y espaciado)
    const availableWidthForItems = boxWidth - (boxPadding * 2) - totalSpacing;
    const itemWidth = availableWidthForItems / totalItems; // Ancho de cada item distribuido equitativamente
    const maxValueWidth = itemWidth; // Usar el mismo ancho para los valores
    
    // Función para dividir texto en palabras y ajustar a múltiples líneas si es necesario
    function splitTextIntoLines(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const testWidth = doc.getTextWidth(testLine);
            
            if (testWidth <= maxWidth && currentLine) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                // Si una palabra sola es más ancha que maxWidth, dividirla por caracteres
                if (doc.getTextWidth(word) > maxWidth) {
                    let charLine = '';
                    for (let i = 0; i < word.length; i++) {
                        const testCharLine = charLine + word[i];
                        if (doc.getTextWidth(testCharLine) > maxWidth && charLine) {
                            lines.push(charLine);
                            charLine = word[i];
                        } else {
                            charLine = testCharLine;
                        }
                    }
                    currentLine = charLine;
                } else {
                    currentLine = word;
                }
            }
        });
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines.length > 0 ? lines : [text];
    }
    
    // Función para dibujar un item con label arriba y valor abajo (puede tener múltiples líneas)
    function drawItemWithMultiline(label, value, maxValueWidth, startX, labelY, valueY) {
        // Dibujar label arriba (centrado)
    doc.setFont('helvetica', 'bold');
        const labelWidth = doc.getTextWidth(label);
        doc.text(label, startX + (maxValueWidth / 2) - (labelWidth / 2), labelY);
    
        // Dibujar valor abajo
    doc.setFont('helvetica', 'normal');
        const valueText = value || '-';
        
        // Dividir el valor en líneas si es necesario
        const valueLines = splitTextIntoLines(valueText, maxValueWidth);
        
        // Dibujar cada línea del valor (centrado)
        valueLines.forEach((line, index) => {
            const lineWidth = doc.getTextWidth(line);
            doc.text(line, startX + (maxValueWidth / 2) - (lineWidth / 2), valueY + (index * lineSpacing));
        });
        
        // Retornar la altura total usada (número de líneas del valor)
        return valueLines.length;
    }
    
    // Calcular cuántas líneas necesita cada item ANTES de dibujar
    const proposalCodeText = proposalCode || '-';
    const commercialText = commercialName || '-';
    const clientText = clientName || '-';
    
    const proposalLines = splitTextIntoLines(proposalCodeText, maxValueWidth).length;
    const dateLines = splitTextIntoLines(formattedDate, maxValueWidth).length;
    const commercialLines = splitTextIntoLines(commercialText, maxValueWidth).length;
    const clientLines = splitTextIntoLines(clientText, maxValueWidth).length;
    
    // Calcular la altura máxima necesaria (1 línea para labels + líneas de valores)
    const maxLines = Math.max(proposalLines, dateLines, commercialLines, clientLines);
    const labelRowHeight = 5; // Altura para la fila de labels
    const boxHeight = labelRowHeight + baseBoxHeight + ((maxLines - 1) * lineSpacing);
    
    // Dibujar fondo del cuadro (blanco con borde negro) con altura ajustada
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(boxX, boxY, boxWidth, boxHeight, 'FD'); // FD = Fill and Draw
    
    // Calcular posiciones Y: labels arriba, valores abajo
    const labelY = boxY + boxPadding + 4; // Posición Y para los labels
    const valueY = labelY + labelRowHeight; // Posición Y para los valores (debajo de los labels)
    
    // Dibujar cada item
    let currentX = boxX + boxPadding;
    
    // Número de propuesta
    drawItemWithMultiline(l.proposalNumber, proposalCodeText, itemWidth, currentX, labelY, valueY);
    currentX += itemWidth + itemSpacing;
    
    // Fecha de propuesta
    drawItemWithMultiline(l.proposalDate, formattedDate, itemWidth, currentX, labelY, valueY);
    currentX += itemWidth + itemSpacing;
    
    // Comercial
    drawItemWithMultiline(l.commercial, commercialText, itemWidth, currentX, labelY, valueY);
    currentX += itemWidth + itemSpacing;
    
    // Cliente
    drawItemWithMultiline(l.client, clientText, itemWidth, currentX, labelY, valueY);
    
    // Línea decorativa debajo del cuadro (usar boxHeight calculado dinámicamente)
    const headerBottomY = boxY + boxHeight + 5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);
    
    // Ajustar startY para que la tabla comience después del encabezado
    startY = headerBottomY + 8;
    currentY = startY;

    // Procesar cada item del carrito
    // IMPORTANTE: Siempre recargar el carrito desde localStorage para tener los datos más recientes
    // Esto asegura que tengamos el selectedReferenceVariant actualizado
    const cartToProcess = useProposalData ? window.cartManager.cart : window.cartManager.loadCart();

    // Calcular ancho disponible (página menos márgenes)
    const availableWidth = pageWidth - (margin * 2);
    
    // Verificar si hay logos en los productos
    const hasLogos = cartToProcess.some(item => item.logoUrl && item.logoUrl.trim() !== '');
    
    // Definir anchos de columnas (ajustados para que quepan en la página)
    const colWidths = {
        name: 30,  // Nueva columna para el nombre del producto
        photo: 35,  // Reducida para dar espacio al nombre
        description: 50,  // Reducida
        quantity: 15,  // Para "Cant." o "Qtd."
        unitPrice: 16,  // Más pequeña (solo "Precio")
        total: 16,  // Más pequeña
        deliveryTime: 18,  // Más pequeña
        logo: hasLogos ? 20 : 0  // Columna de logo solo si hay logos
    };

    // Verificar que la suma de anchos no exceda el ancho disponible
    const totalWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
    if (totalWidth > availableWidth) {
        // Ajustar proporcionalmente
        const scale = availableWidth / totalWidth;
        Object.keys(colWidths).forEach(key => {
            colWidths[key] = Math.floor(colWidths[key] * scale);
        });
    }

    // Posiciones X de cada columna
    const colPositions = {
        name: margin,
        photo: margin + colWidths.name,
        description: margin + colWidths.name + colWidths.photo,
        quantity: margin + colWidths.name + colWidths.photo + colWidths.description,
        unitPrice: margin + colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity,
        total: margin + colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity + colWidths.unitPrice,
        deliveryTime: margin + colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity + colWidths.unitPrice + colWidths.total,
        logo: hasLogos ? margin + colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity + colWidths.unitPrice + colWidths.total + colWidths.deliveryTime : 0
    };

    // Función para dibujar una celda
    function drawCell(x, y, width, height, text, options = {}) {
        const { align = 'left', bold = false, fontSize = 8, border = true, maxLines = null, noWrap = false, textColor = null } = options;
        
        // Asegurar que los colores estén correctos antes de dibujar
        doc.setDrawColor(0, 0, 0); // Negro para bordes
        
        // Si se especifica un color de texto, usarlo; sino, usar negro por defecto
        if (textColor !== null) {
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        } else {
            doc.setTextColor(0, 0, 0); // Negro para texto por defecto
        }
        
        // Dibujar borde
        if (border) {
            doc.rect(x, y, width, height);
        }
        
        // Si no hay texto, solo dibujar el borde
        if (!text || text.trim() === '') {
            return;
        }
        
        const padding = 2;
        const availableWidth = width - (padding * 2);
        let textLines;
        let actualFontSize = fontSize;
        
        // Si noWrap es true (para números), no dividir el texto
        if (noWrap) {
            // Establecer el tamaño de fuente primero
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            
            // Verificar si el texto cabe en una línea
            let textWidth = doc.getTextWidth(text);
            if (textWidth > availableWidth) {
                // Si no cabe, reducir el tamaño de fuente hasta que quepa
                actualFontSize = fontSize;
                while (actualFontSize > 5 && textWidth > availableWidth) {
                    actualFontSize -= 0.5;
                    doc.setFontSize(actualFontSize);
                    textWidth = doc.getTextWidth(text);
                }
            }
            textLines = [text];
        } else {
            // Dividir texto en líneas que caben en el ancho de la celda
            textLines = doc.splitTextToSize(text, availableWidth);
        
        // Limitar número de líneas si se especifica
        if (maxLines && textLines.length > maxLines) {
            textLines = textLines.slice(0, maxLines);
            // Agregar "..." si se cortó
            const lastLine = textLines[textLines.length - 1];
            if (lastLine.length > 0) {
                textLines[textLines.length - 1] = lastLine.substring(0, lastLine.length - 3) + '...';
                }
            }
        }
        
        // Calcular altura de línea usando el tamaño de fuente actual
        const lineHeight = actualFontSize * 0.4;
        const totalTextHeight = textLines.length * lineHeight;
        const startY = y + (height - totalTextHeight) / 2 + lineHeight;
        
        // Dibujar texto (ya establecimos el tamaño de fuente arriba si es noWrap)
        if (!noWrap) {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        } else {
            // Asegurar que el tamaño de fuente esté establecido (ya lo hicimos arriba)
            doc.setFontSize(actualFontSize);
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
        }
        
        // Asegurar que el color de texto se mantenga antes de dibujar cada línea
        if (textColor !== null) {
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        }
        
        textLines.forEach((line, index) => {
            // Asegurar que el color se mantenga para cada línea
            if (textColor !== null) {
                doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            }
            
            let textX = x + padding;
            if (align === 'center') {
                textX = x + (width / 2);
                doc.text(line, textX, startY + (index * lineHeight), { align: 'center', maxWidth: availableWidth });
            } else if (align === 'right') {
                textX = x + width - padding;
                doc.text(line, textX, startY + (index * lineHeight), { align: 'right', maxWidth: availableWidth });
            } else {
                doc.text(line, textX, startY + (index * lineHeight), { maxWidth: availableWidth });
            }
        });
    }

    /**
     * Dibujar descripción con partes en negrita (variante y observaciones)
     */
    function drawDescriptionWithBoldParts(x, y, width, height, baseDescription, variantText, observations, notesLabel, selectedColorText = '') {
        // Obtener traducción de "Personalizado" según el idioma
        const personalizedLabel = lang === 'pt' ? 'Personalizado' : 
                                  lang === 'es' ? 'Personalizado' : 
                                  'Custom';
        
        // Dibujar borde
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, width, height);
        
        const padding = 2;
        const availableWidth = width - (padding * 2);
        const fontSize = 7;
        const lineHeight = fontSize * 0.5; // Espaciado razonable entre líneas
        
        // Construir el texto completo con marcadores para las partes en negrita
        let fullText = (baseDescription || '').trim();
        let parts = [];
        
        // Verificar si variantText contiene solo color (empieza con "Color:" o "Cor:")
        const isOnlyColor = variantText && (variantText.trim().startsWith('Color:') || variantText.trim().startsWith('Cor:'));
        
        // Si hay variante personalizada (no solo color), agregarla después de la descripción base
        if (variantText && !isOnlyColor) {
            if (fullText) {
                parts.push({ text: fullText, bold: false });
            }
            // "Personalizado" en su propia línea, en negrita, con espacio adicional antes
            // Solo agregar salto de línea si hay descripción base
            const separator = fullText ? '\n\n' : '';
            parts.push({ text: separator + personalizedLabel, bold: true });
            // El texto de la variante en la siguiente línea, también en negrita
            // Limpiar y formatear el texto de la variante
            const cleanVariantText = variantText.trim();
            // Dividir por saltos de línea si los tiene (puede incluir el color)
            const variantLines = cleanVariantText.split('\n');
            variantLines.forEach((line, index) => {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    // Primera línea después de "Personalizado", agregar espacio y el texto
                    if (index === 0) {
                        parts.push({ text: ' ' + trimmedLine, bold: true });
                    } else {
                        // Líneas adicionales (incluyendo el color), nueva línea, también en negrita
                        parts.push({ text: '\n' + trimmedLine, bold: true });
                    }
                }
            });
        } else if (variantText && isOnlyColor) {
            // Si solo hay color (sin variante personalizada), agregarlo después de la descripción
            if (fullText) {
                parts.push({ text: fullText, bold: false });
            }
            // Color en negrita después de la descripción
            const separator = fullText ? '\n\n' : '';
            parts.push({ text: separator + variantText.trim(), bold: true });
        } else {
            if (fullText) {
                parts.push({ text: fullText, bold: false });
            }
        }
        
        // Si hay color seleccionado, agregarlo en un espacio aparte
        console.log('🎨 Verificando color en drawDescriptionWithBoldParts:', {
            selectedColorText: selectedColorText,
            hasSelectedColorText: !!(selectedColorText && selectedColorText.trim()),
            fullText: fullText,
            variantText: variantText
        });
        
        if (selectedColorText && selectedColorText.trim()) {
            // Agregar salto de línea antes del color
            const hasContentBefore = (fullText && fullText.trim()) || (variantText && variantText.trim());
            const colorSeparator = hasContentBefore ? '\n\n' : '';
            // El color se muestra en negrita
            const colorPart = { text: colorSeparator + selectedColorText.trim(), bold: true };
            parts.push(colorPart);
            console.log('✅ Color agregado a parts:', colorPart);
        } else {
            console.warn('⚠️ No se agregó color porque selectedColorText está vacío o es undefined');
        }
        
        // Si hay observaciones, agregarlas
        if (observations && observations.trim()) {
            // Solo agregar salto de línea si ya hay contenido (descripción, variante o color)
            const hasContent = (fullText && fullText.trim()) || (variantText && variantText.trim()) || (selectedColorText && selectedColorText.trim());
            const notesText = hasContent ? '\n\n' + notesLabel + ': ' : notesLabel + ': ';
            parts.push({ text: notesText, bold: false });
            parts.push({ text: observations.trim(), bold: true });
        }
        
        // Si no hay nada, usar guión
        if (parts.length === 0) {
            parts.push({ text: '-', bold: false });
        }
        
        // Dividir cada parte en líneas, manejando saltos de línea explícitos
        let allLines = [];
        
        parts.forEach(part => {
            // Establecer la fuente correcta antes de dividir el texto para calcular el ancho correcto
            doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
            doc.setFontSize(fontSize);
            
            // Dividir por saltos de línea primero
            const paragraphs = part.text.split('\n');
            paragraphs.forEach((paragraph, paraIndex) => {
                if (paraIndex > 0 && paragraph.trim() === '') {
                    // Salto de línea vacío, agregar línea vacía
                    allLines.push({ text: '', bold: part.bold });
                } else if (paragraph.trim() !== '') {
                    // Dividir el párrafo en líneas que caben en el ancho
                    // Usar el ancho disponible completo pero con cuidado
                    const lines = doc.splitTextToSize(paragraph.trim(), availableWidth);
                    lines.forEach(line => {
                        // Asegurar que la línea tenga contenido
                        if (line && line.trim()) {
                            allLines.push({ text: line.trim(), bold: part.bold });
                        }
                    });
                }
            });
        });
        
        // Calcular altura total y posición inicial
        const totalTextHeight = allLines.length * lineHeight;
        // Asegurar que el texto no se salga del cuadro
        const maxY = y + height - padding;
        const minY = y + padding;
        let startY = y + (height - totalTextHeight) / 2 + lineHeight;
        
        // Ajustar si el texto se sale por arriba o por abajo
        if (startY < minY) {
            startY = minY + lineHeight;
        }
        const endY = startY + (allLines.length - 1) * lineHeight;
        if (endY > maxY) {
            startY = maxY - (allLines.length - 1) * lineHeight;
        }
        
        // Dibujar cada línea
        doc.setFontSize(fontSize);
        allLines.forEach((line, index) => {
            // Verificar que la línea esté dentro del cuadro
            const lineY = startY + (index * lineHeight);
            if (lineY >= minY && lineY <= maxY) {
                doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
                const textX = x + (width / 2);
                // Usar maxWidth para asegurar que el texto no se salga
                doc.text(line.text, textX, lineY, { align: 'center', maxWidth: availableWidth });
            }
        });
    }

    // Definir color blanco una sola vez para usar en encabezados y totales
    const whiteColor = [255, 255, 255];
    
    // Agregar traducción para "Logo"
    const logoLabel = lang === 'pt' ? 'Logo' : lang === 'es' ? 'Logo' : 'Logo';
    
    // Dibujar encabezados (todos centrados) - fondo gris oscuro como el pie de página
    doc.setFillColor(64, 64, 64); // Mismo gris oscuro que el pie de página
    const headerWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
    doc.rect(margin, currentY, headerWidth, baseRowHeight, 'F');
    
    // Texto blanco para los encabezados
    drawCell(colPositions.name, currentY, colWidths.name, baseRowHeight, t.name, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.photo, currentY, colWidths.photo, baseRowHeight, t.photo, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.description, currentY, colWidths.description, baseRowHeight, t.description, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.quantity, currentY, colWidths.quantity, baseRowHeight, t.quantity, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.unitPrice, currentY, colWidths.unitPrice, baseRowHeight, t.unitPrice, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.total, currentY, colWidths.total, baseRowHeight, t.total, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    drawCell(colPositions.deliveryTime, currentY, colWidths.deliveryTime, baseRowHeight, t.deliveryTime, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    if (hasLogos) {
        drawCell(colPositions.logo, currentY, colWidths.logo, baseRowHeight, logoLabel, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
    }
    // Restaurar color de texto a negro para el contenido
    doc.setTextColor(0, 0, 0);

    currentY += baseRowHeight;
    let totalProposal = 0;

    // Calcular altura del footer ANTES del bucle para poder usarlo en la verificación del último producto
    const footerPaddingTop = 12; // Padding superior
    const footerPaddingBottom = 0; // Sin padding inferior (pegado al final)
    const footerTextSize = 9; // Tamaño de fuente
    const lineHeight = 5; // Espaciado entre líneas
    
    // Texto del pie de página según idioma
    const footerTexts = {
        pt: [
            'Preços não incluem IVA e são válidos para uma única entrega.',
            'Estes preços não incluem despesas de transporte.',
            'Esta proposta é válida por 2 meses e está sempre sujeita a revisão no momento da adjudicação.',
            'A quantidade de entrega poderá ter uma variação de até 10%.',
            'Condições de pagamento: 30% do valor total do pedido no momento da adjudicação; 70% nas condições habituais.'
        ],
        es: [
            'Los precios no incluyen IVA y son válidos para una única entrega.',
            'Estos precios no incluyen gastos de transporte.',
            'Esta propuesta es válida por 2 meses y está siempre sujeta a revisión en el momento de la adjudicación.',
            'La cantidad de entrega podrá tener una variación de hasta 10%.',
            'Condiciones de pago: 30% del valor total del pedido en el momento de la adjudicación; 70% en las condiciones habituales.'
        ],
        en: [
            'Prices do not include VAT and are valid for a single delivery.',
            'These prices do not include transport costs.',
            'This proposal is valid for 2 months and is always subject to revision at the time of award.',
            'The delivery quantity may have a variation of up to 10%.',
            'Payment conditions: 30% of the total order value at the time of award; 70% under usual conditions.'
        ]
    };
    
    const footerText = footerTexts[lang] || footerTexts.pt;
    
    // Calcular cuántas líneas necesitamos
    doc.setFontSize(footerTextSize);
    const maxWidth = pageWidth - (margin * 2) - (footerPaddingTop * 2);
    let totalLines = 0;
    footerText.forEach(text => {
        const lines = doc.splitTextToSize(text, maxWidth);
        totalLines += lines.length;
    });
    
    // Calcular altura total del footer: líneas + espacios entre párrafos + padding superior
    const spacesBetweenParagraphs = (footerText.length - 1) * 3; // Espacio entre párrafos
    const footerHeight = (totalLines * lineHeight) + spacesBetweenParagraphs + footerPaddingTop + footerPaddingBottom;
    
    console.log('📦 Carrito a procesar para PDF:', cartToProcess.map(item => ({
        id: item.id,
        name: item.name,
        selectedReferenceVariant: item.selectedReferenceVariant,
        hasVariantesReferencias: !!item.variantes_referencias
    })));
    
    for (let i = 0; i < cartToProcess.length; i++) {
        const item = cartToProcess[i];
        
        // Determinar si tiene precio personalizado y obtener el nombre de la variante
        // SOLO es personalizado si hay una variante seleccionada (selectedVariant !== null)
        // Si selectedVariant === null, es precio base (sin personalización), aunque tenga price_tiers
        let hasPersonalizedPrice = false;
        let variantName = '';
        if (item.type === 'product') {
            // Solo es precio personalizado si hay una variante seleccionada
            // selectedVariant === null significa que se está usando el precio base (sin personalización)
            if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                // Hay una variante seleccionada, es precio personalizado
                hasPersonalizedPrice = true;
                const selectedVariant = item.variants[item.selectedVariant];
                variantName = selectedVariant?.name || '';
            }
            // Si selectedVariant === null, NO es personalizado, aunque tenga price_tiers
            // Los price_tiers del producto base son solo escalones de precio, no personalización
        }

        // Preparar descripción (primero la descripción base)
        let description = '';
        if (item.type === 'product') {
            description = lang === 'es' ? 
                (item.descripcionEs || item.description || '') :
                (item.descripcionPt || item.descripcionEs || item.description || '');
        } else if (item.type === 'special') {
            description = item.notes || '';
        } else {
            description = item.notes || '';
        }

        // Guardar información de variante y observaciones por separado para renderizar en negrita
        let variantText = '';
        if (hasPersonalizedPrice && variantName) {
            variantText = variantName;
        }
        
        // Obtener color seleccionado de variantes de referencias
        let selectedColorText = '';
        
        // IMPORTANTE: Buscar el item en el carrito actualizado para obtener el selectedReferenceVariant
        // Puede que el item pasado no tenga el selectedReferenceVariant actualizado
        // Recargar el carrito desde localStorage para asegurar que tenemos los datos más recientes
        const freshCart = window.cartManager.loadCart();
        const currentCartItem = freshCart.find(cartItem => {
            // Buscar por cartItemId primero (para items duplicados)
            if (item.cartItemId && cartItem.cartItemId) {
                return cartItem.cartItemId === item.cartItemId;
            }
            // Si no, buscar por id
            return String(cartItem.id) === String(item.id) || cartItem.id === item.id;
        });
        
        // Usar el item del carrito actualizado si existe, sino usar el item pasado
        const itemToUse = currentCartItem || item;
        
        console.log('🔍 Verificando color para item:', {
            itemId: item.id,
            itemCartItemId: item.cartItemId,
            selectedReferenceVariant: itemToUse.selectedReferenceVariant,
            selectedReferenceVariantOriginal: item.selectedReferenceVariant,
            hasVariantesReferencias: !!itemToUse.variantes_referencias,
            foundInCart: !!currentCartItem
        });
        
        if (itemToUse.selectedReferenceVariant !== null && itemToUse.selectedReferenceVariant !== undefined) {
            // Obtener variantes_referencias del item o del producto en la BD
            let referenceVariants = itemToUse.variantes_referencias || [];
            if (!referenceVariants || referenceVariants.length === 0) {
                const productFromDB = window.cartManager?.allProducts?.find(p => String(p.id) === String(item.id));
                if (productFromDB && productFromDB.variantes_referencias) {
                    referenceVariants = Array.isArray(productFromDB.variantes_referencias) ? 
                        productFromDB.variantes_referencias : 
                        (typeof productFromDB.variantes_referencias === 'string' ? 
                            JSON.parse(productFromDB.variantes_referencias) : []);
                }
            }
            
            console.log('🔍 Variantes de referencia encontradas:', referenceVariants);
            
            if (referenceVariants && Array.isArray(referenceVariants) && referenceVariants.length > 0) {
                const selectedIndex = parseInt(itemToUse.selectedReferenceVariant);
                console.log('🔍 Índice seleccionado:', selectedIndex, 'de', referenceVariants.length);
                
                if (selectedIndex >= 0 && selectedIndex < referenceVariants.length) {
                    const selectedVariant = referenceVariants[selectedIndex];
                    console.log('🔍 Variante seleccionada:', selectedVariant);
                    
                    if (selectedVariant && selectedVariant.color) {
                        // Formato: "Cor seleccionada X" (PT) o "Color seleccionado X" (ES)
                        if (lang === 'pt') {
                            selectedColorText = `Cor seleccionada ${selectedVariant.color}`;
                        } else if (lang === 'es') {
                            selectedColorText = `Color seleccionado ${selectedVariant.color}`;
            } else {
                            selectedColorText = `Color selected ${selectedVariant.color}`;
                        }
                        console.log('✅ Color seleccionado generado:', selectedColorText);
                    } else {
                        console.warn('⚠️ La variante seleccionada no tiene color:', selectedVariant);
                    }
                } else {
                    console.warn('⚠️ Índice fuera de rango:', selectedIndex, 'de', referenceVariants.length);
                }
            } else {
                console.warn('⚠️ No se encontraron variantes de referencia');
            }
        } else {
            console.log('ℹ️ No hay variante de referencia seleccionada. selectedReferenceVariant:', itemToUse.selectedReferenceVariant);
        }

        // Agregar notas especiales (observaciones) al final, con espacio adicional
        // Asegurar que se lea correctamente desde el item
        // Intentar leer de diferentes formas por si acaso
        let observations = item.observations || item.observations_text || '';
        
        // Si no está en el item, intentar leer del carrito actualizado
        if (!observations) {
            const currentItem = window.cartManager.cart.find(cartItem => 
                String(cartItem.id) === String(item.id) || cartItem.id === item.id
            );
            if (currentItem && currentItem.observations) {
                observations = currentItem.observations;
            }
        }

        // Si no hay descripción, usar guión
        if (!description) {
            description = '-';
        }

        // Calcular valores
        const unitPrice = item.price || 0;
        const quantity = item.quantity || 1;
        const total = unitPrice * quantity;
        totalProposal += total;

        // Construir el texto completo para calcular la altura correcta
        // Esto incluye descripción + variante + observaciones
        // Obtener traducción de "Personalizado" según el idioma
        const personalizedLabel = lang === 'pt' ? 'Personalizado' : 
                                  lang === 'es' ? 'Personalizado' : 
                                  'Custom';
        
        let fullDescriptionText = description || '-';
        if (variantText) {
            fullDescriptionText += '\n\n' + personalizedLabel;
            const cleanVariantText = variantText.trim();
            const variantLines = cleanVariantText.split('\n');
            variantLines.forEach((line, index) => {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    if (index === 0) {
                        fullDescriptionText += ' ' + trimmedLine;
                    } else {
                        fullDescriptionText += '\n' + trimmedLine;
                    }
                }
            });
        }
        // Agregar color seleccionado después de la variante personalizada
        if (selectedColorText) {
            if (variantText) {
                fullDescriptionText += '\n' + selectedColorText;
            } else {
                fullDescriptionText += '\n\n' + selectedColorText;
            }
        }
        if (observations && observations.trim()) {
            fullDescriptionText += '\n\n' + t.notes + ': ' + observations.trim();
        }

        // Calcular altura necesaria para esta fila basada en el contenido completo
        // IMPORTANTE: Usar el mismo lineHeight que drawDescriptionWithBoldParts para consistencia
        const padding = 2;
        const availableWidth = colWidths.description - (padding * 2);
        const fontSize = 7;
        // Usar el mismo lineHeight que drawDescriptionWithBoldParts (fontSize * 0.5)
        const lineHeight = fontSize * 0.5;
        
        // Establecer la fuente antes de dividir el texto para calcular correctamente
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'normal');
        
        // Dividir el texto completo en líneas
        // IMPORTANTE: Usar el ancho disponible completo para calcular correctamente
        const descriptionLines = doc.splitTextToSize(fullDescriptionText, availableWidth);
        
        // Calcular altura considerando el espaciado entre líneas
        // Reducir padding para que las celdas se ajusten mejor al contenido
        const descriptionHeight = Math.max(
            (descriptionLines.length * lineHeight) + (padding * 2), 
            minRowHeight
        );
        
        console.log('📏 Cálculo de altura de descripción:', {
            itemName: item.name,
            fullDescriptionTextLength: fullDescriptionText.length,
            numLines: descriptionLines.length,
            lineHeight: lineHeight,
            calculatedHeight: descriptionHeight,
            minRowHeight: minRowHeight,
            hasVariant: !!variantText,
            hasColor: !!selectedColorText,
            hasObservations: !!(observations && observations.trim())
        });
        
        // Obtener plazo de entrega: primero verificar si hay variante personalizada con plazo
        let deliveryText = (item.plazoEntrega || item.plazo_entrega || '-');
        let stockDisponible = null;
        let hasVariantDeliveryTime = false;
        
        // VERIFICAR PRIMERO: Si hay una variante seleccionada con plazo de entrega personalizado
        if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
            const selectedVariant = item.variants[item.selectedVariant];
            if (selectedVariant && (selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime)) {
                deliveryText = selectedVariant.plazo_entrega_personalizado || selectedVariant.plazoEntrega || selectedVariant.plazo_entrega || selectedVariant.deliveryTime;
                hasVariantDeliveryTime = true; // Marcar que tiene plazo de variante, no consultar stock
            }
        }
        
        // Si NO hay plazo de variante personalizada, consultar stock
        if (!hasVariantDeliveryTime) {
            // Intentar obtener la referencia PHC del producto para consultar stock
            if (window.cartManager && window.cartManager.allProducts) {
                const productFromDB = window.cartManager.allProducts.find(p => String(p.id) === String(item.id));
                if (productFromDB && productFromDB.phc_ref) {
                    try {
                        stockDisponible = await window.cartManager.getStockForProduct(productFromDB.phc_ref);
                    } catch (error) {
                        console.warn('Error consultando stock para PDF:', error);
                    }
                }
            }
            
            // Determinar el texto a mostrar según el stock (solo si no hay plazo de variante)
            if (stockDisponible !== null && stockDisponible !== undefined) {
                const plazoNormal = deliveryText; // Guardar el plazo original
                if (stockDisponible >= quantity) {
                    // Stock suficiente: mostrar "En stock" con advertencia en línea separada
                    deliveryText = `${t.enStock}\n${t.sujetoConfirmacion}`;
                } else if (stockDisponible > 0) {
                    // Stock parcial: mostrar stock disponible y plazo
                    deliveryText = `${stockDisponible.toLocaleString()} ${t.unidadesEnStock} / ${t.restantes} ${t.plazoEntrega} ${plazoNormal}`;
                }
                // Si stockDisponible === 0, mantener el plazo normal (ya está asignado arriba)
            }
        }
        
        // Calcular altura de otras celdas que pueden tener múltiples líneas
        const deliveryLines = doc.splitTextToSize(deliveryText, colWidths.deliveryTime - (padding * 2));
        const deliveryHeight = Math.max(deliveryLines.length * lineHeight, minRowHeight);
        
        // La altura de la fila es la máxima entre todas las celdas
        // IMPORTANTE: Asegurar que la descripción tenga suficiente espacio
        // Agregar padding adicional para evitar que el texto se corte
        const minDescriptionHeight = descriptionHeight + (padding * 4); // Más padding para descripción
        
        const calculatedRowHeight = Math.max(
            baseRowHeight,
            minDescriptionHeight,
            deliveryHeight + (padding * 2),
            imageSize + (padding * 2)
        );
        
        console.log('📏 Altura final calculada para fila:', {
            itemName: item.name,
            descriptionHeight: descriptionHeight,
            minDescriptionHeight: minDescriptionHeight,
            calculatedRowHeight: calculatedRowHeight,
            numDescriptionLines: descriptionLines.length
        });

        // Verificar si necesitamos una nueva página
        // SOLO verificar si el producto individual cabe (sin considerar total ni condiciones)
        // El total y las condiciones se manejan después
        if (currentY + calculatedRowHeight > pageHeight - margin) {
            doc.addPage();
            // En páginas siguientes, empezar desde el margen superior (sin espacio de logos)
            currentY = margin;
            
            // Redibujar encabezados en nueva página - fondo gris oscuro
            doc.setFillColor(64, 64, 64); // Mismo gris oscuro que el pie de página
            const headerWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
            doc.rect(margin, margin, headerWidth, baseRowHeight, 'F');
            // Texto blanco para los encabezados (usar margin en lugar de currentY para que quede alineado)
            drawCell(colPositions.name, margin, colWidths.name, baseRowHeight, t.name, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.photo, margin, colWidths.photo, baseRowHeight, t.photo, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.description, margin, colWidths.description, baseRowHeight, t.description, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.quantity, margin, colWidths.quantity, baseRowHeight, t.quantity, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.unitPrice, margin, colWidths.unitPrice, baseRowHeight, t.unitPrice, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.total, margin, colWidths.total, baseRowHeight, t.total, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            drawCell(colPositions.deliveryTime, margin, colWidths.deliveryTime, baseRowHeight, t.deliveryTime, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            if (hasLogos) {
                drawCell(colPositions.logo, margin, colWidths.logo, baseRowHeight, logoLabel, { align: 'center', bold: true, fontSize: 8, textColor: whiteColor });
            }
            // Restaurar color de texto a negro para el contenido
            doc.setTextColor(0, 0, 0);
            currentY = margin + baseRowHeight;
        }

        // Dibujar fila con altura calculada
        // Nombre del producto
        const productName = item.name || '';
        drawCell(colPositions.name, currentY, colWidths.name, calculatedRowHeight, productName, { fontSize: 7, align: 'center', border: true });
        
        // Foto
        drawCell(colPositions.photo, currentY, colWidths.photo, calculatedRowHeight, '', { border: true });
        
        // Agregar imagen (centrada verticalmente)
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve) => {
                img.onload = () => {
                    try {
                        const smallerImageSize = Math.min(imageSize, colWidths.photo - 4);
                        const imgX = colPositions.photo + (colWidths.photo - smallerImageSize) / 2;
                        const imgY = currentY + (calculatedRowHeight - smallerImageSize) / 2;
                        doc.addImage(img, 'JPEG', imgX, imgY, smallerImageSize, smallerImageSize);
                    } catch (error) {
                        console.error('Error adding image:', error);
                    }
                    resolve();
                };
                img.onerror = () => resolve();
                if (item.image) {
                    img.src = item.image;
                } else {
                    img.style.display = 'none';
                }
            });
        } catch (error) {
            console.error('Error loading image:', error);
        }

        // Preparar texto de variante (sin color, el color se maneja por separado)
        let variantTextForDescription = variantText || '';
        
        // Dibujar descripción con partes en negrita (variante, color y observaciones)
        // Pasamos el color seleccionado como un parámetro separado
        console.log('📄 Dibujando descripción para PDF:', {
            itemId: item.id,
            itemName: item.name,
            selectedColorText: selectedColorText,
            selectedReferenceVariant: item.selectedReferenceVariant,
            variantText: variantTextForDescription,
            observations: observations,
            hasVariantesReferencias: !!item.variantes_referencias
        });
        
        // Asegurar que selectedColorText se pase correctamente
        if (!selectedColorText && item.selectedReferenceVariant !== null && item.selectedReferenceVariant !== undefined) {
            console.warn('⚠️ selectedColorText está vacío pero hay selectedReferenceVariant:', item.selectedReferenceVariant);
        }
        
        drawDescriptionWithBoldParts(
            colPositions.description, 
            currentY, 
            colWidths.description, 
            calculatedRowHeight, 
            description, 
            variantTextForDescription, 
            observations,
            t.notes,
            selectedColorText || '' // Color seleccionado como parámetro adicional, asegurar que no sea undefined
        );
        drawCell(colPositions.quantity, currentY, colWidths.quantity, calculatedRowHeight, quantity.toString(), { align: 'center', fontSize: 8, noWrap: true });
        // Formatear precio unitario: hasta 4 decimales si tiene 4 decimales significativos
        const formattedUnitPrice = window.cartManager ? window.cartManager.formatUnitPrice(unitPrice) : unitPrice.toFixed(2);
        drawCell(colPositions.unitPrice, currentY, colWidths.unitPrice, calculatedRowHeight, `€${formattedUnitPrice}`, { align: 'center', fontSize: 8, noWrap: true });
        // Formatear total: siempre 2 decimales
        const formattedTotal = window.cartManager ? window.cartManager.formatTotal(total) : total.toFixed(2);
        drawCell(colPositions.total, currentY, colWidths.total, calculatedRowHeight, `€${formattedTotal}`, { align: 'center', bold: true, fontSize: 8, noWrap: true });
        drawCell(colPositions.deliveryTime, currentY, colWidths.deliveryTime, calculatedRowHeight, deliveryText, { align: 'center', fontSize: 7 });
        
        // Dibujar logo si existe
        if (hasLogos) {
            drawCell(colPositions.logo, currentY, colWidths.logo, calculatedRowHeight, '', { border: true });
            
            // Agregar logo (centrado verticalmente)
            if (item.logoUrl && item.logoUrl.trim() !== '') {
                try {
                    // Verificar si es PDF o imagen
                    const isPdf = item.logoUrl.toLowerCase().endsWith('.pdf') || item.logoUrl.toLowerCase().includes('.pdf');
                    
                    if (isPdf) {
                        // Usar la imagen pre-procesada del mapa (ya convertida antes de generar el PDF)
                        // Normalizar la URL (sin espacios) para buscar en el mapa
                        const normalizedLogoUrl = item.logoUrl.trim();
                        
                        console.log('🔍 Buscando logo PDF en mapa:', {
                            logoUrl: item.logoUrl,
                            normalizedLogoUrl: normalizedLogoUrl,
                            mapKeys: Object.keys(pdfLogosMap),
                            hasInMap: !!pdfLogosMap[normalizedLogoUrl],
                            mapSize: Object.keys(pdfLogosMap).length
                        });
                        
                        const pdfImageData = pdfLogosMap[normalizedLogoUrl];
                        
                        if (pdfImageData && pdfImageData.length > 0) {
                            try {
                                const logoSize = Math.min(15, colWidths.logo - 4);
                                const logoX = colPositions.logo + (colWidths.logo - logoSize) / 2;
                                const logoY = currentY + (calculatedRowHeight - logoSize) / 2;
                                
                                // Agregar imagen pre-convertida al PDF
                                doc.addImage(pdfImageData, 'PNG', logoX, logoY, logoSize, logoSize);
                                console.log('✅ Logo PDF (pre-procesado) agregado al PDF correctamente');
                            } catch (addImageError) {
                                console.error('❌ Error agregando imagen PDF pre-procesada al documento:', addImageError);
                                // Si falla al agregar, mostrar "PDF"
                                doc.setFontSize(6);
                                doc.setTextColor(0, 0, 0);
                                const pdfTextX = colPositions.logo + colWidths.logo / 2;
                                const pdfTextY = currentY + calculatedRowHeight / 2;
                                doc.text('PDF', pdfTextX, pdfTextY, { align: 'center' });
                            }
                        } else {
                            console.warn('⚠️ No se encontró imagen pre-procesada para el PDF:', {
                                logoUrl: item.logoUrl,
                                mapKeys: Object.keys(pdfLogosMap),
                                pdfImageData: pdfImageData ? 'existe pero vacío' : 'no existe'
                            });
                            // Si no hay imagen pre-procesada, mostrar "PDF"
                            doc.setFontSize(6);
                            doc.setTextColor(0, 0, 0);
                            const pdfTextX = colPositions.logo + colWidths.logo / 2;
                            const pdfTextY = currentY + calculatedRowHeight / 2;
                            doc.text('PDF', pdfTextX, pdfTextY, { align: 'center' });
                        }
                    } else {
                        // Para imágenes, cargar y mostrar
                        const logoImg = new Image();
                        logoImg.crossOrigin = 'anonymous';
                        await new Promise((resolve) => {
                            logoImg.onload = () => {
                                try {
                                    const logoSize = Math.min(15, colWidths.logo - 4);
                                    const logoX = colPositions.logo + (colWidths.logo - logoSize) / 2;
                                    const logoY = currentY + (calculatedRowHeight - logoSize) / 2;
                                    
                                    // Crear canvas para convertir a base64 si es necesario
                                    const canvas = document.createElement('canvas');
                                    canvas.width = logoImg.width;
                                    canvas.height = logoImg.height;
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(logoImg, 0, 0);
                                    const imgData = canvas.toDataURL('image/png');
                                    
                                    // Agregar imagen al PDF
                                    doc.addImage(imgData, 'PNG', logoX, logoY, logoSize, logoSize);
                                } catch (error) {
                                    console.error('Error adding logo image:', error);
                                    // Si falla, mostrar "N/A"
                                    doc.setFontSize(6);
                                    doc.setTextColor(0, 0, 0);
                                    doc.text('N/A', colPositions.logo + colWidths.logo / 2, currentY + calculatedRowHeight / 2, { align: 'center' });
                                }
                                resolve();
                            };
                            logoImg.onerror = () => {
                                // Si falla la carga, mostrar "N/A"
                                doc.setFontSize(6);
                                doc.setTextColor(0, 0, 0);
                                doc.text('N/A', colPositions.logo + colWidths.logo / 2, currentY + calculatedRowHeight / 2, { align: 'center' });
                                resolve();
                            };
                            logoImg.src = item.logoUrl;
                        });
                    }
                } catch (error) {
                    console.error('Error loading logo:', error);
                    // Si falla, mostrar "N/A"
                    doc.setFontSize(6);
                    doc.setTextColor(0, 0, 0);
                    doc.text('N/A', colPositions.logo + colWidths.logo / 2, currentY + calculatedRowHeight / 2, { align: 'center' });
                }
            } else {
                // Si no hay logo, mostrar "N/A"
                doc.setFontSize(6);
                doc.setTextColor(0, 0, 0);
                doc.text('N/A', colPositions.logo + colWidths.logo / 2, currentY + calculatedRowHeight / 2, { align: 'center' });
            }
        }

        currentY += calculatedRowHeight;
    }

    // footerHeight ya fue calculado antes del bucle, no es necesario recalcularlo

    // Dibujar total - DEBE estar pegado inmediatamente después del último producto
    // NO mover el total a una nueva página, solo verificar que cabe básicamente
    if (currentY + baseRowHeight > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
    }
    
    // El total se dibuja en currentY (que ya está en la posición después del último producto)
    // NO agregar espacio antes del total
    const spaceAfterTotal = 10; // Espacio después del total (solo para las condiciones)

    // Fila del total - fondo gris oscuro como el pie de página
    doc.setFillColor(64, 64, 64); // Mismo gris oscuro que el pie de página
    // Calcular ancho total incluyendo la columna de logo si existe
    const totalRowWidth = colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity + colWidths.unitPrice + colWidths.total + colWidths.deliveryTime + (hasLogos ? colWidths.logo : 0);
    doc.rect(margin, currentY, totalRowWidth, baseRowHeight, 'F');
    
    // Calcular ancho de la celda combinada (desde nombre hasta precio unitario, excluyendo total, delivery y logo)
    const combinedCellWidth = colWidths.name + colWidths.photo + colWidths.description + colWidths.quantity + colWidths.unitPrice;
    
    // Dibujar todas las celdas de la fila del total con bordes para que se cierre correctamente
    // Celda combinada (nombre hasta precio unitario)
    drawCell(colPositions.name, currentY, combinedCellWidth, baseRowHeight, t.totalProposal, { align: 'center', bold: true, fontSize: 9, textColor: whiteColor, border: true });
    
    // Celda del total - siempre 2 decimales
    const formattedTotalProposal = window.cartManager ? window.cartManager.formatTotal(totalProposal) : totalProposal.toFixed(2);
    drawCell(colPositions.total, currentY, colWidths.total, baseRowHeight, `€${formattedTotalProposal}`, { align: 'center', bold: true, fontSize: 9, noWrap: true, textColor: whiteColor, border: true });
    
    // Celda de plazo de entrega (vacía en la fila del total)
    drawCell(colPositions.deliveryTime, currentY, colWidths.deliveryTime, baseRowHeight, '', { align: 'center', border: true, textColor: whiteColor });
    
    // Si hay columna de logo, dibujar celda vacía con borde para cerrar correctamente
    if (hasLogos) {
        drawCell(colPositions.logo, currentY, colWidths.logo, baseRowHeight, '', { align: 'center', border: true, textColor: whiteColor });
    }
    // Restaurar color de texto a negro
    doc.setTextColor(0, 0, 0);

    // Agregar pie de página con condiciones legales (estilo oscuro como en la imagen)
    // Verificar si las condiciones caben completas en la página actual
    // Si no caben, mover SOLO las condiciones a una nueva página (el total ya está dibujado)
    currentY += baseRowHeight + spaceAfterTotal;
    
    // Verificación: si no cabe el footer completo, crear nueva página SOLO para las condiciones
    if (currentY + footerHeight > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
        console.log('📄 Nueva página creada para condiciones (el total ya está en la página anterior)');
    }
    
    // Dibujar fondo gris oscuro (similar al de la imagen: gris oscuro sólido)
    // Color gris oscuro: RGB(64, 64, 64) o similar - más oscuro que el anterior
    doc.setFillColor(64, 64, 64); // Gris oscuro similar a la imagen
    const footerWidth = pageWidth - (margin * 2);
    doc.rect(margin, currentY, footerWidth, footerHeight, 'F');
    
    // Configurar estilo para el texto del pie de página (blanco)
    doc.setFontSize(footerTextSize);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255); // Texto blanco
    
    // Posición inicial del texto dentro del cuadro (solo padding superior)
    currentY += footerPaddingTop;
    
    // Agregar cada línea del pie de página
    footerText.forEach((text, index) => {
        // Dividir texto en líneas si es muy largo
        const lines = doc.splitTextToSize(text, maxWidth);
        
        lines.forEach((line, lineIndex) => {
            doc.text(line, margin + footerPaddingTop, currentY);
            currentY += lineHeight;
        });
        
        // Espacio entre párrafos (excepto después del último)
        if (index < footerText.length - 1) {
            currentY += 3; // Espacio entre párrafos
        }
    });
    
    // Las condiciones quedan pegadas al final del cuadro (sin padding inferior)

    // Guardar PDF
    const fileName = `propuesta_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    // Notificación de éxito
    const message = lang === 'es' ? 
        'PDF generado correctamente' : 
        lang === 'pt' ?
        'PDF gerado com sucesso' :
        'PDF generated successfully';
    window.cartManager?.showNotification(message, 'success');
}

/**
 * Abrir modal para enviar propuesta
 */
function openSendProposalModal() {
    if (!window.cartManager || window.cartManager.cart.length === 0) {
        const message = window.cartManager?.currentLanguage === 'es' ? 
            'El presupuesto está vacío' : 
            window.cartManager?.currentLanguage === 'pt' ?
            'O orçamento está vazio' :
            'The budget is empty';
        window.cartManager?.showNotification(message, 'error');
        return;
    }

    // Si se está editando una propuesta, guardar directamente sin mostrar el modal
    if (window.cartManager.editingProposalId) {
        sendProposalToSupabase();
        return;
    }

    // Configurar fecha: desde hace un mes hasta hoy
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(today.getMonth() - 1); // Restar un mes
    
    const maxDate = today.toISOString().split('T')[0]; // Máximo: hoy
    const minDate = oneMonthAgo.toISOString().split('T')[0]; // Mínimo: hace un mes
    
    const dateInput = document.getElementById('proposalDateInput');
    if (dateInput) {
        dateInput.value = ''; // No establecer fecha por defecto
        dateInput.setAttribute('max', maxDate); // Máximo: hoy
        dateInput.setAttribute('min', minDate); // Mínimo: hace un mes
    }

    // Limpiar campos
    document.getElementById('clientNameInput').value = '';
    const commercialSelect = document.getElementById('commercialNameInput');
    if (commercialSelect) {
        commercialSelect.value = '';
    }
    document.getElementById('proposalCountryInput').value = '';
    const clientNumberInput = document.getElementById('clientNumberInput');
    if (clientNumberInput) {
        clientNumberInput.value = '0'; // Valor por defecto: "0" (cliente no creado)
    }

    // Cargar clientes y comerciales existentes para autocompletado
    loadExistingClients();
    loadExistingCommercials();

    // Configurar autocompletado del nombre del cliente y comercial
    setupClientAutocomplete();
    setupCommercialAutocomplete();

    // Mostrar modal
    const modal = document.getElementById('sendProposalModal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Cerrar modal de enviar propuesta
 */
function closeSendProposalModal() {
    const modal = document.getElementById('sendProposalModal');
    if (modal) {
        modal.classList.remove('active');
    }
    // Ocultar sugerencias al cerrar
    const suggestions = document.getElementById('clientSuggestions');
    if (suggestions) {
        suggestions.style.display = 'none';
    }
}

// Variables globales para almacenar clientes y comerciales existentes
let existingClients = [];
let existingCommercials = [];

/**
 * Cargar clientes existentes desde Supabase
 */
async function loadExistingClients() {
    if (!window.cartManager?.supabase) {
        // No disponible para cargar clientes
        return;
    }

    try {
        // Obtener nombres de clientes únicos de presupuestos existentes
        const { data, error } = await window.cartManager.supabase
            .from('presupuestos')
            .select('nombre_cliente')
            .order('nombre_cliente', { ascending: true });

        if (error) {
            console.error('Error al cargar clientes:', error);
            return;
        }

        // Obtener nombres únicos
        const uniqueClients = [...new Set(data.map(p => p.nombre_cliente))].filter(Boolean);
        existingClients = uniqueClients;
        console.log('✅ Clientes cargados para autocompletado:', existingClients.length);
    } catch (error) {
        console.error('Error en loadExistingClients:', error);
    }
}

/**
 * Lista predefinida de comerciales en orden alfabético
 */
const PREDEFINED_COMMERCIALS = [
    'Adriana Gomez',
    'Antonio Albuquerque',
    'Claudia Cruz',
    'Elizabeth Fernandez',
    'Jesus Paz',
    'Manuel Reza',
    'Miguel Castro',
    'Miguel Eufrasio',
    'Olivier Moreau',
    'Sergio Serrano',
    'Susana Coutinho',
    'Vasco Morais',
    'Vera Cruz Madeira'
];

/**
 * Cargar comerciales existentes y poblar el select
 */
async function loadExistingCommercials() {
    const commercialSelect = document.getElementById('commercialNameInput');
    
    if (!commercialSelect) {
        console.warn('Select de comercial no encontrado');
        return;
    }

    try {
        // Limpiar opciones existentes (excepto la primera opción placeholder)
        while (commercialSelect.options.length > 1) {
            commercialSelect.remove(1);
        }
        
        // Agregar comerciales predefinidos al select
        PREDEFINED_COMMERCIALS.forEach(commercial => {
            const option = document.createElement('option');
            option.value = commercial;
            option.textContent = commercial;
            commercialSelect.appendChild(option);
        });
        
        existingCommercials = PREDEFINED_COMMERCIALS;
        console.log('✅ Lista predefinida de comerciales cargada en select:', existingCommercials.length);
    } catch (error) {
        console.error('Error en loadExistingCommercials:', error);
    }
}

/**
 * Configurar autocompletado del nombre del cliente
 */
function setupClientAutocomplete() {
    const input = document.getElementById('clientNameInput');
    const suggestionsContainer = document.getElementById('clientSuggestions');

    if (!input || !suggestionsContainer) return;

    // Remover listeners anteriores para evitar duplicados
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    // Agregar listeners al nuevo input
    newInput.addEventListener('input', function(e) {
        const value = e.target.value.toLowerCase().trim();
        
        if (value.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        // Filtrar clientes que coincidan
        const matches = existingClients.filter(client => 
            client.toLowerCase().includes(value)
        ).slice(0, 8); // Limitar a 8 sugerencias

        if (matches.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        // Mostrar sugerencias
        suggestionsContainer.innerHTML = matches.map(client => `
            <div class="autocomplete-item" style="
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid var(--border-color, #374151);
                transition: background 0.2s;
                display: flex;
                align-items: center;
                gap: 10px;
            " onmouseover="this.style.background='var(--bg-hover, #374151)'" 
               onmouseout="this.style.background='transparent'"
               onclick="selectClient('${client.replace(/'/g, "\\'")}')">
                <i class="fas fa-user" style="color: var(--text-secondary, #9ca3af); font-size: 0.9rem;"></i>
                <span style="color: var(--text-primary, #f9fafb);">${highlightMatch(client, value)}</span>
            </div>
        `).join('');

        suggestionsContainer.style.display = 'block';
    });

    // Cerrar sugerencias al hacer click fuera
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#clientNameInput') && !e.target.closest('#clientSuggestions')) {
            suggestionsContainer.style.display = 'none';
        }
    });

    // Manejar teclas de navegación
    newInput.addEventListener('keydown', function(e) {
        const items = suggestionsContainer.querySelectorAll('.autocomplete-item');
        const activeItem = suggestionsContainer.querySelector('.autocomplete-item.active');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!activeItem && items.length > 0) {
                items[0].classList.add('active');
                items[0].style.background = 'var(--bg-hover, #374151)';
            } else if (activeItem) {
                const index = Array.from(items).indexOf(activeItem);
                activeItem.classList.remove('active');
                activeItem.style.background = 'transparent';
                if (index < items.length - 1) {
                    items[index + 1].classList.add('active');
                    items[index + 1].style.background = 'var(--bg-hover, #374151)';
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeItem) {
                const index = Array.from(items).indexOf(activeItem);
                activeItem.classList.remove('active');
                activeItem.style.background = 'transparent';
                if (index > 0) {
                    items[index - 1].classList.add('active');
                    items[index - 1].style.background = 'var(--bg-hover, #374151)';
                }
            }
        } else if (e.key === 'Enter') {
            if (activeItem) {
                e.preventDefault();
                activeItem.click();
            }
        } else if (e.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
        }
    });
}

/**
 * Resaltar la coincidencia en el texto
 */
function highlightMatch(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong style="color: var(--accent-500, #10b981);">$1</strong>');
}

/**
 * Seleccionar un cliente de las sugerencias
 */
function selectClient(clientName) {
    const input = document.getElementById('clientNameInput');
    const suggestionsContainer = document.getElementById('clientSuggestions');
    
    if (input) {
        input.value = clientName;
    }
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
    
    // Enfocar el siguiente campo
    const commercialInput = document.getElementById('commercialNameInput');
    if (commercialInput) {
        commercialInput.focus();
    }
}

/**
 * Configurar select del nombre del comercial
 * Ya no se usa autocompletado, ahora es un select con lista predefinida
 */
function setupCommercialAutocomplete() {
    const select = document.getElementById('commercialNameInput');
    
    if (!select) return;
    
    // Agregar listener para guardar el comercial seleccionado
    select.addEventListener('change', function(e) {
        const selectedCommercial = e.target.value;
        if (selectedCommercial) {
            // Guardar el nombre del comercial en localStorage para recordarlo
            localStorage.setItem('commercial_name', selectedCommercial);
        }
    });
    
    // Cargar el comercial guardado si existe
    const savedCommercial = localStorage.getItem('commercial_name');
    if (savedCommercial && PREDEFINED_COMMERCIALS.includes(savedCommercial)) {
        select.value = savedCommercial;
    }
}

/**
 * Seleccionar un comercial de las sugerencias
 */
function selectCommercial(commercialName) {
    const input = document.getElementById('commercialNameInput');
    const suggestionsContainer = document.getElementById('commercialSuggestions');
    
    if (input) {
        input.value = commercialName;
    }
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
    
    // Guardar el nombre del comercial en localStorage para recordarlo
    localStorage.setItem('commercial_name', commercialName);
    
    // Enfocar el siguiente campo (fecha)
    const dateInput = document.getElementById('proposalDateInput');
    if (dateInput) {
        dateInput.focus();
    }
}

/**
 * Generar código identificador de propuesta
 * Formato: DDHHIIAAYY (Día, Hora, Iniciales Comercial, Iniciales Cliente, Año)
 */
async function generateProposalCode(proposalDate, commercialName, clientName) {
    // Obtener fecha actual
    const now = new Date(proposalDate || new Date());
    const day = String(now.getDate()).padStart(2, '0'); // Día (2 dígitos)
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Mes (2 dígitos, +1 porque getMonth() es 0-11)
    const year = String(now.getFullYear()).slice(-2); // Últimos 2 dígitos del año
    
    // Extraer iniciales del comercial (máximo 2 letras)
    // Ej: "María Fernanda López" → "MF"
    let commercialInitials = '';
    if (commercialName) {
        const words = commercialName.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 2) {
            // Tomar primera letra de las primeras dos palabras
            commercialInitials = (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
        } else if (words.length === 1) {
            // Si solo hay una palabra, tomar las primeras 2 letras
            commercialInitials = words[0].substring(0, 2).toUpperCase();
        }
    }
    // Asegurar máximo 2 caracteres
    commercialInitials = commercialInitials.substring(0, 2);
    
    // Obtener número de propuesta del comercial (contar propuestas existentes + 1)
    let proposalNumber = '01'; // Por defecto, primera propuesta
    if (commercialName && window.cartManager && window.cartManager.supabase) {
        try {
            const { data: proposals, error } = await window.cartManager.supabase
                .from('presupuestos')
                .select('id')
                .eq('nombre_comercial', commercialName);
            
            if (!error && proposals) {
                // Contar propuestas existentes y sumar 1 para la nueva
                const proposalCount = proposals.length + 1;
                proposalNumber = String(proposalCount).padStart(2, '0'); // Asegurar 2 dígitos
            }
        } catch (error) {
            console.error('Error al contar propuestas del comercial:', error);
            // En caso de error, usar '01' por defecto
        }
    }
    
    // Concatenar todo sin separadores
    // Formato: Día + Mes + Iniciales Comercial + Número Propuesta + Año
    const code = day + month + commercialInitials + proposalNumber + year;
    
    console.log('🔢 Código de propuesta generado:', {
        day,
        month,
        commercialName,
        commercialInitials,
        proposalNumber,
        year,
        code
    });
    
    return code;
}

/**
 * Enviar propuesta a Supabase
 */
async function sendProposalToSupabase() {
    if (!window.cartManager) {
        console.error('CartManager no disponible');
        return;
    }

    // Validar que el carrito no esté vacío
    if (window.cartManager.cart.length === 0) {
        const message = window.cartManager.currentLanguage === 'es' ? 
            'El presupuesto está vacío' : 
            window.cartManager.currentLanguage === 'pt' ?
            'O orçamento está vazio' :
            'The budget is empty';
        window.cartManager.showNotification(message, 'error');
        return;
    }

    // Verificar si estamos editando una propuesta existente
    const isEditing = window.cartManager.editingProposalId !== null;
    
    let clientName, commercialName, proposalDate, proposalCountry, clientNumber;

    if (isEditing) {
        // Si se está editando, usar los datos existentes de la propuesta
        clientName = window.cartManager.editingProposalData?.nombre_cliente || '';
        commercialName = window.cartManager.editingProposalData?.nombre_comercial || '';
        proposalDate = window.cartManager.editingProposalData?.fecha_inicial || '';
        clientNumber = window.cartManager.editingProposalData?.numero_cliente || '0';
        // Para ediciones, obtener el país desde el campo pais de la propuesta o usar el idioma actual
        // Para ediciones, obtener el país desde el campo pais de la propuesta
        const paisFromData = window.cartManager.editingProposalData?.pais;
        if (paisFromData === 'España') {
            proposalCountry = 'es';
        } else if (paisFromData === 'Portugal') {
            proposalCountry = 'pt';
        } else {
            proposalCountry = 'pt'; // Valor por defecto
        }
    } else {
        // Si es una nueva propuesta, obtener datos del formulario
        clientName = document.getElementById('clientNameInput').value.trim();
        const commercialSelect = document.getElementById('commercialNameInput');
        commercialName = commercialSelect ? commercialSelect.value.trim() : '';
        proposalDate = document.getElementById('proposalDateInput').value;
        proposalCountry = document.getElementById('proposalCountryInput').value;
        const clientNumberInput = document.getElementById('clientNumberInput');
        clientNumber = clientNumberInput ? clientNumberInput.value.trim() : '';
        
        // Si el número de cliente está vacío, usar "0" (cliente no creado)
        if (!clientNumber) {
            clientNumber = '0';
        }

        // Validar campos obligatorios solo para nuevas propuestas
        if (!clientName || !commercialName || !proposalDate || !proposalCountry) {
            const message = window.cartManager.currentLanguage === 'es' ? 
                'Por favor completa todos los campos obligatorios' : 
                window.cartManager.currentLanguage === 'pt' ?
                'Por favor preencha todos os campos obrigatórios' :
                'Please fill in all required fields';
            window.cartManager.showNotification(message, 'error');
            return;
        }
    }

    // Verificar que Supabase esté inicializado
    if (!window.cartManager.supabase) {
        await window.cartManager.initializeSupabase();
        if (!window.cartManager.supabase) {
            const message = window.cartManager.currentLanguage === 'es' ? 
                'Error al conectar con la base de datos' : 
                window.cartManager.currentLanguage === 'pt' ?
                'Erro ao conectar com o banco de dados' :
                'Error connecting to database';
            window.cartManager.showNotification(message, 'error');
            return;
        }
    }

    try {
        let presupuesto;

        if (isEditing) {
            // Cuando se edita, solo actualizar los artículos
            // Los datos del cliente, comercial y fecha se mantienen iguales
            // La fecha de última modificación se actualiza automáticamente por el trigger de la base de datos
            
            presupuesto = {
                id: window.cartManager.editingProposalId,
                nombre_cliente: clientName,
                nombre_comercial: commercialName,
                fecha_inicial: proposalDate,
                numero_cliente: clientNumber || '0'
            };


            // Obtener artículos originales antes de eliminarlos para comparar
            const { data: articulosOriginales, error: fetchError } = await window.cartManager.supabase
                .from('presupuestos_articulos')
                .select('*')
                .eq('presupuesto_id', window.cartManager.editingProposalId);

            if (fetchError) {
                console.warn('⚠️ Error al obtener artículos originales:', fetchError);
            }

            // Eliminar artículos existentes
            const { error: deleteError } = await window.cartManager.supabase
                .from('presupuestos_articulos')
                .delete()
                .eq('presupuesto_id', window.cartManager.editingProposalId);

            if (deleteError) {
                console.warn('⚠️ Error al eliminar artículos antiguos:', deleteError);
                throw deleteError;
            }

            // Preparar artículos nuevos del carrito para comparación
            const articulosNuevos = [];
            for (const item of window.cartManager.cart) {
                if (item.type === 'product' || item.type === 'special') {
                    const nombreArticulo = item.name || item.nombre || '';
                    const referenciaArticulo = item.referencia || item.id || '';
                    const cantidad = item.quantity || 1;
                    const precio = Number(item.price) || 0;
                    const observaciones = (item.observations || item.observations_text || '').trim();
                    // Normalizar tipo de personalización: obtener valor y limpiar
                    const tipoPersonalizacionRaw = item.personalization || item.tipo_personalizacion || '';
                    const tipoPersonalizacion = tipoPersonalizacionRaw ? String(tipoPersonalizacionRaw).trim() : '';

                    // Obtener variante de referencia seleccionada (color)
                    const varianteReferencia = (item.selectedReferenceVariant !== null && item.selectedReferenceVariant !== undefined) 
                        ? parseInt(item.selectedReferenceVariant) 
                        : null;

                    articulosNuevos.push({
                        nombre_articulo: nombreArticulo,
                        referencia_articulo: referenciaArticulo,
                        cantidad: cantidad,
                        precio: precio,
                        observaciones: observaciones,
                        tipo_personalizacion: tipoPersonalizacion,
                        variante_referencia: varianteReferencia
                    });
                }
            }

            // Comparar y generar registro de ediciones
            const cambios = window.cartManager.compareArticlesAndGenerateEdits(
                articulosOriginales || [],
                articulosNuevos
            );

            // Actualizar el presupuesto con el número de cliente si cambió
            const { error: updateError } = await window.cartManager.supabase
                .from('presupuestos')
                .update({ numero_cliente: clientNumber || '0' })
                .eq('id', window.cartManager.editingProposalId);

            if (updateError) {
                console.warn('⚠️ Error al actualizar número de cliente:', updateError);
            }

            // Registrar las ediciones en historial_modificaciones
            if (cambios.length > 0) {
                await window.cartManager.registrarEdicionesPropuesta(
                    window.cartManager.editingProposalId,
                    cambios,
                    commercialName
                );
            }
        } else {
            // Crear nueva propuesta
            // Todas las propuestas se registran como "propuesta en curso"
            const estadoInicial = 'propuesta_en_curso';
            
            console.log('📋 Estado inicial de la propuesta:', estadoInicial);
            
            // Generar código identificador de la propuesta
            const codigoPropuesta = await generateProposalCode(proposalDate, commercialName, clientName);
            
            // Determinar país completo según selección
            const paisCompleto = proposalCountry === 'es' ? 'España' : 'Portugal';
            
            const presupuestoData = {
                nombre_cliente: clientName,
                nombre_comercial: commercialName,
                fecha_inicial: proposalDate,
                estado_propuesta: estadoInicial,
                codigo_propuesta: codigoPropuesta,
                pais: paisCompleto,
                numero_cliente: clientNumber || '0'
            };


            const { data: newPresupuesto, error: presupuestoError } = await window.cartManager.supabase
                .from('presupuestos')
                .insert([presupuestoData])
                .select()
                .single();

            if (presupuestoError) {
                throw presupuestoError;
            }

            presupuesto = newPresupuesto;
            console.log('✅ Presupuesto guardado:', presupuesto);
        }

        // Preparar artículos del presupuesto
        const articulos = [];
        const cart = window.cartManager.cart;

        for (const item of cart) {
            // Solo procesar productos y pedidos especiales
            if (item.type === 'product' || item.type === 'special') {
                // Para productos, recalcular el precio según la cantidad actual antes de guardar
                if (item.type === 'product') {
                    // Asegurar que tenemos los price_tiers
                    if (!item.price_tiers || item.price_tiers.length === 0) {
                        const productFromDB = window.cartManager.allProducts.find(p => {
                            return String(p.id) === String(item.id) || p.id === item.id;
                        });
                        if (productFromDB && productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
                            item.price_tiers = productFromDB.price_tiers;
                        }
                        if (!item.basePrice && productFromDB) {
                            item.basePrice = productFromDB.precio || item.price || 0;
                        }
                    }
                    
                    // Determinar qué price_tiers usar: variante seleccionada o base
                    let priceTiersToUse = item.price_tiers || [];
                    if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                        const selectedVariant = item.variants[item.selectedVariant];
                        if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
                            priceTiersToUse = selectedVariant.price_tiers;
                        }
                    }
                    
                    // Recalcular precio según escalones con la cantidad actual
                    if (priceTiersToUse && Array.isArray(priceTiersToUse) && priceTiersToUse.length > 0) {
                        const basePriceForCalc = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
                        const priceResult = window.cartManager.getPriceForQuantity(priceTiersToUse, item.quantity, basePriceForCalc);
                        item.price = priceResult.price;
                    } else if (item.basePrice !== undefined && item.basePrice !== null) {
                        item.price = item.basePrice;
                    }
                }

                // Determinar si tiene precio personalizado
                let precioPersonalizado = false;
                let tipoPersonalizacion = null;

                if (item.type === 'product') {
                    // Es personalizado si hay una variante seleccionada
                    if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
                        precioPersonalizado = true;
                        const selectedVariant = item.variants[item.selectedVariant];
                        tipoPersonalizacion = selectedVariant?.name || 'Personalizado';
                    } else {
                        // Sin personalización
                        tipoPersonalizacion = window.cartManager.currentLanguage === 'es' ? 
                            'Sin personalización' : 
                            window.cartManager.currentLanguage === 'pt' ?
                            'Sem personalização' :
                            'No customization';
                    }
                } else if (item.type === 'special') {
                    // Pedidos especiales siempre son personalizados
                    precioPersonalizado = true;
                    tipoPersonalizacion = 'Pedido Especial';
                }

                // Obtener nombre y referencia
                const nombreArticulo = item.name || '';
                const referenciaArticulo = item.referencia || item.id || '';
                const cantidad = item.quantity || 1;
                const precio = Number(item.price) || 0; // Asegurar que sea número
                const observaciones = item.observations || item.observations_text || '';
                const plazoEntrega = item.plazoEntrega || item.plazo_entrega || null;

                console.log(`📦 Guardando artículo: ${nombreArticulo}, Cantidad: ${cantidad}, Precio: ${precio}`);

                // Obtener variante de referencia seleccionada (color)
                const varianteReferencia = (item.selectedReferenceVariant !== null && item.selectedReferenceVariant !== undefined) 
                    ? parseInt(item.selectedReferenceVariant) 
                    : null;

                articulos.push({
                    presupuesto_id: presupuesto.id,
                    nombre_articulo: nombreArticulo,
                    referencia_articulo: referenciaArticulo,
                    cantidad: cantidad,
                    precio: precio,
                    observaciones: observaciones || null,
                    precio_personalizado: precioPersonalizado,
                    tipo_personalizacion: tipoPersonalizacion,
                    plazo_entrega: plazoEntrega,
                    variante_referencia: varianteReferencia,
                    logo_url: item.logoUrl || null
                });
            }
        }

        console.log('📦 Artículos a guardar:', articulos);

        // Insertar artículos
        let articulosData = null;
        if (articulos.length > 0) {
            const { data: insertedArticulos, error: articulosError } = await window.cartManager.supabase
                .from('presupuestos_articulos')
                .insert(articulos)
                .select();

            if (articulosError) {
                throw articulosError;
            }

            articulosData = insertedArticulos;
            console.log('✅ Artículos guardados:', articulosData);
        }
        
        // Renombrar logotipos temporales con el nombre del cliente después de guardar
        if (clientName && articulosData && articulosData.length > 0) {
            await renameTemporaryLogos(clientName, articulosData);
        }

        // Cerrar modal solo si se abrió (no cuando se está editando)
        if (!isEditing) {
            closeSendProposalModal();
        }

        // Limpiar datos de edición
        if (window.cartManager.editingProposalId) {
            localStorage.removeItem('editing_proposal');
            window.cartManager.editingProposalId = null;
            window.cartManager.editingProposalData = null;
            
            // Remover indicador de edición superior
            const indicator = document.getElementById('editing-proposal-indicator');
            if (indicator) {
                indicator.remove();
            }

            // Ocultar información en la barra del carrito
            const infoContainer = document.getElementById('editing-proposal-info');
            if (infoContainer) {
                infoContainer.style.display = 'none';
            }

            // Mostrar nuevamente el botón de crear propuesta
            const generateProposalBtn = document.getElementById('generateProposalBtn');
            if (generateProposalBtn) {
                generateProposalBtn.style.display = 'block';
            }

            // Restaurar texto del botón de enviar propuesta
            const sendProposalText = document.getElementById('send-proposal-text');
            if (sendProposalText) {
                if (window.cartManager.currentLanguage === 'es') {
                    sendProposalText.textContent = 'Enviar Propuesta';
                } else if (window.cartManager.currentLanguage === 'pt') {
                    sendProposalText.textContent = 'Enviar Proposta';
                } else {
                    sendProposalText.textContent = 'Send Proposal';
                }
            }
        }

        // Mostrar mensaje de éxito
        const message = window.cartManager.currentLanguage === 'es' ? 
            (isEditing ? 'Propuesta actualizada correctamente' : 'Propuesta enviada correctamente') : 
            window.cartManager.currentLanguage === 'pt' ?
            (isEditing ? 'Proposta atualizada com sucesso' : 'Proposta enviada com sucesso') :
            (isEditing ? 'Proposal updated successfully' : 'Proposal sent successfully');
        window.cartManager.showNotification(message, 'success');

        // Limpiar el carrito después de enviar
        window.cartManager.clearCart();
        
        // Mostrar mensaje de éxito
        const successMessage = window.cartManager.currentLanguage === 'es' ? 
            'Propuesta guardada correctamente' : 
            window.cartManager.currentLanguage === 'pt' ?
            'Proposta guardada com sucesso' :
            'Proposal saved successfully';
        window.cartManager.showNotification(successMessage, 'success');
        
        // Redirigir a consultar propuestas después de un breve delay
        setTimeout(() => {
            window.location.href = 'consultar-propuestas.html';
        }, 1500);

    } catch (error) {
        console.error('❌ Error al guardar propuesta:', error);
        const message = window.cartManager.currentLanguage === 'es' ? 
            `Error al guardar la propuesta: ${error.message}` : 
            window.cartManager.currentLanguage === 'pt' ?
            `Erro ao salvar a proposta: ${error.message}` :
            `Error saving proposal: ${error.message}`;
        window.cartManager.showNotification(message, 'error');
    }
}

// Agregar event listener al formulario
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('sendProposalForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            sendProposalToSupabase();
        });
    }

    // Traducciones para el modal
    const updateSendProposalModalTranslations = () => {
        const lang = localStorage.getItem('language') || 'pt';
        const translations = {
            pt: {
                title: 'Enviar Proposta',
                clientName: 'Nome do Cliente *',
                commercialName: 'Nome do Comercial *',
                proposalDate: 'Data do Pedido *',
                proposalCountry: 'País *',
                clientNumber: 'Número de Cliente *',
                cancel: 'Cancelar',
                send: 'Enviar Proposta'
            },
            es: {
                title: 'Enviar Propuesta',
                clientName: 'Nombre del Cliente *',
                commercialName: 'Nombre del Comercial *',
                proposalDate: 'Fecha del Pedido *',
                proposalCountry: 'País *',
                clientNumber: 'Número de Cliente *',
                cancel: 'Cancelar',
                send: 'Enviar Propuesta'
            },
            en: {
                title: 'Send Proposal',
                clientName: 'Client Name *',
                commercialName: 'Commercial Name *',
                proposalDate: 'Order Date *',
                proposalCountry: 'Country *',
                clientNumber: 'Client Number',
                cancel: 'Cancel',
                send: 'Send Proposal'
            }
        };

        const t = translations[lang] || translations.pt;

        const titleEl = document.getElementById('send-proposal-modal-title');
        const clientNameLabel = document.getElementById('client-name-label');
        const commercialNameLabel = document.getElementById('commercial-name-label');
        const proposalDateLabel = document.getElementById('proposal-date-label');
        const proposalCountryLabel = document.getElementById('proposal-country-label');
        const clientNumberLabel = document.getElementById('client-number-label');
        const cancelBtn = document.getElementById('cancel-send-proposal-btn');
        const sendBtn = document.getElementById('send-proposal-submit-text');

        if (titleEl) titleEl.textContent = t.title;
        if (clientNameLabel) clientNameLabel.textContent = t.clientName;
        if (commercialNameLabel) commercialNameLabel.textContent = t.commercialName;
        if (proposalDateLabel) proposalDateLabel.textContent = t.proposalDate;
        if (proposalCountryLabel) proposalCountryLabel.textContent = t.proposalCountry;
        if (clientNumberLabel) clientNumberLabel.textContent = t.clientNumber;
        const selectCountryOption = document.getElementById('select-country-option');
        if (selectCountryOption) {
            selectCountryOption.textContent = lang === 'pt' ? 'Selecionar país...' : 
                                            lang === 'es' ? 'Seleccionar país...' : 
                                            'Select country...';
        }
        if (cancelBtn) cancelBtn.textContent = t.cancel;
        if (sendBtn) sendBtn.textContent = t.send;
    };

    // Actualizar traducciones al cargar
    updateSendProposalModalTranslations();

    // Actualizar traducciones cuando cambie el idioma
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.addEventListener('change', updateSendProposalModalTranslations);
    }
});

/**
 * Mostrar modal con imagen ampliada
 */
function showImageModal(imageUrl, productName) {
    // Crear modal si no existe
    let modal = document.getElementById('image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <span class="image-modal-close">&times;</span>
                <img class="image-modal-img" src="" alt="">
                <div class="image-modal-title"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Cerrar al hacer clic en la X o fuera del modal
        const closeBtn = modal.querySelector('.image-modal-close');
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Cerrar con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
    
    // Actualizar contenido
    const img = modal.querySelector('.image-modal-img');
    const title = modal.querySelector('.image-modal-title');
    img.src = imageUrl;
    img.alt = productName;
    title.textContent = productName;
    
    // Mostrar modal
    modal.style.display = 'block';
}

/**
 * Mostrar modal con escalones de precios
 */
function showPriceTiersModal(itemId, productName) {
    if (!window.cartManager) {
        console.error('CartManager no disponible');
        return;
    }
    
    // Buscar el item en el carrito por cartItemId primero (para items duplicados), luego por id como fallback
    const item = window.cartManager.cart.find(i => {
        // Si itemId empieza con "cart-item-", es un cartItemId
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return i.cartItemId === itemId || String(i.cartItemId) === String(itemId);
        }
        // Si no, buscar por cartItemId o id (compatibilidad con items antiguos)
        return (i.cartItemId && (String(i.cartItemId) === String(itemId) || i.cartItemId === itemId)) ||
               (String(i.id) === String(itemId) || i.id === itemId);
    });
    
    if (!item || item.type !== 'product') {
        console.error('Item no encontrado o no es un producto');
        return;
    }
    
    // Determinar qué price_tiers usar: variante seleccionada o base
    let priceTiersToUse = item.price_tiers || [];
    
    // Si hay una variante seleccionada, usar sus price_tiers
    if (item.selectedVariant !== null && item.selectedVariant !== undefined && item.variants && item.variants.length > 0) {
        const selectedVariant = item.variants[item.selectedVariant];
        if (selectedVariant && selectedVariant.price_tiers && selectedVariant.price_tiers.length > 0) {
            priceTiersToUse = selectedVariant.price_tiers;
        }
    }
    
    // Si no hay escalones, intentar obtenerlos de la BD
    if (!priceTiersToUse || priceTiersToUse.length === 0) {
        const productFromDB = window.cartManager.allProducts.find(p => p.id === item.id);
        if (productFromDB && productFromDB.price_tiers && productFromDB.price_tiers.length > 0) {
            priceTiersToUse = productFromDB.price_tiers;
        }
    }
    
    // Obtener precio base
    const basePrice = item.basePrice !== undefined && item.basePrice !== null ? item.basePrice : (item.price || 0);
    
    // Crear modal si no existe
    let modal = document.getElementById('price-tiers-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'price-tiers-modal';
        modal.className = 'price-tiers-modal';
        modal.innerHTML = `
            <div class="price-tiers-modal-content">
                <div class="price-tiers-modal-header">
                    <h3 class="price-tiers-modal-title"></h3>
                    <span class="price-tiers-modal-close">&times;</span>
                </div>
                <div class="price-tiers-modal-body">
                    <div class="price-tiers-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Cerrar al hacer clic en la X o fuera del modal
        const closeBtn = modal.querySelector('.price-tiers-modal-close');
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Cerrar con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
    
    // Actualizar contenido
    const title = modal.querySelector('.price-tiers-modal-title');
    const list = modal.querySelector('.price-tiers-list');
    
    const lang = window.cartManager?.currentLanguage || 'es';
    const translations = {
        es: {
            title: 'Escalones de Precio',
            noTiers: 'Este producto no tiene escalones de precio configurados.',
            basePrice: 'Precio base',
            from: 'Desde',
            to: 'Hasta',
            units: 'unidades',
            price: 'Precio',
            currentQuantity: 'Cantidad actual',
            currentPrice: 'Precio actual'
        },
        pt: {
            title: 'Escalões de Preço',
            noTiers: 'Este produto não tem escalões de preço configurados.',
            basePrice: 'Preço base',
            from: 'De',
            to: 'Até',
            units: 'unidades',
            price: 'Preço',
            currentQuantity: 'Quantidade atual',
            currentPrice: 'Preço atual'
        },
        en: {
            title: 'Price Tiers',
            noTiers: 'This product does not have price tiers configured.',
            basePrice: 'Base price',
            from: 'From',
            to: 'To',
            units: 'units',
            price: 'Price',
            currentQuantity: 'Current quantity',
            currentPrice: 'Current price'
        }
    };
    
    const t = translations[lang] || translations.es;
    title.textContent = `${t.title} - ${productName}`;
    
    if (!priceTiersToUse || priceTiersToUse.length === 0) {
        list.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">${t.noTiers}</p>`;
    } else {
        // Ordenar escalones por cantidad mínima
        const sortedTiers = [...priceTiersToUse].sort((a, b) => {
            const minA = a?.min_qty !== null && a?.min_qty !== undefined ? Number(a.min_qty) : 0;
            const minB = b?.min_qty !== null && b?.min_qty !== undefined ? Number(b.min_qty) : 0;
            return minA - minB;
        });
        
        // Obtener precio actual
        const currentQuantity = item.quantity || 1;
        const priceResult = window.cartManager.getPriceForQuantity(priceTiersToUse, currentQuantity, basePrice);
        const currentPrice = priceResult.price;
        
        let html = `
            <div class="price-tiers-current">
                <div class="price-tiers-current-info">
                    <div>
                        <div class="price-tiers-current-label">${t.currentQuantity}: ${currentQuantity} ${t.units}</div>
                        <div class="price-tiers-current-value">${t.currentPrice}: €${currentPrice.toFixed(2)}</div>
                    </div>
                    <i class="fas fa-info-circle price-tiers-current-icon"></i>
                </div>
            </div>
            <div class="price-tiers-table">
                <table>
                    <thead>
                        <tr>
                            <th>${t.from}</th>
                            <th>${t.to}</th>
                            <th style="text-align: right;">${t.price}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sortedTiers.forEach((tier, index) => {
            const minQty = tier?.min_qty !== null && tier?.min_qty !== undefined ? Number(tier.min_qty) : 0;
            const maxQty = tier?.max_qty !== null && tier?.max_qty !== undefined ? Number(tier.max_qty) : null;
            const tierPrice = tier?.price !== null && tier?.price !== undefined ? Number(tier.price) : basePrice;
            
            const isCurrentTier = currentQuantity >= minQty && (maxQty === null || currentQuantity <= maxQty);
            
            html += `
                <tr class="${isCurrentTier ? 'active-tier' : ''}">
                    <td>${minQty} ${t.units}</td>
                    <td>${maxQty !== null ? `${maxQty} ${t.units}` : '∞'}</td>
                    <td class="price-cell">
                        €${tierPrice.toFixed(2)}
                        ${isCurrentTier ? '<i class="fas fa-check-circle check-icon"></i>' : ''}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        list.innerHTML = html;
    }
    
    // Mostrar modal
    modal.style.display = 'block';
}

/**
 * Normalizar nombre del cliente para usar en nombres de archivo
 */
function normalizeClientName(clientName) {
    if (!clientName) return 'cliente-sin-nombre';
    
    return clientName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
        .replace(/[^a-z0-9]/g, '-') // Reemplazar caracteres especiales con guiones
        .replace(/-+/g, '-') // Reemplazar múltiples guiones con uno solo
        .replace(/^-|-$/g, ''); // Eliminar guiones al inicio y final
}

/**
 * Manejar la subida de logotipo para un producto con variante personalizada
 */
async function handleLogoUpload(itemId, file) {
    if (!file) return;
    
    if (!window.cartManager || !window.cartManager.supabase) {
        alert('Error: No se pudo conectar con la base de datos. Por favor, recarga la página.');
        return;
    }
    
    // Validar tipo de archivo
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.svg'];
    const fileExtensionWithDot = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtensionWithDot)) {
        const lang = window.cartManager.currentLanguage || 'es';
        const errorMsg = lang === 'es' 
            ? 'Tipo de archivo no válido. Solo se permiten PDF, PNG, JPG, JPEG o SVG.'
            : lang === 'pt'
            ? 'Tipo de arquivo inválido. Apenas são permitidos PDF, PNG, JPG, JPEG ou SVG.'
            : 'Invalid file type. Only PDF, PNG, JPG, JPEG or SVG are allowed.';
        alert(errorMsg);
        return;
    }
    
    // Validar tamaño (máximo 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
        const lang = window.cartManager.currentLanguage || 'es';
        const errorMsg = lang === 'es'
            ? 'El archivo es demasiado grande. El tamaño máximo es 2MB.'
            : lang === 'pt'
            ? 'O arquivo é muito grande. O tamanho máximo é 2MB.'
            : 'File is too large. Maximum size is 2MB.';
        alert(errorMsg);
        return;
    }
    
    // Buscar el item en el carrito
    const item = window.cartManager.cart.find(item => {
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (!item) {
        alert('Error: Producto no encontrado en el carrito.');
        return;
    }
    
    // Obtener nombre del cliente del formulario (opcional, solo para verificar logotipos existentes)
    const clientNameInput = document.getElementById('clientNameInput');
    const clientName = clientNameInput ? clientNameInput.value.trim() : '';
    
    const fileExtension = file.name.split('.').pop().toLowerCase(); // Sin punto para usar en nombres de archivo
    
    // Crear un cliente específico para Storage sin headers globales que interfieran
    // Esto evita que el header 'Content-Type': 'application/json' afecte las subidas de archivos
    let storageClient;
    try {
        if (typeof supabase !== 'undefined' && window.SUPABASE_CONFIG) {
            // Crear un cliente nuevo sin headers globales para Storage
            storageClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                },
                // NO incluir 'global.headers' para que Supabase maneje automáticamente el Content-Type según el archivo
            });
            // Copiar la sesión del cliente principal si existe
            if (window.cartManager.supabase && window.cartManager.supabase.auth) {
                const { data: { session } } = await window.cartManager.supabase.auth.getSession();
                if (session) {
                    await storageClient.auth.setSession(session);
                }
            }
        } else {
            // Fallback al cliente compartido si no podemos crear uno nuevo
            storageClient = window.cartManager.supabase;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo crear cliente específico para Storage, usando cliente compartido:', error);
        storageClient = window.cartManager.supabase;
    }
    
    // Asegurarse de que el archivo tenga el tipo MIME correcto
    let finalFile = file;
    if (!file.type || file.type === 'application/json' || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) {
        const fileExt = file.name.split('.').pop().toLowerCase();
        const mimeTypeMap = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf'
        };
        const correctMimeType = mimeTypeMap[fileExt] || 'image/png';
        console.log(`🔧 Corrigiendo tipo MIME de "${file.type}" a "${correctMimeType}"`);
        finalFile = new File([file], file.name, { type: correctMimeType });
    }
    
    try {
        let logoUrl;
        let clientLogos = [];
        
        // Si hay nombre de cliente, verificar si existen logotipos para ese cliente
        if (clientName) {
            const normalizedClientName = normalizeClientName(clientName);
            
            // Listar todos los archivos en la carpeta logos
            const { data: existingFiles, error: listError } = await storageClient.storage
                .from('proposal-logos')
                .list('logos');
            
            // Filtrar archivos que pertenecen a este cliente
            if (!listError && existingFiles && existingFiles.length > 0) {
                for (const existingFile of existingFiles) {
                    const fileNameWithoutExt = existingFile.name.replace(/\.[^/.]+$/, '');
                    // Verificar si el nombre del archivo coincide exactamente con el nombre del cliente
                    // o si empieza con el nombre del cliente seguido de un guión y un número
                    const exactMatch = fileNameWithoutExt === normalizedClientName;
                    const numberedMatch = fileNameWithoutExt.match(new RegExp(`^${normalizedClientName}-\\d+$`));
                    
                    if (exactMatch || numberedMatch) {
                        const { data: urlData } = storageClient.storage
                            .from('proposal-logos')
                            .getPublicUrl(`logos/${existingFile.name}`);
                        
                        clientLogos.push({
                            name: existingFile.name,
                            url: urlData.publicUrl,
                            size: existingFile.metadata?.size || 0,
                            updated: existingFile.updated_at || existingFile.created_at || ''
                        });
                    }
                }
            }
        }
        
        // Verificar si hay otros productos en el carrito que ya tienen logos cargados
        const otherItemsWithLogos = window.cartManager.cart.filter(cartItem => 
            cartItem.type === 'product' && 
            cartItem.cartItemId !== item.cartItemId &&
            cartItem.logoUrl && 
            cartItem.logoUrl.trim() !== ''
        );
        
        // Si existen logotipos para este cliente O hay otros productos con logos, mostrar modal
        if (clientLogos.length > 0 || otherItemsWithLogos.length > 0) {
            // Combinar logos del cliente con logos de otros productos del carrito
            const allAvailableLogos = [...clientLogos];
            
            // Agregar logos de otros productos del carrito (sin duplicados)
            otherItemsWithLogos.forEach(otherItem => {
                if (otherItem.logoUrl && !allAvailableLogos.find(l => l.url === otherItem.logoUrl)) {
                    allAvailableLogos.push({
                        name: otherItem.name || 'Producto',
                        url: otherItem.logoUrl,
                        size: 0,
                        updated: '',
                        isFromCart: true
                    });
                }
            });
            
            // Mostrar modal con logotipos existentes (del cliente y de otros productos)
            const selectedLogo = await showClientLogosModal(clientName, allAvailableLogos, file);
            
            if (selectedLogo === null) {
                // Usuario canceló
                return;
            } else if (selectedLogo === 'new') {
                // Usuario quiere subir un nuevo logotipo
                // Generar nombre temporal basado en timestamp e ID del item
                const timestamp = Date.now();
                const itemIdForFile = item.cartItemId || item.id || 'item';
                const tempFileName = `logos/temp-${timestamp}-${itemIdForFile}.${fileExtension}`;
                
                // Subir nuevo logotipo con nombre temporal
                const { data, error } = await storageClient.storage
                    .from('proposal-logos')
                    .upload(tempFileName, finalFile, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: finalFile.type
                    });
                
                if (error) {
                    throw error;
                }
                
                // Obtener URL pública
                const { data: urlData } = storageClient.storage
                    .from('proposal-logos')
                    .getPublicUrl(tempFileName);
                
                logoUrl = urlData.publicUrl;
            } else {
                // Usuario seleccionó un logotipo existente
                logoUrl = selectedLogo;
            }
        } else {
            // No hay logotipos existentes o no hay nombre de cliente
            // Generar nombre temporal basado en timestamp e ID del item
            const timestamp = Date.now();
            const itemIdForFile = item.cartItemId || item.id || 'item';
            const tempFileName = `logos/temp-${timestamp}-${itemIdForFile}.${fileExtension}`;
            
            // Subir logotipo con nombre temporal
            const { data, error } = await storageClient.storage
                .from('proposal-logos')
                .upload(tempFileName, finalFile, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: finalFile.type
                });
            
            if (error) {
                throw error;
            }
            
            // Obtener URL pública
            const { data: urlData } = storageClient.storage
                .from('proposal-logos')
                .getPublicUrl(tempFileName);
            
            logoUrl = urlData.publicUrl;
        }
        
        // Guardar URL en el item del carrito (solo para este producto específico)
        item.logoUrl = logoUrl;
        window.cartManager.saveCart();
        window.cartManager.renderCart();
        
        const lang = window.cartManager.currentLanguage || 'es';
        const successMsg = lang === 'es'
            ? 'Logotipo subido correctamente.'
            : lang === 'pt'
            ? 'Logotipo carregado com sucesso.'
            : 'Logo uploaded successfully.';
        
        showQuickNotification(successMsg);
        
    } catch (error) {
        console.error('Error subiendo logotipo:', error);
        const lang = window.cartManager.currentLanguage || 'es';
        const errorMsg = lang === 'es'
            ? 'Error al subir el logotipo: ' + error.message
            : lang === 'pt'
            ? 'Erro ao carregar o logotipo: ' + error.message
            : 'Error uploading logo: ' + error.message;
        alert(errorMsg);
    }
}

/**
 * Extraer ruta del archivo desde la URL del logo
 * @param {string} url - URL del logo
 * @returns {string|null} - Ruta del archivo o null si no se puede extraer
 */
function extractLogoFilePathFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Patrón: https://[project].supabase.co/storage/v1/object/public/proposal-logos/logos/[filename]
    const match = url.match(/\/storage\/v1\/object\/public\/proposal-logos\/(.+)$/);
    if (match && match[1]) {
        return decodeURIComponent(match[1]);
    }
    
    // Si la URL ya es una ruta relativa (logos/filename.jpg o temp-...)
    if (url.startsWith('logos/') || url.startsWith('temp-')) {
        return url;
    }
    
    return null;
}

/**
 * Eliminar logo del bucket de Supabase Storage
 * @param {string} logoUrl - URL del logo a eliminar
 * @returns {Promise<boolean>} - true si se eliminó correctamente, false en caso contrario
 */
async function deleteLogoFromStorage(logoUrl) {
    if (!logoUrl) return false;
    
    try {
        const filePath = extractLogoFilePathFromUrl(logoUrl);
        if (!filePath) {
            console.warn('⚠️ No se pudo extraer la ruta del logo desde la URL:', logoUrl);
            return false;
        }
        
        // Crear cliente específico para Storage
        let storageClient;
        if (typeof supabase !== 'undefined' && window.SUPABASE_CONFIG) {
            storageClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            // Copiar sesión si existe
            if (window.cartManager && window.cartManager.supabase && window.cartManager.supabase.auth) {
                const { data: { session } } = await window.cartManager.supabase.auth.getSession();
                if (session) {
                    await storageClient.auth.setSession(session);
                }
            }
        } else if (window.cartManager && window.cartManager.supabase) {
            storageClient = window.cartManager.supabase;
        } else {
            console.warn('⚠️ Cliente de Supabase no disponible');
            return false;
        }
        
        if (!storageClient || !storageClient.storage) {
            console.warn('⚠️ Cliente de Storage no disponible');
            return false;
        }
        
        const { error } = await storageClient.storage
            .from('proposal-logos')
            .remove([filePath]);
        
        if (error) {
            console.error('❌ Error al eliminar logo del bucket:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar logo del bucket:', error);
        return false;
    }
}

/**
 * Remover logotipo de un producto
 */
async function removeLogo(itemId) {
    if (!window.cartManager) {
        alert('Error: Sistema de carrito no disponible.');
        return;
    }
    
    const item = window.cartManager.cart.find(item => {
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (!item) {
        alert('Error: Producto no encontrado en el carrito.');
        return;
    }
    
    const lang = window.cartManager.currentLanguage || 'es';
    const confirmMsg = lang === 'es'
        ? '¿Estás seguro de que deseas eliminar el logotipo?'
        : lang === 'pt'
        ? 'Tem certeza de que deseja remover o logotipo?'
        : 'Are you sure you want to remove the logo?';
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    // Obtener la URL del logo antes de eliminarlo
    const logoUrl = item.logoUrl;
    
    // Eliminar el logo del bucket de Supabase Storage si existe
    if (logoUrl) {
        const deleted = await deleteLogoFromStorage(logoUrl);
        if (!deleted) {
            const lang = window.cartManager.currentLanguage || 'es';
            const warningMsg = lang === 'es'
                ? 'El logotipo se eliminó del carrito, pero no se pudo eliminar del almacenamiento. Puede que ya haya sido eliminado.'
                : lang === 'pt'
                ? 'O logotipo foi removido do carrinho, mas não foi possível removê-lo do armazenamento. Pode já ter sido removido.'
                : 'The logo was removed from the cart, but could not be removed from storage. It may have already been deleted.';
            console.warn('⚠️', warningMsg);
        }
    }
    
    // Eliminar URL del logotipo del item
    delete item.logoUrl;
    window.cartManager.saveCart();
    window.cartManager.renderCart();
    
    const successMsg = lang === 'es'
        ? 'Logotipo eliminado.'
        : lang === 'pt'
        ? 'Logotipo removido.'
        : 'Logo removed.';
    
    showQuickNotification(successMsg);
}

/**
 * Verificar si existe un logotipo guardado para el cliente y sugerir usarlo
 */
async function checkAndSuggestClientLogo(itemId) {
    if (!window.cartManager || !window.cartManager.supabase) {
        return;
    }
    
    // Obtener nombre del cliente del formulario (opcional)
    const clientNameInput = document.getElementById('clientNameInput');
    const clientName = clientNameInput ? clientNameInput.value.trim() : '';
    
    // Si no hay nombre de cliente, no buscar logotipos existentes
    if (!clientName) {
        return;
    }
    
    // Buscar el item en el carrito
    const item = window.cartManager.cart.find(item => {
        if (itemId && itemId.toString().startsWith('cart-item-')) {
            return item.cartItemId === itemId || String(item.cartItemId) === String(itemId);
        }
        return (item.cartItemId && (String(item.cartItemId) === String(itemId) || item.cartItemId === itemId)) ||
               (String(item.id) === String(itemId) || item.id === itemId);
    });
    
    if (!item || item.logoUrl) {
        return; // Item no encontrado o ya tiene logotipo
    }
    
    // Normalizar nombre del cliente
    const normalizedClientName = normalizeClientName(clientName);
    
    try {
        // Buscar logotipos existentes para este cliente
        // Listar todos los archivos en la carpeta logos
        const { data: existingFiles, error: listError } = await window.cartManager.supabase.storage
            .from('proposal-logos')
            .list('logos');
        
        if (listError || !existingFiles || existingFiles.length === 0) {
            return; // No hay logotipos para este cliente
        }
        
        // Filtrar archivos que pertenecen a este cliente
        const clientLogos = [];
        for (const file of existingFiles) {
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            // Verificar si el nombre del archivo coincide exactamente con el nombre del cliente
            // o si empieza con el nombre del cliente seguido de un guión y un número
            const exactMatch = fileNameWithoutExt === normalizedClientName;
            const numberedMatch = fileNameWithoutExt.match(new RegExp(`^${normalizedClientName}-\\d+$`));
            
            if (exactMatch || numberedMatch) {
                const { data: urlData } = window.cartManager.supabase.storage
                    .from('proposal-logos')
                    .getPublicUrl(`logos/${file.name}`);
                
                clientLogos.push({
                    name: file.name,
                    url: urlData.publicUrl
                });
            }
        }
        
        if (clientLogos.length > 0) {
            // Si hay múltiples logotipos, mostrar modal
            // Si hay solo uno, preguntar directamente
            if (clientLogos.length === 1) {
                const lang = window.cartManager.currentLanguage || 'es';
                const confirmMsg = lang === 'es'
                    ? `Se encontró un logotipo guardado para el cliente "${clientName}". ¿Deseas usarlo para este producto?`
                    : lang === 'pt'
                    ? `Foi encontrado um logotipo salvo para o cliente "${clientName}". Deseja usá-lo para este produto?`
                    : `A saved logo was found for client "${clientName}". Do you want to use it for this product?`;
                
                const useExisting = confirm(confirmMsg);
                
                if (useExisting) {
                    // Aplicar el logotipo existente
                    item.logoUrl = clientLogos[0].url;
                    window.cartManager.saveCart();
                    window.cartManager.renderCart();
                    
                    const successMsg = lang === 'es'
                        ? 'Logotipo del cliente aplicado correctamente.'
                        : lang === 'pt'
                        ? 'Logotipo do cliente aplicado com sucesso.'
                        : 'Client logo applied successfully.';
                    
                    showQuickNotification(successMsg);
                }
            } else {
                // Múltiples logotipos - mostrar modal (aunque no hay archivo nuevo, solo para seleccionar)
                // En este caso, no se puede subir uno nuevo desde aquí, solo seleccionar existente
                const selectedLogo = await showClientLogosModal(clientName, clientLogos, null);
                
                if (selectedLogo && selectedLogo !== 'new' && selectedLogo !== null) {
                    item.logoUrl = selectedLogo;
                    window.cartManager.saveCart();
                    window.cartManager.renderCart();
                    
                    const lang = window.cartManager.currentLanguage || 'es';
                    const successMsg = lang === 'es'
                        ? 'Logotipo del cliente aplicado correctamente.'
                        : lang === 'pt'
                        ? 'Logotipo do cliente aplicado com sucesso.'
                        : 'Client logo applied successfully.';
                    
                    showQuickNotification(successMsg);
                }
            }
        }
    } catch (error) {
        console.error('Error verificando logotipo del cliente:', error);
        // No mostrar error al usuario, solo registrar en consola
    }
}

/**
 * Mostrar modal con logotipos existentes del cliente
 */
async function showClientLogosModal(clientName, clientLogos, newFile) {
    return new Promise((resolve) => {
        const modal = document.getElementById('clientLogoModal');
        const modalBody = document.getElementById('clientLogoModalBody');
        const modalTitle = document.getElementById('clientLogoModalTitle');
        
        if (!modal || !modalBody || !modalTitle) {
            // Si no existe el modal, usar confirm simple
            const lang = window.cartManager.currentLanguage || 'es';
            const confirmMsg = lang === 'es'
                ? `Ya existen ${clientLogos.length} logotipo(s) guardado(s) para el cliente "${clientName}". ¿Deseas subir un nuevo logotipo?`
                : lang === 'pt'
                ? `Já existem ${clientLogos.length} logotipo(s) salvo(s) para o cliente "${clientName}". Deseja carregar um novo logotipo?`
                : `${clientLogos.length} logo(s) already exist for client "${clientName}". Do you want to upload a new logo?`;
            
            const uploadNew = confirm(confirmMsg);
            if (uploadNew) {
                resolve('new');
            } else {
                // Usar el primer logotipo existente
                resolve(clientLogos[0].url);
            }
            return;
        }
        
        const lang = window.cartManager.currentLanguage || 'es';
        const translations = {
            es: {
                title: clientName ? `Logotipos del Cliente: ${clientName}` : 'Logotipos Disponibles',
                subtitle: 'Selecciona un logotipo existente o sube uno nuevo',
                selectExisting: 'Usar este logotipo',
                uploadNew: 'Subir nuevo logotipo',
                cancel: 'Cancelar',
                noPreview: 'Vista previa no disponible',
                fromPreviousProduct: ' (de producto anterior)',
                fromClient: ' (del cliente)'
            },
            pt: {
                title: clientName ? `Logotipos do Cliente: ${clientName}` : 'Logotipos Disponíveis',
                subtitle: 'Selecione um logotipo existente ou carregue um novo',
                selectExisting: 'Usar este logotipo',
                uploadNew: 'Carregar novo logotipo',
                cancel: 'Cancelar',
                noPreview: 'Pré-visualização não disponível',
                fromPreviousProduct: ' (de produto anterior)',
                fromClient: ' (do cliente)'
            },
            en: {
                title: clientName ? `Client Logos: ${clientName}` : 'Available Logos',
                subtitle: 'Select an existing logo or upload a new one',
                selectExisting: 'Use this logo',
                uploadNew: 'Upload new logo',
                cancel: 'Cancel',
                noPreview: 'Preview not available',
                fromPreviousProduct: ' (from previous product)',
                fromClient: ' (from client)'
            }
        };
        
        const t = translations[lang] || translations.es;
        modalTitle.textContent = t.title;
        
        // Crear HTML del modal
        let logosHTML = `<p style="margin-bottom: 20px; color: var(--text-secondary);">${t.subtitle}</p>`;
        logosHTML += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">';
        
        clientLogos.forEach((logo, index) => {
            const isImage = logo.url.match(/\.(jpg|jpeg|png|gif|svg)$/i);
            const isPdf = logo.url.match(/\.pdf$/i);
            const logoLabel = logo.isFromCart ? 
                `${logo.name}${t.fromPreviousProduct || ' (de producto anterior)'}` : 
                (logo.name || `Logo ${index + 1}${t.fromClient || ' (del cliente)'}`);
            
            logosHTML += `
                <div style="border: 2px solid var(--bg-gray-300); border-radius: 8px; padding: 15px; text-align: center; background: var(--bg-white);">
                    <div style="height: 150px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; background: var(--bg-gray-50); border-radius: 4px; overflow: hidden;">
                        ${isImage ? 
                            `<img src="${logo.url}" alt="Logo ${index + 1}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-image\\' style=\\'font-size: 3rem; color: var(--text-secondary);\\'></i>'">` :
                            isPdf ?
                            `<div style="text-align: center;">
                                <i class="fas fa-file-pdf" style="font-size: 3rem; color: #ef4444; margin-bottom: 10px;"></i>
                                <p style="font-size: 0.875rem; color: var(--text-secondary);">${t.noPreview}</p>
                            </div>` :
                            `<i class="fas fa-file" style="font-size: 3rem; color: var(--text-secondary);"></i>`
                        }
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 8px; min-height: 30px; display: flex; align-items: center; justify-content: center; word-break: break-word;">
                        ${logoLabel}
                    </div>
                    <button onclick="selectClientLogo('${logo.url}')" 
                            style="width: 100%; padding: 10px; background: #1d3557; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 600;">
                        ${t.selectExisting}
                    </button>
                </div>
            `;
        });
        
        logosHTML += '</div>';
        
        // Solo mostrar botón de "Subir nuevo" si hay un archivo nuevo para subir
        const showUploadNewButton = newFile !== null && newFile !== undefined;
        
        logosHTML += `
            <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--bg-gray-200); padding-top: 20px;">
                <button onclick="closeClientLogoModal()" 
                        style="padding: 10px 20px; background: var(--bg-gray-200); color: var(--text-primary); border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                    ${t.cancel}
                </button>
                ${showUploadNewButton ? `
                    <button onclick="selectClientLogo('new')" 
                            style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 600;">
                        ${t.uploadNew}
                    </button>
                ` : ''}
            </div>
        `;
        
        modalBody.innerHTML = logosHTML;
        
        // Guardar el file y resolver la promesa
        window._pendingLogoUpload = {
            file: newFile,
            resolve: resolve
        };
        
        // Mostrar modal
        modal.style.display = 'flex';
        modal.classList.add('active');
    });
}

/**
 * Seleccionar un logotipo del modal
 */
function selectClientLogo(logoUrl) {
    const modal = document.getElementById('clientLogoModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    
    if (window._pendingLogoUpload && window._pendingLogoUpload.resolve) {
        window._pendingLogoUpload.resolve(logoUrl);
        window._pendingLogoUpload = null;
    }
}

/**
 * Cerrar modal de logotipos del cliente
 */
function closeClientLogoModal() {
    const modal = document.getElementById('clientLogoModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    
    if (window._pendingLogoUpload && window._pendingLogoUpload.resolve) {
        window._pendingLogoUpload.resolve(null);
        window._pendingLogoUpload = null;
    }
}

/**
 * Renombrar logotipos temporales con el nombre del cliente al guardar la propuesta
 */
async function renameTemporaryLogos(clientName, articulosData) {
    if (!window.cartManager || !window.cartManager.supabase || !clientName) {
        return;
    }
    
    try {
        const normalizedClientName = normalizeClientName(clientName);
        
        // Listar todos los archivos temporales
        const { data: allFiles, error: listError } = await window.cartManager.supabase.storage
            .from('proposal-logos')
            .list('logos');
        
        if (listError || !allFiles) {
            return;
        }
        
        // Filtrar archivos temporales
        const tempFiles = allFiles.filter(f => f.name.startsWith('temp-'));
        
        if (tempFiles.length === 0) {
            return; // No hay archivos temporales
        }
        
        // Crear mapa de URLs temporales a nuevos nombres
        const logoRenames = new Map();
        let counter = 1;
        
        for (const tempFile of tempFiles) {
            const fileExtension = tempFile.name.split('.').pop().toLowerCase();
            let newFileName;
            
            // Verificar si ya existe un logotipo con el nombre base del cliente
            const baseFileName = `${normalizedClientName}.${fileExtension}`;
            const existingBase = allFiles.find(f => f.name === baseFileName);
            
            if (!existingBase) {
                // No existe, usar nombre base
                newFileName = baseFileName;
            } else {
                // Existe, buscar siguiente número disponible
                while (allFiles.find(f => f.name === `${normalizedClientName}-${counter}.${fileExtension}`)) {
                    counter++;
                }
                newFileName = `${normalizedClientName}-${counter}.${fileExtension}`;
                counter++;
            }
            
            const oldPath = `logos/${tempFile.name}`;
            const newPath = `logos/${newFileName}`;
            
            // Obtener URL antigua
            const { data: oldUrlData } = window.cartManager.supabase.storage
                .from('proposal-logos')
                .getPublicUrl(oldPath);
            
            // Mover/renombrar archivo
            const { data: moveData, error: moveError } = await window.cartManager.supabase.storage
                .from('proposal-logos')
                .move(oldPath, newPath);
            
            if (!moveError) {
                // Obtener nueva URL
                const { data: newUrlData } = window.cartManager.supabase.storage
                    .from('proposal-logos')
                    .getPublicUrl(newPath);
                
                logoRenames.set(oldUrlData.publicUrl, newUrlData.publicUrl);
            }
        }
        
        // Actualizar URLs en los artículos guardados
        if (logoRenames.size > 0 && articulosData) {
            for (const articulo of articulosData) {
                if (articulo.logo_url && logoRenames.has(articulo.logo_url)) {
                    const newUrl = logoRenames.get(articulo.logo_url);
                    
                    // Actualizar en la BD
                    await window.cartManager.supabase
                        .from('presupuestos_articulos')
                        .update({ logo_url: newUrl })
                        .eq('id', articulo.id);
                }
            }
        }
    } catch (error) {
        console.error('Error renombrando logotipos temporales:', error);
        // No mostrar error al usuario, solo registrar en consola
    }
}

window.handleLogoUpload = handleLogoUpload;
window.removeLogo = removeLogo;
window.checkAndSuggestClientLogo = checkAndSuggestClientLogo;
window.selectClientLogo = selectClientLogo;
window.closeClientLogoModal = closeClientLogoModal;
