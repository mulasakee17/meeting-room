import { MetricValue, ExperimentLog, Observation } from "./types";

export class ObservableBase {
  private observers: Map<string, Array<(observation: Observation) => void>> = new Map();

  on(event: string, callback: (observation: Observation) => void): void {
    if (!this.observers.has(event)) {
      this.observers.set(event, []);
    }
    this.observers.get(event)!.push(callback);
  }

  off(event: string, callback: (observation: Observation) => void): void {
    const callbacks = this.observers.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event: string, payload: Record<string, unknown>): void {
    const observation: Observation = {
      type: event,
      timestamp: new Date().toISOString(),
      payload,
    };
    const callbacks = this.observers.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(observation);
      }
    }
  }
}

export class MetricTracker {
  private metrics: Map<string, MetricValue[]> = new Map();

  record(name: string, value: number, roundNumber?: number): void {
    const metric: MetricValue = {
      name,
      value,
      timestamp: new Date().toISOString(),
      roundNumber,
    };
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);
  }

  getMetric(name: string): MetricValue[] {
    return this.metrics.get(name) || [];
  }

  getAllMetrics(): Record<string, MetricValue[]> {
    const result: Record<string, MetricValue[]> = {};
    Array.from(this.metrics.entries()).forEach(([name, values]) => {
      result[name] = values;
    });
    return result;
  }

  getSummary(name: string): { min: number; max: number; avg: number; last: number; count: number } | undefined {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return undefined;

    const nums = values.map(v => v.value);
    return {
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: nums.reduce((a, b) => a + b, 0) / nums.length,
      last: nums[nums.length - 1],
      count: nums.length,
    };
  }

  clear(): void {
    this.metrics.clear();
  }
}

export class ExperimentLogger {
  private logs: ExperimentLog[] = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level: "debug",
      message,
      context,
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      context,
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      context,
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      context,
    });
  }

  getLogs(level?: ExperimentLog["level"]): ExperimentLog[] {
    if (!level) {
      return [...this.logs];
    }
    return this.logs.filter(l => l.level === level);
  }

  getErrors(): ExperimentLog[] {
    return this.logs.filter(l => l.level === "error");
  }

  clear(): void {
    this.logs = [];
  }
}

export class ObservabilityManager {
  private metricTracker = new MetricTracker();
  private logger = new ExperimentLogger();

  get metrics(): MetricTracker {
    return this.metricTracker;
  }

  get logs(): ExperimentLogger {
    return this.logger;
  }

  recordMetric(name: string, value: number, roundNumber?: number): void {
    this.metricTracker.record(name, value, roundNumber);
  }

  logDebug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(message, context);
  }

  logInfo(message: string, context?: Record<string, unknown>): void {
    this.logger.info(message, context);
  }

  logWarn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(message, context);
  }

  logError(message: string, context?: Record<string, unknown>): void {
    this.logger.error(message, context);
  }

  getReport(): {
    metrics: Record<string, MetricValue[]>;
    metricSummaries: Record<string, ReturnType<MetricTracker["getSummary"]>>;
    logs: ExperimentLog[];
    errorCount: number;
  } {
    const metrics = this.metricTracker.getAllMetrics();
    const metricSummaries: Record<string, ReturnType<MetricTracker["getSummary"]>> = {};
    for (const name of Object.keys(metrics)) {
      metricSummaries[name] = this.metricTracker.getSummary(name);
    }

    return {
      metrics,
      metricSummaries,
      logs: this.logger.getLogs(),
      errorCount: this.logger.getErrors().length,
    };
  }

  clear(): void {
    this.metricTracker.clear();
    this.logger.clear();
  }
}