// Simple JWT-like token utilities (no external dependencies)

/**
 * Creates a signed token with expiration
 * @param {object} payload - Data to encode in token
 * @param {string} secret - Secret key for signing
 * @param {number} expiresInHours - Token validity in hours
 * @returns {string} Signed token
 */
export async function createToken(payload, secret, expiresInHours = 24) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
        ...payload,
        iat: now,
        exp: now + (expiresInHours * 3600)
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = await signHMAC(`${headerB64}.${payloadB64}`, secret);

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a token
 * @param {string} token - Token to verify
 * @param {string} secret - Secret key for verification
 * @returns {object|null} Decoded payload if valid, null otherwise
 */
export async function verifyToken(token, secret) {
    try {
        const [headerB64, payloadB64, signature] = token.split('.');
        if (!headerB64 || !payloadB64 || !signature) return null;

        // Verify signature
        const expectedSignature = await signHMAC(`${headerB64}.${payloadB64}`, secret);
        if (signature !== expectedSignature) return null;

        // Decode payload
        const payload = JSON.parse(base64UrlDecode(payloadB64));

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) return null;

        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(str) {
    const base64 = btoa(unescape(encodeURIComponent(str)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return decodeURIComponent(escape(atob(base64)));
}

/**
 * HMAC-SHA256 signing
 */
async function signHMAC(data, secret) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureB64 = btoa(String.fromCharCode(...signatureArray));

    return signatureB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
