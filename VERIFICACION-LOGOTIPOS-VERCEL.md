# Verificación de Logotipos en Vercel/GitHub

## ✅ Lo que NO necesita actualizarse

1. **Código en GitHub**: Todo el código relacionado con logotipos ya está en el repositorio y se desplegará automáticamente cuando hagas push.

2. **Variables de entorno en Vercel**: No se requieren variables de entorno adicionales para los logotipos. El código usa la misma configuración de Supabase que ya tienes configurada.

3. **Configuración de Vercel (`vercel.json`)**: No necesita cambios. La configuración actual es suficiente.

## ⚠️ Lo que SÍ debes verificar en Supabase

### 1. Bucket `proposal-logos` debe existir

**Verificar:**
- Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
- Navega a **Storage** en el menú lateral
- Verifica que exista el bucket llamado `proposal-logos`
- Si no existe, créalo siguiendo las instrucciones en `INSTRUCCIONES-BUCKET-LOGOS.md`

**Configuración del bucket:**
- ✅ Debe ser **público** (Public bucket)
- ✅ Nombre exacto: `proposal-logos`

### 2. Políticas RLS (Row Level Security) configuradas

**Verificar:**
- En el bucket `proposal-logos`, ve a la pestaña **"Policies"**
- Deben existir 4 políticas:
  1. **SELECT** (lectura pública)
  2. **INSERT** (subida para usuarios autenticados)
  3. **UPDATE** (actualización para usuarios autenticados)
  4. **DELETE** (eliminación para usuarios autenticados)

**Si faltan políticas**, ejecuta el SQL en `INSTRUCCIONES-BUCKET-LOGOS.md`

### 3. Columna `logo_url` en la tabla `presupuestos_articulos`

**Verificar:**
- Ve a **Table Editor** en Supabase
- Abre la tabla `presupuestos_articulos`
- Verifica que exista la columna `logo_url` de tipo `TEXT`
- Si no existe, ejecuta el SQL en `sql/agregar-columna-logo-url-articulos.sql`

## 🔄 Proceso de Despliegue

Cuando hagas cambios en el código:

1. **GitHub:**
   ```bash
   git add .
   git commit -m "Actualización de logotipos"
   git push
   ```

2. **Vercel:**
   - Se desplegará automáticamente si tienes integración continua configurada
   - O despliega manualmente desde el dashboard de Vercel

3. **No necesitas:**
   - Actualizar variables de entorno
   - Cambiar configuración de Vercel
   - Hacer cambios en `vercel.json`

## 🧪 Pruebas después del despliegue

1. **Subir un logotipo:**
   - Crea una propuesta
   - Selecciona un producto con variante personalizada
   - Sube un logotipo (PDF o imagen)
   - Verifica que se suba sin errores

2. **Verificar en Supabase Storage:**
   - Ve a Storage → `proposal-logos` → `logos/`
   - Debe aparecer el archivo subido

3. **Verificar en el PDF:**
   - Genera el PDF de la propuesta
   - Debe aparecer la columna "Logo" con el logotipo

4. **Eliminar logotipo:**
   - Elimina un logotipo desde la propuesta
   - Verifica que también se elimine del bucket en Supabase

## 📝 Resumen

| Componente | ¿Necesita actualización? | Notas |
|------------|-------------------------|-------|
| Código en GitHub | ✅ Ya está | Se despliega automáticamente |
| Variables de entorno Vercel | ❌ No | Usa la misma config de Supabase |
| `vercel.json` | ❌ No | Configuración actual es suficiente |
| Bucket `proposal-logos` | ⚠️ Verificar | Debe existir y ser público |
| Políticas RLS | ⚠️ Verificar | 4 políticas necesarias |
| Columna `logo_url` | ⚠️ Verificar | En tabla `presupuestos_articulos` |

## 🆘 Si algo no funciona

1. **Error "Bucket not found":**
   - Verifica que el bucket `proposal-logos` exista
   - Verifica que el nombre sea exactamente `proposal-logos` (sin espacios, minúsculas)

2. **Error de permisos:**
   - Verifica las políticas RLS en el bucket
   - Asegúrate de estar autenticado en la aplicación

3. **Logotipos no aparecen en PDF:**
   - Verifica que la columna `logo_url` exista en `presupuestos_articulos`
   - Verifica que el logotipo se haya guardado correctamente en el bucket

4. **Logotipos no se eliminan:**
   - Verifica la política RLS de DELETE
   - Verifica que el usuario tenga permisos de autenticación




