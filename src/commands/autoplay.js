const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle autoplay mode to automatically play related songs.'),
    async execute(interaction) {
        const { client } = interaction;
        const { requirePlayer } = require('../utils/interactionHelpers');

        const player = await requirePlayer(interaction);
        if (!player) return;

        logger.cmd(`/autoplay by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        const guildId = interaction.guild.id;
        const newState = !client.autoplayEnabled.get(guildId);
        client.autoplayEnabled.set(guildId, newState);

        // When enabling autoplay, reset loop mode (DJ mode takes over)
        if (newState && player.repeatMode !== 'off') {
            player.setRepeatMode('off');
        }

        schedulePlayerUpdate(client, guildId, 100);

        return interaction.reply({
            content: client.t(newState ? 'AUTOPLAY_ENABLED' : 'AUTOPLAY_DISABLED'),
            flags: MessageFlags.Ephemeral,
        });
    },
};
