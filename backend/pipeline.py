"""
Basketball-AI Daily Pipeline  (v2 — with free APIs + grader)

Steps:
  1. Database init
  2. Fetch games (Odds API)
  3. Fetch completed scores (Odds API + ESPN + Ball Don't Lie — free)
  3.5 Grade previous predictions against actual results
  4. NBA team stats (nba_api)
  5. Load/train model
  6. Generate predictions for today
  7. Save daily prediction file
  8. Write JSON files for Vercel
"""

import json, logging, sys, os, argparse, numpy as np
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.makedirs("logs",             exist_ok=True)
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
PRED_DIR    = Path("data/predictions")


def make_simple_prediction(game: dict) -> dict:
    """Statistical model — fallback until XGBoost is trained."""
    line = game.get("consensus_total", 220)
    books = game.get("books", {})
    if books:
        totals = [v.get("total", line) for v in books.values() if v.get("total")]
        if totals:
            line = round(sum(totals) / len(totals), 1)

    move         = game.get("line_movement", 0) or 0
    total_range  = game.get("total_range", [line, line])
    spread       = total_range[1] - total_range[0] if len(total_range) == 2 else 1.0
    move_signal  = move * 0.04
    spread_signal= -spread * 0.01
    prob_over    = max(0.40, min(0.70, 0.50 + move_signal + spread_signal))
    prob_under   = 1 - prob_over
    implied      = 110 / 210
    edge_over    = prob_over  - implied
    edge_under   = prob_under - implied
    ev_over      = (prob_over  * 0.909) - (1 - prob_over)
    ev_under     = (prob_under * 0.909) - (1 - prob_under)

    if prob_over >= 0.57 and ev_over > 0:
        play, play_prob, edge, ev = "OVER", prob_over, edge_over, ev_over
    elif prob_under >= 0.57 and ev_under > 0:
        play, play_prob, edge, ev = "UNDER", prob_under, edge_under, ev_under
    else:
        play, play_prob, edge, ev = "PASS", max(prob_over, prob_under), max(edge_over, edge_under), max(ev_over, ev_under)

    conf = "HIGH" if play_prob >= 0.65 else "MEDIUM" if play_prob >= 0.57 else "LOW"

    kelly_stake = None
    if play != "PASS" and ev > 0:
        b = 0.909
        q = 1 - play_prob
        full_kelly = (b * play_prob - q) / b
        kelly_stake = round(max(0, full_kelly * 0.25) * 1000, 2)

    mc_mean = line + (move * 0.5)
    mc_std  = 12.0

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
        "graded":           False,
        "correct":          None,
        "actual_total":     None,
        "result_note":      "",
    }


def _save_daily_predictions(predictions: list[dict]):
    """Persist today's predictions to data/predictions/predictions_YYYYMMDD.json."""
    date_str  = datetime.today().strftime("%Y-%m-%d")
    pred_file = PRED_DIR / f"predictions_{date_str.replace('-','')}.json"

    # If file already exists, preserve graded entries and only add new games
    existing = {}
    if pred_file.exists():
        try:
            old_data = json.loads(pred_file.read_text())
            old_preds = old_data if isinstance(old_data, list) else old_data.get("predictions", [])
            existing = {p["game_id"]: p for p in old_preds}
        except Exception:
            pass

    merged = []
    for p in predictions:
        gid = p["game_id"]
        if gid in existing and existing[gid].get("graded"):
            merged.append(existing[gid])   # keep graded version
        else:
            merged.append(p)

    payload = {
        "date":         date_str,
        "generated_at": datetime.utcnow().isoformat(),
        "predictions":  merged,
    }
    pred_file.write_text(json.dumps(payload, indent=2, default=str))
    log.info(f"[Pipeline] Saved {len(merged)} predictions → {pred_file.name}")


def run(retrain: bool = False):
    log.info("=" * 55)
    log.info("  BASKETBALL-AI DAILY PIPELINE  v2")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 55)

    # ── 1. Database ──────────────────────────────────────────────────────────
    log.info("\n[1] Setting up database...")
    from db.database import init_db, save_odds_snapshots, save_game_results, get_training_data
    init_db()

    # ── 2. Fetch today's games (Odds API) ────────────────────────────────────
    log.info("\n[2] Fetching games from all leagues...")
    from collectors.odds_collector import get_all_games, get_all_scores, LineMovementTracker
    games = get_all_games()
    if games:
        save_odds_snapshots(games)
        tracker = LineMovementTracker()
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

    # ── 3. Fetch completed scores — Odds API + free sources ──────────────────
    log.info("\n[3] Fetching completed scores (Odds API + ESPN + Ball Don't Lie)...")
    scores = get_all_scores(days_from=2)

    # Free source scores (ESPN + Ball Don't Lie)
    try:
        from collectors.free_collectors import get_free_scores
        for days_ago in range(0, 3):
            date_str = (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            free = get_free_scores(date_str=date_str)
            scores.extend(free)
        # Deduplicate by game_id
        seen = set()
        scores = [s for s in scores if not (s["game_id"] in seen or seen.add(s["game_id"]))]
        log.info(f"   {len(scores)} total completed games (including free sources)")
    except Exception as e:
        log.warning(f"   Free collectors failed (using Odds API scores only): {e}")

    if scores:
        save_game_results(scores)
        log.info(f"   {len(scores)} game results stored in DB")

    # ── 3.5 Grade previous predictions ──────────────────────────────────────
    log.info("\n[3.5] Grading previous predictions...")
    try:
        from grader import grade_predictions
        n_graded = grade_predictions(scores, lookback_days=3)
        log.info(f"   {n_graded} predictions graded")
    except Exception as e:
        log.warning(f"   Grading failed: {e}")

    # ── 4. NBA team stats ────────────────────────────────────────────────────
    log.info("\n[4] Fetching NBA team stats...")
    team_stats = {}
    try:
        from collectors.nba_collector import build_team_stats_lookup
        team_stats = build_team_stats_lookup(season="2024-25")
        log.info(f"   {len(team_stats)} NBA teams loaded")
    except Exception as e:
        log.warning(f"   NBA stats skipped: {e}")

    # Ball Don't Lie team averages as supplement
    try:
        from collectors.free_collectors import get_bdl_team_stats
        bdl_stats = get_bdl_team_stats()
        for name, s in bdl_stats.items():
            if name not in team_stats:
                team_stats[name] = s
        log.info(f"   BDL team stats loaded ({len(bdl_stats)} teams)")
    except Exception as e:
        log.warning(f"   BDL team stats skipped: {e}")

    # ── 5. Load model ────────────────────────────────────────────────────────
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

    # ── 6. Generate predictions ──────────────────────────────────────────────
    log.info("\n[6] Generating predictions...")
    predictions_data = []
    for game in games:
        try:
            pred = make_simple_prediction(game)
            predictions_data.append(pred)
        except Exception as e:
            log.warning(f"   Prediction failed for {game.get('matchup','?')}: {e}")

    predictions_data.sort(key=lambda p: (
        p["play"] == "PASS",
        {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(p["confidence"], 2),
        -p["play_probability"],
    ))
    log.info(f"   {len(predictions_data)} predictions generated")
    bets = [p for p in predictions_data if p["play"] != "PASS"]
    log.info(f"   {len(bets)} actionable bets")

    # ── 7. Save daily prediction file ────────────────────────────────────────
    log.info("\n[7] Saving daily predictions file...")
    _save_daily_predictions(predictions_data)

    # ── 8. Write Vercel JSON files ────────────────────────────────────────────
    log.info("\n[8] Writing files for Vercel...")
    STATIC_OUT.parent.mkdir(parents=True, exist_ok=True)

    STATIC_OUT.write_text(json.dumps({
        "generated_at": datetime.utcnow().isoformat(),
        "date":         datetime.today().strftime("%Y-%m-%d"),
        "predictions":  predictions_data,
    }, indent=2, default=str))

    # Build history from graded prediction files
    try:
        from grader import build_history_json
        history = build_history_json(days=30)
    except Exception as e:
        log.warning(f"   History build failed: {e} — writing empty history")
        history = []
    HISTORY_OUT.write_text(json.dumps(history, indent=2, default=str))

    # Model metadata
    meta = {}
    if MODEL_PATH.exists():
        try:
            from training.model import load_metadata
            meta = load_metadata()
        except Exception:
            pass
    META_OUT.write_text(json.dumps(meta, indent=2, default=str))

    log.info(f"   predictions.json  ({len(predictions_data)} games)")
    log.info(f"   history.json      ({len(history)} days)")
    log.info(f"   model_meta.json")
    log.info("\n[DONE] GitHub Actions will commit these. Vercel will update.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrain", action="store_true")
    args = parser.parse_args()
    run(retrain=args.retrain)
