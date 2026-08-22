// Deterministic tests for the playback failure breaker and the plugin drift tripwire.
// No Lavalink/network required. Run: node scripts/test-resilience.js

const assert = require('node:assert/strict');
const {
    recordFailure,
    recordSuccess,
    endedOnFailure,
    hasNotified,
    clearGuild,
    CONSECUTIVE_FAILURE_LIMIT,
} = require('../src/utils/playbackFailureTracker');
const { findPluginMismatches } = require('../src/utils/nodePluginCheck');

let passed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log(`  ok  - ${name}`); }
    catch (err) { console.error(`FAIL - ${name}\n      ${err.message}`); process.exitCode = 1; }
}

// --- playbackFailureTracker ---

check('notifies exactly once when the streak reaches the limit', () => {
    clearGuild('g1');
    const results = [];
    for (let i = 0; i < CONSECUTIVE_FAILURE_LIMIT + 4; i++) results.push(recordFailure('g1'));

    const notifying = results.filter((r) => r.shouldNotify);
    assert.equal(notifying.length, 1, 'must notify exactly once per streak');
    assert.equal(notifying[0].consecutive, CONSECUTIVE_FAILURE_LIMIT, 'must notify on the limit-th failure');
    assert.ok(hasNotified('g1'), 'notified flag must stick after tripping');
});

check('stays quiet below the limit', () => {
    clearGuild('g2');
    for (let i = 0; i < CONSECUTIVE_FAILURE_LIMIT - 1; i++) {
        assert.equal(recordFailure('g2').shouldNotify, false, 'must stay quiet below the limit');
    }
    assert.equal(hasNotified('g2'), false);
});

check('a successful finish resets the streak and the notified flag', () => {
    clearGuild('g3');
    for (let i = 0; i < CONSECUTIVE_FAILURE_LIMIT; i++) recordFailure('g3');
    assert.ok(hasNotified('g3'));

    recordSuccess('g3');
    assert.equal(hasNotified('g3'), false, 'success must clear the notified flag');
    assert.equal(recordFailure('g3').consecutive, 1, 'success must reset the counter');
});

check('guilds are tracked independently', () => {
    clearGuild('g4'); clearGuild('g5');
    for (let i = 0; i < CONSECUTIVE_FAILURE_LIMIT; i++) recordFailure('g4');
    assert.ok(hasNotified('g4'));
    assert.equal(hasNotified('g5'), false, 'one guild failing must not trip another');
    assert.equal(recordFailure('g5').consecutive, 1);
});

check('clearGuild drops all state for a guild', () => {
    clearGuild('g6');
    for (let i = 0; i < CONSECUTIVE_FAILURE_LIMIT; i++) recordFailure('g6');
    clearGuild('g6');
    assert.equal(hasNotified('g6'), false);
    assert.equal(recordFailure('g6').consecutive, 1);
});

// Regression guard: a queue whose LAST track played fine still reaches queueEnd with a
// non-zero failure streak (the library never emits trackEnd for it), so this decision must
// come from the payload, never from the counter - otherwise the bot blames a track that
// played perfectly.
check('endedOnFailure reads the payload, not the failure streak', () => {
    assert.equal(endedOnFailure({ reason: 'finished', type: 'TrackEndEvent' }), false, 'a finished queue is a clean exit');
    assert.equal(endedOnFailure({ reason: 'stopped', type: 'TrackEndEvent' }), false, '/stop and /skip are clean exits');
    assert.equal(endedOnFailure({ reason: 'replaced', type: 'TrackEndEvent' }), false, 'a replaced track is a clean exit');
    assert.equal(endedOnFailure({ reason: 'loadFailed', type: 'TrackEndEvent' }), true, 'loadFailed means the track never played');
    assert.equal(endedOnFailure({ type: 'TrackStuckEvent', thresholdMs: 5000 }), true, 'a stuck track never played either');
    assert.equal(endedOnFailure(undefined), false, 'a missing payload must not accuse anyone');
});

// --- nodePluginCheck ---

check('reports no mismatch when versions line up', () => {
    const out = findPluginMismatches(
        [{ name: 'youtube-plugin', version: 'abc' }, { name: 'lavasrc-plugin', version: '4.8.1' }],
        { 'youtube-plugin': 'abc', 'lavasrc-plugin': '4.8.1' }
    );
    assert.deepEqual(out, []);
});

check('reports a version mismatch with both sides', () => {
    const out = findPluginMismatches(
        [{ name: 'youtube-plugin', version: '1.18.1' }],
        { 'youtube-plugin': 'abc' }
    );
    assert.deepEqual(out, [{ name: 'youtube-plugin', expected: 'abc', actual: '1.18.1' }]);
});

check('reports a plugin that did not load at all', () => {
    const out = findPluginMismatches([], { 'youtube-plugin': 'abc' });
    assert.deepEqual(out, [{ name: 'youtube-plugin', expected: 'abc', actual: null }]);
});

check('tolerates a missing or malformed plugin list', () => {
    assert.deepEqual(findPluginMismatches(undefined, { x: '1' }), [{ name: 'x', expected: '1', actual: null }]);
    assert.deepEqual(findPluginMismatches(null, {}), []);
});

console.log(`\n${passed} check(s) passed${process.exitCode ? ', with failures' : ''}.`);
