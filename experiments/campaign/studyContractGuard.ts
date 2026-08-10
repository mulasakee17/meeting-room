/**
 * CC-2: Study Contract guard for the campaign Runner.
 *
 * Validates an explicitly provided GovernanceStudyContract before any
 * LLM/provider invocation. A missing contract is left undeclared (legacy);
 * it is never inferred from `isMain`, `governanceMode`, arm names, filenames,
 * or descriptions. The validated contract is returned as an exact structured
 * clone so the Runner can persist the same declaration verbatim into
 * RawRunData.
 */

import { validateGovernanceStudyContract } from "../../src/lib/experimentation/governanceStudy";
import type { GovernanceStudyContract } from "../../src/lib/experimentation/governanceStudy";
import type { ExperimentConfig } from "./types";

/**
 * Returns an exact structured clone of the validated study contract, or
 * `undefined` when the config carries no explicit declaration.
 *
 * Throws when a provided contract is malformed; the throw happens before the
 * Runner reaches any LLM/provider-backed call.
 */
export function assertValidStudyContract(
  config: ExperimentConfig,
): GovernanceStudyContract | undefined {
  if (config.governanceStudy === undefined) return undefined;
  validateGovernanceStudyContract(config.governanceStudy);
  return structuredClone(config.governanceStudy);
}
