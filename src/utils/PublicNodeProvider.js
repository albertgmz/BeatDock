const logger = require('./logger');
const { isSafeExternalHost, normalizeHost, parseHostAllowlist } = require('./networkGuard');

const API_URL = 'https://lavalink-list.ajieblogs.eu.org/All';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (matches API refresh)
const FETCH_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_HOST_LENGTH = 253;
const MAX_PASSWORD_LENGTH = 512;

async function readResponseTextWithLimit(response) {
    if (!response.body?.getReader) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
            throw new Error('Public node API response exceeded size limit');
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error('Public node API response exceeded size limit');
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks).toString('utf8');
}

class PublicNodeProvider {
    constructor() {
        this.nodes = [];
        this.currentIndex = 0;
        this.refreshInterval = null;
    }

    async fetchNodes() {
        let timeout;
        try {
            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            const response = await fetch(API_URL, { signal: controller.signal });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const text = await readResponseTextWithLimit(response);
            const data = JSON.parse(text);
            if (!Array.isArray(data)) throw new Error('Unexpected API response format');
            const allowlist = parseHostAllowlist();
            const checkedNodes = await Promise.all(data.map(node => this.validateNode(node, allowlist)));
            const allV4Nodes = checkedNodes.filter(Boolean);
            const secureNodes = allV4Nodes.filter(node => node.secure === true);
            const v4Nodes = secureNodes.length > 0 ? secureNodes : allV4Nodes;
            if (secureNodes.length === 0 && allV4Nodes.length > 0) {
                logger.warn('No secure public Lavalink nodes found, falling back to insecure nodes');
            }

            if (v4Nodes.length === 0) {
                logger.warn('Public Lavalink API returned no v4 nodes');
                return this.nodes.length > 0; // Keep existing cache if available
            }

            this.nodes = v4Nodes;
            this.currentIndex = 0;
            logger.info(`Fetched ${v4Nodes.length} validated public Lavalink v4 nodes`);
            return true;
        } catch (error) {
            if (this.nodes.length > 0) {
                logger.warn('Failed to refresh public node list, using cached nodes:', error.message);
                return true;
            }
            logger.error('Failed to fetch public Lavalink nodes:', error.message);
            return false;
        } finally {
            clearTimeout(timeout);
        }
    }

    async validateNode(node, allowlist) {
        if (!node || typeof node !== 'object') return null;
        if (node.version !== 'v4') return null;

        const host = normalizeHost(node.host);
        const port = Number(node.port);
        const password = typeof node.password === 'string' ? node.password.trim() : '';
        const secure = node.secure === true;

        if (!host || host.length > MAX_HOST_LENGTH) return null;
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
        if (!password || password.length > MAX_PASSWORD_LENGTH) return null;

        try {
            const safeHost = await isSafeExternalHost(host, { allowlist });
            if (!safeHost) return null;
        } catch (error) {
            logger.debug(`Rejected public Lavalink node ${host}:${port}: ${error.message}`);
            return null;
        }

        return {
            version: 'v4',
            host,
            port,
            password,
            secure,
        };
    }

    getNextNode() {
        if (this.nodes.length === 0) return null;

        const node = this.nodes[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.nodes.length;

        return {
            host: node.host,
            port: node.port,
            authorization: node.password,
            secure: node.secure,
            id: 'main-node',
            retryAmount: 2,
            retryDelay: 3000,
        };
    }

    hasNodes() {
        return this.nodes.length > 0;
    }

    startAutoRefresh() {
        if (this.refreshInterval) return;

        this.refreshInterval = setInterval(() => {
            this.fetchNodes();
        }, REFRESH_INTERVAL_MS);
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

module.exports = PublicNodeProvider;
