"use strict";
// src/utils/logger.ts
Object.defineProperty(exports, "__esModule", { value: true });
class Logger {
    format(level, message, meta) {
        const ts = new Date().toISOString();
        if (meta && Object.keys(meta).length > 0) {
            return `[${ts}] [${level.toUpperCase()}] ${message} | ${JSON.stringify(meta)}`;
        }
        return `[${ts}] [${level.toUpperCase()}] ${message}`;
    }
    debug(message, meta) {
        if (process.env.NODE_ENV !== 'production') {
            // Only log debug in non-prod
            // eslint-disable-next-line no-console
            console.debug(this.format('debug', message, meta));
        }
    }
    info(message, meta) {
        // eslint-disable-next-line no-console
        console.log(this.format('info', message, meta));
    }
    warn(message, meta) {
        // eslint-disable-next-line no-console
        console.warn(this.format('warn', message, meta));
    }
    error(message, meta) {
        // eslint-disable-next-line no-console
        console.error(this.format('error', message, meta));
    }
}
const logger = new Logger();
exports.default = logger;
