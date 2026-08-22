// Per-guild consecutive playback-failure counter, the trip condition for the breaker in
// registerLavalinkEvents(). Deliberately source-agnostic: it counts failures rather than
// matching error strings, so it keeps working when the next platform change produces a
// message nobody has seen before.

const CONSECUTIVE_FAILURE_LIMIT = 3;

const failures = new Map(); // guildId -> { consecutive, notified }

function recordFailure(guildId) {
    const entry = failures.get(guildId) || { consecutive: 0, notified: false };
    entry.consecutive += 1;

    const shouldNotify = entry.consecutive >= CONSECUTIVE_FAILURE_LIMIT && !entry.notified;
    if (shouldNotify) entry.notified = true;

    failures.set(guildId, entry);
    return { consecutive: entry.consecutive, shouldNotify };
}

// A track that played to the end proves the pipeline works; drop the streak entirely.
function recordSuccess(guildId) {
    failures.delete(guildId);
}

// Did the queue stop because a track could not be played, or because it simply ran out?
// The library routes a queue's last track to queueEnd without ever emitting trackEnd, so the
// event payload is the only reliable signal there - a failure counter is stale by then.
function endedOnFailure(payload) {
    return payload?.reason === 'loadFailed' || payload?.type === 'TrackStuckEvent';
}

function hasNotified(guildId) {
    return failures.get(guildId)?.notified === true;
}

function clearGuild(guildId) {
    failures.delete(guildId);
}

module.exports = {
    recordFailure,
    recordSuccess,
    endedOnFailure,
    hasNotified,
    clearGuild,
    CONSECUTIVE_FAILURE_LIMIT,
};
