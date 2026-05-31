const { Events } = require('discord.js');
const searchSessions = require('../utils/searchSessions');
const { emptyChannelTimeouts } = require('./voiceStateUpdate');
const { clearGuildLifecycleTimers } = require('../utils/playerLifecycle');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild) {
        const client = guild.client;
        const guildId = guild.id;

        // Clean up Lavalink player and controller message
        const player = client.lavalink.getPlayer(guildId);
        clearGuildLifecycleTimers(guildId);
        if (player) player.destroy();
        client.playerController.deletePlayer(guildId);

        // Clean up search sessions for this guild
        searchSessions.cleanupGuildSessions(guildId);

        // Clean up state maps
        client.activePlayers.delete(guildId);
        client.autoplayEnabled.delete(guildId);
        client.updatePresence();

        // Clear any pending empty-channel disconnect timer
        if (emptyChannelTimeouts.has(guildId)) {
            clearTimeout(emptyChannelTimeouts.get(guildId));
            emptyChannelTimeouts.delete(guildId);
        }
    },
};
