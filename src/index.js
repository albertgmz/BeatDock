require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const LanguageManager = require('./LanguageManager');
const PlayerController = require('./utils/PlayerController');
const LavalinkConnectionManager = require('./utils/LavalinkConnectionManager');
const PublicNodeProvider = require('./utils/PublicNodeProvider');
const searchSessions = require('./utils/searchSessions');
const { findAutoplayTracks } = require('./utils/autoplay');
const {
    clearQueueEndTimeout,
    setQueueEndTimeout,
    clearAllQueueEndTimeouts,
    clearAllPlayerUpdates,
    clearGuildLifecycleTimers,
    schedulePlayerUpdate,
} = require('./utils/playerLifecycle');
const loadCommands = require('./handlers/commandHandler');
const registerEvents = require('./handlers/eventHandler');
const logger = require('./utils/logger');

const AUTOPLAY_TIMEOUT_MS = 5000;
const TRACK_END_CLEANUP_DELAY_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 5000;
const HEALTHCHECK_HEARTBEAT_PATH = process.env.HEALTHCHECK_HEARTBEAT_PATH || '/tmp/beatdock-alive';
const HEALTHCHECK_HEARTBEAT_INTERVAL_MS = 30000;

function isLocalLavalinkConfigured() {
    const host = process.env.LAVALINK_HOST;
    const port = process.env.LAVALINK_PORT;
    const password = process.env.LAVALINK_PASSWORD;
    return Boolean(host && host.trim() && port && port.trim() && password && password.trim());
}

async function getInitialNodes() {
    if (isLocalLavalinkConfigured()) {
        logger.info('Using local Lavalink server');
        return {
            mode: 'local',
            nodes: [{
                host: process.env.LAVALINK_HOST,
                port: parseInt(process.env.LAVALINK_PORT, 10),
                authorization: process.env.LAVALINK_PASSWORD,
                id: 'main-node',
                reconnectTimeout: 10000,
                reconnectTries: 3,
            }],
            provider: null,
        };
    }

    logger.info('No local Lavalink configured, fetching public Lavalink servers...');
    const provider = new PublicNodeProvider();
    const success = await provider.fetchNodes();

    if (!success || !provider.hasNodes()) {
        throw new Error('Failed to fetch public Lavalink nodes. Cannot start without a Lavalink server.');
    }

    provider.startAutoRefresh();
    const firstNode = provider.getNextNode();
    logger.warn('Using public Lavalink servers — search queries and track requests are sent to third-party servers');
    logger.info(`Selected public node: ${firstNode.secure ? 'wss' : 'ws'}://${firstNode.host}:${firstNode.port}`);

    return {
        mode: 'public',
        nodes: [firstNode],
        provider,
    };
}

function createClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    client.languageManager = new LanguageManager();
    client.defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en';

    client.t = function (key, ...args) {
        return this.languageManager.get(this.defaultLanguage, key, ...args);
    };

    client.playerController = new PlayerController(client);
    client.activePlayers = new Map();
    client.autoplayEnabled = new Map();

    client.updatePresence = function() {
        const activePlayers = Array.from(this.activePlayers.values());

        if (activePlayers.length === 0) {
            this.user.setActivity(null);
        } else if (activePlayers.length === 1) {
            this.user.setActivity(this.t('PLAYING_MUSIC_GENERIC'), { type: ActivityType.Listening });
        } else {
            this.user.setActivity(this.t('PLAYING_MUSIC_IN_SERVERS', activePlayers.length), { type: ActivityType.Listening });
        }
    };

    return client;
}

function writeHealthcheckHeartbeat() {
    fs.writeFile(HEALTHCHECK_HEARTBEAT_PATH, String(Date.now()), (error) => {
        if (error) {
            logger.debug('Failed to write healthcheck heartbeat:', error.message);
        }
    });
}

function startHealthcheckHeartbeat() {
    writeHealthcheckHeartbeat();
    return setInterval(writeHealthcheckHeartbeat, HEALTHCHECK_HEARTBEAT_INTERVAL_MS);
}

function cleanupGuildPlayer(client, guildId) {
    clearGuildLifecycleTimers(guildId);
    client.playerController.deletePlayer(guildId);
    client.activePlayers.delete(guildId);
    client.autoplayEnabled.delete(guildId);
    client.updatePresence();
}

async function setupLavalink(client) {
    const { mode, nodes, provider } = await getInitialNodes();
    client.lavalinkMode = mode;
    client.publicNodeProvider = provider;

    client.lavalink = new LavalinkManager({
        nodes,
        sendToShard: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        autoSkip: true,
        playerOptions: {
            clientBasedPositionUpdateInterval: 1000,
            defaultSearchPlatform: process.env.DEFAULT_SEARCH_PLATFORM || "ytmsearch",
            onEmptyQueue: {
                destroyAfterMs: parseInt(process.env.QUEUE_EMPTY_DESTROY_MS || "30000", 10),
                autoPlayFunction: async (player, lastPlayedTrack) => {
                    if (!client.autoplayEnabled.get(player.guildId)) return;

                    try {
                        const tracks = await findAutoplayTracks(player, lastPlayedTrack);
                        if (!client.autoplayEnabled.get(player.guildId)) return;
                        if (!tracks.length) return;

                        for (const track of tracks) {
                            track.userData = { autoplay: true };
                        }
                        await player.queue.add(tracks);
                    } catch (err) {
                        logger.error('Autoplay failed:', err);
                    }
                },
            }
        },
    });

    client.lavalinkConnectionManager = new LavalinkConnectionManager(client);
    client.lavalinkConnectionManager.initialize();

    client.lavalink.nodeManager.on('connect', (node) => {
        client.lavalinkConnectionManager.onConnect(node);
    });

    client.lavalink.nodeManager.on('error', (node, error) => {
        client.lavalinkConnectionManager.onError(node, error);
    });

    client.lavalink.nodeManager.on('disconnect', (node, reason) => {
        client.lavalinkConnectionManager.onDisconnect(node, reason);
    });
}

function registerLavalinkEvents(client) {
    client.lavalink.on("trackStart", (player, track) => {
        clearQueueEndTimeout(player.guildId);

        if (!client.autoplayEnabled.has(player.guildId)) {
            const autoplayDefault = process.env.AUTOPLAY_DEFAULT === 'true';
            client.autoplayEnabled.set(player.guildId, autoplayDefault);
        }

        schedulePlayerUpdate(client, player.guildId, 0);

        client.activePlayers.set(player.guildId, {
            title: track.info?.title,
            startedAt: Date.now()
        });
        client.updatePresence();

        logger.track(`Now playing: ${track.info?.title} — ${track.info?.author}`);
    });

    client.lavalink.on("trackEnd", (player, track, reason) => {
        logger.debug(`Track ended: ${track.info?.title} (reason: ${reason?.reason || reason})`);
        if (reason === "replaced" || reason === "stopped") return;

        setTimeout(() => {
            if (player.queue.current) {
                schedulePlayerUpdate(client, player.guildId, 0);
            } else if (!client.autoplayEnabled.get(player.guildId)) {
                cleanupGuildPlayer(client, player.guildId);
            }
        }, TRACK_END_CLEANUP_DELAY_MS);
    });

    client.lavalink.on("queueEnd", (player) => {
        const guildId = player.guildId;

        clearQueueEndTimeout(guildId);

        if (client.autoplayEnabled.get(guildId)) {
            const timeout = setTimeout(() => {
                clearQueueEndTimeout(guildId);

                const currentPlayer = client.lavalink.getPlayer(guildId);
                if (currentPlayer?.queue.current || currentPlayer?.playing) return;

                const playerMessage = client.playerController.playerMessages.get(guildId);
                if (playerMessage) {
                    const textChannel = client.channels.cache.get(playerMessage.channelId);
                    if (textChannel) {
                        textChannel.send(client.t('QUEUE_ENDED')).catch(() => {});
                    }
                }
                cleanupGuildPlayer(client, guildId);
            }, AUTOPLAY_TIMEOUT_MS);
            setQueueEndTimeout(guildId, timeout);
            return;
        }

        const playerMessage = client.playerController.playerMessages.get(guildId);
        if (playerMessage) {
            const textChannel = client.channels.cache.get(playerMessage.channelId);
            if (textChannel) {
                textChannel.send(client.t('QUEUE_ENDED')).catch(() => {});
            }
        }
        cleanupGuildPlayer(client, guildId);
    });

    client.lavalink.on("trackStuck", (player, track, payload) => {
        logger.warn(`Track stuck: ${track?.info?.title} (threshold: ${payload.thresholdMs}ms)`);
    });

    client.lavalink.on("trackError", (player, track, payload) => {
        logger.error(`Track error: ${track?.info?.title} — ${payload.exception?.message || payload.error || 'Unknown error'}`);
    });
}

function setupShutdown(client) {
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        client.lavalinkConnectionManager.destroy();
        clearAllQueueEndTimeouts();
        clearAllPlayerUpdates();

        if (client.healthcheckHeartbeat) {
            clearInterval(client.healthcheckHeartbeat);
            client.healthcheckHeartbeat = null;
        }

        client.publicNodeProvider?.destroy();

        searchSessions.destroy();

        const shutdownWork = (async () => {
            await Promise.allSettled([...client.lavalink.players.values()].map(player => player.destroy()));
            await Promise.allSettled([...client.lavalink.nodeManager.nodes.values()].map(node => node.destroy()));
            await client.destroy();
        })();

        const result = await Promise.race([
            shutdownWork.then(() => 'complete'),
            new Promise(resolve => setTimeout(() => resolve('timeout'), SHUTDOWN_TIMEOUT_MS)),
        ]);

        if (result === 'timeout') {
            logger.warn(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms deadline; exiting`);
        }

        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function bootstrap() {
    const client = createClient();
    await setupLavalink(client);
    registerLavalinkEvents(client);
    loadCommands(client);
    registerEvents(client);
    setupShutdown(client);
    await client.login(process.env.TOKEN);
    client.healthcheckHeartbeat = startHealthcheckHeartbeat();
}

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

bootstrap().catch(err => {
    logger.error('Failed to start bot:', err);
    process.exit(1);
});
