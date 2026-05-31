const { isSafeExternalHost } = require('./networkGuard');

const SEARCH_PREFIXES = [
    'ytsearch:',
    'ytmsearch:',
    'scsearch:',
    'spsearch:',
    'amsearch:',
    'dzsearch:',
    'ymsearch:',
];

const BLOCKED_PROTOCOLS = new Set([
    'data:',
    'file:',
    'ftp:',
    'gopher:',
    'javascript:',
]);

const QUERY_VALIDATION_TIMEOUT_MS = 2500;

function stripToken(token) {
    return token.replace(/^[<("'`]+|[>)"',`]+$/g, '');
}

function hasSearchPrefix(value) {
    const lower = value.toLowerCase();
    return SEARCH_PREFIXES.some(prefix => lower.startsWith(prefix));
}

function parseUrlToken(token) {
    const cleaned = stripToken(token);
    if (!cleaned || hasSearchPrefix(cleaned)) return null;

    if (/^https?:\/\//i.test(cleaned)) {
        return new URL(cleaned);
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) {
        return new URL(cleaned);
    }

    if (/^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(:\d+)?(\/|$)/i.test(cleaned)) {
        return new URL(`https://${cleaned}`);
    }

    if (/^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?\//i.test(cleaned)) {
        return new URL(`https://${cleaned}`);
    }

    return null;
}

async function validatePlaybackQueryInner(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed || hasSearchPrefix(trimmed)) {
        return { allowed: true };
    }

    const tokens = trimmed.match(/\S+/g) || [];

    for (const token of tokens) {
        let url;
        try {
            url = parseUrlToken(token);
        } catch {
            return { allowed: false, reason: 'invalid-url' };
        }

        if (!url) continue;

        if (BLOCKED_PROTOCOLS.has(url.protocol)) {
            return { allowed: false, reason: 'blocked-protocol' };
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            continue;
        }

        let safeHost = false;
        try {
            safeHost = await isSafeExternalHost(url.hostname);
        } catch {
            return { allowed: false, reason: 'blocked-host' };
        }
        if (!safeHost) {
            return { allowed: false, reason: 'blocked-host' };
        }
    }

    return { allowed: true };
}

// Caps total validation latency so callers can run this before the Discord
// interaction ACK (3s budget). Timeout fails closed to match the security
// guarantees documented in the PR.
async function validatePlaybackQuery(query) {
    let timeoutId;
    try {
        return await Promise.race([
            validatePlaybackQueryInner(query),
            new Promise(resolve => {
                timeoutId = setTimeout(
                    () => resolve({ allowed: false, reason: 'timeout' }),
                    QUERY_VALIDATION_TIMEOUT_MS,
                );
            }),
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = { validatePlaybackQuery };
