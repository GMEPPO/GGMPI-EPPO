# KPIs Disponibles en EPPO - Sistema de Presupuestos

## 📊 KPIs de Propuestas/Presupuestos

### 1. **KPIs de Volumen**
- **Total de propuestas enviadas** (por día, semana, mes, año)
- **Total de propuestas por estado** (enviadas, pendientes, aprobadas, rechazadas)
- **Tasa de conversión de propuestas** (propuestas enviadas / propuestas iniciadas)
- **Promedio de propuestas por comercial**
- **Promedio de propuestas por cliente**

### 2. **KPIs de Valor**
- **Valor total de propuestas enviadas** (€)
- **Valor promedio por propuesta** (€)
- **Valor promedio por artículo** (€)
- **Valor total por comercial** (€)
- **Valor total por cliente** (€)
- **Ticket promedio** (valor total / número de propuestas)

### 3. **KPIs de Productos en Propuestas**
- **Productos más incluidos en propuestas** (top 10, top 20)
- **Cantidad total vendida por producto** (suma de cantidades en todas las propuestas)
- **Valor total generado por producto** (€)
- **Productos más personalizados** (porcentaje de propuestas con precio_personalizado = true)
- **Tipos de personalización más solicitados** (análisis de tipo_personalizacion)
- **Productos por categoría** (secadores, planchas, tablas-planchar, porta-malas)

### 4. **KPIs de Comerciales**
- **Número de propuestas por comercial**
- **Valor total generado por comercial** (€)
- **Ticket promedio por comercial** (€)
- **Tasa de aprobación por comercial** (% de propuestas aprobadas)
- **Comercial más activo** (ranking)
- **Comercial con mayor valor generado** (ranking)

### 5. **KPIs de Clientes**
- **Número de propuestas por cliente**
- **Valor total por cliente** (€)
- **Clientes más frecuentes** (top 10)
- **Clientes con mayor valor** (top 10)
- **Nuevos clientes vs recurrentes** (análisis temporal)

### 6. **KPIs de Tiempo y Eficiencia**
- **Tiempo promedio desde creación hasta envío** (días)
- **Tiempo promedio de respuesta** (fecha_propuesta vs fecha_ultima_actualizacion)
- **Número promedio de modificaciones por propuesta** (veces_modificado)
- **Propuestas con más modificaciones** (indicador de complejidad)
- **Tasa de modificación** (% de propuestas modificadas)

### 7. **KPIs de Personalización**
- **Porcentaje de propuestas con personalización** (%)
- **Tipos de personalización más solicitados** (ranking)
- **Valor promedio de propuestas personalizadas vs no personalizadas** (€)
- **Productos más personalizados** (por producto)

### 8. **KPIs de Categorías**
- **Propuestas por categoría de producto** (secadores, planchas, etc.)
- **Valor total por categoría** (€)
- **Categoría más solicitada** (ranking)
- **Categoría con mayor valor** (ranking)

### 9. **KPIs Temporales**
- **Tendencias mensuales** (propuestas por mes)
- **Tendencias semanales** (propuestas por semana)
- **Días de la semana más activos** (lunes, martes, etc.)
- **Estacionalidad** (propuestas por trimestre/estación)
- **Crecimiento interanual** (comparación año a año)

### 10. **KPIs de Calidad**
- **Tasa de aprobación** (% de propuestas aprobadas)
- **Tasa de rechazo** (% de propuestas rechazadas)
- **Propuestas pendientes** (número y %)
- **Tiempo promedio hasta aprobación/rechazo** (días)

## 📈 KPIs de Productos (Catálogo)

### 11. **KPIs de Catálogo**
- **Total de productos en catálogo**
- **Productos por categoría**
- **Productos con precio personalizado disponibles**
- **Productos con escalones de precio** (price_tiers)
- **Productos más consultados** (si se implementa tracking)
- **Productos más agregados al carrito** (si se implementa tracking)

## 🔍 KPIs de Uso de la Plataforma (Requieren Implementación)

### 12. **KPIs de Navegación** (si se implementa tracking)
- **Páginas más visitadas**
- **Tiempo promedio en cada página**
- **Tasa de rebote**
- **Productos más vistos**
- **Filtros más utilizados**
- **Búsquedas más frecuentes**

### 13. **KPIs de Carrito** (si se implementa tracking)
- **Tasa de abandono de carrito** (%)
- **Productos más agregados al carrito**
- **Tiempo promedio en carrito antes de enviar propuesta**
- **Número promedio de productos por propuesta**
- **Valor promedio del carrito** (€)

## 📋 Consultas SQL Ejemplo para KPIs

### KPI: Total de propuestas por mes
```sql
SELECT 
    DATE_TRUNC('month', fecha_propuesta) as mes,
    COUNT(*) as total_propuestas,
    SUM((SELECT SUM(pa.cantidad * pa.precio) 
         FROM presupuestos_articulos pa 
         WHERE pa.presupuesto_id = p.id)) as valor_total
FROM presupuestos p
GROUP BY DATE_TRUNC('month', fecha_propuesta)
ORDER BY mes DESC;
```

### KPI: Top 10 productos más vendidos
```sql
SELECT 
    pa.nombre_articulo,
    pa.referencia_articulo,
    SUM(pa.cantidad) as cantidad_total,
    SUM(pa.cantidad * pa.precio) as valor_total,
    COUNT(DISTINCT pa.presupuesto_id) as veces_incluido
FROM presupuestos_articulos pa
GROUP BY pa.nombre_articulo, pa.referencia_articulo
ORDER BY cantidad_total DESC
LIMIT 10;
```

### KPI: Performance por comercial
```sql
SELECT 
    nombre_comercial,
    COUNT(*) as total_propuestas,
    SUM((SELECT SUM(pa.cantidad * pa.precio) 
         FROM presupuestos_articulos pa 
         WHERE pa.presupuesto_id = p.id)) as valor_total,
    AVG((SELECT SUM(pa.cantidad * pa.precio) 
         FROM presupuestos_articulos pa 
         WHERE pa.presupuesto_id = p.id)) as ticket_promedio,
    AVG(veces_modificado) as modificaciones_promedio
FROM presupuestos p
GROUP BY nombre_comercial
ORDER BY valor_total DESC;
```

### KPI: Tasa de personalización
```sql
SELECT 
    COUNT(*) FILTER (WHERE precio_personalizado = true) as con_personalizacion,
    COUNT(*) FILTER (WHERE precio_personalizado = false) as sin_personalizacion,
    ROUND(100.0 * COUNT(*) FILTER (WHERE precio_personalizado = true) / COUNT(*), 2) as porcentaje_personalizado
FROM presupuestos_articulos;
```

### KPI: Tipos de personalización más solicitados
```sql
SELECT 
    tipo_personalizacion,
    COUNT(*) as veces_solicitado,
    SUM(cantidad * precio) as valor_total
FROM presupuestos_articulos
WHERE precio_personalizado = true
GROUP BY tipo_personalizacion
ORDER BY veces_solicitado DESC;
```

## 🎯 KPIs Recomendados para Dashboard

### Dashboard Ejecutivo
1. **Total de propuestas este mes**
2. **Valor total generado este mes** (€)
3. **Ticket promedio** (€)
4. **Tasa de aprobación** (%)
5. **Top 5 comerciales** (por valor)
6. **Top 5 productos** (por cantidad vendida)

### Dashboard Comercial
1. **Mis propuestas este mes**
2. **Mi valor generado** (€)
3. **Mi ticket promedio** (€)
4. **Mis clientes más activos**
5. **Mis productos más vendidos**
6. **Tiempo promedio de respuesta**

### Dashboard de Productos
1. **Productos más vendidos** (top 20)
2. **Categorías más solicitadas**
3. **Tasa de personalización por producto**
4. **Valor generado por categoría** (€)
5. **Productos con mayor margen** (si se agrega costo)

## 📊 Métricas Adicionales Recomendadas

### Para Implementar en el Futuro:
1. **Tracking de visualizaciones de productos** (crear tabla `product_views`)
2. **Tracking de búsquedas** (crear tabla `search_logs`)
3. **Tracking de clics en productos** (crear tabla `product_clicks`)
4. **Tracking de tiempo en página** (analytics)
5. **Tracking de origen de tráfico** (si se implementa marketing)
6. **Sistema de ratings/feedback** de propuestas
7. **Tiempo de respuesta del cliente** (si se agrega campo fecha_respuesta_cliente)

## 🔧 Implementación Sugerida

Para obtener estos KPIs, se recomienda:

1. **Crear una página de Dashboard** (`dashboard.html`) con visualizaciones
2. **Usar una librería de gráficos** (Chart.js, D3.js, o similar)
3. **Crear funciones en JavaScript** para consultar Supabase y calcular KPIs
4. **Implementar caché** para mejorar rendimiento
5. **Agregar filtros temporales** (último mes, último trimestre, año completo, etc.)


