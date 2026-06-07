// Deterministic test for the autoplay engine. No Lavalink/network required.
// Run: node scripts/test-autoplay.js  (exits non-zero on any failed assertion)

const assert = require('node:assert/strict');
const { normalizeString } = require('../src/utils/trackText');
// Pin the target before loading autoplay — it reads AUTOPLAY_TARGET_COUNT at require time.
process.env.AUTOPLAY_TARGET_COUNT = '25';
const { findAutoplayTracks } = require('../src/utils/autoplay');

let passed = 0;
function check(name, fn) {
    return fn().then(() => { passed++; console.log(`  ok  - ${name}`); })
        .catch((err) => { console.error(`FAIL - ${name}\n      ${err.message}`); process.exitCode = 1; });
}

function track(id, title, opts = {}) {
    return {
        info: {
            identifier: id,
            title,
            author: opts.author || 'Artist',
            sourceName: opts.sourceName || 'youtube',
            isrc: opts.isrc || null,
            isStream: opts.isStream || false,
        },
    };
}

// Fake player whose search() returns canned RD mixes keyed by the seed video id.
function makePlayer({ previous = [], mixes = {} }) {
    return {
        queue: { current: null, previous, tracks: [] },
        async search({ query }) {
            const m = query.match(/list=RD([^&]+)/);
            const id = m ? m[1] : null;
            const tracks = (mixes[id] || []).map((t) => track(t.id, t.title, t));
            return { loadType: 'playlist', tracks };
        },
    };
}

function ids(list) { return list.map((t) => t.info.identifier); }
function hasUnique(arr) { return new Set(arr).size === arr.length; }

async function main() {
    // ── Scenario 1: dedup + multi-seed accumulation + non-music + ISRC ──
    await check('dedups ids/titles/isrc, excludes seed+recent, accumulates across seeds, drops non-music', async () => {
        const seed = track('s1', 'Seed Song');
        const recent = track('h1', 'Old Song');
        const player = makePlayer({
            previous: [recent],
            mixes: {
                s1: [
                    { id: 's1', title: 'Seed Song' },                 // the seed itself -> excluded
                    { id: 'h1', title: 'Old Song' },                  // recent history -> excluded
                    { id: 'a1', title: 'Alpha' },
                    { id: 'a2', title: 'Alpha' },                     // same title -> dedup
                    { id: 'b1', title: 'Beta (Live)' },
                    { id: 'b2', title: 'Beta (Official Video)' },     // same recording -> dedup
                    { id: 'g1', title: 'Eta', isrc: 'ISRC0001' },
                    { id: 'g2', title: 'Totally Different Name', isrc: 'ISRC0001' }, // same ISRC -> dedup
                    { id: 'r1', title: 'Alpha Song Reaction!' },      // non-music -> excluded from collected
                    { id: 'c1', title: 'Gamma' },
                    { id: 'd1', title: 'Delta' },
                ],
                h1: [
                    { id: 'a1', title: 'Alpha' },                     // cross-seed dup -> excluded
                    { id: 'c1', title: 'Gamma' },                     // cross-seed dup -> excluded
                    { id: 'e1', title: 'Epsilon' },                  // new, only reachable via 2nd seed
                    { id: 'f1', title: 'Zeta' },                     // new
                ],
            },
        });

        const out = await findAutoplayTracks(player, seed);
        const outIds = ids(out);

        assert.ok(!outIds.includes('s1') && !outIds.includes('h1'), 'must exclude seed and recent history');
        assert.ok(hasUnique(outIds), `ids must be unique, got ${outIds}`);
        assert.ok(hasUnique(out.map((t) => normalizeString(t.info.title))), 'normalized titles must be unique');
        const isrcs = out.map((t) => t.info.isrc).filter(Boolean);
        assert.ok(hasUnique(isrcs), 'isrcs must be unique');
        assert.ok(!outIds.includes('r1'), 'non-music reaction must be excluded');
        // Reachable only from the 2nd seed -> proves accumulation across seeds.
        assert.ok(outIds.includes('e1') && outIds.includes('f1'), 'must accumulate from second seed');
        // Expected unique songs: Alpha, Beta, Eta, Gamma, Delta, Epsilon, Zeta = 7
        assert.equal(out.length, 7, `expected 7 unique tracks, got ${out.length} (${outIds})`);
    });

    // ── Scenario 2: caps at AUTOPLAY_TARGET (25) ──
    await check('caps the batch at 25', async () => {
        const big = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, title: `Song ${i}` }));
        const player = makePlayer({ previous: [], mixes: { seedBig: big } });
        const out = await findAutoplayTracks(player, track('seedBig', 'Seed'));
        assert.equal(out.length, 25, `expected cap of 25, got ${out.length}`);
        assert.ok(hasUnique(ids(out)), 'ids unique under cap');
    });

    // ── Scenario 3: only non-music available -> fall back rather than return silence ──
    await check('falls back to non-music only when nothing else is available', async () => {
        const player = makePlayer({
            previous: [],
            mixes: { onlyjunk: [{ id: 'x1', title: 'Live Stream', isStream: true }, { id: 'x2', title: 'Gameplay Highlights' }] },
        });
        const out = await findAutoplayTracks(player, track('onlyjunk', 'Seed'));
        assert.ok(out.length >= 1, 'should return a fallback rather than nothing');
    });

    // ── Scenario 4: non-YouTube seed with no YT history -> empty (no search fallback) ──
    await check('returns [] for a non-YouTube seed with no usable history', async () => {
        const player = makePlayer({ previous: [], mixes: {} });
        const out = await findAutoplayTracks(player, track('sp1', 'Spotify Song', { sourceName: 'spotify' }));
        assert.equal(out.length, 0, 'no YT seed -> no recommendations');
    });

    // ── Scenario 5: title normaliser collapses version variants ──
    await check('normalizeString collapses common version variants', async () => {
        const base = normalizeString('Blinding Lights');
        for (const v of [
            'Blinding Lights (Official Video)',
            'Blinding Lights (Official Music Video)',
            'Blinding Lights [Lyric Video]',
            'Blinding Lights (Live)',
            'Blinding Lights - Topic',
            'Blinding Lights (sped up)',
            'Blinding Lights (feat. Someone)',
            'Blinding Lights (Remastered 2020)',
        ]) {
            assert.equal(normalizeString(v), base, `"${v}" should normalize to "${base}"`);
        }
        // Distinct songs must NOT collapse.
        assert.notEqual(normalizeString('Video Games'), normalizeString('Games'), 'distinct titles must stay distinct');
    });

    console.log(`\n${passed} check(s) passed${process.exitCode ? ', with failures' : ''}.`);
}

main();
