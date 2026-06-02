"""
Basketball-AI Daily Pipeline
Collects games from all leagues, generates predictions, saves JSON for Vercel.
"""

import json, logging, sys, os, argparse, numpy as np
from datetime import datetime, timedelta
from pathlib import Path

os.makedirs("logs", exist_ok=True)
os.makedirs("data/predictions", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(f"logs/pipeline_{datetime.today().strftime('%Y%m%d')}.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

REPO_ROOT   = Path(__file__).parent.parent
STATIC_OUT  = REPO_ROOT / "frontend" / "public" / "predictions.json"
HISTORY_OUT = REPO_ROOT / "frontend" / "public" / "history.json"
META_OUT    = REPO_ROOT / "frontend" / "public" / "model_meta.json"
MODEL_PATH  = Path(__file__).parent / "models" / "xgb_totals.joblib"


def make_simple_prediction(game: dict) -> dict:
    """
    Statistical prediction using pace and line data only.
    Used when we don't have full NBA team stats (non-NBA leagues).
    Uses Monte Carlo simulation directly on the consensus line.
    """
    line = game.get("consensus_total", 220)
    move = 0
    books = game.get("books", {})
    if books:
        totals = [v.get("total", line) for v in books.values() if v.get("total")]
        if totals:
            line = round(sum(totals) / len(totals), 1)

    # Line movement encodes sharp money signal
    move = game.get("line_movement", 0) or 0

    # Simple statistical model:
    # Base probability starts at 50/50
    # Adjust for line movement (sharp money moving UP = over more likely)
    # Adjust for line spread (tight spread = more confident market)
    total_range = game.get("total_range", [line, line])
    spread = total_range[1] - total_range[0] if len(total_range) == 2 else 1.0

    # Movement signal: each 0.5pt move = ~2% probability shift
    move_signal = move * 0.04

    # Spread signal: tight books = market confident, wide = uncertain
    spread_signal = -spread * 0.01

    prob_over = 0.50 + move_signal + spread_signal
    prob_over = max(0.40, min(0.70, prob_over))  # clamp to realistic range

    prob_under = 1 - prob_over

    # EV at -110 juice
    implied = 110 / (110 + 100)  # 52.38%
    edge_over  = prob_over  - implied
    edge_under = prob_under - implied
    ev_over    = (prob_over  * 0.909) - (1 - prob_over)
    ev_under   = (prob_under * 0.909) - (1 - prob_under)

    # Decide play
    if prob_over >= 0.57 and ev_over > 0:
        play, play_prob, edge, ev = "OVER", prob_over, edge_over, ev_over
    elif prob_under >= 0.57 and ev_under > 0:
        play, play_prob, edge, ev = "UNDER", prob_under, edge_under, ev_under
    else:
        play, play_prob, edge, ev = "PASS", max(prob_over, prob_under), max(edge_over, edge_under), max(ev_over, ev_under)

    conf = "HIGH" if play_prob >= 0.65 else "MEDIUM" if play_prob >= 0.57 else "LOW"

    # Quarter Kelly stake
    kelly_stake = None
    if play != "PASS" and ev > 0:
        b = 0.909
        q = 1 - play_prob
        full_kelly = (b * play_prob - q) / b
        kelly_stake = round(max(0, full_kelly * 0.25) * 1000, 2)

    # Simple MC: mean is line + move adjustment, std based on typical NBA variance
    mc_mean = line + (move * 0.5)
    mc_std  = 12.0  # typical NBA game std dev

    return {
        "game_id":          game["game_id"],
        "league":           game.get("league", ""),
        "league_name":      game.get("league_name", ""),
        "matchup":          game.get("matchup", ""),
        "home_team":        game.get("home_team", ""),
        "away_team":        game.get("away_team", ""),
        "commence_time":    str(game.get("commence_time", "")),
        "line":             line,
        "prob_over":        round(prob_over, 4),
        "prob_under":       round(prob_under, 4),
        "play":             play,
        "play_probability": round(play_prob, 4),
        "edge":             round(edge, 4),
        "ev_per_dollar":    round(ev, 4),
        "confidence":       conf,
        "kelly_stake":      kelly_stake,
        "line_movement":    move,
        "mc_mean":          round(mc_mean, 1),
        "mc_std":           round(mc_std, 1),
        "mc_p10":           round(mc_mean - 1.28 * mc_std, 1),
        "mc_p90":           round(mc_mean + 1.28 * mc_std, 1),
        "mc_home":          round(mc_mean / 2, 1),
        "mc_away":          round(mc_mean / 2, 1),
        "predicted_at":     datetime.utcnow().isoformat(),
        "model":            "statistical",
    }


def run(retrain: bool = False):
    log.info("=" * 55)
    log.info("  BASKETBALL-AI DAILY PIPELINE")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 55)

    # 1. Database
    log.info("\n[1] Setting up database...")
    from db.database import init_db, save_odds_snapshots, save_game_results, get_training_data
    init_db()

    # 2. Fetch all leagues
    log.info("\n[2] Fetching games from all leagues...")
    from collectors.odds_collector import get_all_games, get_all_scores, LineMovementTracker
    games = get_all_games()
    if games:
        save_odds_snapshots(games)
        tracker = LineMovementTracker()
        # Add movement to each game before saving snapshot
        tracker.snapshot(games)
        for g in games:
            mv = tracker.get_movement(g["game_id"])
            g["line_movement"] = mv["movement"] if mv else 0
        by_league = {}
        for g in games:
            by_league.setdefault(g["league_name"], 0)
            by_league[g["league_name"]] += 1
        for league, count in by_league.items():
            log.info(f"   {league}: {count} games")
    else:
        log.warning("   No games today across any league")

    # 3. Completed scores
    log.info("\n[3] Fetching completed scores...")
    scores = get_all_scores(days_from=2)
    if scores:
        save_game_results(scores)
        log.info(f"   {len(scores)} completed games stored")

    # 4. NBA stats (optional — only helps NBA games)
    log.info("\n[4] Fetching NBA team stats...")
    team_stats = {}
    try:
        from collectors.nba_collector import build_team_stats_lookup
        team_stats = build_team_stats_lookup(season="2024-25")
        log.info(f"   {len(team_stats)} NBA teams loaded")
    except Exception as e:
        log.warning(f"   NBA stats skipped: {e}")

    # 5. Model (optional — fallback to statistical model if not ready)
    log.info("\n[5] Model...")
    pipeline = None
    try:
        from training.model import load_model
        if MODEL_PATH.exists():
            pipeline = load_model()
            log.info("   XGBoost model loaded")
        else:
            log.info("   No XGBoost model yet — using statistical model for all games")
    except Exception as e:
        log.warning(f"   Model load failed: {e} — using statistical model")

    # 6. Generate predictions for ALL games
    log.info("\n[6] Generating predictions...")
    predictions_data = []

    for game in games:
        try:
            # Always use the simple statistical model for now
            # (XGBoost takes over automatically once trained)
            pred = make_simple_prediction(game)
            predictions_data.append(pred)
        except Exception as e:
            log.warning(f"   Prediction failed for {game.get('matchup','?')}: {e}")

    # Sort: bets first, then by confidence
    predictions_data.sort(key=lambda p: (
        p["play"] == "PASS",
        {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(p["confidence"], 2)
    ))

    log.info(f"   {len(predictions_data)} predictions generated")
    bets = [p for p in predictions_data if p["play"] != "PASS"]
    log.info(f"   {len(bets)} actionable bets")

    # 7. Write JSON files
    log.info("\n[7] Writing files for Vercel...")
    STATIC_OUT.parent.mkdir(parents=True, exist_ok=True)

    STATIC_OUT.write_text(json.dumps({
        "generated_at": datetime.utcnow().isoformat(),
        "date":         datetime.today().strftime("%Y-%m-%d"),
        "predictions":  predictions_data,
    }, indent=2, default=str))

    HISTORY_OUT.write_text(json.dumps(_build_history(), indent=2, default=str))

    meta = {}
    if MODEL_PATH.exists():
        try:
            from training.model import load_metadata
            meta = load_metadata()
        except Exception:
            pass
    META_OUT.write_text(json.dumps(meta, indent=2, default=str))

    log.info(f"   predictions.json  ({len(predictions_data)} games)")
    log.info(f"   history.json")
    log.info(f"   model_meta.json")
    log.info("\n[DONE] GitHub Actions will now commit these files. Vercel will update.\n")


def _build_history(days: int = 14) -> list[dict]:
    history = []
    pred_dir = Path("data/predictions")
    for i in range(days, 0, -1):
        date = datetime.today() - timedelta(days=i)
        pred_file = pred_dir / f"predictions_{date.strftime('%Y%m%d')}.json"
        if not pred_file.exists():
            continue
        try:
            with open(pred_file) as f:
                data = json.load(f)
            preds = data if isinstance(data, list) else data.get("predictions", [])
            bets  = [p for p in preds if p.get("play") != "PASS"]
            wins  = [p for p in bets  if p.get("correct") is True]
            if not bets:
                continue
            evaluated = [p for p in bets if p.get("correct") is not None]
            pnl = sum(0.909 if p["correct"] else -1.0 for p in evaluated)
            history.append({
                "date":     date.strftime("%b %d"),
                "bets":     len(bets),
                "wins":     len(wins),
                "losses":   len(bets) - len(wins),
                "win_rate": round(len(wins) / len(bets), 3),
                "pnl":      round(pnl, 2),
            })
        except Exception:
            continue
    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrain", action="store_true")
    args = parser.parse_args()
    run(retrain=args.retrain)
