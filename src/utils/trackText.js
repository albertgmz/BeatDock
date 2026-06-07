const TITLE_NOISE = /\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video|visualizer)|lyric\s*video|lyrics?|audio|video|mv|hd|hq|4k|remaster(ed)?|live|ft\.?.*|feat\.?.*|prod\.?.*|visualizer)[\)\]]\s*/gi;
const ARTIST_NOISE = /\s*\b(official(?:\s*youtube)?\s*channel|official|vevo|records?|entertainment)\b\s*/gi;
const TOPIC_SUFFIX = /\s*-\s*Topic$/i;

// Version/edition qualifiers that mark the SAME recording across re-uploads
// (e.g. "Song (Live)" vs "Song (Official Video)"). Stripped only when trailing
// and not parenthesised, so real titles ending in these words stay rare-but-safe.
const TRAILING_QUALIFIER = /[\s\-_]+(official\s*(music\s*)?video|official\s*(music\s*)?audio|official\s*music\s*video|lyric\s*video|lyrics?|visualizer|audio|video|hd|hq|4k|remaster(?:ed)?(?:\s*\d{4})?|live|acoustic|unplugged|sped\s*up|slowed(?:\s*\+?\s*reverb)?|reverb|nightcore|8d(?:\s*audio)?|bass\s*boost(?:ed)?)\s*$/i;

function normalizeString(str = '') {
    let s = str.toLowerCase();
    // Drop featuring/production credits and everything trailing them.
    s = s.replace(/\b(feat|ft|featuring|prod)\b\.?.*$/i, '');
    // Drop bracketed/parenthesised noise — version tags, credits, etc.
    s = s.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
    // Drop auto-generated channel suffixes.
    s = s.replace(/\s*-\s*topic\s*$/i, '').replace(/vevo\s*$/i, '');
    // Repeatedly strip trailing version/edition qualifiers (handles stacked tags).
    let prev;
    do { prev = s; s = s.replace(TRAILING_QUALIFIER, ''); } while (s !== prev);
    return s.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanAuthor(author = '') {
    return author
        .replace(/vevo$/i, '')
        .replace(/\s*-\s*topic$/i, '')
        .replace(/official$/i, '')
        .trim();
}

function cleanTitle(title = '') {
    return title.replace(TITLE_NOISE, '').trim();
}

function cleanArtist(artist = '') {
    return artist
        .replace(TOPIC_SUFFIX, '')
        .replace(ARTIST_NOISE, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitArtistFromTitle(title, artist) {
    const dashMatch = title.match(/^(.+?)\s*[-\u2013\u2014]\s+(.+)$/);
    if (dashMatch) {
        return { title: dashMatch[2], artist: dashMatch[1] };
    }
    return { title, artist };
}

module.exports = {
    normalizeString,
    cleanAuthor,
    cleanTitle,
    cleanArtist,
    splitArtistFromTitle,
};
