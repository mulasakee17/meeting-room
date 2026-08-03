/**
 * EvidencePool — 确定性共享证据池（State-Centric Shared Evidence Pool）
 *
 * 定位：把"每个 agent 各自重放 prose 记忆"升级为"全局去重原子事实池"，
 * 以结构化事实块注入 NativeCognitiveEngine 的 prompt（零额外 LLM 调用）。
 *
 * 设计约束（与 v6 哲学一致）：
 *  - 去重键保留数值：同 (dimension, targetItem) 不同数值是【冲突】，不是重复。
 *    （数值剔除会让 "0.90" 与 "0.85" 被误合并——Supplier 场景已实测过该数值碰撞。）
 *  - 冲突只做可判定子集：同 (dimension, targetItem) 且提取数值不同 → isContradicted。
 *    开放文本反义检测超出确定性能力，不做（诚实标注）。
 *  - dimension 按属主映射（hidden-profile 构造已知，同 idr_diffusion 的碎片定义）：
 *    跨维度冲突不在本池范围（a5"综合粗略"维度的冲突天然低频）。
 *  - 池只收录 agent 实际输出的证据（structuredEvidence / evidence 回退），
 *    不含 agent 私有知识——即"已陈述事实的去重结构化视图"，非全知黑板书。
 *  - 注入采用「仅背景参考，非强制」框架（与系统参考块同风格）。
 *
 * 度量：这是机制探路（E10 smoke），去重阈值/预算为启发式，需 A/B 标定。
 */

export interface AtomicEvidence {
  /** 确定性 hash（FNV-1a 32bit hex）：hashKey(保留数值) + dimension + supports */
  id: string;
  sourceAgentId: string;
  roundIntroduced: number;
  dimension: string;
  /** 结构化 evidence 的 supports（被支持的选项/实体） */
  targetItem?: string;
  /** 原始陈述（trim） */
  statement: string;
  /** 自报置信度 [0, 100] */
  confidence: number;
  /** 从 statement 提取的数值（用于冲突判定） */
  numericValues: number[];
  isContradicted?: boolean;
  conflictWith?: string[];
}

export interface EvidencePoolOptions {
  /** Jaccard char-bigram 相似度阈值（近似重复判定，默认 0.75） */
  similarityThreshold?: number;
  /** buildView 的字符预算（默认 800，约 480 token） */
  maxChars?: number;
  /** agentId → dimension 映射（任务相关，hidden-profile 构造已知） */
  dimensions?: Record<string, string>;
}

export class EvidencePool {
  private readonly facts: AtomicEvidence[] = [];
  private readonly byHash = new Map<string, AtomicEvidence>();
  private readonly opts: Required<
    Pick<EvidencePoolOptions, "similarityThreshold" | "maxChars">
  > & { dimensions: Record<string, string> };

  constructor(options?: EvidencePoolOptions) {
    this.opts = {
      similarityThreshold: options?.similarityThreshold ?? 0.75,
      maxChars: options?.maxChars ?? 800,
      dimensions: options?.dimensions ?? {},
    };
  }

  /**
   * 喂入一条证据：去重合并（精确 hash / Jaccard 近似）或标记冲突。
   * 返回落池的 AtomicEvidence（合并时返回被合并的旧条目）。
   */
  addEvidence(input: {
    sourceAgentId: string;
    roundIntroduced: number;
    statement: string;
    confidence: number;
    supports?: string;
  }): AtomicEvidence | null {
    const statement = (input.statement ?? "").trim();
    if (statement.length < 3) return null;

    const dimension = this.opts.dimensions[input.sourceAgentId] ?? "unknown";
    const numericValues = extractNumbers(statement);
    // hashKey 保留数值（去空白/标点/小写）——数值不同 → hash 不同 → 走冲突而非合并
    const hashKey = statement.toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, "");
    const hash = fnv1a(`${hashKey}|${dimension}|${input.supports ?? ""}`);

    // 1. 精确去重（同一语句重复出现 → 合并，置信度取最大）
    const exact = this.byHash.get(hash);
    if (exact) {
      exact.confidence = Math.max(exact.confidence, input.confidence);
      return exact;
    }

    const ev: AtomicEvidence = {
      id: hash,
      sourceAgentId: input.sourceAgentId,
      roundIntroduced: input.roundIntroduced,
      dimension,
      targetItem: input.supports,
      statement,
      confidence: input.confidence,
      numericValues,
    };

    // Jaccard 用剔除数值的规范化文本（近似重复匹配不受数字噪声干扰）
    const canonText = canonicalize(statement);

    // 2. 与既有事实比较：冲突 or 近似重复
    for (const other of this.facts) {
      // targetItem 明确且不同 → 不同话题，不算矛盾（不同大学的事实不是冲突）
      if (other.targetItem && ev.targetItem && other.targetItem !== ev.targetItem) continue;

      const textSim = jaccardCharBigram(canonicalize(other.statement), canonText);

      // 数值冲突（同话题不同数值）：不 gate 在 dimension 上（a1"学术+科研" vs
      // a5"综合粗略" 的数值冲突正是要标记的），改为【目标 + 文本相似 + 数值不同】。
      // 文本相似度排除跨话题假阳性（"就业率0.90" vs "地理位置0.95" 文本不同不冲突）。
      const numericConflict =
        other.numericValues.length > 0 &&
        ev.numericValues.length > 0 &&
        !sameNumeric(other.numericValues, ev.numericValues) &&
        textSim >= CONFLICT_TEXT_THRESHOLD;

      if (numericConflict) {
        ev.isContradicted = true;
        ev.conflictWith = [...(ev.conflictWith ?? []), other.id];
        other.isContradicted = true;
        other.conflictWith = [...(other.conflictWith ?? []), ev.id];
        continue; // 冲突不合并，继续与其他条目比较
      }

      // 近似重复（同维度 + Jaccard ≥ 阈值）→ 合并（数值一致或一方无数值，不构成冲突）
      // 保留 dimension gate：防止跨维度文本碰撞（"学术声誉评分A顶尖" vs "地理评分A顶尖"）误合并
      if (
        other.dimension === ev.dimension &&
        textSim >= this.opts.similarityThreshold
      ) {
        other.confidence = Math.max(other.confidence, input.confidence);
        return other;
      }
    }

    this.facts.push(ev);
    this.byHash.set(hash, ev);
    return ev;
  }

  getFacts(): AtomicEvidence[] {
    return this.facts;
  }

  getConflicts(): AtomicEvidence[] {
    return this.facts.filter((f) => f.isContradicted);
  }

  /**
   * 生成 agent 可见的池视图（仅他人已陈述的事实，去重后）。
   * 排序：冲突优先 → 最新优先；受 maxChars 字符预算约束。
   * 返回空串表示无可展示内容（调用方跳过）。
   */
  buildView(agentId: string): string {
    const candidates = this.facts
      .filter((f) => f.sourceAgentId !== agentId)
      .sort(
        (a, b) =>
          (Number(b.isContradicted ?? false) - Number(a.isContradicted ?? false)) ||
          (b.roundIntroduced - a.roundIntroduced),
      );

    const lines: string[] = [];
    let used = 0;
    for (const f of candidates) {
      const conflictMark = f.conflictWith?.length
        ? ` ⚠️冲突（与 ${f.conflictWith.join(", ")} 数值矛盾）`
        : "";
      const line = `- [${f.dimension}] ${f.statement}${conflictMark}（来源 ${f.sourceAgentId}，自报置信度 ${f.confidence.toFixed(0)}%）`;
      if (used + line.length > this.opts.maxChars && lines.length > 0) break;
      lines.push(line);
      used += line.length;
    }
    if (lines.length === 0) return "";

    return (
      "\n\n【他人已陈述的事实（结构化，已去重）】以下为讨论中其他 agent 已明确陈述的事实。仅供你参考——请独立判断其可靠性，并据此核对/更新你对各选项的评估（不强制采用）。\n" +
      lines.join("\n")
    );
  }
}

// ============================================================================
// 确定性工具
// ============================================================================

/** 数值冲突的文本相似度下限：同话题不同数值才判冲突（排除跨话题假阳性）。 */
const CONFLICT_TEXT_THRESHOLD = 0.5;

/** 提取陈述中的数值（用于冲突判定）。如 "0.90" / "95%" → [0.9, 95]。 */
function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(parseFloat(m[1]));
  return out;
}

/** 规范化：去数字、去标点/空白、小写 → 用于 Jaccard 相似度（不含数值）。 */
function canonicalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameNumeric(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return false;
  }
  return true;
}

/** Jaccard 相似度（字符 bigram 集合）。 */
function jaccardCharBigram(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i + 1 < s.length; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** FNV-1a 32bit（确定性，无外部依赖）。 */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
