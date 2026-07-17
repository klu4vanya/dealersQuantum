export const RATE_TIERS = [
  { shifts: 0, rate: 600 },
  { shifts: 20, rate: 700 },
  { shifts: 60, rate: 800 },
  { shifts: 100, rate: 900 },
  { shifts: 150, rate: 950 },
  { shifts: 200, rate: 1000 }
];

export function getCurrentRate(completedCount: number) {
  const activeTier = RATE_TIERS.reduce((current, tier) => {
    return completedCount >= tier.shifts ? tier : current;
  }, RATE_TIERS[0]);
  const nextTier = RATE_TIERS.find((tier) => tier.shifts > completedCount) || null;

  return {
    rate: activeTier.rate,
    completedCount,
    tierStart: activeTier.shifts,
    nextTier,
    shiftsToNextTier: nextTier ? nextTier.shifts - completedCount : 0
  };
}

export function calculateShift(startedAt: Date, endedAt: Date, hourlyRate: number) {
  const durationMinutes = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));
  const amount = Math.round((durationMinutes * hourlyRate) / 60);

  return { durationMinutes, amount };
}
