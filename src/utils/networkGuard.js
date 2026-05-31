const dns = require('dns').promises;
const net = require('net');

const DNS_LOOKUP_TIMEOUT_MS = 3000;
const BLOCKED_HOST_SUFFIXES = [
    '.localhost',
    '.local',
    '.internal',
    '.lan',
    '.home',
    '.corp',
];

function normalizeHost(host) {
    return String(host || '')
        .trim()
        .replace(/^\[(.*)\]$/, '$1')
        .replace(/\.$/, '')
        .toLowerCase();
}

function parseHostAllowlist(value = process.env.PUBLIC_NODE_HOST_ALLOWLIST || '') {
    return value
        .split(',')
        .map(entry => normalizeHost(entry))
        .filter(Boolean);
}

function isHostAllowedByAllowlist(host, allowlist = []) {
    if (!allowlist.length) return true;

    const normalized = normalizeHost(host);
    return allowlist.some((entry) => {
        if (entry.startsWith('*.')) {
            const suffix = entry.slice(1);
            return normalized.endsWith(suffix) && normalized !== suffix.slice(1);
        }
        return normalized === entry;
    });
}

function ipv4ToInt(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return null;
    }
    return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function ipv4InRange(address, base, bits) {
    const addressInt = ipv4ToInt(address);
    const baseInt = ipv4ToInt(base);
    if (addressInt === null || baseInt === null) return false;

    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    return (addressInt & mask) === (baseInt & mask);
}

function isBlockedIPv4(address) {
    return [
        ['0.0.0.0', 8],
        ['10.0.0.0', 8],
        ['100.64.0.0', 10],
        ['127.0.0.0', 8],
        ['169.254.0.0', 16],
        ['172.16.0.0', 12],
        ['192.0.0.0', 24],
        ['192.0.2.0', 24],
        ['192.168.0.0', 16],
        ['198.18.0.0', 15],
        ['198.51.100.0', 24],
        ['203.0.113.0', 24],
        ['224.0.0.0', 4],
        ['240.0.0.0', 4],
    ].some(([base, bits]) => ipv4InRange(address, base, bits));
}

function isBlockedIPv6(address) {
    const normalized = address.toLowerCase();

    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('::ffff:')) {
        return isBlockedIp(normalized.slice('::ffff:'.length));
    }

    const firstSegment = normalized.split(':')[0];
    if (!firstSegment) return false;

    const first = parseInt(firstSegment, 16);
    if (!Number.isFinite(first)) return false;

    return (
        (first & 0xFE00) === 0xFC00 || // unique local fc00::/7
        (first & 0xFFC0) === 0xFE80 || // link-local fe80::/10
        (first & 0xFF00) === 0xFF00    // multicast ff00::/8
    );
}

function isBlockedIp(address) {
    const version = net.isIP(address);
    if (version === 4) return isBlockedIPv4(address);
    if (version === 6) return isBlockedIPv6(address);
    return true;
}

function isBlockedHostname(host) {
    const normalized = normalizeHost(host);
    return (
        normalized === 'localhost' ||
        !normalized.includes('.') ||
        BLOCKED_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix))
    );
}

function isValidHostname(host) {
    const normalized = normalizeHost(host);
    if (!normalized || normalized.length > 253) return false;
    if (/[\s/@\\]/.test(normalized)) return false;
    if (net.isIP(normalized)) return true;

    return normalized.split('.').every(label =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/.test(label) &&
        !label.startsWith('-') &&
        !label.endsWith('-')
    );
}

async function resolveHostAddresses(host) {
    let timeout;
    try {
        return await Promise.race([
            dns.lookup(host, { all: true, verbatim: true }),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_LOOKUP_TIMEOUT_MS);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

async function isSafeExternalHost(host, { allowlist = [] } = {}) {
    const normalized = normalizeHost(host);

    if (!isHostAllowedByAllowlist(normalized, allowlist)) return false;
    if (!isValidHostname(normalized)) return false;

    const ipVersion = net.isIP(normalized);
    if (ipVersion) return !isBlockedIp(normalized);
    if (isBlockedHostname(normalized)) return false;

    const addresses = await resolveHostAddresses(normalized);
    if (!addresses.length) return false;

    return addresses.every(entry => !isBlockedIp(entry.address));
}

module.exports = {
    normalizeHost,
    parseHostAllowlist,
    isHostAllowedByAllowlist,
    isBlockedIp,
    isValidHostname,
    isSafeExternalHost,
};
