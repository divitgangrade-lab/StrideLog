export function scoreTrendFor(scores) {
  const recent = scores.filter(Number.isFinite).slice(-3);
  if (recent.length < 3) return null;
  const mean = recent.reduce((sum, score) => sum + score, 0) / recent.length;
  const numerator = recent.reduce((sum, score, index) => sum + (index - 1) * (score - mean), 0);
  return numerator / 2;
}

export function isDecliningTrend(scores) {
  const slope = scoreTrendFor(scores);
  return slope !== null && slope <= -5;
}
