"""
Daily Pipeline — the only file you need to run.
GitHub Actions runs this automatically every day.
It collects data, generates predictions, and saves them
as JSON files that your Vercel website reads.

You can also run it manually on your computer:
    cd backend
    python pipeline.py
"""

import json, logging, sys, os, argparse
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


def run(retrain: bool = False):
    log.info("=" * 55)
    log.info("  BASKETBALL-AI DAILY PIPELINE")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 55)

    # 1. Database
    log.info("\n[1] Setting up database...")
    from db.database import init_db, save_odds_snapshots, save_game_results, get_training_data
    init_db()

    # 2. Fetch games from ALL leagues (NBA, WNBA, EuroLeague, NCAA, NBL, CBA)
    log.info("\n[2] Fetching games from all leagues...")
    from collectors.odds_collector import get_all_games, get_all_scores, LineMovementTracker
    games = get_all_games()
    if games:
        save_odds_snapshots(games)
        LineMovementTracker().snapshot(games)
        by_league = {}
        for g in games:
            by_league.setdefault(g["league_name"], 0)
            by_league[g["league_name"]] += 1
        for league, count in by_league.items():
            log.info(f"   {league}: {count} games")
    else:
        log.warning("   No games today across any league")

    # 3. Fetch completed scores (to evaluate yesterday's predictions)
    log.info("\n[3] Fetching completed scores...")
    scores = get_all_scores(days_from=2)
    if scores:
        save_game_results(scores)
        log.info(f"   {len(scores)} completed games stored")

    # 4. Fetch NBA team stats (used as features for NBA games)
    log.info("\n[4] Fetching NBA team stats...")
    team_stats, team_logs = {}, {}
    try:
        from collectors.nba_collector import build_team_stats_lookup, get_all_teams, get_team_game_logs
        import pandas as pd
        team_stats = build_team_stats_lookup(season="2024-25")
        all_teams_df = get_all_teams()
        id_map = {t["full_name"]: t["id"] for t in all_teams_df.to_dict("records")}
        nba_teams = {g["home_team"] for g in games if g["league"] == "basketball_nba"} | \
                    {g["away_team"] for g in games if g["league"] == "basketball_nba"}
        for name in nba_teams:
            tid = id_map.get(name)
            if tid:
                team_logs[name] = get_team_game_logs(team_id=tid, last_n=10)
        log.info(f"   {len(team_stats)} teams with stats")
    except Exception as e:
        log.warning(f"   NBA stats skipped: {e}")

    # 5. Train model or load existing
    log.info("\n[5] Model...")
    from training.model import train, load_model, load_metadata
    pipeline = None
    needs_train = retrain or not MODEL_PATH.exists()
    if needs_train:
        try:
            hist_df = get_training_data()
            if len(hist_df) >= 50:
                from training.features import TARGET_COL
                hist_df[TARGET_COL]         = (hist_df["actual_total"] > hist_df["line"]).astype(int)
                hist_df["consensus_total"]   = hist_df["line"]
                hist_df["line_movement"]     = hist_df.get("line_movement", 0)
                hist_df["abs_line_movement"] = hist_df["line_movement"].abs()
                hist_df["line_spread"]       = hist_df.get("line_spread", 1.0)
                hist_df["move_direction"]    = hist_df["line_movement"].apply(
                    lambda x: 1 if x > 0.5 else (-1 if x < -0.5 else 0))
                pipeline, metrics = train(hist_df, calibrate=True, save=True)
                log.info(f"   Model trained — AUC: {metrics['cv_roc_auc_mean']:.4f}")
            else:
                log.warning(f"   Only {len(hist_df)} games stored. Need 50+ to train.")
                log.warning("   Keep running daily — model trains automatically when ready.")
        except Exception as e:
            log.error(f"   Training failed: {e}")
    else:
        try:
            pipeline = load_model()
            log.info(f"   Model loaded OK")
        except Exception as e:
            log.error(f"   Model load failed: {e}")

    # 6. Generate predictions
    log.info("\n[6] Generating predictions...")
    predictions_data = []
    if pipeline and games and team_stats:
        try:
            from predictions.predict import predict_games, format_predictions_report
            preds = predict_games(games, team_stats, team_logs)
            print(format_predictions_report(preds))
            for p in preds:
                predictions_data.append({
                    "game_id":          p.get("game_id", ""),
                    "league":           p.get("league", "NBA"),
                    "league_name":      p.get("league_name", "NBA"),
                    "matchup":          p.get("matchup", ""),
                    "home_team":        p.get("home_team", ""),
                    "away_team":        p.get("away_team", ""),
                    "commence_time":    str(p.get("commence_time", "")),
                    "line":             p.get("line"),
                    "prob_over":        round(float(p.get("prob_over", 0.5)), 4),
                    "prob_under":       round(float(p.get("prob_under", 0.5)), 4),
                    "play":             p.get("play", "PASS"),
                    "play_probability": round(float(p.get("play_probability", 0.5)), 4),
                    "edge":             round(float(p.get("edge", 0)), 4),
                    "ev_per_dollar":    round(float(p.get("ev_per_dollar", 0)), 4),
                    "confidence":       p.get("confidence", "LOW"),
                    "kelly_stake":      p.get("kelly_stake"),
                    "line_movement":    p.get("_features", {}).get("line_movement"),
                    "predicted_at":     str(p.get("predicted_at", datetime.utcnow().isoformat())),
                })
        except Exception as e:
            log.error(f"   Predictions failed: {e}")
    elif not pipeline:
        log.warning("   No model yet — showing demo data on frontend until 50+ games collected")
    elif not games:
        log.warning("   No games today")

    # 7. Write the three JSON files Vercel reads
    log.info("\n[7] Writing files for Vercel...")
    STATIC_OUT.parent.mkdir(parents=True, exist_ok=True)

    STATIC_OUT.write_text(json.dumps({
        "generated_at": datetime.utcnow().isoformat(),
        "date":         datetime.today().strftime("%Y-%m-%d"),
        "predictions":  predictions_data,
    }, indent=2, default=str))

    HISTORY_OUT.write_text(json.dumps(_build_history(), indent=2, default=str))

    meta = load_metadata() if MODEL_PATH.exists() else {}
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
                preds = json.load(f)
            bets = [p for p in preds if p.get("play") != "PASS"]
            wins = [p for p in bets if p.get("correct") is True]
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
    parser.add_argument("--retrain", action="store_true", help="Force model retraining")
    args = parser.parse_args()
    run(retrain=args.retrain)
