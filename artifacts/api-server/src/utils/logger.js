/**
 * Winston Logger Configuration
 * Provides structured logging for the application
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log level colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Choose format based on environment
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  // Colorize in development, use JSON in production
  process.env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf((info) => {
          const { timestamp, level, message, ...meta } = info;
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
);

// Define log transports
const transports = [
  // Console logging
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
  }),
];

// File logging for errors (only if not in test mode)
if (process.env.NODE_ENV !== 'test') {
  try {
    // Ensure logs directory exists
    const fs = require('fs');
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    transports.push(
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );

    transports.push(
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  } catch (e) {
    // If can't create log files (e.g., permissions), just use console
    console.warn('Warning: Could not create log files, using console only');
  }
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false, // Don't exit on uncaught exceptions
});

// Create a stream object for Morgan (HTTP request logging)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// HTTP request logging middleware
logger.httpMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const delta = Date.now() - start;
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} - ${delta}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: delta,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });
  next();
};

module.exports = logger;
