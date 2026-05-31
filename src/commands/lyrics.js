const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { requirePlayer } = require('../utils/interactionHelpers');
const { cleanArtist, cleanTitle, splitArtistFromTitle } = require('../utils/trackText');
const { version } = require('../../package.json');
const logger = require('../utils/logger');

const MAX_EMBED_LENGTH = 4096;
const LYRICS_TIMEOUT_MS = 8000;

async function fetchLyrics(title, artist, durationSec) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LYRICS_TIMEOUT_MS);

    try {
        const params = new URLSearchParams({
            track_name: title,
            artist_name: artist,
        });
        if (durationSec) params.set('duration', String(Math.round(durationSec)));

        const response = await fetch(`https://lrclib.net/api/get?${params}`, {
            headers: { 'User-Agent': `BeatDock/${version}` },
            signal: controller.signal,
        });

        if (response.ok) {
            const data = await response.json();
            if (data && (data.plainLyrics || data.syncedLyrics || data.instrumental)) {
                return data;
            }
        }

        // Fallback: search endpoint
        const searchResponse = await fetch(
            `https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
            {
                headers: { 'User-Agent': `BeatDock/${version}` },
                signal: controller.signal,
            }
        );

        if (searchResponse.ok) {
            const results = await searchResponse.json();
            if (Array.isArray(results) && results.length > 0) {
                return results[0];
            }
        }

        return null;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Shows lyrics for the currently playing song.'),
    async execute(interaction) {
        const { client } = interaction;
        const lang = client.defaultLanguage;

        const player = await requirePlayer(interaction);
        if (!player) return;

        logger.cmd(`/lyrics by ${interaction.user.tag} in #${interaction.channel.name} (Guild: ${interaction.guild.name})`);

        if (!player.playing || !player.queue.current) {
            return interaction.reply({
                content: client.languageManager.get(lang, 'LYRICS_NO_TRACK'),
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const track = player.queue.current;
        const rawTitle = cleanTitle(track.info?.title || '');
        const rawArtist = cleanArtist(track.info?.author || '');
        const split = splitArtistFromTitle(rawTitle, rawArtist);
        const title = split.title;
        const artist = split.artist;
        const durationSec = track.info?.duration ? track.info.duration / 1000 : null;

        try {
            const result = await fetchLyrics(title, artist, durationSec);

            if (!result) {
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'LYRICS_NOT_FOUND'),
                });
            }

            if (result.instrumental) {
                return interaction.editReply({
                    content: client.languageManager.get(lang, 'LYRICS_INSTRUMENTAL'),
                });
            }

            let lyrics = result.plainLyrics || result.syncedLyrics || '';
            if (lyrics.length > MAX_EMBED_LENGTH) {
                lyrics = lyrics.substring(0, MAX_EMBED_LENGTH - 3) + '...';
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(client.languageManager.get(lang, 'LYRICS_TITLE'))
                .setDescription(lyrics)
                .setFooter({ text: `${track.info?.title} — ${track.info?.author}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error fetching lyrics:', error);
            return interaction.editReply({
                content: client.languageManager.get(lang, 'LYRICS_NOT_FOUND'),
            });
        }
    },
};
