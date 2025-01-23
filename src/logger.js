const logger = (function() {
    let level = 'warning'; // default level

    function setLevel(newLevel) {
        level = newLevel;
    }

    function log(type, ...messages) {
        const levels = { 'info': 1, 'warning': 2, 'error': 3 };
        if (levels[type] >= levels[level]) {
            console.log(`[${type.toUpperCase()}]`, ...messages);
        }
    }

    return {
        setLevel,
        log,
        info: (...messages) => log('info', ...messages),
        warning: (...messages) => log('warning', ...messages),
        error: (...messages) => log('error', ...messages)
    };
})();

export default logger; // Use ES module export
