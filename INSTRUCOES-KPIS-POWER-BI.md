# Instruções para Criar KPIs no Power BI

## Vista de Dados: `vista_kpis_propuestas`

Esta vista contém todas as propostas concluídas e rejeitadas com os dados necessários para as análises.

---

## 1. KPI: Tempo de Envio de Proposta

### Descrição
Mede o tempo médio (em dias) que decorre desde a data inicial da proposta até ser enviada ao cliente.

### Campos a utilizar
- `fecha_inicial`: Data de início da proposta
- `fecha_envio_propuesta`: Data em que a proposta foi enviada
- `dias_hasta_envio`: Campo calculado que já contém a diferença em dias (apenas para propostas enviadas)

### Passos no Power BI

1. **Criar Medida: Tempo Médio de Envio**
   ```DAX
   Tempo Médio Envio = 
   AVERAGE(vista_kpis_propuestas[dias_hasta_envio])
   ```

2. **Criar Medida: Tempo Mediano de Envio**
   ```DAX
   Tempo Mediano Envio = 
   MEDIAN(vista_kpis_propuestas[dias_hasta_envio])
   ```

3. **Criar Medida: Tempo Máximo de Envio**
   ```DAX
   Tempo Máximo Envio = 
   MAX(vista_kpis_propuestas[dias_hasta_envio])
   ```

4. **Criar Medida: Tempo Mínimo de Envio**
   ```DAX
   Tempo Mínimo Envio = 
   MIN(vista_kpis_propuestas[dias_hasta_envio])
   ```

5. **Visualização Recomendada:**
   - **Cartão (Card)**: Mostrar "Tempo Médio Envio"
   - **Gráfico de Barras**: Tempo médio por comercial (`nombre_comercial`)
   - **Gráfico de Linhas**: Evolução do tempo médio por mês (usar `fecha_inicial` agrupada por mês)
   - **Tabela**: Detalhe com proposta, cliente, comercial, dias até envio

### Filtros Sugeridos
- Por intervalo de datas (`fecha_inicial`)
- Por comercial (`nombre_comercial`)
- Por país (`pais`)

---

## 2. KPI: Taxa de Sucesso das Propostas

### Descrição
Mede a percentagem de propostas que foram concluídas vs. as que foram rejeitadas.

### Campos a utilizar
- `es_concluida`: Boolean que indica se a proposta está concluída
- `es_rechazada`: Boolean que indica se a proposta está rejeitada

### Passos no Power BI

1. **Criar Medida: Total de Propostas**
   ```DAX
   Total Propostas = 
   COUNTROWS(vista_kpis_propuestas)
   ```

2. **Criar Medida: Propostas Concluídas**
   ```DAX
   Propostas Concluídas = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_concluida] = TRUE()
   )
   ```

3. **Criar Medida: Propostas Rejeitadas**
   ```DAX
   Propostas Rejeitadas = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE()
   )
   ```

4. **Criar Medida: Taxa de Sucesso (%)**
   ```DAX
   Taxa de Sucesso % = 
   DIVIDE(
       [Propostas Concluídas],
       [Total Propostas],
       0
   ) * 100
   ```

5. **Criar Medida: Taxa de Rejeição (%)**
   ```DAX
   Taxa de Rejeição % = 
   DIVIDE(
       [Propostas Rejeitadas],
       [Total Propostas],
       0
   ) * 100
   ```

6. **Visualização Recomendada:**
   - **Cartões (Cards)**: 
     - Taxa de Sucesso %
     - Taxa de Rejeição %
     - Total Propostas
   - **Gráfico Circular (Donut Chart)**: 
     - Propostas Concluídas vs. Rejeitadas
   - **Gráfico de Barras Empilhadas**: 
     - Taxa de sucesso por comercial
   - **Gráfico de Linhas**: 
     - Evolução da taxa de sucesso por mês

### Filtros Sugeridos
- Por intervalo de datas (`fecha_inicial`)
- Por comercial (`nombre_comercial`)
- Por país (`pais`)

---

## 3. KPI: Principais Motivos de Rejeição

### Descrição
Identifica os motivos mais frequentes pelos quais as propostas são rejeitadas.

### Campos a utilizar
- `motivo_rechazo_completo`: Motivo completo de rejeição (inclui texto personalizado se aplicável)
- `es_rechazada`: Para filtrar apenas propostas rejeitadas

### Passos no Power BI

1. **Criar Medida: Total Rejeições**
   ```DAX
   Total Rejeições = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE()
   )
   ```

2. **Criar Medida: Rejeições por Motivo**
   ```DAX
   Rejeições por Motivo = 
   CALCULATE(
       COUNTROWS(vista_kpis_propuestas),
       vista_kpis_propuestas[es_rechazada] = TRUE(),
       VALUES(vista_kpis_propuestas[motivo_rechazo_completo])
   )
   ```

3. **Visualização Recomendada:**
   - **Gráfico de Barras Horizontais**: 
     - Eixo Y: `motivo_rechazo_completo`
     - Eixo X: `Rejeições por Motivo`
     - Ordenar por valor descendente
   - **Gráfico Circular**: 
     - Mostrar distribuição de motivos
   - **Tabela**: 
     - Coluna 1: `motivo_rechazo_completo`
     - Coluna 2: `Rejeições por Motivo`
     - Coluna 3: Percentagem (ver secção seguinte)

---

## 4. KPI: Percentagem de Cada Motivo de Rejeição

### Descrição
Calcula que percentagem representa cada motivo de rejeição sobre o total de propostas rejeitadas.

### Passos no Power BI

1. **Criar Medida: Percentagem por Motivo**
   ```DAX
   % por Motivo = 
   DIVIDE(
       [Rejeições por Motivo],
       [Total Rejeições],
       0
   ) * 100
   ```

2. **Criar Medida: Percentagem por Motivo (Formatado)**
   ```DAX
   % por Motivo Formatado = 
   FORMAT([% por Motivo], "0.00") & "%"
   ```

3. **Visualização Recomendada:**
   - **Tabela Detalhada**: 
     - Coluna 1: `motivo_rechazo_completo`
     - Coluna 2: `Rejeições por Motivo`
     - Coluna 3: `% por Motivo` (formato: percentagem com 2 casas decimais)
   - **Gráfico de Barras Empilhadas a 100%**: 
     - Mostrar a proporção de cada motivo
   - **Gráfico de Área**: 
     - Evolução da percentagem de cada motivo por mês

### Exemplo de Tabela Resultante

| Motivo de Rejeição | Quantidade | Percentagem |
|-------------------|------------|-------------|
| Preços            | 45         | 35,43%      |
| Prazo             | 32         | 25,20%      |
| Outro motivo X    | 25         | 19,69%      |
| ...               | ...        | ...         |
| **Total**         | **127**    | **100%**    |

---

## Dashboard Recomendado

### Página 1: Resumo Executivo
- Cartões com KPIs principais:
  - Taxa de Sucesso %
  - Tempo Médio de Envio
  - Total Propostas
  - Total Rejeitadas
- Gráfico circular: Concluídas vs. Rejeitadas
- Gráfico de linhas: Evolução mensal da taxa de sucesso

### Página 2: Análise de Tempos
- Cartão: Tempo médio, mediano, máximo, mínimo
- Gráfico de barras: Tempo médio por comercial
- Gráfico de linhas: Evolução do tempo por mês
- Tabela: Detalhe de propostas com tempos

### Página 3: Análise de Rejeições
- Gráfico de barras horizontais: Principais motivos
- Tabela: Motivos com quantidade e percentagem
- Gráfico circular: Distribuição de motivos
- Gráfico de linhas: Evolução de rejeições por motivo por mês

### Página 4: Análise por Cliente
- Tabela: Clientes com mais rejeições
- Tabela: Clientes com mais sucessos
- Gráfico: Taxa de sucesso por cliente (top 10)

---

## Filtros Globais Recomendados

1. **Intervalo de Datas**: `fecha_inicial` (slicer de data)
2. **Comercial**: `nombre_comercial` (slicer)
3. **País**: `pais` (slicer)
4. **Estado**: `estado_propuesta` (slicer, opcional)

---

## Notas Importantes

1. **Dados Nulos**: 
   - Algumas propostas podem não ter `fecha_envio_propuesta` se nunca foram enviadas
   - Algumas propostas rejeitadas podem não ter `motivo_rechazo` se foram rejeitadas antes de implementar esta funcionalidade

2. **Atualização de Dados**:
   - Configurar atualização automática no Power BI Service
   - Recomendado: Atualização diária

3. **Desempenho**:
   - Se houver muitos dados, considerar adicionar índices no Supabase em:
     - `fecha_inicial`
     - `estado_propuesta`
     - `nombre_comercial`

4. **Segurança**:
   - Configurar Row Level Security (RLS) no Supabase se necessário
   - Usar funções apropriadas no Power BI

---

## Exemplo de Consulta SQL Direta (Opcional)

Se preferir criar medidas mais complexas diretamente em SQL, pode modificar a vista:

```sql
-- Exemplo: Adicionar coluna de mês-ano
ALTER VIEW vista_kpis_propuestas AS
SELECT 
    *,
    TO_CHAR(fecha_inicial, 'YYYY-MM') AS mes_ano
FROM vista_kpis_propuestas;
```

---

## Suporte

Para qualquer dúvida sobre a estrutura de dados ou campos disponíveis, consultar:
- Tabela base: `presupuestos`
- Vista: `vista_kpis_propuestas`
- Documentação de campos nos scripts SQL






