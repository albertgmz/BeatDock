const { MessageFlags } = require('discord.js');
const searchSessions = require('../utils/searchSessions');
const { isLavalinkAvailable } = require('../utils/interactionHelpers');
const { createSearchEmbed, createSearchComponents } = require('../utils/embeds');
const { getValidVolume } = require('../utils/volumeValidator');
const { clearGuildLifecycleTimers, schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

async function handleSearchNavigation(interaction) {
    const { client, customId, user, guild } = interaction;
    const lang = client.defaultLanguage;

    try {
        const parts = customId.split(':');
        const [component, action, sessionId, ...args] = parts;

        if (component !== 'search') return;

        // Get search session
        const session = searchSessions.getSession(sessionId);
        
        if (!session) {
            return interaction.update({
                content: client.languageManager.get(lang, 'SEARCH_SESSION_EXPIRED'),
                embeds: [],
                components: []
            });
        }
        
        // Validate session ownership
        if (session.userId !== user.id) {
            return interaction.reply({
                content: client.languageManager.get(lang, 'SEARCH_NOT_YOUR_SESSION'),
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if Lavalink is available
        if (!isLavalinkAvailable(client)) {
            return interaction.reply({
                content: client.languageManager.get(lang, 'LAVALINK_UNAVAILABLE'),
                flags: MessageFlags.Ephemeral
            });
        }

        let shouldUpdate = false;
        let responseMessage = null;

        await interaction.deferUpdate();

        switch (action) {
            case 'prev':
                if (searchSessions.updatePage(sessionId, session.currentPage - 1)) {
                    shouldUpdate = true;
                }
                break;

            case 'next':
                if (searchSessions.updatePage(sessionId, session.currentPage + 1)) {
                    shouldUpdate = true;
                }
                break;

            case 'select':
                // Handle dropdown selection - connect player on demand
                const trackIndex = parseInt(interaction.values[0]);
                if (!isNaN(trackIndex)) {
                    const track = session.tracks[trackIndex];
                    if (track) {
                        // Validate user still in voice channel
                        const member = await guild.members.fetch(user.id);
                        const voiceChannel = member.voice.channel;

                        if (!voiceChannel) {
                            return interaction.followUp({
                                content: client.languageManager.get(lang, 'NOT_IN_VOICE'),
                                flags: MessageFlags.Ephemeral
                            });
                        }

                        // Get or create player
                        let player = client.lavalink.getPlayer(guild.id);

                        if (!player) {
                            // Create player if it doesn't exist
                            player = client.lavalink.createPlayer({
                                guildId: guild.id,
                                voiceChannelId: session.voiceChannelId,
                                textChannelId: session.textChannelId,
                                selfDeaf: true,
                                selfMute: false,
                                volume: getValidVolume(process.env.DEFAULT_VOLUME, 80),
                            });
                        }

                        // Connect if not already connected (player may exist from search but not be connected)
                        if (!player.connected) {
                            await player.connect();
                        }

                        // Add track and play
                        player.queue.add(track);
                        if (!player.playing) player.play();

                        const trackTitle = track.info?.title || 'Unknown';

                        // Send or update the player controller
                        const existingMessageId = client.playerController.playerMessages.get(guild.id);
                        if (existingMessageId) {
                            schedulePlayerUpdate(client, guild.id, 100);
                        } else {
                            // Get the text channel to send the player UI
                            const textChannel = await client.channels.fetch(session.textChannelId).catch(() => null);
                            if (textChannel) {
                                setTimeout(() => client.playerController.sendPlayer(textChannel, player).catch(() => {}), 100);
                            }
                        }

                        // Clean up search session after selection
                        searchSessions.deleteSession(sessionId);

                        // Clear the search UI and show confirmation
                        await interaction.editReply({
                            content: client.languageManager.get(lang, 'SEARCH_TRACK_ADDED', trackTitle),
                            embeds: [],
                            components: []
                        });
                        return; // Exit early
                    }
                }
                break;

            case 'cancel':
                // Clean up player if it was created for search but never connected
                const existingPlayer = client.lavalink.getPlayer(guild.id);
                if (existingPlayer && !existingPlayer.connected && !existingPlayer.playing) {
                    client.autoplayEnabled.delete(guild.id);
                    clearGuildLifecycleTimers(guild.id);
                    existingPlayer.destroy();
                }

                searchSessions.deleteSession(sessionId);
                await interaction.editReply({
                    content: client.languageManager.get(lang, 'SEARCH_CANCELLED'),
                    embeds: [],
                    components: []
                });
                return; // Exit early
        }

        if (shouldUpdate) {
            const pageData = searchSessions.getCurrentPageData(sessionId);
            if (pageData) {
                const embed = createSearchEmbed(client, pageData, session.query);
                const components = createSearchComponents(client, pageData, sessionId);
                await interaction.editReply({ embeds: [embed], components });
            }
        }

        if (responseMessage) {
            await interaction.followUp({ content: responseMessage, flags: MessageFlags.Ephemeral });
        }

    } catch (error) {
        logger.error('Error handling search navigation:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate().catch(() => {});
        }
        await interaction.followUp({
            content: client.languageManager.get(lang, 'SEARCH_INTERACTION_ERROR'),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
}

module.exports = {
    handleSearchNavigation,
};
