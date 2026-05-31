const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const searchSessions = require('../utils/searchSessions');
const { isLavalinkAvailable, handleLavalinkError } = require('../utils/interactionHelpers');
const { createSearchEmbed, createSearchComponents } = require('../utils/embeds');
const { validatePlaybackQuery } = require('../utils/queryGuard');
const { getValidVolume } = require('../utils/volumeValidator');
const logger = require('../utils/logger');



module.exports = {
    /**
     * Slash command data for the /search command
     *
     * Defines the command structure, name, description, and required options
     * for the search functionality. The command requires a search query string
     * with a maximum length of 200 characters.
     *
     * @type {SlashCommandBuilder}
     */
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for music and select tracks to add to the queue.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Search query for music (max 200 characters).')
                .setRequired(true)),
    
    /**
     * Executes the search command
     *
     * Handles the /search command interaction by:
     * 1. Validating user input and voice channel membership
     * 2. Creating or retrieving a Lavalink player
     * 3. Searching for tracks using the provided query
     * 4. Creating a search session with results
     * 5. Displaying paginated search results with interactive buttons
     *
     * @param {CommandInteraction} interaction - Discord command interaction
     * @returns {Promise<void>} Resolves when command execution is complete
     * @throws {Error} If command execution fails
     */
    async execute(interaction) {
        const { client, guild, member, options } = interaction;
        const query = options.getString('query');
        const voiceChannel = member.voice.channel;
        const lang = client.defaultLanguage;

        try {
            // Input validation
            if (!query || query.trim().length === 0) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'SEARCH_EMPTY_QUERY'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (query.length > 200) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'SEARCH_QUERY_TOO_LONG'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const querySafety = await validatePlaybackQuery(query);
            if (!querySafety.allowed) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'QUERY_NOT_ALLOWED'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!voiceChannel) {
                return await interaction.reply({
                    content: client.languageManager.get(lang, 'NOT_IN_VOICE'),
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

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            logger.cmd(`/search "${query}" by ${member.user.tag} in #${interaction.channel.name} (Guild: ${guild.name})`);
            // Get or create player (without connecting - connection deferred to track selection)
            let player = client.lavalink.getPlayer(guild.id);
            let createdNewPlayer = false;

            if (!player) {
                // Create a new player for searching (NOT connected yet)
                player = client.lavalink.createPlayer({
                    guildId: guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: getValidVolume(process.env.DEFAULT_VOLUME, 80),
                });
                createdNewPlayer = true;
            } else if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
                // Existing player is in a different voice channel
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'ERROR_SAME_VOICE_CHANNEL')
                });
            }

            // Search for tracks using the player
            const searchResult = await player.search({
                query: query.trim(),
            }, interaction.user);

            if (!searchResult || !searchResult.tracks.length) {
                // If we created a new player just for search and got no results, clean up
                if (createdNewPlayer && !player.connected) {
                    player.destroy();
                }
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'NO_RESULTS')
                });
            }

            // Create search session with voice channel info for deferred connection
            const sessionId = searchSessions.createSession(
                interaction.user.id,
                guild.id,
                searchResult.tracks,
                query.trim(),
                voiceChannel.id,
                interaction.channel.id
            );

            // Get initial page data
            const pageData = searchSessions.getCurrentPageData(sessionId);
            if (!pageData) {
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'SEARCH_SESSION_ERROR')
                });
            }

            // Create and send search results with dropdown
            const embed = createSearchEmbed(client, pageData, query.trim());
            const components = createSearchComponents(client, pageData, sessionId);

            await interaction.editReply({
                embeds: [embed],
                components
            });

        } catch (error) {
            if (error.code === 10062) {
                logger.warn('Interaction expired for /search command');
                return;
            }
            logger.error('Error in search command:', error);
            await handleLavalinkError(interaction, error, client);
        }
    },
};
