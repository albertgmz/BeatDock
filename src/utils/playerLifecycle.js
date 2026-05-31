const logger = require('./logger');

const queueEndTimeouts = new Map();
const pendingPlayerUpdates = new Map();

function clearMappedTimeout(map, guildId) {
    const timeout = map.get(guildId);
    if (!timeout) return;

    clearTimeout(timeout);
    map.delete(guildId);
}

function clearQueueEndTimeout(guildId) {
    clearMappedTimeout(queueEndTimeouts, guildId);
}

function setQueueEndTimeout(guildId, timeout) {
    clearQueueEndTimeout(guildId);
    queueEndTimeouts.set(guildId, timeout);
}

function clearAllQueueEndTimeouts() {
    for (const timeout of queueEndTimeouts.values()) {
        clearTimeout(timeout);
    }
    queueEndTimeouts.clear();
}

function clearPlayerUpdate(guildId) {
    clearMappedTimeout(pendingPlayerUpdates, guildId);
}

function clearAllPlayerUpdates() {
    for (const timeout of pendingPlayerUpdates.values()) {
        clearTimeout(timeout);
    }
    pendingPlayerUpdates.clear();
}

function clearGuildLifecycleTimers(guildId) {
    clearQueueEndTimeout(guildId);
    clearPlayerUpdate(guildId);
}

function schedulePlayerUpdate(client, guildId, delay = 500) {
    if (!client?.playerController || !guildId) return;

    clearPlayerUpdate(guildId);

    const timeout = setTimeout(() => {
        pendingPlayerUpdates.delete(guildId);
        client.playerController.updatePlayer(guildId).catch((error) => {
            logger.debug('Scheduled player update failed:', error?.message || error);
        });
    }, delay);

    pendingPlayerUpdates.set(guildId, timeout);
}

module.exports = {
    queueEndTimeouts,
    clearQueueEndTimeout,
    setQueueEndTimeout,
    clearAllQueueEndTimeouts,
    clearPlayerUpdate,
    clearAllPlayerUpdates,
    clearGuildLifecycleTimers,
    schedulePlayerUpdate,
};
