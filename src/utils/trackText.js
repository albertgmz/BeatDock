const TITLE_NOISE = /\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video|visualizer)|lyric\s*video|lyrics?|audio|video|mv|hd|hq|4k|remaster(ed)?|live|ft\.?.*|feat\.?.*|prod\.?.*|visualizer)[\)\]]\s*/gi;
const ARTIST_NOISE = /\s*\b(official(?:\s*youtube)?\s*channel|official|vevo|records?|entertainment)\b\s*/gi;
const TOPIC_SUFFIX = /\s*-\s*Topic$/i;

function normalizeString(str = '') {
    return str
        .toLowerCase()
        .replace(/\(official\s*(music\s*)?video\)/gi, '')
        .replace(/\((lyrics?|audio|official\s*audio|visualizer|hd|hq)\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\s*-\s*topic$/gi, '')
        .replace(/vevo$/gi, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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
