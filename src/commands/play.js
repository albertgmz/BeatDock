const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isLavalinkAvailable, handleLavalinkError } = require('../utils/interactionHelpers');
const { validatePlaybackQuery } = require('../utils/queryGuard');
const { getValidVolume } = require('../utils/volumeValidator');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song from YouTube.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song to play (URL or search query).')
                .setRequired(true)
                .setMaxLength(500))
        .addBooleanOption(option =>
            option.setName('next')
                .setDescription('Add the song to play next in the queue.')
                .setRequired(false)),
    async execute(interaction) {
        const { client, guild, member, options } = interaction;
        const query = options.getString('query');
        const playNext = options.getBoolean('next') || false;
        const voiceChannel = member.voice.channel;
        const lang = client.defaultLanguage;

        try {
            if (!voiceChannel) {
                return await interaction.reply({ content: client.languageManager.get(lang, 'NOT_IN_VOICE'), flags: MessageFlags.Ephemeral });
            }

            const querySafety = await validatePlaybackQuery(query);
            if (!querySafety.allowed) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'QUERY_NOT_ALLOWED'),
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if Lavalink is available
            if (!isLavalinkAvailable(client)) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'LAVALINK_UNAVAILABLE'),
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();
            logger.cmd(`/play "${query}" by ${member.user.tag} in #${interaction.channel.name} (Guild: ${guild.name})`);
            let player = client.lavalink.getPlayer(guild.id);

            if (!player) {
                // Create a new player if one doesn't exist
                player = client.lavalink.createPlayer({
                    guildId: guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: getValidVolume(process.env.DEFAULT_VOLUME, 80),
                });
            }

            // Check if the bot is in a different voice channel
            if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'ERROR_SAME_VOICE_CHANNEL'),
                });
            }
            
            // Connect if not connected
            if (!player.connected) {
                player.connect();
            }
            
            const res = await player.search({
                query: query,
            }, interaction.user);

            if (!res || !res.tracks.length) {
                return interaction.editReply({ content: client.languageManager.get(lang, 'NO_RESULTS') });
            }

            player.queue.add(
                res.loadType === "playlist" ? res.tracks : res.tracks[0],
                playNext ? 0 : undefined
            );

            if (!player.playing) {
                player.play();
            }

            let replyContent;
            if (res.loadType === "playlist") {
                const key = playNext ? 'PLAYLIST_ADDED_NEXT' : 'PLAYLIST_ADDED';
                replyContent = client.languageManager.get(lang, key, res.playlist?.title);
            } else {
                const trackTitle = res.tracks[0].info?.title || client.languageManager.get(lang, 'UNKNOWN_TITLE');
                const key = playNext ? 'SONG_ADDED_NEXT' : 'SONG_ADDED';
                replyContent = client.languageManager.get(lang, key, trackTitle);
            }

            await interaction.editReply({ content: replyContent });

            // Send or update the player controller
            const existingMessageId = client.playerController.playerMessages.get(guild.id);
            if (existingMessageId) {
                await client.playerController.updatePlayer(guild.id);
            } else {
                await client.playerController.sendPlayer(interaction.channel, player);
            }
            
        } catch (error) {
            if (error.code === 10062) {
                logger.warn('Interaction expired for /play command');
                return;
            }
            logger.error('Error in play command:', error);
            await handleLavalinkError(interaction, error, client);
        }
    },
};
