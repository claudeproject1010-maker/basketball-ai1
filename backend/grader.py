"""
Prediction Grader
=================
Runs after scores are fetched. For every completed game that has a stored
prediction, it:
  1. Checks whether the actual total went OVER or UNDER the line.
  2. Marks the prediction correct / incorrect.
  3. Updates the daily prediction JSON files in data/predictions/.
  4. Rebuilds history.json for the frontend.

Called at the end of pipeline.py (step 3.5, after save_game_results).

Usage:
    from grader import grade_predictions, build_history_json
    grade_predictions(scores)        # scores = list of result dicts
    history = build_history_json()   # returns list of daily summary dicts
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger(__name__)

PRED_DIR  = Path(__file__).parent.parent / "data" / "predictions"
PRED_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalise_name(name: str) -> str:
    """Lower-case, strip punctuation — for fuzzy team matching."""
    return name.lower().replace(".", "").replace("-", " ").strip()


def _teams_match(result_team: str, pred_team: str) -> bool:
    """True if two team name strings refer to the same team."""
    a, b = _normalise_name(result_team), _normalise_name(pred_team)
    return a == b or a in b or b in a


def _find_pred_file(date_str: str) -> Path:
    return PRED_DIR / f"predictions_{date_str}.json"


def _load_pred_file(date_str: str) -> list[dict]:
    f = _find_pred_file(date_str)
    if not f.exists():
        return []
    try:
        data = json.loads(f.read_text())
        return data if isinstance(data, list) else data.get("predictions", [])
    except Exception as e:
        log.warning(f"[Grader] Could not read {f}: {e}")
        return []


def _save_pred_file(date_str: str, preds: list[dict]):
    f = _find_pred_file(date_str)
    # Preserve wrapper if it exists
    existing_raw = {}
    if f.exists():
        try:
            existing_raw = json.loads(f.read_text())
        except Exception:
            pass

    if isinstance(existing_raw, dict) and "predictions" in existing_raw:
        existing_raw["predictions"] = preds
        existing_raw["graded_at"]   = datetime.utcnow().isoformat()
        payload = existing_raw
    else:
        payload = preds

    f.write_text(json.dumps(payload, indent=2, default=str))


# ─────────────────────────────────────────────────────────────────────────────
# Core grading logic
# ─────────────────────────────────────────────────────────────────────────────

def _grade_single(pred: dict, actual_total: int) -> dict:
    """
    Add grading fields to a prediction dict.
    over_hit : True if actual > line, False if actual < line, None if push
    correct  : True / False / None (push or PASS)
    result_note: human-readable explanation
    """
    pred = dict(pred)           # don't mutate caller's dict
    line = pred.get("line", 0)
    play = pred.get("play", "PASS")

    if actual_total == line:    # push — no result
        pred["actual_total"] = actual_total
        pred["over_hit"]     = None
        pred["correct"]      = None
        pred["result_note"]  = f"Push — actual {actual_total} = line {line}"
        pred["graded"]       = True
        return pred

    over_hit = actual_total > line
    pred["actual_total"] = actual_total
    pred["over_hit"]     = over_hit

    if play == "PASS":
        pred["correct"]     = None
        pred["result_note"] = f"No bet · actual {actual_total} vs line {line}"
    elif play == "OVER":
        pred["correct"]     = over_hit
        pred["result_note"] = (
            f"{'✓ WIN' if over_hit else '✗ LOSS'} · "
            f"actual {actual_total} {'>' if over_hit else '<'} line {line}"
        )
    elif play == "UNDER":
        pred["correct"]     = not over_hit
        pred["result_note"] = (
            f"{'✓ WIN' if not over_hit else '✗ LOSS'} · "
            f"actual {actual_total} {'<' if not over_hit else '>'} line {line}"
        )
    else:
        pred["correct"]     = None
        pred["result_note"] = f"Unknown play type: {play}"

    pred["graded"] = True
    return pred


def grade_predictions(results: list[dict], lookback_days: int = 3) -> int:
    """
    Match completed game results to stored daily prediction files and grade them.

    Args:
        results       : list of result dicts (from get_all_scores / get_free_scores)
        lookback_days : how many past prediction files to scan (default 3)

    Returns:
        Number of predictions graded this run.
    """
    if not results:
        log.info("[Grader] No results to grade.")
        return 0

    # Build a lookup: {game_id: actual_total} plus a fallback name-based lookup
    by_id   = {r["game_id"]: r for r in results}
    by_name = {}   # {(norm_home, norm_away): result}
    for r in results:
        key = (_normalise_name(r["home_team"]), _normalise_name(r["away_team"]))
        by_name[key] = r

    total_graded = 0

    for days_ago in range(0, lookback_days + 1):
        date = (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        preds = _load_pred_file(date)
        if not preds:
            continue

        changed = False
        for i, pred in enumerate(preds):
            # Skip already graded
            if pred.get("graded"):
                continue

            # Try game_id match first
            result = by_id.get(pred.get("game_id"))

            # Fallback: fuzzy team name match
            if not result:
                home = _normalise_name(pred.get("home_team", ""))
                away = _normalise_name(pred.get("away_team", ""))
                # Try exact key
                result = by_name.get((home, away))
                if not result:
                    # Try any result where both teams match loosely
                    for (rh, ra), r in by_name.items():
                        if (home and home in rh) and (away and away in ra):
                            result = r
                            break

            if not result:
                continue    # Game not completed yet

            actual = result.get("actual_total")
            if actual is None:
                continue

            preds[i] = _grade_single(pred, actual)
            total_graded += 1
            changed = True

            play = preds[i].get("play", "PASS")
            correct = preds[i].get("correct")
            note = preds[i].get("result_note", "")
            log.info(f"[Grader] {pred.get('matchup','?')} · {play} {pred.get('line')} · {note}")

        if changed:
            _save_pred_file(date, preds)
            log.info(f"[Grader] Saved graded predictions for {date}")

    log.info(f"[Grader] Total graded this run: {total_graded}")
    return total_graded


# ─────────────────────────────────────────────────────────────────────────────
# History builder (replaces _build_history in pipeline.py)
# ─────────────────────────────────────────────────────────────────────────────

def build_history_json(days: int = 30) -> list[dict]:
    """
    Scan the last `days` prediction files and build a daily summary list
    suitable for history.json on the frontend.

    Each entry:
    {
        "date":        "Jun 3",
        "date_full":   "2026-06-03",
        "bets":        5,
        "wins":        3,
        "losses":      2,
        "pushes":      0,
        "win_rate":    0.6,
        "pnl":         0.73,        # units at -110 juice
        "games":       [...]        # per-game detail for history tab
    }
    """
    history = []

    for i in range(days, -1, -1):
        date_obj  = datetime.now(timezone.utc) - timedelta(days=i)
        date_str  = date_obj.strftime("%Y-%m-%d")
        preds     = _load_pred_file(date_str)

        if not preds:
            continue

        bets     = [p for p in preds if p.get("play") not in ("PASS", None)]
        graded   = [p for p in bets  if p.get("graded")]
        wins     = [p for p in graded if p.get("correct") is True]
        losses   = [p for p in graded if p.get("correct") is False]
        pushes   = [p for p in graded if p.get("correct") is None]

        if not bets:
            continue

        # P&L: +0.909 per win, -1.0 per loss at standard -110 juice
        pnl = sum(0.909 for _ in wins) + sum(-1.0 for _ in losses)

        win_rate = len(wins) / len(graded) if graded else None

        history.append({
            "date":      date_obj.strftime("%b %-d"),
            "date_full": date_str,
            "bets":      len(bets),
            "graded":    len(graded),
            "wins":      len(wins),
            "losses":    len(losses),
            "pushes":    len(pushes),
            "pending":   len(bets) - len(graded),
            "win_rate":  round(win_rate, 3) if win_rate is not None else None,
            "pnl":       round(pnl, 2),
            "games": [
                {
                    "matchup":      p.get("matchup", ""),
                    "league":       p.get("league", ""),
                    "play":         p.get("play"),
                    "line":         p.get("line"),
                    "confidence":   p.get("confidence"),
                    "play_probability": p.get("play_probability"),
                    "actual_total": p.get("actual_total"),
                    "over_hit":     p.get("over_hit"),
                    "correct":      p.get("correct"),
                    "result_note":  p.get("result_note", ""),
                    "graded":       p.get("graded", False),
                }
                for p in bets
            ],
        })

    return history
