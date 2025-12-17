# Instrucciones para Configurar el Bucket de Logotipos en Supabase

## Problema
El error "StorageApiError: Bucket not found" indica que el bucket `proposal-logos` no existe en Supabase Storage.

## Solución: Crear el Bucket

### Opción 1: Desde el Dashboard de Supabase (Recomendado)

1. **Acceder a Storage:**
   - Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
   - En el menú lateral, haz clic en **"Storage"**

2. **Crear nuevo bucket:**
   - Haz clic en el botón **"New bucket"** o **"Crear bucket"**
   - Nombre del bucket: `proposal-logos`
   - **IMPORTANTE:** Marca la opción **"Public bucket"** para que los archivos sean accesibles públicamente
   - Haz clic en **"Create bucket"**

3. **Configurar políticas de acceso (RLS):**
   - Una vez creado el bucket, haz clic en él
   - Ve a la pestaña **"Policies"**
   - Crea las siguientes políticas:

   **Política 1: Permitir lectura pública**
   ```sql
   CREATE POLICY "Public Access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'proposal-logos');
   ```

   **Política 2: Permitir subida de archivos (autenticados)**
   ```sql
   CREATE POLICY "Authenticated users can upload"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'proposal-logos' AND
     auth.role() = 'authenticated'
   );
   ```

   **Política 3: Permitir actualización de archivos (autenticados)**
   ```sql
   CREATE POLICY "Authenticated users can update"
   ON storage.objects FOR UPDATE
   USING (
     bucket_id = 'proposal-logos' AND
     auth.role() = 'authenticated'
   );
   ```

   **Política 4: Permitir eliminación de archivos (autenticados)**
   ```sql
   CREATE POLICY "Authenticated users can delete"
   ON storage.objects FOR DELETE
   USING (
     bucket_id = 'proposal-logos' AND
     auth.role() = 'authenticated'
   );
   ```

### Opción 2: Usando SQL (Alternativa)

Si prefieres usar SQL directamente, ejecuta el siguiente script en el SQL Editor de Supabase:

```sql
-- Crear el bucket (esto debe hacerse desde el dashboard, pero puedes verificar que existe)
-- Luego ejecutar las políticas:

-- Política para lectura pública
CREATE POLICY IF NOT EXISTS "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'proposal-logos');

-- Política para subida (autenticados)
CREATE POLICY IF NOT EXISTS "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'proposal-logos' AND
  auth.role() = 'authenticated'
);

-- Política para actualización (autenticados)
CREATE POLICY IF NOT EXISTS "Authenticated users can update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'proposal-logos' AND
  auth.role() = 'authenticated'
);

-- Política para eliminación (autenticados)
CREATE POLICY IF NOT EXISTS "Authenticated users can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'proposal-logos' AND
  auth.role() = 'authenticated'
);
```

## Verificación

Después de crear el bucket y configurar las políticas:

1. Intenta subir un logotipo desde la aplicación
2. Verifica en el dashboard de Supabase Storage que el archivo se haya subido correctamente
3. Verifica que puedas acceder a la URL pública del archivo

## Notas Importantes

- El bucket debe ser **público** para que las URLs funcionen correctamente
- Las políticas RLS controlan quién puede leer, escribir, actualizar y eliminar archivos
- Los archivos se organizan en la carpeta `logos/` dentro del bucket
- Los logotipos temporales se renombran automáticamente al guardar la propuesta

## Estructura de Archivos en el Bucket

```
proposal-logos/
  └── logos/
      ├── temp-1234567890-item123.pdf  (temporales, antes de guardar propuesta)
      ├── cliente-nombre.pdf           (renombrados después de guardar)
      ├── cliente-nombre-1.png         (si hay múltiples logotipos)
      └── cliente-nombre-2.jpg
```





