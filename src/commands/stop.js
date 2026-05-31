const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requirePlayer } = require('../utils/interactionHelpers');
const { clearGuildLifecycleTimers } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops playback and clears the queue.'),
    async execute(interaction) {
        const { client } = interaction;

        const player = await requirePlayer(interaction);
        if (!player) return;

        logger.cmd(`/stop by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        client.autoplayEnabled.delete(interaction.guild.id);
        clearGuildLifecycleTimers(interaction.guild.id);
        await player.destroy();
        return interaction.reply({
            content: client.languageManager.get(client.defaultLanguage, 'STOPPED_PLAYBACK'),
            flags: MessageFlags.Ephemeral
        });
    },
};
