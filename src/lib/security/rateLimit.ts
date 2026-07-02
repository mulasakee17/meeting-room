/**
 * API 速率限制模块
 * 
 * 功能：
 * 1. 基于内存的速率限制（适用于单服务器）
 * 2. 支持不同级别的限制（全局、用户、IP）
 * 3. 自动清理过期记录
 */

export interface RateLimitConfig {
  windowMs: number;      // 时间窗口（毫秒）
  maxRequests: number;   // 最大请求次数
  keyGenerator?: (identifier: string) => string; // 自定义键生成器
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // 需等待的秒数
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// 内存存储
const rateLimitStore = new Map<string, RateLimitRecord>();

// 默认配置
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 10,     // 每分钟最多10次
};

// 定期清理过期记录（每5分钟）
setInterval(() => {
  const now = Date.now();
  Array.from(rateLimitStore.entries()).forEach(([key, record]) => {
    if (record.resetTime < now) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

/**
 * 检查速率限制
 */
export function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const { windowMs, maxRequests } = { ...DEFAULT_CONFIG, ...config };
  const key = identifier;
  const now = Date.now();
  const resetTime = now + windowMs;

  const record = rateLimitStore.get(key);

  if (!record || record.resetTime < now) {
    // 新窗口或过期，重置计数
    rateLimitStore.set(key, { count: 1, resetTime });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: new Date(resetTime),
    };
  }

  if (record.count >= maxRequests) {
    // 超过限制
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(record.resetTime),
      retryAfter,
    };
  }

  // 增加计数
  record.count++;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: new Date(record.resetTime),
  };
}

/**
 * 清除特定标识符的速率限制记录
 */
export function clearRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * 获取当前速率限制状态
 */
export function getRateLimitStatus(identifier: string): {
  currentCount: number;
  resetTime: Date | null;
} {
  const record = rateLimitStore.get(identifier);
  if (!record) {
    return { currentCount: 0, resetTime: null };
  }
  return {
    currentCount: record.count,
    resetTime: new Date(record.resetTime),
  };
}

/**
 * 创建速率限制中间件配置
 */
export const RATE_LIMIT_PRESETS = {
  // 严格限制：适用于敏感操作
  strict: { windowMs: 60 * 1000, maxRequests: 5 },
  
  // 标准限制：适用于普通 API
  standard: { windowMs: 60 * 1000, maxRequests: 10 },
  
  //宽松限制：适用于高频查询
  relaxed: { windowMs: 60 * 1000, maxRequests: 30 },
  
  // 每小时限制
  hourly: { windowMs: 60 * 60 * 1000, maxRequests: 100 },
  
  // 每天限制
  daily: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 500 },
  
  // 实验限制：适用于批量实验
  experiment: { windowMs: 60 * 1000, maxRequests: 5 },
};

/**
 * 从请求中提取客户端标识符
 */
export function getClientIdentifier(request: NextRequest): string {
  // 尝试多种方式获取客户端标识
  const headers = request.headers;
  
  // 1. X-Forwarded-For（代理场景）
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // 2. X-Real-IP（Nginx 等代理）
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // 3. User-Agent + 时间窗口（作为备用）
  const userAgent = headers.get('user-agent') || 'unknown';
  const window = Math.floor(Date.now() / (60 * 1000)); // 当前分钟
  
  return `ua-${userAgent.slice(0, 50)}-${window}`;
}

// 导入 NextRequest 类型
import { NextRequest } from 'next/server';