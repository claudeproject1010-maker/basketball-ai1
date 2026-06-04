"""
Basketball-AI Daily Pipeline — Multi-Source Edition
Combines The Odds API + BallDontLie + RapidAPI for maximum daily coverage.

GitHub Actions runs this automatically every day at 9 AM and 2 PM ET.
You can also trigger it manually from the Actions tab.
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

REPO_ROOT  = Path(__file__).parent.parent
STATIC_OUT = REPO_ROOT / "frontend" / "public" / "predictions.json"
HISTORY_OUT= REPO_ROOT / "frontend" / "public" / "history.json"
META_OUT   = REPO_ROOT / "frontend" / "public" / "model_meta.json"
MODEL_PATH = Path(__file__).parent / "models" / "xgb_totals.joblib"

# Typical scoring averages by league — used when no bookmaker line exists
LEAGUE_BASELINES = {
    "basketball_nba":               {"mean":224.0, "std":12.0},
    "basketball_wnba":              {"mean":168.0, "std":11.0},
    "basketball_ncaab":             {"mean":148.0, "std":13.0},
    "basketball_ncaaw":             {"mean":130.0, "std":12.0},
    "basketball_nba_summer_league": {"mean":215.0, "std":13.0},
    "basketball_euroleague":        {"mean":162.0, "std":11.0},
    "basketball_eurocup":           {"mean":158.0, "std":11.0},
    "ACB":                          {"mean":162.0, "std":11.0},
    "Lega":                         {"mean":158.0, "std":11.0},
    "ProA":                         {"mean":156.0, "std":11.0},
    "BBL":                          {"mean":160.0, "std":11.0},
    "BSL":                          {"mean":158.0, "std":12.0},
    "LKL":                          {"mean":154.0, "std":11.0},
    "HEBA":                         {"mean":155.0, "std":11.0},
    "NBL":                          {"mean":170.0, "std":12.0},
    "CBA":                          {"mean":198.0, "std":13.0},
}
DEFAULT_BASELINE = {"mean":165.0, "std":12.0}


def make_prediction(game: dict) -> dict:
    """
    Generate a prediction for any game regardless of whether it has a line.

    For games WITH a bookmaker line: use line + movement signal.
    For games WITHOUT a line: use league historical baseline.
    """
    league   = game.get("league","")
    has_line = game.get("has_line", False)
    baseline = LEAGUE_BASELINES.get(league, DEFAULT_BASELINE)

    if has_line and game.get("consensus_total"):
        line = float(game["consensus_total"])
        move = game.get("line_movement", 0) or 0

        # Line movement signal: sharp money shows intent
        move_signal  = move * 0.04
        # Book spread: tight = sharp market, wide = softer
        total_range  = game.get("total_range",[line,line])
        spread = (total_range[1]-total_range[0]) if total_range[0] and total_range[1] else 1.0
        spread_signal = -spread * 0.01

        prob_over = max(0.42, min(0.68, 0.50 + move_signal + spread_signal))
        mc_mean   = line + (move * 0.5)
        mc_std    = baseline["std"]
        model_type = "market+statistical"

    else:
        # No line — use pure statistical baseline
        line      = baseline["mean"]
        move      = 0
        prob_over = 0.50   # no signal without a line — fair coin
        mc_mean   = baseline["mean"]
        mc_std    = baseline["std"]
        model_type = "statistical_baseline"

    prob_under = 1 - prob_over

    # EV at -110 juice
    implied   = 110 / 210        # 52.38%
    ev_over   = (prob_over  * 0.909) - (1 - prob_over)
    ev_under  = (prob_under * 0.909) - (1 - prob_under)
    edge_over  = prob_over  - implied
    edge_under = prob_under - implied

    if prob_over >= 0.54 and ev_over > 0:
        play, play_prob, edge, ev = "OVER", prob_over, edge_over, ev_over
    elif prob_under >= 0.54 and ev_under > 0:
        play, play_prob, edge, ev = "UNDER", prob_under, edge_under, ev_under
    else:
        play, play_prob, edge, ev = "PASS", max(prob_over, prob_under), max(edge_over, edge_under), max(ev_over, ev_under)

    # Games without a real line always PASS — we can't size a bet without one
    if not has_line:
        play = "PASS"
        play_prob = prob_over
        edge = 0
        ev   = 0

    conf = "HIGH" if play_prob >= 0.63 else "MEDIUM" if play_prob >= 0.56 else "LOW"
    kelly_stake = None
    if play != "PASS" and ev > 0:
        b = 0.909
        q = 1 - play_prob
        full_kelly = max(0, (b * play_prob - q) / b)
        kelly_stake = round(full_kelly * 0.25 * 1000, 2)

    return {
        "game_id":          game.get("game_id",""),
        "league":           league,
        "league_name":      game.get("league_name",""),
        "matchup":          game.get("matchup",""),
        "home_team":        game.get("home_team",""),
        "away_team":        game.get("away_team",""),
        "commence_time":    str(game.get("commence_time","")),
        "line":             round(line, 1),
        "has_line":         has_line,
        "source":           game.get("source","odds_api"),
        "model_type":       model_type,
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
    }


def run(retrain: bool = False):
    log.info("=" * 55)
    log.info("  BASKETBALL-AI DAILY PIPELINE")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 55)

    from db.database import init_db, save_odds_snapshots, save_game_results, get_training_data
    init_db()

    # Fetch all games from all sources
    log.info("\n[1] Fetching games from all sources...")
    from collectors.odds_collector import get_all_games, get_all_scores, LineMovementTracker
    games = get_all_games()

    # Snapshot lines for movement tracking
    tracker = LineMovementTracker()
    tracker.snapshot(games)
    for g in games:
        g["line_movement"] = tracker.get_movement(g["game_id"])

    # Save to DB
    games_with_lines = [g for g in games if g.get("has_line")]
    if games_with_lines:
        save_odds_snapshots(games_with_lines)

    # Fetch completed scores
    log.info("\n[2] Fetching completed scores...")
    scores = get_all_scores(days_from=2)
    if scores:
        save_game_results(scores)
        log.info(f"   {len(scores)} completed games stored")

    # NBA stats
    log.info("\n[3] NBA team stats...")
    try:
        from collectors.nba_collector import build_team_stats_lookup
        team_stats = build_team_stats_lookup(season="2024-25")
        log.info(f"   {len(team_stats)} teams")
    except Exception as e:
        log.warning(f"   NBA stats skipped: {e}")

    # Generate predictions for ALL games
    log.info("\n[4] Generating predictions...")
    predictions = []
    for game in games:
        try:
            pred = make_prediction(game)
            predictions.append(pred)
        except Exception as e:
            log.warning(f"   Failed {game.get('matchup','?')}: {e}")

    # Sort: actionable first, then by confidence
    predictions.sort(key=lambda p:(
        p["play"]=="PASS",
        not p.get("has_line",False),
        {"HIGH":0,"MEDIUM":1,"LOW":2}.get(p["confidence"],2)
    ))

    with_lines    = [p for p in predictions if p.get("has_line")]
    without_lines = [p for p in predictions if not p.get("has_line")]
    actionable    = [p for p in predictions if p["play"]!="PASS"]

    log.info(f"   {len(predictions)} total predictions")
    log.info(f"   {len(with_lines)} with bookmaker lines (actionable possible)")
    log.info(f"   {len(without_lines)} schedule-only (monitoring, no bet signal)")
    log.info(f"   {len(actionable)} actionable bets")

    # Write static JSON for Vercel
    log.info("\n[5] Writing files for Vercel...")
    STATIC_OUT.parent.mkdir(parents=True, exist_ok=True)

    STATIC_OUT.write_text(json.dumps({
        "generated_at":  datetime.utcnow().isoformat(),
        "date":          datetime.today().strftime("%Y-%m-%d"),
        "total_games":   len(predictions),
        "with_lines":    len(with_lines),
        "actionable":    len(actionable),
        "predictions":   predictions,
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

    log.info(f"   predictions.json ({len(predictions)} games)")
    log.info("\n[DONE] GitHub will commit. Vercel will update.\n")


def _build_history(days: int = 14) -> list[dict]:
    history = []
    pred_dir = Path("data/predictions")
    for i in range(days,0,-1):
        date_obj = datetime.today() - timedelta(days=i)
        pred_file = pred_dir / f"predictions_{date_obj.strftime('%Y%m%d')}.json"
        if not pred_file.exists(): continue
        try:
            with open(pred_file) as f:
                data = json.load(f)
            preds    = data if isinstance(data,list) else data.get("predictions",[])
            bets     = [p for p in preds if p.get("play")!="PASS"]
            wins     = [p for p in bets  if p.get("correct") is True]
            if not bets: continue
            evaluated= [p for p in bets  if p.get("correct") is not None]
            pnl      = sum(0.909 if p["correct"] else -1.0 for p in evaluated)
            history.append({
                "date":     date_obj.strftime("%b %d"),
                "bets":     len(bets),
                "wins":     len(wins),
                "losses":   len(bets)-len(wins),
                "win_rate": round(len(wins)/len(bets),3),
                "pnl":      round(pnl,2),
            })
        except Exception:
            continue
    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrain", action="store_true")
    args = parser.parse_args()
    run(retrain=args.retrain)
