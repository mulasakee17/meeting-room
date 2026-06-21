/**
 * 结构化日志系统模块
 * 
 * 功能：
 * 1. 分级日志输出
 * 2. 结构化日志格式
 * 3. 日志分类和过滤
 * 4. 性能监控日志
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  category: string;
  context?: Record<string, any>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  categories: string[];
  maxQueueSize: number;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: false,
  enableRemote: false,
  categories: [],
  maxQueueSize: 1000,
};

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

const LOG_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m',
  [LogLevel.INFO]: '\x1b[32m',
  [LogLevel.WARN]: '\x1b[33m',
  [LogLevel.ERROR]: '\x1b[31m',
  [LogLevel.FATAL]: '\x1b[35m',
};

class Logger {
  private config: LoggerConfig;
  private queue: LogEntry[] = [];
  private performanceMarks = new Map<string, number>();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private formatEntry(entry: LogEntry): string {
    const color = LOG_COLORS[entry.level];
    const reset = '\x1b[0m';

    let logLine = `${entry.timestamp} ${color}[${entry.levelName}]${reset} [${entry.category}] ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      logLine += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.duration !== undefined) {
      logLine += ` (${entry.duration}ms)`;
    }

    if (entry.error) {
      logLine += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        logLine += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return logLine;
  }

  private enqueue(entry: LogEntry): void {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(entry);

    if (this.config.enableRemote) {
      this.sendToRemote(entry);
    }
  }

  private sendToRemote(entry: LogEntry): void {
    console.log('[Remote] Would send log:', JSON.stringify(entry));
  }

  log(level: LogLevel, category: string, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LOG_LEVEL_NAMES[level],
      message,
      category,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    this.enqueue(entry);

    if (this.config.enableConsole) {
      console.log(this.formatEntry(entry));
    }
  }

  debug(category: string, message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, category, message, context);
  }

  info(category: string, message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, category, message, context);
  }

  warn(category: string, message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, category, message, context);
  }

  error(category: string, message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, category, message, context, error);
  }

  fatal(category: string, message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, category, message, context, error);
  }

  mark(name: string): void {
    this.performanceMarks.set(name, Date.now());
  }

  measure(name: string, startMark?: string): number {
    const startTime = startMark ? this.performanceMarks.get(startMark) : this.performanceMarks.get(name);
    const endTime = Date.now();

    if (startTime === undefined) {
      this.warn('Performance', `No start mark found for: ${name}`);
      return 0;
    }

    const duration = endTime - startTime;
    this.info('Performance', `Measure: ${name}`, { duration: `${duration}ms` });

    return duration;
  }

  startTimer(name: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info('Timer', name, { duration: `${duration}ms` });
    };
  }

  getLogs(level?: LogLevel, category?: string, limit?: number): LogEntry[] {
    let filtered = this.queue;

    if (level !== undefined) {
      filtered = filtered.filter(e => e.level === level);
    }

    if (category) {
      filtered = filtered.filter(e => e.category === category);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  clear(): void {
    this.queue = [];
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getStats(): { total: number; byLevel: Record<string, number>; byCategory: Record<string, number> } {
    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const entry of this.queue) {
      byLevel[entry.levelName] = (byLevel[entry.levelName] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }

    return {
      total: this.queue.length,
      byLevel,
      byCategory,
    };
  }
}

export const logger = new Logger({ level: LogLevel.INFO });

export interface CategoryLogger {
  debug: (message: string, context?: Record<string, any>) => void;
  info: (message: string, context?: Record<string, any>) => void;
  warn: (message: string, context?: Record<string, any>) => void;
  error: (message: string, error?: Error, context?: Record<string, any>) => void;
  fatal: (message: string, error?: Error, context?: Record<string, any>) => void;
  mark: (name: string) => void;
  startTimer: (name: string) => () => void;
}

export function createCategoryLogger(category: string): CategoryLogger {
  return {
    debug: (message: string, context?: Record<string, any>) => logger.debug(category, message, context),
    info: (message: string, context?: Record<string, any>) => logger.info(category, message, context),
    warn: (message: string, context?: Record<string, any>) => logger.warn(category, message, context),
    error: (message: string, error?: Error, context?: Record<string, any>) => logger.error(category, message, error, context),
    fatal: (message: string, error?: Error, context?: Record<string, any>) => logger.fatal(category, message, error, context),
    mark: (name: string) => logger.mark(name),
    startTimer: (name: string) => logger.startTimer(name),
  };
}

export const apiLogger = createCategoryLogger('API');
export const agentLogger = createCategoryLogger('Agent');
export const quantLogger = createCategoryLogger('Quant');
export const marketLogger = createCategoryLogger('Market');
export const systemLogger = createCategoryLogger('System');
