export const JOKER_LIMIT = 3;

export function resultOf(hs, as) {
  if (hs === as) return "D";
  return hs > as ? "H" : "A";
}

// pred: { home_score, away_score, joker } | null
// fixture: { status, home_score, away_score }
export function pointsFor(pred, fixture) {
  if (!pred || fixture.status !== "FT" || fixture.home_score === null || fixture.home_score === undefined) {
    return 0;
  }
  if (pred.home_score === fixture.home_score && pred.away_score === fixture.away_score) return 3;
  if (resultOf(pred.home_score, pred.away_score) === resultOf(fixture.home_score, fixture.away_score)) return 1;
  return 0;
}

export function finalPoints(pred, fixture) {
  return pointsFor(pred, fixture) * (pred && pred.joker ? 2 : 1);
}

export function isPerfect(pred, fixture) {
  return pointsFor(pred, fixture) === 3;
}

export function monthLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
