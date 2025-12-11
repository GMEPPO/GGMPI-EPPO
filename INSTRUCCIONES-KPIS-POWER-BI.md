# Instrucciones para Crear KPIs en Power BI

## Vista de Datos: `vista_kpis_propuestas`

Esta vista contiene todas las propuestas concluidas y rechazadas con los datos necesarios para los análisis.

---

## 1. KPI: Tiempo de Envío de Propuesta

### Descripción
Mide el tiempo promedio (en días) que transcurre desde la fecha inicial de la propuesta hasta que se envía al cliente.

### Campos a usar
- `fecha_inicial`: Fecha de inicio de la propuesta
- `fecha_envio_propuesta`: Fecha cuando se envió la propuesta
- `dias_hasta_envio`: Campo calculado que ya contiene la diferencia en días (solo para propuestas enviadas)

### Pasos en Power BI

1. **Crear Medida: Tiempo Promedio de Envío**
   ```DAX
   Tiempo Promedio Envío = 
   AVERAGE(vista_kpis_propuestas[dias_hasta_envio])
   ```

2. **Crear Medida: Tiempo Mediano de Envío**
   ```DAX
   Tiempo Mediano Envío = 
   MEDIAN(vista_kpis_propuestas[dias_hasta_envio])
   ```

3. **Crear Medida: Tiempo Máximo de Envío**
   ```DAX
   Tiempo Máximo Envío = 
   MAX(vista_kpis_propuestas[dias_hasta_envio])
   ```

4. **Crear Medida: Tiempo Mínimo de Envío**
   ```DAX
   Tiempo Mínimo Envío = 
   MIN(vista_kpis_propuestas[dias_hasta_envio])
   ```

5. **Visualización Recomendada:**
   - **Tarjeta (Card)**: Mostrar "Tiempo Promedio Envío"
   - **Gráfico de Barras**: Tiempo promedio por comercial (`nombre_comercial`)
   - **Gráfico de Líneas**: Evolución del tiempo promedio por mes (usar `fecha_inicial` agrupada por mes)
   - **Tabla**: Detalle con propuesta, cliente, comercial, días hasta envío

### Filtros Sugeridos
- Por rango de fechas (`fecha_inicial`)
- Por comercial (`nombre_comercial`)
- Por país (`pais`)

---

## 2. KPI: Tasa de Éxito de las Propuestas

### Descripción
Mide el porcentaje de propuestas que fueron concluidas vs. las que fueron rechazadas.

### Campos a usar
- `es_concluida`: Boolean que indica si la propuesta está concluida
- `es_rechazada`: Boolean que indica si la propuesta está rechazada

### Pasos en Power BI

1. **Crear Medida: Total de Propuestas**
   ```DAX
   Total Propuestas = 
   COUNTROWS(vista_kpis_propuestas)
   ```

2. **Crear Medida: Propuestas Concluidas**
   ```DAX
   Propuestas Concluidas = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_concluida] = TRUE()
   )
   ```

3. **Crear Medida: Propuestas Rechazadas**
   ```DAX
   Propuestas Rechazadas = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE()
   )
   ```

4. **Crear Medida: Tasa de Éxito (%)**
   ```DAX
   Tasa de Éxito % = 
   DIVIDE(
       [Propuestas Concluidas],
       [Total Propuestas],
       0
   ) * 100
   ```

5. **Crear Medida: Tasa de Rechazo (%)**
   ```DAX
   Tasa de Rechazo % = 
   DIVIDE(
       [Propuestas Rechazadas],
       [Total Propuestas],
       0
   ) * 100
   ```

6. **Visualización Recomendada:**
   - **Tarjetas (Cards)**: 
     - Tasa de Éxito %
     - Tasa de Rechazo %
     - Total Propuestas
   - **Gráfico Circular (Donut Chart)**: 
     - Propuestas Concluidas vs. Rechazadas
   - **Gráfico de Barras Apiladas**: 
     - Tasa de éxito por comercial
   - **Gráfico de Líneas**: 
     - Evolución de la tasa de éxito por mes

### Filtros Sugeridos
- Por rango de fechas (`fecha_inicial`)
- Por comercial (`nombre_comercial`)
- Por país (`pais`)

---

## 3. KPI: Principales Motivos de Rechazo

### Descripción
Identifica los motivos más frecuentes por los que se rechazan las propuestas.

### Campos a usar
- `motivo_rechazo_completo`: Motivo completo de rechazo (incluye texto personalizado si aplica)
- `es_rechazada`: Para filtrar solo propuestas rechazadas

### Pasos en Power BI

1. **Crear Medida: Total Rechazos**
   ```DAX
   Total Rechazos = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE()
   )
   ```

2. **Crear Medida: Rechazos por Motivo**
   ```DAX
   Rechazos por Motivo = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE(),
       VALUES(vista_kpis_propuestas[motivo_rechazo_completo])
   )
   ```

3. **Visualización Recomendada:**
   - **Gráfico de Barras Horizontales**: 
     - Eje Y: `motivo_rechazo_completo`
     - Eje X: `Rechazos por Motivo`
     - Ordenar por valor descendente
   - **Gráfico Circular**: 
     - Mostrar distribución de motivos
   - **Tabla**: 
     - Columna 1: `motivo_rechazo_completo`
     - Columna 2: `Rechazos por Motivo`
     - Columna 3: Porcentaje (ver siguiente sección)

---

## 4. KPI: Porcentaje de Cada Motivo de Rechazo

### Descripción
Calcula qué porcentaje representa cada motivo de rechazo sobre el total de propuestas rechazadas.

### Pasos en Power BI

1. **Crear Medida: Porcentaje por Motivo**
   ```DAX
   % por Motivo = 
   DIVIDE(
       [Rechazos por Motivo],
       [Total Rechazos],
       0
   ) * 100
   ```

2. **Crear Medida: Porcentaje por Motivo (Formateado)**
   ```DAX
   % por Motivo Formateado = 
   FORMAT([% por Motivo], "0.00") & "%"
   ```

3. **Visualización Recomendada:**
   - **Tabla Detallada**: 
     - Columna 1: `motivo_rechazo_completo`
     - Columna 2: `Rechazos por Motivo`
     - Columna 3: `% por Motivo` (formato: porcentaje con 2 decimales)
   - **Gráfico de Barras Apiladas al 100%**: 
     - Mostrar la proporción de cada motivo
   - **Gráfico de Área**: 
     - Evolución del porcentaje de cada motivo por mes

### Ejemplo de Tabla Resultante

| Motivo de Rechazo | Cantidad | Porcentaje |
|-------------------|----------|------------|
| Preços            | 45       | 35.43%     |
| Prazo             | 32       | 25.20%     |
| Outro motivo X    | 25       | 19.69%     |
| ...               | ...      | ...        |
| **Total**         | **127**  | **100%**   |

---

## Dashboard Recomendado

### Página 1: Resumen Ejecutivo
- Tarjetas con KPIs principales:
  - Tasa de Éxito %
  - Tiempo Promedio de Envío
  - Total Propuestas
  - Total Rechazadas
- Gráfico circular: Concluidas vs. Rechazadas
- Gráfico de líneas: Evolución mensual de tasa de éxito

### Página 2: Análisis de Tiempos
- Tarjeta: Tiempo promedio, mediano, máximo, mínimo
- Gráfico de barras: Tiempo promedio por comercial
- Gráfico de líneas: Evolución del tiempo por mes
- Tabla: Detalle de propuestas con tiempos

### Página 3: Análisis de Rechazos
- Gráfico de barras horizontales: Principales motivos
- Tabla: Motivos con cantidad y porcentaje
- Gráfico circular: Distribución de motivos
- Gráfico de líneas: Evolución de rechazos por motivo por mes

### Página 4: Análisis por Cliente
- Tabla: Clientes con más rechazos
- Tabla: Clientes con más éxitos
- Gráfico: Tasa de éxito por cliente (top 10)

---

## Filtros Globales Recomendados

1. **Rango de Fechas**: `fecha_inicial` (slicer de fecha)
2. **Comercial**: `nombre_comercial` (slicer)
3. **País**: `pais` (slicer)
4. **Estado**: `estado_propuesta` (slicer, opcional)

---

## Notas Importantes

1. **Datos Nulos**: 
   - Algunas propuestas pueden no tener `fecha_envio_propuesta` si nunca se enviaron
   - Algunas propuestas rechazadas pueden no tener `motivo_rechazo` si se rechazaron antes de implementar esta funcionalidad

2. **Actualización de Datos**:
   - Configurar actualización automática en Power BI Service
   - Recomendado: Actualización diaria

3. **Rendimiento**:
   - Si hay muchos datos, considerar agregar índices en Supabase en:
     - `fecha_inicial`
     - `estado_propuesta`
     - `nombre_comercial`

4. **Seguridad**:
   - Configurar Row Level Security (RLS) en Supabase si es necesario
   - Usar roles apropiados en Power BI

---

## Ejemplo de Consulta SQL Directa (Opcional)

Si prefieres crear medidas más complejas directamente en SQL, puedes modificar la vista:

```sql
-- Ejemplo: Agregar columna de mes-año
ALTER VIEW vista_kpis_propuestas AS
SELECT 
    *,
    TO_CHAR(fecha_inicial, 'YYYY-MM') AS mes_ano
FROM vista_kpis_propuestas;
```

---

## Soporte

Para cualquier duda sobre la estructura de datos o campos disponibles, consultar:
- Tabla base: `presupuestos`
- Vista: `vista_kpis_propuestas`
- Documentación de campos en los scripts SQL



