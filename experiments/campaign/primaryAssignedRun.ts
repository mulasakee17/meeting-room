import {
  createPrimaryAssignmentManifestV1,
  createPrimaryAssignmentV1,
  loadOrCreatePrimaryAssignmentManifestV1,
  resolvePrimaryArmExecutionBindingV1,
  validateGovernanceStudyContract,
  validatePrimaryAssignmentManifestForStudy,
  type GovernanceStudyContract,
  type PersistedPrimaryAssignmentManifestV1,
  type PrimaryArmExecutionRegistryV1,
} from "../../src/lib/experimentation";
import {
  loadOrCreatePrimaryArmExecutionBindingV1,
  type PersistedPrimaryArmExecutionBindingV1,
} from "../../src/lib/experimentation/primaryArmExecutionStore";

export interface PreparedPrimaryAssignedRunV1 {
  runId: string;
  study: GovernanceStudyContract;
  assignment: PersistedPrimaryAssignmentManifestV1;
  execution: PersistedPrimaryArmExecutionBindingV1;
}

export type PrimaryAssignmentClock = () => string;

function systemClock(): string {
  return new Date().toISOString();
}

function stableJson(value: unknown): string {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child !== null && typeof child === "object") {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return child;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Production pre-provider boundary for Stage-1 assignment.
 *
 * Callers must invoke this before constructing any provider-backed engine.
 * The returned implementationConfig and budgetContract are the only permitted
 * execution inputs for the selected arm. This function deliberately does not
 * execute an arm or emit schema 5; those require the governance/outcome writer
 * to be complete, otherwise the repository would regain two authorities.
 */
export function preparePrimaryAssignedRunV1(input: {
  outputDir: string;
  runId: string;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  stratum: Record<string, string | number | boolean>;
  masterSeed: number;
  clock?: PrimaryAssignmentClock;
}): PreparedPrimaryAssignedRunV1 {
  validateGovernanceStudyContract(input.study);
  if (!input.study.primaryAssignmentDesign) {
    throw new Error("primary assigned run requires a frozen Stage-1 assignment design");
  }
  const study = structuredClone(input.study);
  const design = structuredClone(input.study.primaryAssignmentDesign);
  const clock = input.clock ?? systemClock;
  const assignment = loadOrCreatePrimaryAssignmentManifestV1({
    outputDir: input.outputDir,
    runId: input.runId,
    study,
    createManifest: () => {
      const assignedAt = clock();
      const record = createPrimaryAssignmentV1({
        id: `primary-assignment:${input.runId}`,
        runId: input.runId,
        studyRef: { id: study.id, version: study.version },
        design,
        stratum: structuredClone(input.stratum),
        masterSeed: input.masterSeed,
        assignedAt,
      });
      return createPrimaryAssignmentManifestV1({
        runId: input.runId,
        studyRef: { id: study.id, version: study.version },
        design,
        assignment: record,
        createdAt: clock(),
      });
    },
  });
  validatePrimaryAssignmentManifestForStudy(assignment.manifest, study);
  if (assignment.manifest.assignment.masterSeed !== input.masterSeed
    || stableJson(assignment.manifest.assignment.stratum) !== stableJson(input.stratum)) {
    throw new Error("existing primary assignment conflicts with requested masterSeed/stratum");
  }

  const execution = loadOrCreatePrimaryArmExecutionBindingV1({
    outputDir: input.outputDir,
    runId: input.runId,
    manifest: assignment.manifest,
    registry: input.registry,
    createBinding: () => resolvePrimaryArmExecutionBindingV1({
      manifest: assignment.manifest,
      registry: input.registry,
      resolvedAt: clock(),
    }),
  });

  return {
    runId: input.runId,
    study,
    assignment,
    execution,
  };
}
