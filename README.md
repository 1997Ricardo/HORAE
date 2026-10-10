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


> **URL de Apps Script preconfigurada:** esta versión ya incluye la URL que has facilitado. En la app, abre Configuración y pulsa **Conectar y sincronizar**. Revisa y autoriza la operación cuando aparezca la confirmación.

## B. Crear el backend de Google Sheets
1. Crea un Google Sheet nuevo.
2. Abre Extensiones → Apps Script.
3. Pega el contenido de `Code.gs` y guarda.
4. Ejecuta `setup()` una vez y concede permisos. Si abriste Apps Script desde tu Google Sheet nuevo (Extensiones → Apps Script), usará esa hoja y creará las pestañas `Jornadas`, `Servicios` y `Perfil`. Si el proyecto es independiente, creará una hoja `HORAE · Control horario`. La URL aparecerá en el registro de ejecución.
5. Implementar → Nueva implementación → Aplicación web.
6. Ejecutar como: tú. Elige el acceso más restrictivo que permita tu uso.
7. Copia la URL que termina en `/exec`.
8. En HORAE → Configuración, pega la URL y pulsa Conectar y sincronizar.

### Sincronización y seguridad
La app envía el conjunto de registros y servicios locales al backend y recibe el estado persistido. Antes de conectar por primera vez, descarga una copia JSON. No importará automáticamente registros de otras hojas. La URL de Apps Script no es un sistema de autenticación: no la publiques. Para varios usuarios o datos sensibles, añade autenticación y autorización antes de abrir el acceso.

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
