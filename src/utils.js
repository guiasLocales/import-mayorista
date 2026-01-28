/**
 * Formatea un número como moneda (ARS)
 * @param {number} n 
 * @returns {string} "$ 1.234,56"
 */
export function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

/**
 * Valida si un string es un email válido
 * @param {string} email 
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Reglas de Negocio (Compartidas)
 */
export const ORDER_RULES = {
  MIN_TOTAL: 100000,
  DISCOUNT_THRESHOLD: 1000000,
  DISCOUNT_RATE: 0.20,
};

/**
 * Normaliza objetos desde Arrays de Google Sheets
 * @param {Array} rows - Filas de la hoja (sin header)
 * @param {Array} headers - Primera fila de la hoja
 * @param {Object} mapping - Mapa { key: 'exact_header_name' }
 */
export function mapSheetRows(rows, headers, mapping) {
  const colMap = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    const idx = headers.indexOf(headerName);
    colMap[key] = idx;
  }

  return rows.map(r => {
    const obj = {};
    for (const [key, idx] of Object.entries(colMap)) {
      obj[key] = idx !== -1 ? r[idx] : null;
    }
    return obj;
  });
}
