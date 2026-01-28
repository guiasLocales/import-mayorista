import { getAccessToken } from './google-auth.js';
import { mapSheetRows } from './utils.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Reads products from the specified Category sheet
 */
export async function readProducts(env, category) {
    if (!env.GOOGLE_PRIVATE_KEY) throw new Error('MISSING_SECRET: GOOGLE_PRIVATE_KEY no está configurado (asegurate de haber hecho click en Encrypt).');
    if (!env.GOOGLE_CLIENT_EMAIL) throw new Error('MISSING_VAR: GOOGLE_CLIENT_EMAIL no está configurado.');
    const token = await getAccessToken(env.GOOGLE_CLIENT_EMAIL, env.GOOGLE_PRIVATE_KEY);

    // Fetch entire sheet (assuming header is row 1)
    const url = `${SHEETS_API_BASE}/${env.SPREADSHEET_ID}/values/${category}!A:Z?majorDimension=ROWS`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
        if (res.status === 400) throw new Error(`Category sheet '${category}' not found.`);
        throw new Error(`Sheets API Error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const rows = data.values;

    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map(h => String(h).trim());
    const dataRows = rows.slice(1);

    // Dynamic Column Mapping
    const idx = {
        id: headers.indexOf('product_id'),
        code: headers.indexOf('product_code'),
        name: headers.indexOf('product_name'),
        price: headers.indexOf('price'),
        stockFlag: headers.indexOf('product_use_stock'),
        img: headers.indexOf('full_image_url'),
    };

    // Integrity Check
    const required = ['product_code', 'product_name', 'price', 'product_use_stock', 'full_image_url'];
    for (const r of required) {
        if (headers.indexOf(r) === -1) throw new Error(`Missing column '${r}' in sheet '${category}'`);
    }

    // Filter and Map
    return dataRows
        .filter(r => {
            const img = r[idx.img];
            return img && img !== 'No Image';
        })
        .map(r => {
            const stockCell = r[idx.stockFlag];
            const hasStock = String(stockCell).toLowerCase() === 'true';

            const idVal = (idx.id !== -1) ? r[idx.id] : '';
            const codeVal = r[idx.code];

            return {
                id: String(idVal || codeVal || ''),
                code: String(codeVal || ''),
                name: String(r[idx.name] || ''),
                price: Number(r[idx.price] || 0),
                img: String(r[idx.img] || ''),
                stock: hasStock,
            };
        });
}

/**
 * Appends a new order to the 'Pedidos' sheet
 */
export async function appendOrder(env, orderData, categoryName) {
    const SHEET_NAME = 'Pedidos';
    const token = await getAccessToken(env.GOOGLE_CLIENT_EMAIL, env.GOOGLE_PRIVATE_KEY);

    // 1. Get Headers to map columns correctly
    const rangeHeader = `${SHEET_NAME}!1:1`;
    const urlHeader = `${SHEETS_API_BASE}/${env.SPREADSHEET_ID}/values/${rangeHeader}`;

    const resHeader = await fetch(urlHeader, { headers: { Authorization: `Bearer ${token}` } });

    // If sheet doesn't exist or is empty, we might need to create it. 
    // For simplicity in Worker V1, we assume the sheet 'Pedidos' exists with headers.
    if (!resHeader.ok) throw new Error(`Could not access '${SHEET_NAME}' sheet.`);

    const headerData = await resHeader.json();
    if (!headerData.values || !headerData.values[0]) throw new Error(`'${SHEET_NAME}' sheet seems empty.`);

    const headers = headerData.values[0].map(h => String(h).trim());

    // Map fields to header indices
    // 'timestamp','client_name','client_phone','client_email','product_id','product_code','product_name','unit_price','quantity','subtotal','order_total','id_operacion','notificacion_enviada','categoria'
    const colIndex = {};
    headers.forEach((h, i) => { if (h) colIndex[h] = i; });

    const ts = new Date().toISOString();
    // Note: Apps Script uses JS Date object which Sheets interprets nicely. 
    // JSON API expects values. Strings like "2023-01-01T..." are usually fine, or format manually.
    // We'll send standard ISO string for now.

    const { client, items, total: orderTotal } = orderData;

    const rowsToAppend = items.map(it => {
        const row = Array(headers.length).fill('');

        const setVal = (colName, val) => {
            if (colIndex[colName] !== undefined) row[colIndex[colName]] = val;
        };

        setVal('timestamp', ts);
        setVal('client_name', client.name);
        setVal('client_phone', client.phone);
        setVal('client_email', client.email);

        setVal('product_id', it.id);
        setVal('product_code', it.code);
        setVal('product_name', it.name);

        setVal('unit_price', it.price);
        setVal('quantity', it.qty);
        setVal('subtotal', it.price * it.qty);
        setVal('order_total', orderTotal);

        setVal('categoria', categoryName);

        return row;
    });

    // 2. Append Data
    const urlAppend = `${SHEETS_API_BASE}/${env.SPREADSHEET_ID}/values/${SHEET_NAME}!A:A:append?valueInputOption=USER_ENTERED`;

    const resAppend = await fetch(urlAppend, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            range: `${SHEET_NAME}!A:A`,
            majorDimension: 'ROWS',
            values: rowsToAppend
        })
    });

    if (!resAppend.ok) {
        throw new Error(`Failed to append order: ${resAppend.status} ${await resAppend.text()}`);
    }

    return { inserted: rowsToAppend.length };
}

/**
 * Reads configuration from 'Config' sheet
 * Returns object with keys: MIN_TOTAL, DISCOUNT_THRESHOLD, DISCOUNT_RATE
 */
export async function readConfig(env) {
    const token = await getAccessToken(env.GOOGLE_CLIENT_EMAIL, env.GOOGLE_PRIVATE_KEY);
    const url = `${SHEETS_API_BASE}/${env.SPREADSHEET_ID}/values/Config!A:B?majorDimension=ROWS`;

    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null; // Graceful fallback

        const data = await res.json();
        const rows = data.values || [];

        const config = {};
        rows.forEach(row => {
            if (row.length >= 2) {
                const key = String(row[0]).trim();
                const val = parseFloat(String(row[1]).replace(/[^0-9.]/g, '')); // Sanitize number
                if (key && !isNaN(val)) {
                    // Special case for percentage if user put "20" instead of "0.20"
                    if (key === 'DISCOUNT_RATE' && val > 1) {
                        config[key] = val / 100;
                    } else {
                        config[key] = val;
                    }
                }
            }
        });

        return config;
    } catch (e) {
        console.error('Error reading config', e);
        return null;
    }
}
