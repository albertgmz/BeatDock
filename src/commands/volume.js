const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requirePlayer } = require('../utils/interactionHelpers');
const { schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjusts the playback volume.')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
    async execute(interaction) {
        const { client, options } = interaction;

        const player = await requirePlayer(interaction);
        if (!player) return;

        const volume = options.getInteger('level');

        logger.cmd(`/volume ${volume} by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        // Set the volume
        player.setVolume(volume);

        // Update the player display
        schedulePlayerUpdate(client, interaction.guild.id, 100);

        return interaction.reply({
            content: client.languageManager.get(client.defaultLanguage, 'VOLUME_SET', volume),
            flags: MessageFlags.Ephemeral
        });
    },
};
