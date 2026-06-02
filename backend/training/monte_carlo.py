"""
Monte Carlo Simulation Engine — Phase 4
Simulates 10,000 games per matchup to produce a full scoring distribution,
not just a single probability estimate.

Why this matters:
- XGBoost gives P(total > line) — a single number.
- Monte Carlo gives the full distribution: mean, std dev, percentiles,
  and the exact probability that ANY specific total is hit.
- This is how professional totals models actually work.

Install: pip install scipy (already in requirements if using numpy/pandas)
"""

import logging
import numpy as np
from scipy import stats
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)


# ── Simulation result container ────────────────────────────────────────────

@dataclass
class SimulationResult:
    """Full output from one Monte Carlo run."""
    game_id: str
    matchup: str
    line: float

    # Distribution summary
    mean_total: float
    std_total: float
    median_total: float
    p10: float          # 10th percentile — low end
    p25: float          # 25th percentile
    p75: float          # 75th percentile
    p90: float          # high end

    # The key outputs
    prob_over: float    # P(total > line) from simulation
    prob_push: float    # P(total == line exactly — rare but real)
    prob_under: float   # P(total < line)

    # Quarter-level breakdown
    q1_mean: float
    q2_mean: float
    q3_mean: float
    q4_mean: float

    # Team-level
    home_mean: float
    away_mean: float

    # Confidence interval on prob_over (from simulation variance)
    prob_over_ci_low: float
    prob_over_ci_high: float

    # How many simulations
    n_simulations: int


# ── Core simulation engine ─────────────────────────────────────────────────

class MonteCarloEngine:
    """
    Simulates NBA game totals using a possession-based model with
    calibrated variance. Each simulation:

    1. Samples pace from a normal distribution
    2. Samples offensive efficiency per possession
    3. Computes quarter-by-quarter scores
    4. Aggregates to full-game total

    This captures the real variance in NBA games (high-variance teams,
    pace outliers, blowouts, OT) that a single-point estimate misses.
    """

    def __init__(self, n_simulations: int = 10_000, seed: Optional[int] = 42):
        self.n = n_simulations
        self.rng = np.random.default_rng(seed)
        log.info(f"Monte Carlo engine initialised: {n_simulations:,} simulations")

    def run(
        self,
        game_id: str,
        matchup: str,
        line: float,
        # Team stats
        home_pace: float,
        away_pace: float,
        home_ortg: float,   # points per 100 possessions
        home_drtg: float,
        away_ortg: float,
        away_drtg: float,
        # Situational modifiers
        home_b2b: bool = False,
        away_b2b: bool = False,
        home_rest_days: int = 2,
        away_rest_days: int = 2,
        # Optional: XGBoost prior (for ensemble blending)
        xgb_prob_over: Optional[float] = None,
    ) -> SimulationResult:
        """
        Run full Monte Carlo simulation for one game.
        Returns a SimulationResult with full scoring distribution.
        """

        # ── Effective pace ─────────────────────────────────────────
        # The game pace is the average of both teams' paces,
        # adjusted for fatigue. B2B reduces pace ~1.5%.
        home_pace_adj = home_pace * (0.985 if home_b2b else 1.0)
        away_pace_adj = away_pace * (0.985 if away_b2b else 1.0)
        game_pace_mean = (home_pace_adj + away_pace_adj) / 2

        # Pace variance: NBA games vary ±4 possessions from expected
        pace_std = 3.5

        # ── Effective offensive efficiency ─────────────────────────
        # Home team scores against away defense:
        #   home_pts_per_poss = home_ortg adjusted by away_drtg vs league avg
        LEAGUE_AVG_RTG = 114.0  # approximate 2024-25 season average

        home_ppp_mean = (home_ortg / 100) * (LEAGUE_AVG_RTG / away_drtg)
        away_ppp_mean = (away_ortg / 100) * (LEAGUE_AVG_RTG / home_drtg)

        # Fatigue slightly reduces scoring efficiency too
        if home_b2b:
            home_ppp_mean *= 0.992
        if away_b2b:
            away_ppp_mean *= 0.992

        # PPP variance: real games vary ±5% around season average
        home_ppp_std = home_ppp_mean * 0.048
        away_ppp_std = away_ppp_mean * 0.048

        # ── Simulate n games ───────────────────────────────────────
        # Shape: (n_simulations,)
        pace_samples = self.rng.normal(game_pace_mean, pace_std, self.n).clip(85, 120)

        # Each team's PPP is correlated with game pace (fast games = more off. trips)
        pace_factor = (pace_samples - game_pace_mean) / (pace_std * 10)
        home_ppp = self.rng.normal(home_ppp_mean, home_ppp_std, self.n).clip(0.85, 1.45)
        away_ppp = self.rng.normal(away_ppp_mean, away_ppp_std, self.n).clip(0.85, 1.45)

        # Small positive pace-efficiency correlation (good teams run more)
        home_ppp += pace_factor * 0.01
        away_ppp += pace_factor * 0.01

        # ── Quarter-by-quarter simulation ──────────────────────────
        # Possessions per quarter: full-game pace × (12/48)
        q_poss_mean = pace_samples * (12 / 48)
        q_poss_std  = 1.2   # within-game quarter variance

        home_total = np.zeros(self.n)
        away_total = np.zeros(self.n)
        q_totals   = np.zeros((4, self.n))   # for quarter breakdown

        for q in range(4):
            q_poss = self.rng.normal(q_poss_mean, q_poss_std, self.n).clip(10, 18)
            # Slight 4th-quarter adjustment: games tighten (more fouling)
            foul_bonus = 1.04 if q == 3 else 1.0

            home_q = q_poss * home_ppp * foul_bonus
            away_q = q_poss * away_ppp * foul_bonus
            home_total += home_q
            away_total += away_q
            q_totals[q] = home_q + away_q

        game_totals = home_total + away_total

        # ── Overtime ───────────────────────────────────────────────
        # ~6% of NBA games go to OT. OT adds ~10-14 pts per period.
        ot_mask = self.rng.random(self.n) < 0.06
        n_ot = ot_mask.sum()
        if n_ot > 0:
            ot_pts = self.rng.normal(12.0, 2.5, n_ot).clip(6, 22)
            game_totals[ot_mask] += ot_pts

        # ── Compute statistics ─────────────────────────────────────
        prob_over  = float((game_totals > line).mean())
        prob_push  = float((game_totals == line).mean())  # always near 0 for floats
        prob_under = float((game_totals < line).mean())

        # 95% confidence interval on prob_over estimate
        se = np.sqrt(prob_over * (1 - prob_over) / self.n)
        ci_low  = max(0.0, prob_over - 1.96 * se)
        ci_high = min(1.0, prob_over + 1.96 * se)

        result = SimulationResult(
            game_id=game_id,
            matchup=matchup,
            line=line,
            mean_total=float(game_totals.mean()),
            std_total=float(game_totals.std()),
            median_total=float(np.median(game_totals)),
            p10=float(np.percentile(game_totals, 10)),
            p25=float(np.percentile(game_totals, 25)),
            p75=float(np.percentile(game_totals, 75)),
            p90=float(np.percentile(game_totals, 90)),
            prob_over=prob_over,
            prob_push=prob_push,
            prob_under=prob_under,
            q1_mean=float(q_totals[0].mean()),
            q2_mean=float(q_totals[1].mean()),
            q3_mean=float(q_totals[2].mean()),
            q4_mean=float(q_totals[3].mean()),
            home_mean=float(home_total.mean()),
            away_mean=float(away_total.mean()),
            prob_over_ci_low=ci_low,
            prob_over_ci_high=ci_high,
            n_simulations=self.n,
        )

        log.info(
            f"  {matchup}: mean={result.mean_total:.1f} ± {result.std_total:.1f} | "
            f"P(O {line}) = {prob_over:.1%} [{ci_low:.1%}, {ci_high:.1%}]"
        )
        return result


# ── Ensemble blender ───────────────────────────────────────────────────────

def blend_predictions(
    xgb_prob: float,
    mc_prob: float,
    xgb_weight: float = 0.40,
    mc_weight: float  = 0.35,
    market_prob: Optional[float] = None,
    market_weight: float = 0.25,
) -> dict:
    """
    Blend XGBoost, Monte Carlo, and market-implied probability
    into a single ensemble prediction.

    Default weights (from the bb.txt blueprint):
        40% XGBoost
        35% Monte Carlo (simulation)
        25% Market implied probability

    Market implied is derived from the consensus line:
        market_implied ≈ 0.5 (line is the market's best guess at 50/50)
    We only use market if there's meaningful line movement to encode.
    """
    if market_prob is None:
        # Without a real market signal, split between model outputs
        total = xgb_weight + mc_weight
        blended = (xgb_prob * xgb_weight + mc_prob * mc_weight) / total
    else:
        total = xgb_weight + mc_weight + market_weight
        blended = (
            xgb_prob    * xgb_weight
            + mc_prob   * mc_weight
            + market_prob * market_weight
        ) / total

    return {
        "xgb_prob":     round(xgb_prob,  4),
        "mc_prob":      round(mc_prob,   4),
        "market_prob":  round(market_prob, 4) if market_prob is not None else None,
        "ensemble_prob":round(blended,   4),
        "weights": {
            "xgb": xgb_weight,
            "mc":  mc_weight,
            "market": market_weight if market_prob is not None else 0,
        },
    }


# ── Quarter total helper ───────────────────────────────────────────────────

def simulate_quarter_total(
    result: SimulationResult,
    quarter: int,       # 1-4
    q_line: float,
) -> dict:
    """
    Derive quarter over/under probability from the full simulation.
    Useful for live betting and half-time markets.
    Quarter results correlate with game pace, so we derive them
    from the same simulation rather than running a separate one.
    """
    assert 1 <= quarter <= 4
    q_mean = [result.q1_mean, result.q2_mean, result.q3_mean, result.q4_mean][quarter - 1]
    q_std  = result.std_total / 4 * 1.1  # quarter variance slightly > 1/4 game

    # Approximate quarter distribution (normal for a single quarter)
    prob_q_over = float(1 - stats.norm.cdf(q_line, loc=q_mean, scale=q_std))

    return {
        "quarter":     quarter,
        "q_line":      q_line,
        "q_mean":      round(q_mean, 2),
        "prob_q_over": round(prob_q_over, 4),
        "prob_q_under":round(1 - prob_q_over, 4),
    }


# ── CLI demo ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("\n=== MONTE CARLO SIMULATION DEMO ===\n")

    engine = MonteCarloEngine(n_simulations=10_000, seed=42)

    # Demo: Celtics @ Nuggets, O/U 228.5
    result = engine.run(
        game_id  = "demo_001",
        matchup  = "Celtics @ Nuggets",
        line     = 228.5,
        home_pace = 101.2,
        away_pace = 99.8,
        home_ortg = 118.4,
        home_drtg = 110.2,
        away_ortg = 116.1,
        away_drtg = 111.8,
        home_b2b  = False,
        away_b2b  = False,
    )

    print(f"\nGame:          {result.matchup}")
    print(f"Line:          O/U {result.line}")
    print(f"\nScoring distribution ({result.n_simulations:,} simulations):")
    print(f"  Mean total:   {result.mean_total:.1f}")
    print(f"  Std dev:      {result.std_total:.1f}")
    print(f"  Median:       {result.median_total:.1f}")
    print(f"  10th pct:     {result.p10:.1f}  (low game)")
    print(f"  25th pct:     {result.p25:.1f}")
    print(f"  75th pct:     {result.p75:.1f}")
    print(f"  90th pct:     {result.p90:.1f}  (high game)")
    print(f"\nTeam projections:")
    print(f"  Nuggets (home): {result.home_mean:.1f}")
    print(f"  Celtics (away): {result.away_mean:.1f}")
    print(f"\nQuarter breakdown:")
    print(f"  Q1: {result.q1_mean:.1f}  Q2: {result.q2_mean:.1f}  Q3: {result.q3_mean:.1f}  Q4: {result.q4_mean:.1f}")
    print(f"\nProbabilities:")
    print(f"  P(Over {result.line}):  {result.prob_over:.1%}")
    print(f"  P(Under {result.line}): {result.prob_under:.1%}")
    print(f"  95% CI on P(Over): [{result.prob_over_ci_low:.1%}, {result.prob_over_ci_high:.1%}]")

    # Ensemble blend
    xgb_prob = 0.641   # from XGBoost model
    blend = blend_predictions(xgb_prob=xgb_prob, mc_prob=result.prob_over)
    print(f"\nEnsemble blend:")
    print(f"  XGBoost:      {blend['xgb_prob']:.1%}")
    print(f"  Monte Carlo:  {blend['mc_prob']:.1%}")
    print(f"  Ensemble:     {blend['ensemble_prob']:.1%}")

    # Quarter total example
    q1 = simulate_quarter_total(result, quarter=1, q_line=57.5)
    print(f"\nQ1 total (line {q1['q_line']}):")
    print(f"  P(Over): {q1['prob_q_over']:.1%}  P(Under): {q1['prob_q_under']:.1%}")

    print("\n=== DONE ===")
