"""
Prediction Engine
Loads a trained model and generates predictions for today's games.

Usage:
    python predictions/predict.py

Output: predictions JSON + stored in DB for dashboard display.
"""

import json
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

PREDICTIONS_DIR = Path(__file__).parent.parent / "data" / "predictions"
PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)


def predict_games(games: list[dict], team_stats: dict, team_logs: dict) -> list[dict]:
    """
    Generate over/under predictions for a list of upcoming games.

    Args:
        games: list of parsed game dicts from odds_collector.get_nba_games()
        team_stats: {team_name: {pace, off_rating, def_rating, ...}}
        team_logs: {team_name: pd.DataFrame of recent game logs}

    Returns:
        list of prediction dicts, sorted by confidence descending.
    """
    from training.model import load_model, load_metadata, expected_value, kelly_stake
    from training.features import (
        build_feature_row, ALL_FEATURES,
        build_market_features, build_situational_features,
    )

    pipeline = load_model()
    meta = load_metadata()
    log.info(f"Loaded model (trained {meta.get('trained_at', 'unknown')})")

    predictions = []

    for game in games:
        home = game["home_team"]
        away = game["away_team"]

        home_stats = team_stats.get(home, {})
        away_stats = team_stats.get(away, {})
        home_logs  = team_logs.get(home,  pd.DataFrame())
        away_logs  = team_logs.get(away,  pd.DataFrame())

        # Use last known rest day data (or defaults)
        home_meta = _extract_meta(home_logs)
        away_meta = _extract_meta(away_logs)

        # Odds snapshots: list of dicts with consensus_total
        odds_snaps = _game_to_snaps(game)

        row = build_feature_row(
            home_stats=home_stats,
            away_stats=away_stats,
            home_logs=home_logs,
            away_logs=away_logs,
            home_meta=home_meta,
            away_meta=away_meta,
            odds_snapshots=odds_snaps,
        )

        # Build feature DataFrame (must match training column order)
        X = pd.DataFrame([row]).reindex(columns=ALL_FEATURES)

        try:
            prob_over = float(pipeline.predict_proba(X)[0, 1])
        except Exception as e:
            log.warning(f"Prediction failed for {away} @ {home}: {e}")
            continue

        prob_under = 1 - prob_over
        line = game.get("consensus_total", np.nan)

        ev_over  = expected_value(prob_over,  american_odds=-110)
        ev_under = expected_value(prob_under, american_odds=-110)

        # Determine recommended play
        if prob_over >= 0.58 and ev_over["ev_per_dollar"] > 0:
            play = "OVER"
            play_prob = prob_over
            play_ev = ev_over
        elif prob_under >= 0.58 and ev_under["ev_per_dollar"] > 0:
            play = "UNDER"
            play_prob = prob_under
            play_ev = ev_under
        else:
            play = "PASS"
            play_prob = max(prob_over, prob_under)
            play_ev = ev_over if prob_over > prob_under else ev_under

        confidence = _confidence_label(play_prob)
        kelly = kelly_stake(play_prob, bankroll=1000) if play != "PASS" else {}

        pred = {
            "game_id": game["game_id"],
            "home_team": home,
            "away_team": away,
            "matchup": f"{away} @ {home}",
            "commence_time": game["commence_time"],
            "line": line,
            "prob_over": round(prob_over, 4),
            "prob_under": round(prob_under, 4),
            "play": play,
            "play_probability": round(play_prob, 4),
            "edge": round(play_ev.get("edge", 0), 4),
            "ev_per_dollar": round(play_ev.get("ev_per_dollar", 0), 4),
            "confidence": confidence,
            "kelly_stake": kelly.get("recommended_stake"),
            "predicted_at": datetime.utcnow().isoformat(),
            "model_version": meta.get("trained_at", "unknown"),
            # Feature snapshot for debugging
            "_features": {k: round(v, 3) if isinstance(v, float) else v
                          for k, v in row.items()},
        }
        predictions.append(pred)
        log.info(
            f"  {away:20s} @ {home:20s} | Line {line} | "
            f"P(O)={prob_over:.1%} | {play} {confidence}"
        )

    # Sort: PASS last, then by confidence
    predictions.sort(key=lambda p: (p["play"] == "PASS", -p["play_probability"]))

    # Save to disk
    out_file = PREDICTIONS_DIR / f"predictions_{datetime.today().strftime('%Y%m%d')}.json"
    with open(out_file, "w") as f:
        json.dump(predictions, f, indent=2, default=str)
    log.info(f"Predictions saved to {out_file}")

    return predictions


def format_predictions_report(predictions: list[dict]) -> str:
    """Pretty-print prediction summary to stdout / logs."""
    lines = [
        "",
        "=" * 70,
        f"  BASKETBALL-AI PREDICTIONS — {datetime.today().strftime('%A %b %d, %Y')}",
        "=" * 70,
        "",
    ]
    for p in predictions:
        emoji = {"OVER": "⬆", "UNDER": "⬇", "PASS": "—"}.get(p["play"], "")
        lines.append(
            f"  {p['matchup']:<40s} Line: {p['line']}"
        )
        lines.append(
            f"    {emoji} {p['play']:<5s}  "
            f"P(O): {p['prob_over']:.1%}  "
            f"Edge: {p['edge']:+.1%}  "
            f"Confidence: {p['confidence']}"
        )
        if p["play"] != "PASS":
            lines.append(f"    Kelly stake: ${p['kelly_stake']} / $1,000")
        lines.append("")

    bets = [p for p in predictions if p["play"] != "PASS"]
    lines += [
        f"  Actionable bets today: {len(bets)} / {len(predictions)}",
        "=" * 70,
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Result tracker — compare predictions to actual scores
# ---------------------------------------------------------------------------

def evaluate_past_predictions(
    predictions: list[dict],
    actuals: list[dict],
) -> dict:
    """
    Compare yesterday's predictions against actual game totals.

    actuals: list from odds_collector.get_scores()
    Returns win/loss/pass breakdown and P&L estimate.
    """
    actual_map = {a["game_id"]: a for a in actuals}
    results = []
    for pred in predictions:
        gid = pred["game_id"]
        if gid not in actual_map or pred["play"] == "PASS":
            continue
        actual_total = actual_map[gid]["actual_total"]
        line = pred["line"]
        over_hit = actual_total > line
        correct = (pred["play"] == "OVER" and over_hit) or \
                  (pred["play"] == "UNDER" and not over_hit)
        pnl = 0.909 if correct else -1.0   # -110 juice standard
        results.append({
            "game_id": gid,
            "matchup": pred["matchup"],
            "play": pred["play"],
            "line": line,
            "actual_total": actual_total,
            "over_hit": over_hit,
            "correct": correct,
            "pnl": pnl,
            "confidence": pred["confidence"],
        })

    n = len(results)
    wins = sum(1 for r in results if r["correct"])
    pnl_total = sum(r["pnl"] for r in results)

    return {
        "date": datetime.today().strftime("%Y-%m-%d"),
        "bets": n,
        "wins": wins,
        "losses": n - wins,
        "win_rate": wins / n if n > 0 else None,
        "pnl": round(pnl_total, 2),
        "results": results,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_meta(game_logs: pd.DataFrame) -> dict:
    """Derive rest/b2b meta from game log DataFrame."""
    if game_logs.empty or "GAME_DATE" not in game_logs.columns:
        return {"rest_days": 2, "is_back_to_back": 0}
    dates = pd.to_datetime(game_logs["GAME_DATE"]).sort_values(ascending=False)
    if len(dates) < 2:
        return {"rest_days": 2, "is_back_to_back": 0}
    rest = (datetime.today() - dates.iloc[0]).days
    b2b = int((dates.iloc[0] - dates.iloc[1]).days == 1)
    return {"rest_days": rest, "is_back_to_back": b2b}


def _game_to_snaps(game: dict) -> list[dict]:
    """Convert a parsed game dict to the snapshot list format features expects."""
    return [{
        "consensus_total": game.get("consensus_total"),
        "total_high": game.get("total_range", [None, None])[1],
        "total_low":  game.get("total_range", [None, None])[0],
    }]


def _confidence_label(prob: float) -> str:
    if prob >= 0.65:
        return "HIGH"
    elif prob >= 0.58:
        return "MEDIUM"
    else:
        return "LOW"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("Prediction Engine — requires trained model + live data.")
    print("Run pipeline.py first to collect today's games, then:")
    print("  from predictions.predict import predict_games")
    print("  predictions = predict_games(games, team_stats, team_logs)")
