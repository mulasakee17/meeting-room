/**
 * Fatal provider-control failures must escape ordinary missingness handling.
 * They mean the experiment is no longer authorized to issue calls, so emitting
 * a completed run artifact would misrepresent the execution.
 */
export class ProviderExecutionHaltError extends Error {
  constructor(
    public readonly code:
      | "provider_call_budget_exceeded"
      | "token_budget_exceeded"
      | "provider_usage_required_for_budget"
      | "provider_usage_invalid_for_budget",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "ProviderExecutionHaltError";
  }
}

export function rethrowProviderExecutionHalt(error: unknown): void {
  if (error instanceof ProviderExecutionHaltError) throw error;
}
