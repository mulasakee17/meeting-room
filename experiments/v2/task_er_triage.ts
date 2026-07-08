/**
 * Emergency Room Triage — Reusable Hidden Profile Task
 *
 * A multi-agent benchmark task where 5 specialist doctors must collaboratively
 * rank 5 emergency patients by treatment priority. Each doctor has unique
 * partial information — no single doctor can correctly triage all patients.
 *
 * DESIGN PRINCIPLES (reusable):
 *   - Swap PATIENTS array to create new task variants
 *   - Adjust AGENTS to change specialist composition
 *   - Tune DIFFICULTY by changing information overlap
 *   - Fixed structure: 5 agents × 5 items × hidden profile = always interdependent
 *
 * Ground truth ranking is defined by medical urgency score:
 *   Life-threatening + time-critical (minutes) > Life-threatening + time-critical (hours)
 *   > Stable but deteriorating > Stable chronic > Non-urgent
 */

import type { TaskConfig } from "../lunar_survival/config";

// ============================================================================
// PATIENT POOL — Swap this to create new task variants
// ============================================================================

interface PatientCase {
  name: string;
  rank: number;           // 1 = highest priority
  urgency: string;        // Human-readable urgency label
  sharedInfo: string;     // Info ALL agents know
}

const PATIENTS: PatientCase[] = [
  {
    name: "王某 (52岁 男性)",
    rank: 1,
    urgency: "即刻——大面积心梗，30分钟内需介入",
    sharedInfo: "胸痛3小时，大汗淋漓，血压90/60，心率110",
  },
  {
    name: "李某 (7岁 女童)",
    rank: 2,
    urgency: "紧急——急性会厌炎，2小时内需气管插管",
    sharedInfo: "呼吸困难、流口水、不能吞咽、体温39.2°C、端坐呼吸",
  },
  {
    name: "张某 (34岁 女性 孕32周)",
    rank: 3,
    urgency: "紧急——胎盘早剥，6小时内需剖宫产",
    sharedInfo: "阴道出血伴腹痛，胎心监测显示晚期减速，宫缩频繁",
  },
  {
    name: "赵某 (68岁 男性)",
    rank: 4,
    urgency: "次紧急——COPD急性加重，24小时内需无创通气",
    sharedInfo: "慢阻肺病史20年，气短加重3天，血氧饱和度88%，吸氧后92%",
  },
  {
    name: "陈某 (23岁 男性)",
    rank: 5,
    urgency: "非紧急——踝关节骨折，72小时内手术即可",
    sharedInfo: "打篮球扭伤，右踝肿胀疼痛，X光确认外踝骨折，无血管神经损伤",
  },
];

// ============================================================================
// HIDDEN PROFILE — Each doctor's unique knowledge
// ============================================================================

interface DoctorConfig {
  id: string;
  name: string;
  role: string;
  knownItems: string;    // Critical info only this doctor knows
  initialBias: string;   // This doctor's natural prioritization tendency
}

const DOCTORS: DoctorConfig[] = [
  {
    id: "d1",
    name: "Dr.陈 (心内科)",
    role: "心血管专科医师",
    knownItems:
      "王某：心电图示广泛前壁ST段抬高（STEMI），肌钙蛋白I 12.5 ng/mL（正常<0.04），需紧急PCI。" +
      "窗口期仅90分钟——每延误30分钟死亡率增加7.5%。" +
      "赵某：BNP 850 pg/mL（正常<100），但心超示EF 45%——属慢性心衰，非急性发作，不需要优先处理。",
    initialBias: "心梗是第一优先级。时间就是心肌。骨折可以等。",
  },
  {
    id: "d2",
    name: "Dr.王 (儿科)",
    role: "儿科急症专科医师",
    knownItems:
      "李某：颈部侧位X光示'拇指征'——会厌肿胀已堵塞气道70%。" +
      "随时可能完全窒息。需立即气管插管，延迟可能导致缺氧性脑损伤。" +
      "陈某：踝关节骨折无并发症——但患儿是唯一不需要紧急干预的，可安排72小时内手术。",
    initialBias: "儿童的气道问题是最紧急的——窒息只需4分钟就会导致不可逆损伤。",
  },
  {
    id: "d3",
    name: "Dr.刘 (妇产科)",
    role: "高危产科专科医师",
    knownItems:
      "张某：B超确认胎盘后壁血肿8×5cm（胎盘早剥Grade II），胎儿估重1800g。" +
      "胎心监护显示每次宫缩后胎心下降40bpm持续60秒（晚期减速，提示胎儿窘迫）。" +
      "需在6小时内剖宫产——但随着时间推移，胎盘剥离面积可能扩大，导致胎儿死亡。",
    initialBias: "两条命比一条命重要。胎盘早剥对胎儿的风险是指数级的。",
  },
  {
    id: "d4",
    name: "Dr.杨 (呼吸科)",
    role: "呼吸危重症专科医师",
    knownItems:
      "赵某：动脉血气示pH 7.31、PaCO2 62 mmHg、PaO2 55 mmHg——急性呼吸性酸中毒。" +
      "但吸氧2L/min后血氧升至92%，说明对氧疗有反应。24小时内上无创通气（BiPAP）即可避免插管。" +
      "王某虽然心梗更紧急，但赵某的COPD加重如不及时处理，可能在48小时后进展为需要插管的呼吸衰竭。",
    initialBias: "COPD急性加重的死亡率是12%。虽然不是即刻致命，但可预防的死亡仍是死亡。",
  },
  {
    id: "d5",
    name: "Dr.周 (急诊科主任)",
    role: "急诊医学 & 分诊协调医师",
    knownItems:
      "综合急诊视角——确认了关键数据：" +
      "王某的STEMI：door-to-balloon时间目标90分钟，已过30分钟——剩余60分钟。" +
      "李某的会厌炎：气道阻塞70%，随时可能完全闭合——窒息只需4分钟。" +
      "张某的胎盘早剥：胎儿晚期减速已持续，但母体血流动力学稳定。" +
      "赵某的COPD：对氧疗有反应，BiPAP可在24小时内安排——暂不需要气管插管。" +
      "陈某的骨折：稳定，可延迟至72小时。明确的最末优先级。",
    initialBias:
      "分诊原则：先处理'即将死亡'的（王某和李某），再处理'可能恶化'的（张某和赵某），最后处理'稳定'的（陈某）。但王某和李某之间——心梗和窒息——哪个更紧急需要通过讨论来权衡。",
  },
];

// ============================================================================
// Task Construction
// ============================================================================

function buildTriageTask(): TaskConfig {
  const patientList = PATIENTS.map((p, i) => `${i + 1}. ${p.name}: ${p.sharedInfo}`).join("\n");

  const correctAnswer: Record<string, number> = {};
  for (const p of PATIENTS) {
    correctAnswer[p.name] = p.rank;
  }

  const searchKeys: Record<string, string[]> = {};
  for (const p of PATIENTS) {
    const shortName = p.name.split(" ")[0];
    searchKeys[p.name] = [shortName, p.name, ...p.sharedInfo.split(/[，,、]/).slice(0, 3).map(s => s.trim())];
  }

  const sharedBriefing =
    `你是某三甲医院急诊科的多学科会诊团队成员。现有5名危重患者需要按抢救优先级排序（从最优先到最低优先）：\n\n${patientList}\n\n` +
    `共享信息：急诊室当前有1间导管室（PCI可用）、1间手术室（待命中）、2台呼吸机（1台已占用）、3张ICU床位（2张可用）。`;

  return {
    id: "er_triage",
    title: "急诊室分诊任务",
    correctAnswer,
    searchKeys,
    sharedBriefing,
    agents: DOCTORS.map(d => ({
      id: d.id,
      name: d.name,
      role: d.role,
      knownItems: d.knownItems,
      initialBias: d.initialBias,
    })),
  };
}

export const TASK_ER_TRIAGE = buildTriageTask();

// ============================================================================
// VARIANT GENERATOR — Create new task instances by swapping patient data
// ============================================================================

/**
 * Generate a new triage task variant with custom patients.
 *
 * Usage:
 *   const variant = createTriageVariant([
 *     { name: "新患者A", rank: 1, urgency: "...", sharedInfo: "..." },
 *     // ... 4 more patients
 *   ]);
 *
 * The DOCTORS remain the same — only patient data changes.
 * This makes the task "recyclable": same structure, new data.
 */
export function createTriageVariant(patients: PatientCase[]): TaskConfig {
  const saved = PATIENTS.slice();
  // Mutate PATIENTS array temporarily (restored after building)
  PATIENTS.length = 0;
  PATIENTS.push(...patients);

  const task = buildTriageTask();

  // Restore original patients
  PATIENTS.length = 0;
  PATIENTS.push(...saved);

  return { ...task, id: `er_triage_variant_${Date.now()}` };
}
