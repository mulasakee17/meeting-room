/**
 * V6 task-family adapters: the single task-specific projection boundary between
 * the task-agnostic v6 kernel (production vertical slice) and concrete
 * distributed-information tasks. The kernel never imports a concrete task
 * module; the runner/CLI resolves a family to its adapter and passes only the
 * projected task data into the slice.
 */

import type { VersionedGovernanceRef } from "../../../src/lib/governance";
import type { V6BinaryTaskV1, V6TaskV1 } from "./productionVerticalSlice";

export type V6TaskFamilyKey = "distributed-binary" | "network-fault";

export const DISTRIBUTED_BINARY_TASK_FAMILY = Object.freeze({
  id: "swarmalpha.task.distributed-binary",
  version: "1.0.0",
});

export const NETWORK_FAULT_TASK_FAMILY = Object.freeze({
  id: "swarmalpha.task.network-fault",
  version: "1.0.0",
});

/** Structural schema shared by all binary distributed-information families. */
export const BINARY_TASK_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.v6.binary-task",
  version: "1.0.0",
});

/**
 * Narrow adapter contract. The adapter owns the family identity, the public
 * context, the frozen ordered roster and per-agent private views, one
 * preregistered claim, and the declarative resolution contract. It must
 * NOT compute governance diagnoses, choose interventions, provide pi_0 / primary
 * metric / missingness policy, mutate task/roster/claim after assignment, or
 * write schema-5 authoritative fields.
 */
export interface V6TaskAdapterV1<TTask extends V6TaskV1 = V6TaskV1> {
  /** Versioned adapter identity. */
  adapterRef: VersionedGovernanceRef;
  /** Task-family identity; must equal the study's taskFamilyRef. */
  taskFamilyRef: VersionedGovernanceRef;
  /** Structural schema of the projected task. */
  taskSchemaRef: VersionedGovernanceRef;
  /** The frozen task the kernel executes (ordered roster + private views). */
  task: TTask;
  /** Declarative resolution contract: truth is released from the task outcome at resolution time. */
  resolution: { kind: "from_task_outcome"; resolverId: string };
  /**
   * Optional task-specific governance source-event projection hook. Both v1
   * families rely on the kernel's built-in belief-report events and leave this
   * unset; the hook is reserved for a family that must contribute its own
   * source events once the kernel supports them. Codex owns the final contract.
   */
  sourceEventProjection?: { id: string; version: string };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

/** The frozen v1 distributed-binary task, wrapped byte-for-byte. */
function distributedBinaryAdapter(): V6TaskAdapterV1<V6BinaryTaskV1> {
  return deepFreeze({
    adapterRef: { id: "swarmalpha.task-adapter.distributed-binary", version: "1.0.0" },
    taskFamilyRef: DISTRIBUTED_BINARY_TASK_FAMILY,
    taskSchemaRef: BINARY_TASK_SCHEMA_V1,
    task: {
      id: "task:v6-smoke-route",
      taskFamilyRef: DISTRIBUTED_BINARY_TASK_FAMILY,
      publicContext: "A remote station must decide whether the emergency route is viable.",
      claim: {
        id: "claim:v6-smoke-route-viable",
        proposition: "The emergency route is viable.",
        domain: "distributed-binary-smoke",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:v6-smoke" },
      },
      agents: [
        { agentId: "agent:a", privateInformation: "Sensor A reports a clear route." },
        { agentId: "agent:b", privateInformation: "Sensor B reports unstable ice." },
      ],
      outcome: false,
    },
    resolution: { kind: "from_task_outcome", resolverId: "resolver:v6-smoke" },
  });
}

/**
 * A second-domain binary distributed-information task (network-fault
 * root-cause). Owner-provisional: swapping families only changes this block.
 */
function networkFaultAdapter(): V6TaskAdapterV1<V6BinaryTaskV1> {
  return deepFreeze({
    adapterRef: { id: "swarmalpha.task-adapter.network-fault", version: "1.0.0" },
    taskFamilyRef: NETWORK_FAULT_TASK_FAMILY,
    taskSchemaRef: BINARY_TASK_SCHEMA_V1,
    task: {
      id: "task:v6-network-fault",
      taskFamilyRef: NETWORK_FAULT_TASK_FAMILY,
      publicContext: "A corridor network has reported an outage; the operations team must decide the root cause of the connectivity loss.",
      claim: {
        id: "claim:v6-network-fault-s7",
        proposition: "Switch S7 is the root cause of the corridor outage.",
        domain: "network-fault-diagnosis",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:v6-network-fault" },
      },
      agents: [
        { agentId: "agent:a", privateInformation: "Corridor monitor A reports BGP flapping on switch S7 for the last 40 minutes." },
        { agentId: "agent:b", privateInformation: "Corridor monitor B reports the redundant path via S9 carrying traffic without loss." },
      ],
      outcome: false,
    },
    resolution: { kind: "from_task_outcome", resolverId: "resolver:v6-network-fault" },
  });
}

export function createV6TaskAdapter(family: V6TaskFamilyKey): V6TaskAdapterV1<V6BinaryTaskV1> {
  switch (family) {
    case "distributed-binary":
      return distributedBinaryAdapter();
    case "network-fault":
      return networkFaultAdapter();
  }
}
