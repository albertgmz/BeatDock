// Autoplay recommendation engine — 3-tier cascade with 3-layer deduplication.
// Tier 1: YouTube Mix URL (YouTube's recommendation algorithm)
// Tier 2: Smart search rotation via YouTube Music
// Tier 3: Relaxed dedup last resort

const { cleanAuthor, normalizeString } = require('./trackText');

function getRecentIdentifiers(player) {
    const ids = new Set();
    if (player.queue.current) ids.add(player.queue.current.info.identifier);
    for (const t of player.queue.previous.slice(-25)) {
        ids.add(t.info.identifier);
    }
    for (const t of player.queue.tracks) {
        if (t.info) ids.add(t.info.identifier);
    }
    return ids;
}

function isDuplicate(track, recentIds, history) {
    // Layer 1: Exact identifier match (O(1))
    if (recentIds.has(track.info.identifier)) return true;

    // Layer 2: ISRC match (same recording across uploads)
    if (track.info.isrc) {
        for (const h of history) {
            if (h.info.isrc && h.info.isrc === track.info.isrc) return true;
        }
    }

    // Layer 3: Normalized title match (catches covers, re-uploads, lyric videos)
    const normalized = normalizeString(track.info.title);
    for (const h of history) {
        const hNorm = normalizeString(h.info.title);
        if (normalized === hNorm) return true;
        if (normalized.length > 10 && hNorm.length > 10) {
            if (normalized.includes(hNorm) || hNorm.includes(normalized)) return true;
        }
    }

    return false;
}

function filterCandidates(tracks, recentIds, history) {
    return tracks.filter(t => !isDuplicate(t, recentIds, history));
}

function pickRandom(arr, max = 3) {
    const index = Math.floor(Math.random() * Math.min(max, arr.length));
    return arr[index];
}

/**
 * Finds autoplay tracks using a 3-tier cascade strategy.
 * Returns an array of 0-2 tracks to add to the queue.
 */
async function findAutoplayTracks(player, lastPlayedTrack) {
    if (!lastPlayedTrack?.info) return [];

    const recentIds = getRecentIdentifiers(player);
    recentIds.add(lastPlayedTrack.info.identifier);
    const history = player.queue.previous.slice(-25);
    const videoId = lastPlayedTrack.info.identifier;
    const source = lastPlayedTrack.info.sourceName;
    const author = lastPlayedTrack.info.author;
    const title = lastPlayedTrack.info.title;

    // ── TIER 1: YouTube Mix URL (best recommendations) ──
    if (source === 'youtube' || source === 'youtubemusic') {
        try {
            const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
            const res = await player.search({ query: mixUrl });

            if (res?.tracks?.length) {
                const candidates = filterCandidates(res.tracks, recentIds, history);
                if (candidates.length > 0) return candidates.slice(0, 2);
            }
        } catch {
            // Mix URL failed — fall through to Tier 2
        }
    }

    // ── TIER 2: Smart search rotation via YouTube Music ──
    if (author) {
        const artist = cleanAuthor(author);
        const cleanedTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
        const partialTitle = cleanedTitle.split(' ').slice(0, 3).join(' ');

        const queryStrategies = [
            `ytmsearch:${artist}`,
            `ytmsearch:${artist} mix`,
            `ytmsearch:${artist} ${partialTitle}`,
        ];

        // Detect same-artist saturation: if 3+ of last 5 tracks share the same artist,
        // broaden the query to break out of the artist loop
        const last5Artists = history.slice(-5).map(t => normalizeString(cleanAuthor(t.info.author)));
        const artistCount = last5Artists.filter(a => a === normalizeString(artist)).length;
        if (artistCount >= 3) {
            queryStrategies.unshift(`ytmsearch:${cleanedTitle} music`);
        }

        // Add variety from recent history — cross-pollinate artists
        const recentArtists = [...new Set(
            history.slice(-10).map(t => cleanAuthor(t.info.author))
        )].filter(a => a !== artist);

        if (recentArtists.length > 0) {
            const altArtist = pickRandom(recentArtists);
            queryStrategies.push(`ytmsearch:${altArtist} ${artist}`);
        }

        // Shuffle strategies but keep the first (most relevant) in position
        const [primary, ...rest] = queryStrategies;
        const shuffledRest = rest.sort(() => Math.random() - 0.5);
        const orderedStrategies = [primary, ...shuffledRest];

        for (const query of orderedStrategies) {
            try {
                const res = await player.search({ query });

                if (res?.tracks?.length) {
                    const candidates = filterCandidates(res.tracks, recentIds, history);
                    if (candidates.length > 0) return candidates.slice(0, 2);
                }
            } catch {
                continue;
            }
        }
    }

    // ── TIER 3: Last resort — relaxed dedup to prevent silence ──
    try {
        const artist = author ? cleanAuthor(author) : '';
        const query = artist ? `ytmsearch:${artist}` : `ytmsearch:${normalizeString(title)}`;
        const res = await player.search({ query });

        if (res?.tracks?.length) {
            // Only check against last 10 tracks (relaxed)
            const relaxedIds = new Set(
                player.queue.previous.slice(-10).map(t => t.info.identifier)
            );
            const fallback = res.tracks.find(t => !relaxedIds.has(t.info.identifier));
            if (fallback) return [fallback];

            // Absolute last resort: pick something random
            return [res.tracks[Math.floor(Math.random() * res.tracks.length)]];
        }
    } catch {
        // All strategies exhausted — queueEnd event will fire
    }

    return [];
}

module.exports = { findAutoplayTracks };
