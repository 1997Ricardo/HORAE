# HORAE Pro — Control horario personal

Aplicación web instalable (PWA) para registrar jornadas, servicios, tarifas y generar informes mensuales. Interfaz premium oscura, responsive y en español.

## Incluye
- Panel mensual con horas, importes, jornadas, media por jornada y distribución por servicio.
- Registro manual de jornadas con validación de horas y tarifa histórica.
- Servicios por horas o por importe fijo (por ejemplo, programación mensual de 150 €), sin sumar horas ficticias.
- Cronómetro en directo: inicia una jornada, consulta el tiempo transcurrido y finaliza para guardarla. El estado se conserva si cierras o recargas la app.
- Catálogo editable de servicios y tarifas.
- Historial mensual con búsqueda, filtro, edición y eliminación.
- Informe A4 con resumen por servicio y espacios de firma; imprimir o guardar como PDF.
- Exportación mensual a CSV y copia de seguridad/restauración JSON.
- Persistencia local y sincronización con Google Sheets mediante Apps Script.
- PWA con manifest, iconos y service worker para cachear la interfaz.

## A. Publicar la web
1. Descomprime el ZIP.
2. Publica el contenido en un hosting estático HTTPS (Vercel, Netlify o GitHub Pages).
3. Conserva las rutas relativas de `manifest.webmanifest`, `sw.js` y `icons/`.
4. En iPhone: abre la URL en Safari → Compartir → Añadir a pantalla de inicio. En Android: menú del navegador → Instalar aplicación.

El service worker requiere HTTPS (excepto `localhost`). La app guarda datos en el navegador sin conexión, pero la sincronización con Sheets necesita internet.


> **Endpoint no preconfigurado:** por seguridad, la URL de Apps Script se introduce manualmente en Configuración después de comprobar el backend. No se incluye una URL de despliegue en el código público.

## B. Sincronización con Google Sheets

**Importante:** el repositorio actual no contiene el archivo `Code.gs` ni el código del backend de Apps Script. La interfaz incluye el cliente de sincronización, pero el backend debe existir y estar desplegado por separado.

El cliente espera un endpoint de Apps Script que acepte una petición POST con el contrato `{ action: "sync", data: { records, services, profile } }` y devuelva JSON con `{ ok: true, data: { records, services, profile } }`. No despliegues una URL hasta verificar que el script implementa ese contrato y protege correctamente los datos. Como una URL de despliegue estuvo incluida en una versión anterior del repositorio, crea una implementación nueva y desactiva la antigua si continúa activa; borrar la URL del código actual no la elimina del historial Git.

1. Configura y despliega tu proyecto de Apps Script por separado.
2. Comprueba que la URL termina en `/exec` y que el endpoint implementa el contrato anterior.
3. En HORAE → Configuración, pega la URL y pulsa **Conectar y sincronizar**.
4. Antes de confirmar, descarga una copia JSON y verifica que la hoja de destino es la correcta.

### Sincronización y seguridad

La sincronización transmite el conjunto de registros, servicios y perfil del dispositivo al backend. La sincronización inicial puede sustituir datos remotos dependiendo de la implementación de Apps Script. La app no ofrece todavía resolución de conflictos entre varios dispositivos ni autenticación propia para usuarios. Una URL de Apps Script no equivale a autenticación. No uses el endpoint con datos sensibles ni lo abras públicamente sin controles de identidad y autorización.

La sincronización automática solo se ejecuta cuando la conexión se ha activado expresamente y se mantiene conectada. Al desconectar, se cancelan las sincronizaciones pendientes. El modo local sigue disponible.

## C. Generar PDF
1. Entra en Informes o pulsa Exportar informe.
2. Selecciona el mes, indica trabajador y empresa/responsable.
3. Genera la vista previa y pulsa Imprimir / Guardar como PDF.
4. En el diálogo de impresión, selecciona Guardar como PDF.

## Cálculo de duración
- La duración manual se calcula entre hora de inicio y fin; si la hora final es anterior, se interpreta como jornada nocturna.
- No se permite la misma hora de inicio y fin en el registro manual para evitar guardar 24 horas por error.
- El cronómetro conserva su inicio al recargar y guarda la duración real redondeada al minuto.
- Importe = minutos / 60 × tarifa por hora.
- Cada registro conserva la tarifa aplicada en el momento de crearlo. Cambiar la tarifa del servicio no altera registros anteriores.
- El importe es estimado; no contempla descansos no remunerados, complementos, impuestos ni reglas especiales de nómina.

## Copias de seguridad
- CSV: jornadas del mes activo para abrir en una hoja de cálculo.
- JSON: copia completa de registros, servicios y perfil, apta para restaurar.
- Guarda una copia fuera del móvil periódicamente.

## Estructura
```text
HORAE_Pro/
├── index.html
├── styles.css
├── app.js
├── Code.gs
├── sw.js
├── manifest.webmanifest
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```
