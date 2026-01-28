/**
 * GOOGLE AUTH MODULE
 * Generates JWT and exchanges it for an Access Token using Web Crypto API.
 */

// Helper: Base64Url Encode
function base64UrlEncode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function arrayBufferToBase64Url(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return base64UrlEncode(binary);
}

// Helper: Import PEM Key for Web Crypto
async function importPrivateKey(pem) {
    // Remove headers and newlines
    const pemContents = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        false,
        ["sign"]
    );
}

/**
 * Generates a signed JWT for Google Service Account
 */
async function generateJWT(clientEmail, privateKey) {
    const header = {
        alg: "RS256",
        typ: "JWT"
    };

    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
    const unsignedToken = `${encodedHeader}.${encodedClaimSet}`;

    const key = await importPrivateKey(privateKey);
    const signatureBuffer = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(unsignedToken)
    );

    const encodedSignature = arrayBufferToBase64Url(signatureBuffer);
    return `${unsignedToken}.${encodedSignature}`;
}

/**
 * TOKEN CACHE (Available only within the same instance life)
 * For production, consider using KV or Durable Objects for better caching,
 * but global variable works for hot instances.
 */
let cachedToken = null;
let tokenExpiry = 0;

export async function getAccessToken(clientEmail, privateKey) {
    const now = Date.now();

    // Return cached token if valid (buffer of 60s)
    if (cachedToken && now < tokenExpiry - 60000) {
        return cachedToken;
    }

    const jwt = await generateJWT(clientEmail, privateKey);

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google Auth Failed: ${response.status} - ${text}`);
    }

    const data = await response.json();

    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in * 1000);

    return cachedToken;
}
