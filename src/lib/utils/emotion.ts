export function calculateMean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateVariance(values: number[]): number {
  const mean = calculateMean(values);
  return values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
}

export function calculateStdDev(values: number[]): number {
  return Math.sqrt(calculateVariance(values));
}

export function checkConvergence(emotions: number[], threshold: number = 10): boolean {
  return calculateStdDev(emotions) < threshold;
}

export function getDirection(emotion: number): string {
  if (emotion > 20) return "strongly_bullish";
  if (emotion > 5) return "slightly_bullish";
  if (emotion < -20) return "strongly_bearish";
  if (emotion < -5) return "slightly_bearish";
  return "neutral";
}

export function clampEmotion(value: number): number {
  return Math.max(-100, Math.min(100, value));
}
