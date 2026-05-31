const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Toggle loop mode for the current track or queue.'),
    async execute(interaction) {
        const { client } = interaction;
        const { requirePlayer } = require('../utils/interactionHelpers');

        const player = await requirePlayer(interaction);
        if (!player) return;

        logger.cmd(`/loop by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        if (client.autoplayEnabled.get(interaction.guild.id)) {
            return interaction.reply({
                content: client.languageManager.get(client.defaultLanguage, 'AUTOPLAY_BLOCKS_ACTION'),
                flags: MessageFlags.Ephemeral,
            });
        }

        // Cycle through loop modes: off -> track -> queue -> off
        let newMode;
        let modeMessage;

        switch (player.repeatMode) {
            case 'off':
                newMode = 'track';
                modeMessage = client.languageManager.get(client.defaultLanguage, 'LOOP_TRACK_ENABLED');
                break;
            case 'track':
                newMode = 'queue';
                modeMessage = client.languageManager.get(client.defaultLanguage, 'LOOP_QUEUE_ENABLED');
                break;
            case 'queue':
                newMode = 'off';
                modeMessage = client.languageManager.get(client.defaultLanguage, 'LOOP_DISABLED');
                break;
            default:
                newMode = 'track';
                modeMessage = client.languageManager.get(client.defaultLanguage, 'LOOP_TRACK_ENABLED');
        }

        // Set the new repeat mode
        player.setRepeatMode(newMode);

        // Update the player display
        schedulePlayerUpdate(client, interaction.guild.id, 100);

        return interaction.reply({ content: modeMessage, flags: MessageFlags.Ephemeral });
    },
};
