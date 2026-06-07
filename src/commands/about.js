const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { version } = require('../../package.json');
const os = require('os');
const logger = require('../utils/logger');

// Helper to format uptime from milliseconds to a readable string
function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let uptime = '';
    if (days > 0) uptime += `${days}d `;
    if (hours > 0) uptime += `${hours}h `;
    if (minutes > 0) uptime += `${minutes}m `;
    uptime += `${seconds}s`;

    return uptime.trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('Displays detailed information about the bot.'),
    async execute(interaction) {
        const { client } = interaction;
        const lang = client.defaultLanguage;

        logger.cmd(`/about by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        

                const embed = new EmbedBuilder()

                    .setColor(0x0099FF)

                    .setTitle(client.languageManager.get(lang, 'ABOUT_TITLE'))

                    .setDescription(client.languageManager.get(lang, 'ABOUT_DESCRIPTION'))

                    .setThumbnail(client.user.displayAvatarURL())

                    .addFields(

                        { 

                            name: '📊 General', 

                            value: `**Version:** \`v${version}\`\n**Servers:** \`${client.guilds.cache.size}\`\n**Active Players:** \`${client.activePlayers.size}\``, 

                            inline: true 

                        },

                                        { 

                                            name: '📈 Latency', 

                                            value: `**API:** \`${client.ws.ping === -1 ? 'Pinging...' : `${Math.round(client.ws.ping)}ms`}\``, 

                                            inline: true 

                                        },

                        { 

                            name: '⚙️ System', 

                            value: `**Uptime:** \`${formatUptime(client.uptime)}\`\n**Node.js:** \`${process.version}\`\n**Platform:** \`${os.platform()}\``, 

                            inline: false

                        }

                    )            .setFooter({ text: 'BeatDock - High-Quality Music Experience' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('GitHub Repository')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/albertgmz/BeatDock')
                    .setEmoji('⭐'),
                new ButtonBuilder()
                    .setLabel('Report an Issue')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/albertgmz/BeatDock/issues')
                    .setEmoji('🐛')
            );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },
};
