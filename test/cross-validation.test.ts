import { describe, it, expect } from 'vitest';
import { runCrossValidation } from '../src/lib/agents/v9/diagnostics';
import { V9_AGENTS } from '../src/lib/agents/v9/agentDefinitions';
import { computeAllAgentStates } from '../src/lib/agents/v9/agentInterpretation';

describe('Cross Validation Tests', () => {
  it('should run cross validation with 7 consensus methods', () => {
    const factorVector = {
      factors: [
        { category: 'liquidity' as const, value: 30, confidence: 80, evidence: 'test' },
        { category: 'policy' as const, value: 20, confidence: 70, evidence: 'test' },
        { category: 'fundamental' as const, value: -10, confidence: 60, evidence: 'test' },
        { category: 'narrative' as const, value: 40, confidence: 90, evidence: 'test' },
        { category: 'uncertainty' as const, value: 10, confidence: 50, evidence: 'test' },
      ],
    };

    const { states } = computeAllAgentStates(factorVector, V9_AGENTS, {});
    const result = runCrossValidation(V9_AGENTS, states);

    expect(result.methodResults).toHaveLength(7);
    expect(result.methodResults[0].method).toBe('linear_baseline');
    expect(result.methodResults[1].method).toBe('power_law');
    expect(result.methodResults[2].method).toBe('entropy_weighted');
    expect(result.methodResults[3].method).toBe('trimmed_mean');
    expect(result.methodResults[4].method).toBe('median');
    expect(result.methodResults[5].method).toBe('winsorized');
    expect(result.methodResults[6].method).toBe('geometric_mean');

    result.methodResults.forEach(method => {
      expect(method.consensus).toBeGreaterThanOrEqual(-100);
      expect(method.consensus).toBeLessThanOrEqual(100);
      expect(method.direction).toBeOneOf(['UP', 'DOWN', 'NEUTRAL']);
    });

    expect(result.consensusStd).toBeGreaterThanOrEqual(0);
    expect(result.directionConsistency).toBeGreaterThanOrEqual(0);
    expect(result.directionConsistency).toBeLessThanOrEqual(1);
    expect(result.confidenceLevel).toBeOneOf(['HIGH', 'MEDIUM', 'LOW', 'CRITICAL']);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('should compute direction consistency correctly', () => {
    const factorVector = {
      factors: [
        { category: 'liquidity' as const, value: 80, confidence: 90, evidence: 'test' },
        { category: 'policy' as const, value: 70, confidence: 85, evidence: 'test' },
        { category: 'fundamental' as const, value: 60, confidence: 80, evidence: 'test' },
        { category: 'narrative' as const, value: 50, confidence: 75, evidence: 'test' },
        { category: 'uncertainty' as const, value: 20, confidence: 60, evidence: 'test' },
      ],
    };

    const { states } = computeAllAgentStates(factorVector, V9_AGENTS, {});
    const result = runCrossValidation(V9_AGENTS, states);

    console.log('Direction consistency:', result.directionConsistency);
    console.log('Confidence level:', result.confidenceLevel);
    console.log('Overall score:', result.overallScore);
    console.log('Method results:', JSON.stringify(result.methodResults, null, 2));

    expect(result.directionConsistency).toBeGreaterThan(0.5);
  });

  it('should handle neutral cases', () => {
    const factorVector = {
      factors: [
        { category: 'liquidity' as const, value: 0, confidence: 50, evidence: 'test' },
        { category: 'policy' as const, value: 0, confidence: 50, evidence: 'test' },
        { category: 'fundamental' as const, value: 0, confidence: 50, evidence: 'test' },
        { category: 'narrative' as const, value: 0, confidence: 50, evidence: 'test' },
        { category: 'uncertainty' as const, value: 0, confidence: 50, evidence: 'test' },
      ],
    };

    const { states } = computeAllAgentStates(factorVector, V9_AGENTS, {});
    const result = runCrossValidation(V9_AGENTS, states);

    expect(result).toBeDefined();
    expect(result.methodResults).toHaveLength(7);
  });
});