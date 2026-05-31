const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { formatDuration } = require('./embeds');
const { truncateText } = require('./trackSelectMenu');
const logger = require('./logger');

const EMBED_TITLE_LIMIT = 256;
const EMBED_DESCRIPTION_LIMIT = 4096;
const EMBED_FIELD_VALUE_LIMIT = 1024;
const EMBED_FOOTER_LIMIT = 2048;

class PlayerController {
    constructor(client) {
        this.client = client;
        this.playerMessages = new Map(); // Guild ID -> Message ID
    }

    createPlayerEmbed(player, track) {
        const lang = this.client.defaultLanguage;
        const title = truncateText(track.info?.title || 'Unknown', EMBED_TITLE_LIMIT);
        const uri = typeof track.info?.uri === 'string' && track.info.uri.length <= 2048
            ? track.info.uri
            : null;
        const trackLabel = uri ? `[${title}](${uri})` : title;
        const nowPlaying = this.client.languageManager.get(lang, 'PLAYER_NOW_PLAYING');
        const description = truncateText(`**${nowPlaying}:**\n${trackLabel}`, EMBED_DESCRIPTION_LIMIT);
        const artist = truncateText(track.info?.author || 'Unknown', EMBED_FIELD_VALUE_LIMIT);
        const volumeFooter = truncateText(this.client.languageManager.get(lang, 'PLAYER_VOLUME', player.volume), EMBED_FOOTER_LIMIT);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(truncateText(this.client.languageManager.get(lang, 'PLAYER_TITLE'), EMBED_TITLE_LIMIT))
            .setDescription(description)
            .setThumbnail(track.info?.artworkUrl || null)
            .addFields(
                { name: this.client.languageManager.get(lang, 'PLAYER_ARTIST'), value: artist, inline: true },
                { name: this.client.languageManager.get(lang, 'PLAYER_DURATION'), value: formatDuration(track.info?.duration || 0), inline: true },
                { name: this.client.languageManager.get(lang, 'PLAYER_QUEUE_COUNT'), value: this.client.languageManager.get(lang, 'PLAYER_SONGS_COUNT', player.queue.tracks.length), inline: true },
                ...(track.userData?.autoplay
                    ? [{ name: this.client.languageManager.get(lang, 'PLAYER_REQUESTED_BY'), value: this.client.languageManager.get(lang, 'AUTOPLAY_REQUESTER'), inline: true }]
                    : track.userData?.requester
                        ? [{ name: this.client.languageManager.get(lang, 'PLAYER_REQUESTED_BY'), value: `<@${track.userData.requester.id}>`, inline: true }]
                        : [])
            )
            .setFooter({ text: volumeFooter })
            .setTimestamp();

        // Add loop status to the embed
        if (player.repeatMode && player.repeatMode !== 'off') {
            const loopIcon = player.repeatMode === 'track' ? '🔂' : '🔁';
            const loopText = player.repeatMode === 'track'
                ? this.client.languageManager.get(lang, 'LOOP_STATUS_TRACK')
                : this.client.languageManager.get(lang, 'LOOP_STATUS_QUEUE');
            embed.setFooter({
                text: truncateText(`${volumeFooter} | ${loopIcon} ${loopText}`, EMBED_FOOTER_LIMIT)
            });
        }

        // Add autoplay status to the embed
        if (this.client.autoplayEnabled.get(player.guildId)) {
            const autoplayText = this.client.languageManager.get(lang, 'AUTOPLAY_STATUS');
            const currentFooter = embed.data.footer?.text || volumeFooter;
            embed.setFooter({ text: truncateText(`${currentFooter} | 📻 ${autoplayText}`, EMBED_FOOTER_LIMIT) });
        }

        return embed;
    }

    createPlayerButtons(player) {
        const isPaused = player.paused;
        const loopIcon = player.repeatMode === 'track' ? '🔂' : player.repeatMode === 'queue' ? '🔁' : '➡️';

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('player:back')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('player:playpause')
                    .setEmoji(isPaused ? '▶️' : '⏸️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('player:skip')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('player:stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('player:shuffle')
                    .setEmoji('🔀')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('player:loop')
                    .setEmoji(loopIcon)
                    .setStyle(player.repeatMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('player:queue')
                    .setEmoji('📜')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('player:clear')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row1, row2];
    }

    async sendPlayer(channel, player) {
        const track = player.queue.current;
        if (!track) return;

        const embed = this.createPlayerEmbed(player, track);
        const components = this.createPlayerButtons(player);

        const message = await channel.send({ embeds: [embed], components });
        this.playerMessages.set(player.guildId, {
            messageId: message.id,
            channelId: channel.id,
        });
        return message;
    }

    async updatePlayer(guildId) {
        const player = this.client.lavalink.getPlayer(guildId);
        if (!player || !player.queue.current) return;

        const playerMessage = this.playerMessages.get(guildId);
        if (!playerMessage) return;

        const channel = this.client.channels.cache.get(playerMessage.channelId);
        if (!channel) return;

        try {
            const message = channel.messages.cache.get(playerMessage.messageId)
                || await channel.messages.fetch(playerMessage.messageId);
            const embed = this.createPlayerEmbed(player, player.queue.current);
            const components = this.createPlayerButtons(player);

            await message.edit({ embeds: [embed], components });
        } catch (error) {
            logger.error('Error updating player:', error);
            this.playerMessages.delete(guildId);
        }
    }

    async deletePlayer(guildId) {
        const playerMessage = this.playerMessages.get(guildId);
        if (!playerMessage) return;

        const channel = this.client.channels.cache.get(playerMessage.channelId);
        if (channel) {
            try {
                const message = await channel.messages.fetch(playerMessage.messageId);
                await message.delete();
            } catch (error) {
                // We can ignore errors here, as the message might have been deleted manually.
            }
        }

        this.playerMessages.delete(guildId);
    }

}

module.exports = PlayerController;
