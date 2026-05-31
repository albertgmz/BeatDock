const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requirePlayer } = require('../utils/interactionHelpers');
const { shuffleQueue } = require('../utils/PlayerActions');
const { schedulePlayerUpdate } = require('../utils/playerLifecycle');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the queue.'),
    async execute(interaction) {
        const { client } = interaction;

        const player = await requirePlayer(interaction, { requireQueue: true });
        if (!player) return;

        logger.cmd(`/shuffle by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        if (client.autoplayEnabled.get(interaction.guild.id)) {
            return interaction.reply({
                content: client.languageManager.get(client.defaultLanguage, 'AUTOPLAY_BLOCKS_ACTION'),
                flags: MessageFlags.Ephemeral,
            });
        }

        shuffleQueue(player);

        // Update the player display
        schedulePlayerUpdate(client, interaction.guild.id, 100);

        return interaction.reply({
            content: client.languageManager.get(client.defaultLanguage, 'QUEUE_SHUFFLED'),
            flags: MessageFlags.Ephemeral
        });
    },
};
