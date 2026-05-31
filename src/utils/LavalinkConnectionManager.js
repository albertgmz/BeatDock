const logger = require('./logger');

const CONNECTION_TIMEOUT_MS = 15000;
const JITTER_MS = 1000;
const RECONNECT_DELAY_ON_ERROR_MS = 5000;
const MONITORING_CHECK_INTERVAL_MS = 5000;
const MONITORING_FALLBACK_TIMEOUT_MS = 120000;
const CRITICAL_TIMEOUT_MS = 300000;
const PERIODIC_RESET_INTERVAL_MS = 60 * 60 * 1000;
const PING_TIMEOUT_MS = 30 * 60 * 1000;

class LavalinkConnectionManager {
    constructor(client) {
        this.client = client;
        this.state = {
            reconnectAttempts: 0,
            maxReconnectAttempts: parseInt(process.env.LAVALINK_MAX_RECONNECT_ATTEMPTS || "10", 10),
            baseDelay: parseInt(process.env.LAVALINK_BASE_DELAY_MS || "1000", 10),
            maxDelay: parseInt(process.env.LAVALINK_MAX_DELAY_MS || "30000", 10),
            reconnectTimer: null,
            healthCheckInterval: null,
            periodicResetInterval: null,
            lastPing: Date.now(),
            isReconnecting: false,
            cooldownUntil: 0,
            isInitialized: false,
            hasHadSuccessfulConnection: false
        };
    }

    // Check if Lavalink is available
    isAvailable() {
        const mainNode = this.client.lavalink.nodeManager.nodes.get('main-node');
        return mainNode && mainNode.connected;
    }

    // Check if Lavalink manager is ready
    isManagerReady() {
        return this.client.lavalink && this.client.lavalink.nodeManager;
    }

    // Exponential backoff delay calculation
    getReconnectDelay(attempt) {
        const delay = Math.min(this.state.baseDelay * Math.pow(2, attempt), this.state.maxDelay);
        return delay + Math.random() * JITTER_MS;
    }

    // Health check function
    startHealthCheck() {
        if (this.state.healthCheckInterval) {
            clearInterval(this.state.healthCheckInterval);
        }

        const healthCheckInterval = parseInt(process.env.LAVALINK_HEALTH_CHECK_INTERVAL_MS || "30000", 10);
        let lastHealthStatus = true; // Track if we were healthy last time

        this.state.healthCheckInterval = setInterval(() => {
            const mainNode = this.client.lavalink.nodeManager.nodes.get('main-node');
            const isCurrentlyHealthy = mainNode && mainNode.connected;

            if (!isCurrentlyHealthy) {
                logger.warn('Health check: Node not connected, attempting reconnection...');
                lastHealthStatus = false;
                this.attemptReconnection();
            } else {
                // Update last ping time if node is connected
                this.state.lastPing = Date.now();

                // Only log if status changed from unhealthy to healthy
                if (!lastHealthStatus) {
                    logger.debug('Health check: Node is healthy');
                    lastHealthStatus = true;
                }

                // Reset reconnection attempts if we're connected and healthy
                if (this.state.reconnectAttempts > 0) {
                    logger.info('Connection restored, resetting reconnection attempts');
                    this.state.reconnectAttempts = 0;
                }
            }
        }, healthCheckInterval);
    }

    // Periodic reset function - safety net for long-running disconnections
    startPeriodicReset() {
        if (this.state.periodicResetInterval) {
            clearInterval(this.state.periodicResetInterval);
        }

        this.state.periodicResetInterval = setInterval(() => {
            const mainNode = this.client.lavalink.nodeManager.nodes.get('main-node');
            const timeSinceLastPing = Date.now() - this.state.lastPing;

            if (!mainNode || !mainNode.connected || timeSinceLastPing > PING_TIMEOUT_MS) {
                logger.debug('Periodic reset: No recent connection activity, attempting reconnection...');
                this.state.reconnectAttempts = 0; // Reset attempts
                this.attemptReconnection();
            }
        }, PERIODIC_RESET_INTERVAL_MS);
    }

    // Get node config based on mode (local or public)
    async getNodeConfig() {
        if (this.client.lavalinkMode === 'public') {
            const provider = this.client.publicNodeProvider;
            let nodeConfig = provider.getNextNode();

            if (!nodeConfig) {
                logger.debug('No cached public nodes, refreshing list...');
                await provider.fetchNodes();
                nodeConfig = provider.getNextNode();
            }

            if (!nodeConfig) {
                throw new Error('No public Lavalink nodes available');
            }

            logger.info(`Rotating to public node: ${nodeConfig.secure ? 'wss' : 'ws'}://${nodeConfig.host}:${nodeConfig.port}`);
            return nodeConfig;
        }

        return {
            host: process.env.LAVALINK_HOST,
            port: parseInt(process.env.LAVALINK_PORT, 10),
            authorization: process.env.LAVALINK_PASSWORD,
            id: 'main-node',
            reconnectTimeout: 10000,
            reconnectTries: 3,
        };
    }

    // Reconnection logic
    async attemptReconnection() {
        if (this.state.isReconnecting) {
            logger.debug('Reconnection already in progress, skipping');
            return;
        }

        if (this.state.cooldownUntil > Date.now()) {
            return;
        }

        // Check if Lavalink manager is ready
        if (!this.isManagerReady()) {
            logger.debug('Lavalink manager not ready yet, skipping reconnection');
            return;
        }

        this.state.isReconnecting = true;
        let keepReconnectLock = false;
        logger.debug('Starting Lavalink reconnection process...');

        try {
            const mainNode = this.client.lavalink.nodeManager.nodes.get('main-node');

            if (mainNode && mainNode.connected) {
                logger.debug('Node is already connected, skipping reconnection');
                this.state.isReconnecting = false;
                return;
            }

            // Destroy existing node if it exists but is disconnected
            if (mainNode) {
                logger.debug('Destroying existing disconnected node...');
                try {
                    await mainNode.destroy();
                } catch (error) {
                    logger.debug('Error destroying existing node:', error?.message || error);
                }
            }

            // Get node config based on mode
            const nodeConfig = await this.getNodeConfig();

            // Create new node
            logger.info(`Reconnecting Lavalink (attempt ${this.state.reconnectAttempts + 1}/${this.state.maxReconnectAttempts})...`);
            logger.debug(`Connecting to Lavalink server at ${nodeConfig.host}:${nodeConfig.port}...`);

            let newNode;
            try {
                newNode = this.client.lavalink.nodeManager.createNode(nodeConfig);
            } catch (error) {
                throw new Error(`Failed to create node: ${error.message}`);
            }

            // Validate the created node
            if (!newNode) {
                throw new Error('Node creation failed - no node object returned');
            }

            // Wait for connection with proper error handling
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    // Clean up event listeners before rejecting
                    if (typeof newNode.off === 'function') {
                        newNode.off('connect', onConnect);
                        newNode.off('error', onError);
                    }
                    reject(new Error('Connection timeout'));
                }, CONNECTION_TIMEOUT_MS);

                const onConnect = () => {
                    clearTimeout(timeout);
                    // Clean up event listeners on success
                    if (typeof newNode.off === 'function') {
                        newNode.off('connect', onConnect);
                        newNode.off('error', onError);
                    }
                    resolve();
                };

                const onError = (error) => {
                    clearTimeout(timeout);
                    // Clean up event listeners on error
                    if (typeof newNode.off === 'function') {
                        newNode.off('connect', onConnect);
                        newNode.off('error', onError);
                    }
                    reject(error);
                };

                // Check if the node has the event methods
                if (typeof newNode.once === 'function') {
                    newNode.once('connect', onConnect);
                    newNode.once('error', onError);
                } else {
                    // If the node doesn't have event methods, wait a bit and check if it's connected
                    setTimeout(() => {
                        if (newNode.connected) {
                            clearTimeout(timeout);
                            resolve();
                        } else {
                            clearTimeout(timeout);
                            reject(new Error('Node created but not connected'));
                        }
                    }, 2000);
                }
            });

            logger.info('Lavalink reconnection successful');
            this.state.reconnectAttempts = 0;
            this.state.isReconnecting = false;

        } catch (error) {
            logger.error('Reconnection attempt failed:', error?.message || error);
            this.state.reconnectAttempts++;

            if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
                logger.error('Max reconnection attempts reached, will retry after 5 minutes...');
                this.state.isReconnecting = false;

                // Reset attempts after configured period and try again
                const resetMinutes = parseInt(process.env.LAVALINK_RESET_ATTEMPTS_AFTER_MINUTES || "5", 10);
                const resetDelay = resetMinutes * 60 * 1000;

                this.state.cooldownUntil = Date.now() + resetDelay;
                if (this.state.reconnectTimer) clearTimeout(this.state.reconnectTimer);
                this.state.reconnectTimer = setTimeout(() => {
                    logger.info('Resetting reconnection attempts and trying again...');
                    this.state.reconnectAttempts = 0;
                    this.state.isReconnecting = false;
                    this.attemptReconnection();
                }, resetDelay);

                return;
            }

            // Schedule next attempt with exponential backoff
            const delay = this.getReconnectDelay(this.state.reconnectAttempts);
            logger.debug(`Scheduling next reconnection attempt in ${Math.round(delay / 1000)} seconds...`);

            if (this.state.reconnectTimer) clearTimeout(this.state.reconnectTimer);
            this.state.reconnectTimer = setTimeout(() => {
                this.state.isReconnecting = false;
                this.attemptReconnection();
            }, delay);
            keepReconnectLock = true;
        } finally {
            if (!keepReconnectLock) {
                this.state.isReconnecting = false;
            }
        }
    }

    // Handle connection events
    onConnect(node) {
        logger.info('Lavalink node connected successfully');
        this.state.lastPing = Date.now();
        this.state.reconnectAttempts = 0;
        this.state.isReconnecting = false;
        this.state.isInitialized = true;
        this.state.hasHadSuccessfulConnection = true;

        // Clear any pending reconnection timers
        if (this.state.reconnectTimer) {
            clearTimeout(this.state.reconnectTimer);
            this.state.reconnectTimer = null;
        }

        // Start health check after successful connection (if not already started)
        if (!this.state.healthCheckInterval) {
            logger.debug('Starting health checks after successful connection...');
            this.startHealthCheck();
        }

        // Start periodic reset as safety net (if not already started)
        if (!this.state.periodicResetInterval) {
            this.startPeriodicReset();
        }
    }

    onError(node, error) {
        // Don't log or handle errors during startup
        if (!this.state.isInitialized) {
            return;
        }

        // Only log errors if we've had a successful connection before
        if (this.state.hasHadSuccessfulConnection) {
            logger.error('Lavalink node encountered an error:', error);

            // Only trigger reconnection for connection-related errors
            const message = error?.message || '';
            if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || message.includes('Unable to connect')) {
                logger.debug('Connection error detected, will attempt reconnection...');
                setTimeout(() => this.attemptReconnection(), RECONNECT_DELAY_ON_ERROR_MS);
            }
        }
    }

    onDisconnect(node, reason) {
        // Don't log or handle disconnects during startup
        if (!this.state.isInitialized) {
            return;
        }

        // Only log disconnects if we've had a successful connection before
        if (this.state.hasHadSuccessfulConnection) {
            const reasonText = reason?.reason || 'Unknown';
            logger.warn(`Lavalink node disconnected (reason: ${reasonText})`);

            // Clear health check interval
            if (this.state.healthCheckInterval) {
                clearInterval(this.state.healthCheckInterval);
                this.state.healthCheckInterval = null;
            }

            // Clear periodic reset interval
            if (this.state.periodicResetInterval) {
                clearInterval(this.state.periodicResetInterval);
                this.state.periodicResetInterval = null;
            }

            // Attempt reconnection for unexpected disconnections
            if (reasonText !== 'destroy') {
                logger.info('Unexpected disconnection, attempting reconnection...');

                // Different handling based on disconnect reason
                let delay = 2000; // Default 2 seconds

                if (reasonText === 'Socket got terminated due to no ping connection') {
                    logger.debug('No ping connection detected - possible network issue');
                    delay = 5000; // Wait 5 seconds for network issues
                } else if (typeof reasonText === 'string' && reasonText.includes('timeout')) {
                    logger.debug('Connection timeout detected');
                    delay = 3000; // Wait 3 seconds for timeouts
                }

                setTimeout(() => this.attemptReconnection(), delay);
            }
        } else {
            logger.debug('No successful connection yet, not triggering reconnection');
        }
    }

    // Initialize the connection manager after a delay to let Lavalink start up
    initialize() {
        logger.info('Lavalink connection manager initializing...');
        this.state.isInitialized = true;

        // Start monitoring immediately
        this.startMonitoring();
    }

    // Start monitoring for Lavalink availability
    startMonitoring() {
        // Check immediately
        this.checkAndStartHealthChecks();

        // Then check every 5 seconds until we get a connection
        const monitoringInterval = setInterval(() => {
            if (this.isAvailable()) {
                logger.info('Lavalink connection detected, starting health checks...');
                clearInterval(monitoringInterval);
                this.startHealthCheck();
                this.startPeriodicReset();
            }
        }, MONITORING_CHECK_INTERVAL_MS);

        // Stop monitoring after 2 minutes if no connection (fallback)
        setTimeout(() => {
            clearInterval(monitoringInterval);
            if (!this.isAvailable()) {
                logger.warn('No Lavalink connection detected after 2 minutes, starting health checks anyway...');
                this.startHealthCheck();
                this.startPeriodicReset();
            }
        }, MONITORING_FALLBACK_TIMEOUT_MS);

        // Add a longer timeout to warn if Lavalink never starts
        setTimeout(() => {
            if (!this.isAvailable()) {
                logger.error('CRITICAL: Lavalink has not connected after 5 minutes!\n  - Check if Lavalink container is running: docker ps\n  - Check Lavalink logs: docker logs <lavalink-container>\n  - Verify network connectivity between containers');
            }
        }, CRITICAL_TIMEOUT_MS);
    }

    // Check if Lavalink is available and start health checks if it is
    checkAndStartHealthChecks() {
        if (this.isAvailable()) {
            logger.debug('Lavalink already connected, starting health checks...');
            this.startHealthCheck();
            this.startPeriodicReset();
            return true;
        }
        return false;
    }

    // Cleanup function
    destroy() {
        if (this.state.reconnectTimer) {
            clearTimeout(this.state.reconnectTimer);
        }
        if (this.state.healthCheckInterval) {
            clearInterval(this.state.healthCheckInterval);
        }
        if (this.state.periodicResetInterval) {
            clearInterval(this.state.periodicResetInterval);
        }
    }

}

module.exports = LavalinkConnectionManager;
