// src/utils/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: any;
}

class Logger {
  private format(level: LogLevel, message: string, meta?: LogMeta): string {
    const ts = new Date().toISOString();
    if (meta && Object.keys(meta).length > 0) {
      return `[${ts}] [${level.toUpperCase()}] ${message} | ${JSON.stringify(meta)}`;
    }
    return `[${ts}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, meta?: LogMeta) {
    if (process.env.NODE_ENV !== 'production') {
      // Only log debug in non-prod
      // eslint-disable-next-line no-console
      console.debug(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: LogMeta) {
    // eslint-disable-next-line no-console
    console.log(this.format('info', message, meta));
  }

  warn(message: string, meta?: LogMeta) {
    // eslint-disable-next-line no-console
    console.warn(this.format('warn', message, meta));
  }

  error(message: string, meta?: LogMeta) {
    // eslint-disable-next-line no-console
    console.error(this.format('error', message, meta));
  }
}

const logger = new Logger();
export default logger;
