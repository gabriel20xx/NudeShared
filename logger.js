/**
 * Shared Logger utility used by NudeFlow and NudeForge.
 * Format: [YYYY-MM-DD HH:MM:SS] [LEVEL] [MODULE] message ...extra
 */
class Logger {
    static _ts() {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        return `${date} ${time}`;
    }

    static _fmt(level, moduleName, message, args) {
        const prefix = `[${this._ts()}] [${level}] [${(moduleName||'APP').toUpperCase()}]`;
        return [prefix, message, ...args];
    }

    static debug(moduleName, message, ...args) { console.debug(...this._fmt('DEBUG', moduleName, message, args)); }
    static info(moduleName, message, ...args) { console.log(...this._fmt('INFO', moduleName, message, args)); }
    static warn(moduleName, message, ...args) { console.warn(...this._fmt('WARN', moduleName, message, args)); }
    static error(moduleName, message, ...args) { console.error(...this._fmt('ERROR', moduleName, message, args)); }
    static success(moduleName, message, ...args) { console.log(...this._fmt('SUCCESS', moduleName, message, args)); }
}

export default Logger;
