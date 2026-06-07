// Autoplay recommendation engine — YouTube's native radio (RD mix) with hardened dedup.
// Seeds YouTube's server-side radio from the last played track (and recent history when
// one mix is short), accumulates a deduplicated batch of related tracks, and filters out
// non-music. No external services or credentials.

const { normalizeString } = require('./trackText');
const logger = require('./logger');

const AUTOPLAY_TARGET = Math.max(1, parseInt(process.env.AUTOPLAY_TARGET_COUNT || '25', 10) || 25);
const MAX_SEEDS = 3;
const HISTORY_WINDOW = 50;

// Clearly non-music uploads to skip. Kept deliberately small to avoid false positives.
// NOTE: "live"/"cover" are intentionally NOT here — they are music; the title normaliser
// already collapses live/alternate re-uploads of an already-played song during dedup.
const NON_MUSIC = /\b(reaction|trailer|teaser|interview|podcast|review|tutorial|gameplay|highlights?|behind\s+the\s+scenes|full\s+(?:movie|album|concert))\b/i;
const TOPIC_AUTHOR = /-\s*topic\s*$/i;

function isYouTubeSource(track) {
    const source = track?.info?.sourceName;
    return source === 'youtube' || source === 'youtubemusic';
}

function getRecentIdentifiers(player) {
    const ids = new Set();
    if (player.queue.current) ids.add(player.queue.current.info.identifier);
    for (const t of player.queue.previous.slice(-HISTORY_WINDOW)) {
        ids.add(t.info.identifier);
    }
    for (const t of player.queue.tracks) {
        if (t.info) ids.add(t.info.identifier);
    }
    return ids;
}

// 3-layer match: exact id, ISRC (same recording across uploads), normalised title
// (covers re-uploads / official-video vs audio / lyric videos).
function isDuplicate(track, recentIds, history) {
    if (recentIds.has(track.info.identifier)) return true;

    if (track.info.isrc) {
        for (const h of history) {
            if (h.info.isrc && h.info.isrc === track.info.isrc) return true;
        }
    }

    const normalized = normalizeString(track.info.title);
    if (!normalized) return false;
    for (const h of history) {
        const hNorm = normalizeString(h.info.title);
        if (normalized === hNorm) return true;
        if (normalized.length > 10 && hNorm.length > 10) {
            if (normalized.includes(hNorm) || hNorm.includes(normalized)) return true;
        }
    }
    return false;
}

function looksLikeNonMusic(track) {
    if (track.info.isStream) return true;
    return NON_MUSIC.test(track.info.title || '');
}

// Songs/audio (Art Tracks, YT Music, ISRC-bearing) are preferred over plain videos so
// that, when duplicates collapse or the batch overflows, the music-video copy is dropped.
function isSongLike(track) {
    const info = track.info;
    return Boolean(info.isrc) || info.sourceName === 'youtubemusic' || TOPIC_AUTHOR.test(info.author || '');
}

function buildSeeds(lastPlayedTrack, history) {
    const seedIds = new Set();
    const seeds = [];
    for (const t of [lastPlayedTrack, ...history.slice().reverse()]) {
        const id = t?.info?.identifier;
        if (!id || !isYouTubeSource(t) || seedIds.has(id)) continue;
        seedIds.add(id);
        seeds.push(t);
        if (seeds.length >= MAX_SEEDS) break;
    }
    return seeds;
}

async function fetchMix(player, videoId) {
    try {
        const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
        const res = await player.search({ query: mixUrl });
        return res?.tracks || [];
    } catch {
        return [];
    }
}

/**
 * Builds an autoplay batch from YouTube's native radio (RD mix), seeded from the last
 * played track and recent history. Returns up to AUTOPLAY_TARGET unique, deduplicated
 * tracks, or [] when no usable recommendations are found.
 */
async function findAutoplayTracks(player, lastPlayedTrack) {
    if (!lastPlayedTrack?.info) return [];

    const history = player.queue.previous.slice(-HISTORY_WINDOW);
    const seen = getRecentIdentifiers(player);
    seen.add(lastPlayedTrack.info.identifier);
    // ISRC/title dedup baseline — include currently playing, queued, and the just-finished
    // track so same-song variants with a different identifier are still caught.
    const dedupHistory = [
        ...(player.queue.current?.info ? [player.queue.current] : []),
        ...history.filter((t) => t?.info),
        ...player.queue.tracks.filter((t) => t?.info),
        lastPlayedTrack,
    ];

    const collected = [];
    const nonMusic = []; // deduped fallback, used only if everything else is filtered out
    const seeds = buildSeeds(lastPlayedTrack, history);

    for (const seed of seeds) {
        if (collected.length >= AUTOPLAY_TARGET) break;

        const tracks = await fetchMix(player, seed.info.identifier);
        if (!tracks.length) continue;

        const ordered = [...tracks].sort((a, b) => Number(isSongLike(b)) - Number(isSongLike(a)));

        for (const track of ordered) {
            if (collected.length >= AUTOPLAY_TARGET) break;
            if (!track?.info || isDuplicate(track, seen, dedupHistory)) continue;

            seen.add(track.info.identifier);
            dedupHistory.push(track);

            if (looksLikeNonMusic(track)) nonMusic.push(track);
            else collected.push(track);
        }
    }

    const result = (collected.length ? collected : nonMusic).slice(0, AUTOPLAY_TARGET);
    logger.debug(`Autoplay: ${result.length} track(s) from ${seeds.length} seed(s)`);
    return result;
}

module.exports = { findAutoplayTracks };
