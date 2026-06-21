/**
 * 输入验证模块
 * 
 * 功能：
 * 1. 严格的输入验证
 * 2. XSS 防护
 * 3. 注入攻击防护
 * 4. 数据清洗
 */

// 危险字符模式
const DANGEROUS_PATTERNS = [
  // XSS 模式
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  
  // SQL 注入模式（仅检测完整关键词）
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\s+\b/gi,
  /(--|\|\/\*|\*\/)/g,
  
  // 命令注入模式（排除常见符号如 & 在 S&P 500 等正常用法）
  /\|\s*(ls|cat|rm|wget|curl)/gi,  // 管道命令
  /\$\([^)]*\)/g,                   // 命令替换
  /\{\{[^}]*\}\}/g,                 // 模板注入
  /`[^`]*`/g,                       // 反引号命令
  
  // 路径遍历
  /\.\.\/|\.\.\\|~/g,
];

// 允许的股票代码格式
const VALID_STOCK_CODE_PATTERN = /^(SH|SZ|BJ)?[0-9]{6}$/i;

// 允许的 LLM Provider
const VALID_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'local'];

// 允许的模型列表
const VALID_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  local: ['llama3', 'mistral', 'qwen2', 'phi3'],
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

/**
 * 检测危险内容
 */
function detectDangerousContent(input: string): string[] {
  const detected: string[] = [];
  
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(`检测到危险模式: ${pattern.source.slice(0, 30)}...`);
    }
  }
  
  return detected;
}

/**
 * 清洗字符串输入
 */
export function sanitizeString(input: string): string {
  let sanitized = input;
  
  // 移除危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // 移除多余空白
  sanitized = sanitized.trim().replace(/\s+/g, ' ');
  
  // 移除控制字符
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}

/**
 * 验证新闻内容
 */
export function validateNews(news: string): ValidationResult {
  const errors: string[] = [];
  
  // 基本检查
  if (!news || typeof news !== 'string') {
    errors.push('新闻内容必须是非空字符串');
    return { valid: false, errors };
  }
  
  // 长度检查（放宽限制）
  if (news.trim().length === 0) {
    errors.push('新闻内容不能为空');
  } else if (news.length > 10000) {
    errors.push('新闻内容过长（最大10000字）');
  }
  
  // 内容质量检查（简化）
  if (news.trim().length < 5) {
    errors.push('新闻内容过短（最少5字）');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? news.trim() : undefined,
  };
}

/**
 * 验证轮次参数
 */
export function validateRounds(rounds: number | string): ValidationResult {
  const errors: string[] = [];
  
  // 转换为数字
  const numRounds = typeof rounds === 'string' ? parseInt(rounds, 10) : rounds;
  
  if (typeof rounds !== 'number' && typeof rounds !== 'string') {
    errors.push('轮次必须是数字或数字字符串');
  } else if (isNaN(numRounds)) {
    errors.push('轮次必须是有效数字');
  } else if (!Number.isInteger(numRounds)) {
    errors.push('轮次必须是整数');
  } else if (numRounds < 1) {
    errors.push('轮次不能小于1');
  } else if (numRounds > 10) {
    errors.push('轮次不能大于10');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? Math.round(numRounds) : undefined,
  };
}

/**
 * 验证股票代码
 */
export function validateStockCode(symbol: string): ValidationResult {
  const errors: string[] = [];
  
  if (!symbol) {
    // 股票代码可选，不提供则使用模拟数据
    return { valid: true, errors: [] };
  }
  
  if (typeof symbol !== 'string') {
    errors.push('股票代码必须是字符串');
  } else if (!VALID_STOCK_CODE_PATTERN.test(symbol)) {
    errors.push(`股票代码格式无效: ${symbol}（应为6位数字，可带SH/SZ/BJ前缀）`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? symbol.toUpperCase() : undefined,
  };
}

/**
 * 验证 LLM 配置
 */
export function validateLLMConfig(config: any): ValidationResult {
  const errors: string[] = [];
  
  if (!config) {
    // 配置可选，不提供则使用默认
    return { valid: true, errors: [] };
  }
  
  // Provider 验证
  if (config.provider) {
    if (!VALID_PROVIDERS.includes(config.provider)) {
      errors.push(`不支持的 LLM 提供商: ${config.provider}`);
    }
  }
  
  // Model 验证
  if (config.provider && config.model) {
    const validModels = VALID_MODELS[config.provider] || [];
    if (!validModels.includes(config.model)) {
      // 不严格限制，只警告
      console.warn(`[Validation] 非标准模型: ${config.model} for ${config.provider}`);
    }
  }
  
  // API Key 验证（仅格式检查）
  if (config.apiKey) {
    if (typeof config.apiKey !== 'string') {
      errors.push('API Key 必须是字符串');
    } else if (config.apiKey.length < 10) {
      errors.push('API Key 格式无效');
    }
  }
  
  // Timeout 验证
  if (config.timeout) {
    if (typeof config.timeout !== 'number') {
      errors.push('超时时间必须是数字');
    } else if (config.timeout < 1000 || config.timeout > 120000) {
      errors.push('超时时间应在1秒到2分钟之间');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? {
      provider: config.provider || 'deepseek',
      model: config.model,
      timeout: config.timeout || 30000,
    } : undefined,
  };
}

/**
 * 验证 ML 选项
 */
export function validateMLOptions(options: any): ValidationResult {
  const errors: string[] = [];
  
  if (!options) {
    return { valid: true, errors: [] };
  }
  
  // enableLSTM 验证
  if (options.enableLSTM !== undefined) {
    if (typeof options.enableLSTM !== 'boolean') {
      errors.push('enableLSTM 必须是布尔值');
    }
  }
  
  // enableTransformer 验证
  if (options.enableTransformer !== undefined) {
    if (typeof options.enableTransformer !== 'boolean') {
      errors.push('enableTransformer 必须是布尔值');
    }
  }
  
  // mlWeight 验证
  if (options.mlWeight !== undefined) {
    if (typeof options.mlWeight !== 'number') {
      errors.push('mlWeight 必须是数字');
    } else if (options.mlWeight < 0 || options.mlWeight > 1) {
      errors.push('mlWeight 必须在0到1之间');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? {
      enableLSTM: options.enableLSTM ?? true,
      enableTransformer: options.enableTransformer ?? true,
      mlWeight: options.mlWeight ?? 0.25,
    } : undefined,
  };
}

/**
 * 综合验证请求体
 */
export function validateSwarmRequest(body: any): ValidationResult {
  const errors: string[] = [];
  const sanitized: any = {};
  
  // 验证新闻
  const newsResult = validateNews(body.news);
  if (!newsResult.valid) {
    errors.push(...newsResult.errors);
  } else {
    sanitized.news = newsResult.sanitized;
  }
  
  // 验证轮次
  const roundsResult = validateRounds(body.rounds || 5);
  if (!roundsResult.valid) {
    errors.push(...roundsResult.errors);
  } else {
    sanitized.rounds = roundsResult.sanitized;
  }
  
  // 验证股票代码
  const symbolResult = validateStockCode(body.symbol);
  if (!symbolResult.valid) {
    errors.push(...symbolResult.errors);
  } else {
    sanitized.symbol = symbolResult.sanitized;
  }
  
  // 验证 LLM 配置
  const llmResult = validateLLMConfig(body.llmConfig);
  if (!llmResult.valid) {
    errors.push(...llmResult.errors);
  } else {
    sanitized.llmConfig = llmResult.sanitized;
  }
  
  // 验证 ML 选项
  const mlResult = validateMLOptions(body.mlOptions);
  if (!mlResult.valid) {
    errors.push(...mlResult.errors);
  } else {
    sanitized.mlOptions = mlResult.sanitized;
  }
  
  // 验证布尔选项
  if (body.enableTechnicalAnalysis !== undefined) {
    if (typeof body.enableTechnicalAnalysis !== 'boolean') {
      errors.push('enableTechnicalAnalysis 必须是布尔值');
    } else {
      sanitized.enableTechnicalAnalysis = body.enableTechnicalAnalysis;
    }
  }
  
  if (body.enableML !== undefined) {
    if (typeof body.enableML !== 'boolean') {
      errors.push('enableML 必须是布尔值');
    } else {
      sanitized.enableML = body.enableML;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * 验证并抛出错误
 */
export function validateOrThrow(body: any): any {
  const result = validateSwarmRequest(body);
  if (!result.valid) {
    throw new Error(`输入验证失败: ${result.errors.join('; ')}`);
  }
  return result.sanitized;
}