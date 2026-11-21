/**
 * HORAE · Google Apps Script API v2
 *
 * Setup:
 * 1) Pega este archivo en el proyecto Apps Script vinculado a tu hoja.
 * 2) Ejecuta setup() una vez.
 * 3) Ejecuta generateApiToken() y copia el token del registro de ejecución.
 * 4) Despliega como aplicación web. La app necesita acceso al endpoint;
 *    la autenticación de HORAE se realiza mediante el token compartido.
 *
 * Seguridad: no compartas el token ni el enlace de despliegue. Si sospechas
 * que el token se ha expuesto, ejecuta generateApiToken() para rotarlo y
 * actualízalo en todos los dispositivos.
 */

const HORAE = Object.freeze({
  VERSION: 2,
  SPREADSHEET_ID_PROPERTY: 'HORAE_SPREADSHEET_ID',
  API_TOKEN_PROPERTY: 'HORAE_API_TOKEN',
  REVISION_PROPERTY: 'HORAE_DATA_REVISION',
  SHEET_RECORDS: 'Jornadas',
  SHEET_SERVICES: 'Servicios',
  SHEET_PROFILE: 'Perfil',
  MAX_BODY_CHARS: 4 * 1024 * 1024,
  MAX_RECORDS: 5000,
  MAX_SERVICES: 100,
  MAX_TEXT: 1000
});

const RECORD_HEADERS = [
  'id', 'date', 'start', 'end', 'rate', 'serviceId',
  'minutes', 'notes', 'billingType', 'fixedAmount'
];
const SERVICE_HEADERS = [
  'id', 'name', 'rate', 'color', 'active', 'type', 'fixedAmount'
];
const PROFILE_HEADERS = ['key', 'value'];

function doGet() {
  return json_({
    ok: true,
    app: 'HORAE API',
    version: HORAE.VERSION,
    message: 'Backend operativo.'
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents
      ? String(e.postData.contents)
      : '';

    if (!raw || raw.length > HORAE.MAX_BODY_CHARS) {
      throw apiError_('REQUEST_TOO_LARGE', 'La petición está vacía o supera el tamaño permitido.');
    }

    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw apiError_('INVALID_REQUEST', 'Formato de petición no válido.');
    }

    assertApiToken_(payload.token);

    if (payload.action === 'sync') {
      const data = payload.data || {};
      validateSyncData_(data);
      return json_({ ok: true, data: syncData_(data) });
    }

    if (payload.action === 'pull') {
      return json_({ ok: true, data: readAllData_() });
    }

    throw apiError_('UNKNOWN_ACTION', 'Acción no reconocida.');
  } catch (err) {
    const known = err && err.horaeCode;
    return json_({
      ok: false,
      code: known || 'SERVER_ERROR',
      error: String(err && err.message ? err.message : 'Error interno del servidor.')
    });
  }
}

/** Inicializa hojas y metadatos. Ejecutar manualmente una vez. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(HORAE.SPREADSHEET_ID_PROPERTY);
  let ss = null;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = SpreadsheetApp.create('HORAE · Control horario');
    props.setProperty(HORAE.SPREADSHEET_ID_PROPERTY, ss.getId());
  }

  ensureSheet_(ss, HORAE.SHEET_RECORDS, RECORD_HEADERS);
  ensureSheet_(ss, HORAE.SHEET_SERVICES, SERVICE_HEADERS);
  ensureSheet_(ss, HORAE.SHEET_PROFILE, PROFILE_HEADERS);
  initializeRevision_(ss);

  Logger.log('HORAE configurado: ' + ss.getUrl());
  return ss.getUrl();
}

/**
 * Genera o rota el secreto compartido.
 * Copia el valor de los registros de ejecución y guárdalo en Configuración
 * de HORAE. El token no se almacena en el código fuente.
 */
function generateApiToken() {
  const token = [
    Utilities.getUuid().replace(/-/g, ''),
    Utilities.getUuid().replace(/-/g, ''),
    Utilities.getUuid().replace(/-/g, '')
  ].join('');

  PropertiesService.getScriptProperties()
    .setProperty(HORAE.API_TOKEN_PROPERTY, token);

  Logger.log('NUEVO TOKEN HORAE (cópialo ahora): ' + token);
  return 'Token generado. Cópialo desde el registro de ejecución.';
}

function syncData_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ss = getSpreadsheet_();
    const currentRevision = getRevision_();
    const expectedRevision = Number(data.expectedRevision);

    if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
      throw apiError_(
        'CONFLICT',
        'Google Sheets contiene una versión diferente. Descarga primero los datos de Sheets y revisa los cambios locales.'
      );
    }

    writeObjects_(ss.getSheetByName(HORAE.SHEET_RECORDS), data.records, RECORD_HEADERS);
    writeObjects_(ss.getSheetByName(HORAE.SHEET_SERVICES), data.services, SERVICE_HEADERS);
    writeProfile_(ss.getSheetByName(HORAE.SHEET_PROFILE), data.profile || {});

    SpreadsheetApp.flush();

    const nextRevision = currentRevision + 1;
    PropertiesService.getScriptProperties()
      .setProperty(HORAE.REVISION_PROPERTY, String(nextRevision));

    return Object.assign(readAllData_(), { revision: nextRevision });
  } finally {
    lock.releaseLock();
  }
}

function readAllData_() {
  const ss = getSpreadsheet_();
  return {
    records: readObjects_(ss.getSheetByName(HORAE.SHEET_RECORDS)),
    services: readObjects_(ss.getSheetByName(HORAE.SHEET_SERVICES)),
    profile: readProfile_(ss.getSheetByName(HORAE.SHEET_PROFILE)),
    revision: getRevision_()
  };
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties()
    .getProperty(HORAE.SPREADSHEET_ID_PROPERTY);

  if (!id) {
    throw apiError_('NOT_CONFIGURED', 'Primero ejecuta setup() desde Apps Script.');
  }

  const ss = SpreadsheetApp.openById(id);
  ensureSheet_(ss, HORAE.SHEET_RECORDS, RECORD_HEADERS);
  ensureSheet_(ss, HORAE.SHEET_SERVICES, SERVICE_HEADERS);
  ensureSheet_(ss, HORAE.SHEET_PROFILE, PROFILE_HEADERS);
  initializeRevision_(ss);
  return ss;
}

function initializeRevision_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(HORAE.REVISION_PROPERTY) !== null) return;

  const records = ss.getSheetByName(HORAE.SHEET_RECORDS);
  const services = ss.getSheetByName(HORAE.SHEET_SERVICES);
  const hasExistingData =
    (records && records.getLastRow() > 1) ||
    (services && services.getLastRow() > 1);

  // Una hoja ya poblada se marca como revisión 1 para impedir que un
  // dispositivo nuevo la sobrescriba en su primera sincronización.
  props.setProperty(HORAE.REVISION_PROPERTY, hasExistingData ? '1' : '0');
}

function getRevision_() {
  const value = PropertiesService.getScriptProperties()
    .getProperty(HORAE.REVISION_PROPERTY);
  return value === null ? 0 : Math.max(0, Number(value) || 0);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#a5f05c')
    .setFontColor('#172013');

  return sh;
}

function validateSyncData_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw apiError_('INVALID_DATA', 'Los datos de sincronización no son válidos.');
  }

  if (!Array.isArray(data.records) || data.records.length > HORAE.MAX_RECORDS) {
    throw apiError_('INVALID_RECORDS', 'Número de jornadas no válido o superior al límite.');
  }

  if (!Array.isArray(data.services) || data.services.length > HORAE.MAX_SERVICES) {
    throw apiError_('INVALID_SERVICES', 'Número de servicios no válido o superior al límite.');
  }

  if (!Number.isInteger(Number(data.expectedRevision)) || Number(data.expectedRevision) < 0) {
    throw apiError_('INVALID_REVISION', 'La versión de sincronización no es válida.');
  }

  const recordIds = new Set();
  data.records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw apiError_('INVALID_RECORD', 'Jornada no válida en la posición ' + (index + 1) + '.');
    }

    const id = requiredText_(record.id, 'Identificador de jornada');
    if (recordIds.has(id)) {
      throw apiError_('DUPLICATE_RECORD', 'Hay identificadores de jornada duplicados.');
    }
    recordIds.add(id);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date || ''))) {
      throw apiError_('INVALID_DATE', 'Una jornada contiene una fecha no válida.');
    }
    if (record.start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(record.start))) {
      throw apiError_('INVALID_TIME', 'Una jornada contiene una hora de inicio no válida.');
    }
    if (record.end && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(record.end))) {
      throw apiError_('INVALID_TIME', 'Una jornada contiene una hora de fin no válida.');
    }

    optionalNumber_(record.rate, 'Tarifa');
    optionalNumber_(record.fixedAmount, 'Importe fijo');
    optionalNumber_(record.minutes, 'Duración');

    if (record.minutes !== '' && record.minutes != null &&
        (Number(record.minutes) < 0 || Number(record.minutes) > 1440)) {
      throw apiError_('INVALID_MINUTES', 'La duración debe estar entre 0 y 1440 minutos.');
    }

    boundedText_(record.notes, HORAE.MAX_TEXT, 'Notas');
    requiredText_(record.serviceId, 'Servicio');
  });

  const serviceIds = new Set();
  data.services.forEach((service, index) => {
    if (!service || typeof service !== 'object' || Array.isArray(service)) {
      throw apiError_('INVALID_SERVICE', 'Servicio no válido en la posición ' + (index + 1) + '.');
    }

    const id = requiredText_(service.id, 'Identificador de servicio');
    if (serviceIds.has(id)) {
      throw apiError_('DUPLICATE_SERVICE', 'Hay identificadores de servicio duplicados.');
    }
    serviceIds.add(id);

    requiredText_(service.name, 'Nombre de servicio');
    boundedText_(service.color, 40, 'Color');
    boundedText_(service.type, 20, 'Tipo de servicio');
    optionalNumber_(service.rate, 'Tarifa del servicio');
    optionalNumber_(service.fixedAmount, 'Importe fijo del servicio');
  });

  const profile = data.profile || {};
  if (typeof profile !== 'object' || Array.isArray(profile)) {
    throw apiError_('INVALID_PROFILE', 'El perfil no es válido.');
  }
  boundedText_(profile.name, 120, 'Nombre del perfil');
  boundedText_(profile.company, 160, 'Empresa o entidad');
}

function requiredText_(value, label) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > 200) {
    throw apiError_('INVALID_FIELD', label + ' no válido.');
  }
  return text;
}

function boundedText_(value, max, label) {
  const text = String(value == null ? '' : value);
  if (text.length > max) throw apiError_('INVALID_FIELD', label + ' supera el límite permitido.');
  return text;
}

function optionalNumber_(value, label) {
  if (value === '' || value === null || value === undefined) return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000000) {
    throw apiError_('INVALID_NUMBER', label + ' debe ser un número válido y positivo.');
  }
}

function writeObjects_(sheet, objects, headers) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!objects.length) {
    styleHeader_(sheet, headers.length);
    return;
  }

  const rows = objects.map(obj => headers.map(header => safeCellValue_(obj[header])));
  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(rows);
  styleHeader_(sheet, headers.length);
  sheet.autoResizeColumns(1, headers.length);
}

function safeCellValue_(value) {
  if (value === undefined || value === null) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : value;

  // Evita que contenido externo se interprete como fórmula de Sheets.
  if (typeof text === 'string' && /^[\s]*[=+@\-]/.test(text)) {
    text = "'" + text;
  }
  return text;
}

function writeProfile_(sheet, profile) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([PROFILE_HEADERS]);
  const rows = [
    ['name', safeCellValue_(String(profile.name || ''))],
    ['company', safeCellValue_(String(profile.company || ''))]
  ];
  sheet.getRange(2, 1, rows.length, 2).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  styleHeader_(sheet, 2);
}

function styleHeader_(sheet, columns) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columns)
    .setFontWeight('bold')
    .setBackground('#a5f05c')
    .setFontColor('#172013');
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  return values.slice(1)
    .filter(row => row.some(value => value !== ''))
    .map(row => {
      const item = {};
      headers.forEach((header, index) => { item[header] = row[index]; });

      ['rate', 'fixedAmount', 'minutes'].forEach(key => {
        if (item[key] !== '' && item[key] != null) item[key] = Number(item[key]);
      });

      if (item.active === 'true' || item.active === true) item.active = true;
      if (item.active === 'false' || item.active === false) item.active = false;
      return item;
    });
}

function readProfile_(sheet) {
  const values = sheet.getDataRange().getValues();
  const profile = {};
  values.slice(1).forEach(row => {
    if (row[0]) profile[String(row[0])] = String(row[1] || '');
  });
  return { name: profile.name || '', company: profile.company || '' };
}

function assertApiToken_(provided) {
  const expected = PropertiesService.getScriptProperties()
    .getProperty(HORAE.API_TOKEN_PROPERTY);

  if (!expected) {
    throw apiError_('NOT_CONFIGURED', 'El token de HORAE no está configurado. Ejecuta generateApiToken().');
  }

  if (!constantTimeEquals_(String(provided || ''), expected)) {
    throw apiError_('UNAUTHORIZED', 'Token incorrecto. Revisa la configuración de seguridad.');
  }
}

function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function apiError_(code, message) {
  const error = new Error(message);
  error.horaeCode = code;
  return error;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
