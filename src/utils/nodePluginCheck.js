const logger = require('./logger');

// Tripwire, not an abstraction. This list intentionally duplicates the pins in
// application.yml — it is a checksum, and the only thing that will tell you the running
// Lavalink never picked up this release. Bump both together.
//
// A mismatch means one of: application.yml is bind-mounted by a stale inode (the container
// was restarted instead of recreated after an update), the plugin jar failed to download,
// or someone hand-edited the config on the host.
const EXPECTED_PLUGINS = {
    'youtube-plugin': 'f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3',
    'lavasrc-plugin': '4.8.1',
};

function findPluginMismatches(loaded, expected = EXPECTED_PLUGINS) {
    const byName = new Map((loaded || []).map((plugin) => [plugin.name, plugin.version]));
    return Object.entries(expected)
        .filter(([name, version]) => byName.get(name) !== version)
        .map(([name, version]) => ({ name, expected: version, actual: byName.get(name) ?? null }));
}

async function verifyNodePlugins(node) {
    const info = node.info || await node.fetchInfo();
    const mismatches = findPluginMismatches(info?.plugins);

    if (!mismatches.length) {
        logger.debug('Lavalink plugin pins match this release');
        return mismatches;
    }

    for (const { name, expected, actual } of mismatches) {
        logger.warn(`Lavalink plugin drift: ${name} is ${actual ?? 'not loaded'}, this release expects ${expected}`);
    }
    logger.warn(
        'The deployed Lavalink config does not match this release. Recreate the container so it re-reads application.yml:\n' +
        '  docker compose up -d --force-recreate lavalink'
    );

    return mismatches;
}

module.exports = { verifyNodePlugins, findPluginMismatches };
