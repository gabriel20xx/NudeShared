export default class Logger {
  static format(module, level, message, extra) {
    const ts = new Date().toISOString().replace('T', ' ').replace('Z','');
    const lvl = level.toUpperCase().padEnd(7, ' ');
    const mod = (module || 'APP').toUpperCase().padEnd(10, ' ');
    const base = `[${ts}] [${lvl}] [${mod}] ${message}`;
    if (extra !== undefined) return `${base} ${typeof extra === 'object' ? JSON.stringify(extra, null, 2) : String(extra)}`;
    return base;
  }
  static log(level, module, message, ...rest) {
    const line = this.format(module, level, message, ...rest);
    if (level === 'error') return console.error(line);
    if (level === 'warn') return console.warn(line);
    return console.log(line);
  }
  static debug(module, message, ...rest) { this.log('debug', module, message, ...rest); }
  static info(module, message, ...rest) { this.log('info', module, message, ...rest); }
  static warn(module, message, ...rest) { this.log('warn', module, message, ...rest); }
  static error(module, message, ...rest) { this.log('error', module, message, ...rest); }
  static success(module, message, ...rest) { this.log('success', module, message, ...rest); }
}
