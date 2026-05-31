const { MessageFlags } = require('discord.js');
const { checkInteractionPermission } = require('../utils/permissionChecker');
const { handleSearchNavigation } = require('../interactions/searchNavigation');
const { handleFilterNavigation } = require('../interactions/filterNavigation');
const { requirePlayer, requireSameVoice } = require('../utils/interactionHelpers');
const { playPrevious, shuffleQueue, clearQueue, jumpToTrack, createPaginatedQueueResponse } = require('../utils/PlayerActions');
const { clearGuildLifecycleTimers, schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

async function handlePlayerInteraction(interaction, action) {
    const { client } = interaction;
    const player = await requirePlayer(interaction);
    if (!player) return;

    const lang = client.defaultLanguage;

    const sameVoice = await requireSameVoice(interaction, player);
    if (!sameVoice) return;

    switch (action) {
        case 'back': {
            const track = await playPrevious(player);
            await interaction.reply({
                content: track
                    ? client.languageManager.get(lang, 'PLAYING_PREVIOUS', track.info?.title || 'Unknown')
                    : client.languageManager.get(lang, 'NO_PREVIOUS_SONG'),
                flags: MessageFlags.Ephemeral
            });
            break;
        }
        case 'playpause': {
            if (player.paused) {
                await player.resume();
                await interaction.reply({ content: client.languageManager.get(lang, 'RESUMED'), flags: MessageFlags.Ephemeral });
            } else {
                await player.pause();
                await interaction.reply({ content: client.languageManager.get(lang, 'PAUSED'), flags: MessageFlags.Ephemeral });
            }
            break;
        }
        case 'skip': {
            const skipAutoplay = client.autoplayEnabled.get(interaction.guild.id) || false;
            if (player.queue.tracks.length === 0 && player.repeatMode === 'off' && !skipAutoplay) {
                await interaction.reply({ content: client.languageManager.get(lang, 'QUEUE_EMPTY'), flags: MessageFlags.Ephemeral });
            } else if (player.queue.tracks.length === 0 && skipAutoplay) {
                await player.skip(0, false);
                await interaction.reply({ content: client.languageManager.get(lang, 'SONG_SKIPPED'), flags: MessageFlags.Ephemeral });
            } else {
                await player.skip();
                await interaction.reply({ content: client.languageManager.get(lang, 'SONG_SKIPPED'), flags: MessageFlags.Ephemeral });
            }
            break;
        }
        case 'stop': {
            client.autoplayEnabled.delete(interaction.guild.id);
            clearGuildLifecycleTimers(interaction.guild.id);
            await player.destroy();
            await interaction.reply({ content: client.languageManager.get(lang, 'STOPPED_PLAYBACK'), flags: MessageFlags.Ephemeral });
            break;
        }
        case 'shuffle': {
            if (client.autoplayEnabled.get(interaction.guild.id)) {
                await interaction.reply({ content: client.languageManager.get(lang, 'AUTOPLAY_BLOCKS_ACTION'), flags: MessageFlags.Ephemeral });
                return;
            }
            if (player.queue.tracks.length > 0) {
                shuffleQueue(player);
                await interaction.reply({ content: client.languageManager.get(lang, 'QUEUE_SHUFFLED'), flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: client.languageManager.get(lang, 'QUEUE_EMPTY'), flags: MessageFlags.Ephemeral });
            }
            break;
        }
        case 'queue': {
            const queueResponse = createPaginatedQueueResponse(client, player, 1);
            await interaction.reply(queueResponse);
            break;
        }
        case 'clear': {
            if (client.autoplayEnabled.get(interaction.guild.id)) {
                await interaction.reply({ content: client.languageManager.get(lang, 'AUTOPLAY_BLOCKS_ACTION'), flags: MessageFlags.Ephemeral });
                return;
            }
            if (player.queue.tracks.length > 0) {
                clearQueue(player);
                await interaction.reply({ content: client.languageManager.get(lang, 'QUEUE_CLEARED'), flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: client.languageManager.get(lang, 'QUEUE_EMPTY'), flags: MessageFlags.Ephemeral });
            }
            break;
        }
        case 'loop': {
            if (client.autoplayEnabled.get(interaction.guild.id)) {
                await interaction.reply({ content: client.languageManager.get(lang, 'AUTOPLAY_BLOCKS_ACTION'), flags: MessageFlags.Ephemeral });
                return;
            }
            let newMode;
            let modeMessage;
            switch (player.repeatMode || 'off') {
                case 'off': newMode = 'track'; modeMessage = client.languageManager.get(lang, 'LOOP_TRACK_ENABLED'); break;
                case 'track': newMode = 'queue'; modeMessage = client.languageManager.get(lang, 'LOOP_QUEUE_ENABLED'); break;
                case 'queue': newMode = 'off'; modeMessage = client.languageManager.get(lang, 'LOOP_DISABLED'); break;
                default: newMode = 'track'; modeMessage = client.languageManager.get(lang, 'LOOP_TRACK_ENABLED');
            }
            player.setRepeatMode(newMode);
            await interaction.reply({ content: modeMessage, flags: MessageFlags.Ephemeral });
            break;
        }
    }

    if (action !== 'stop') {
        schedulePlayerUpdate(client, interaction.guild.id, 500);
    }
}

async function handleQueueInteraction(interaction, action, args) {
    const { client } = interaction;
    const player = await requirePlayer(interaction);
    if (!player) return;

    const lang = client.defaultLanguage;

    // Check same voice channel for jump action
    if (action === 'jump') {
        const sameVoice = await requireSameVoice(interaction, player);
        if (!sameVoice) return;
    }

    switch (action) {
        case 'first':
        case 'last':
        case 'prev':
        case 'next': {
            const targetPage = parseInt(args[0]);
            if (isNaN(targetPage)) return;

            if (!player.queue.tracks.length && !player.queue.current) {
                return interaction.update({ content: client.languageManager.get(lang, 'QUEUE_EMPTY'), embeds: [], components: [] });
            }

            const queueResponse = createPaginatedQueueResponse(client, player, targetPage);
            await interaction.update(queueResponse);
            break;
        }

        case 'jump': {
            const trackIndex = parseInt(args[0]);
            const currentPage = parseInt(args[1]);

            if (isNaN(trackIndex) || isNaN(currentPage)) return;

            if (!player.queue.tracks.length) {
                return interaction.update({ content: client.languageManager.get(lang, 'QUEUE_EMPTY'), embeds: [], components: [] });
            }

            const jumpedTrack = await jumpToTrack(player, trackIndex);

            if (!jumpedTrack) {
                return interaction.reply({
                    content: client.languageManager.get(lang, 'QUEUE_JUMP_INVALID'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const updatedQueueResponse = createPaginatedQueueResponse(client, player, 1);
            await interaction.update(updatedQueueResponse);

            await interaction.followUp({
                content: client.languageManager.get(lang, 'QUEUE_JUMPED', jumpedTrack.info?.title || 'Unknown'),
                flags: MessageFlags.Ephemeral
            });

            schedulePlayerUpdate(client, interaction.guild.id, 500);
            break;
        }
    }
}

async function handleButtonInteraction(interaction) {
    const { client, customId } = interaction;

    try {
        const hasPermission = await checkInteractionPermission(interaction);
        if (!hasPermission) return;

        const [component, action, ...args] = customId.split(':');

        switch (component) {
            case 'search':
                await handleSearchNavigation(interaction);
                break;
            case 'player':
                await handlePlayerInteraction(interaction, action);
                break;
            case 'queue':
                await handleQueueInteraction(interaction, action, args);
                break;
            case 'filter':
                await handleFilterNavigation(interaction);
                break;
        }
    } catch (error) {
        if (error.code === 10062) {
            logger.warn('Interaction expired for button interaction');
            return;
        }
        logger.error('Error handling button interaction:', error);
        const lang = client.defaultLanguage;
        const reply = { content: client.languageManager.get(lang, 'BUTTON_ERROR'), flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(reply).catch(() => {});
        } else {
            await interaction.reply(reply).catch(() => {});
        }
    }
}

async function handleSelectMenuInteraction(interaction) {
    const { client, customId } = interaction;

    try {
        const hasPermission = await checkInteractionPermission(interaction);
        if (!hasPermission) return;

        const [component, action] = customId.split(':');

        if (component === 'search' && action === 'select') {
            // Route search dropdown to search navigation handler
            await handleSearchNavigation(interaction);
        } else if (component === 'queue' && action === 'select') {
            // Parse selected value: "trackIndex:pageNumber"
            const selectedValue = interaction.values[0];
            const [trackIndexStr, pageStr] = selectedValue.split(':');
            await handleQueueInteraction(interaction, 'jump', [trackIndexStr, pageStr]);
        } else if (component === 'filter' && action === 'select') {
            await handleFilterNavigation(interaction);
        }
    } catch (error) {
        if (error.code === 10062) {
            logger.warn('Interaction expired for select menu interaction');
            return;
        }
        logger.error('Error handling select menu interaction:', error);
        const lang = client.defaultLanguage;
        const reply = { content: client.languageManager.get(lang, 'BUTTON_ERROR'), flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(reply).catch(() => {});
        } else {
            await interaction.reply(reply).catch(() => {});
        }
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            const hasPermission = await checkInteractionPermission(interaction);
            if (!hasPermission) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                if (error.code === 10062) {
                    logger.warn(`Interaction expired for /${interaction.commandName}`);
                    return;
                }
                logger.error(`Error executing command ${interaction.commandName}:`, error);
                const lang = interaction.client.defaultLanguage;
                const reply = { content: interaction.client.languageManager.get(lang, 'ERROR_COMMAND_EXECUTION'), flags: MessageFlags.Ephemeral };
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(reply).catch(() => {});
                } else {
                    await interaction.reply(reply).catch(() => {});
                }
            }
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        }
    },
};
