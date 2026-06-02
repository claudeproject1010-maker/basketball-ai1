"""
Multi-League Basketball Odds Collector
Pulls over/under lines for every basketball league available on The Odds API.

FREE leagues available:
  basketball_nba          NBA (men)
  basketball_wnba         WNBA (women)
  basketball_ncaab        NCAA Men's College Basketball
  basketball_ncaaw        NCAA Women's College Basketball
  basketball_euroleague   EuroLeague (Europe's top club competition)
  basketball_nbl          NBL Australia
  basketball_cba          CBA China

This gives you 20-50+ games daily across all leagues combined.
"""

import os
import json
import logging
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

API_KEY  = os.getenv("ODDS_API_KEY", "")
BASE_URL = "https://api.the-odds-api.com/v4"

# Every free basketball league on The Odds API
LEAGUES = [
    "basketball_nba",
    "basketball_wnba",
    "basketball_ncaab",
    "basketball_ncaaw",
    "basketball_euroleague",
    "basketball_nbl",
    "basketball_cba",
]

LEAGUE_NAMES = {
    "basketball_nba":        "NBA",
    "basketball_wnba":       "WNBA",
    "basketball_ncaab":      "NCAA Men",
    "basketball_ncaaw":      "NCAA Women",
    "basketball_euroleague": "EuroLeague",
    "basketball_nbl":        "NBL Australia",
    "basketball_cba":        "CBA China",
}

BOOKMAKERS = ["fanduel", "draftkings", "betmgm", "bovada", "pointsbread"]

CACHE_DIR = Path(__file__).parent.parent / "data" / "odds_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_league_games(league: str) -> list[dict]:
    """Fetch over/under lines for one league. Returns list of parsed game dicts."""
    params = {
        "apiKey":     API_KEY,
        "regions":    "us",
        "markets":    "totals",
        "oddsFormat": "american",
        "bookmakers": ",".join(BOOKMAKERS),
    }
    try:
        resp = requests.get(f"{BASE_URL}/sports/{league}/odds", params=params, timeout=10)
        resp.raise_for_status()
        remaining = resp.headers.get("x-requests-remaining", "?")
        log.info(f"  [{LEAGUE_NAMES.get(league, league)}] fetched — {remaining} API calls remaining")
        return resp.json()
    except requests.HTTPError as e:
        if resp.status_code == 422:
            log.info(f"  [{league}] off-season or no games today")
        else:
            log.error(f"  [{league}] HTTP error: {e}")
        return []
    except Exception as e:
        log.error(f"  [{league}] failed: {e}")
        return []


def parse_game(raw: dict, league: str) -> dict | None:
    """Parse one raw game object into a clean prediction-ready dict."""
    lines = {}
    for bm in raw.get("bookmakers", []):
        for market in bm.get("markets", []):
            if market["key"] != "totals":
                continue
            over = next((o for o in market["outcomes"] if o["name"] == "Over"), None)
            under = next((o for o in market["outcomes"] if o["name"] == "Under"), None)
            if over:
                lines[bm["key"]] = {
                    "total":       over["point"],
                    "over_price":  over["price"],
                    "under_price": under["price"] if under else None,
                }

    if not lines:
        return None

    totals = [v["total"] for v in lines.values()]
    return {
        "game_id":         raw["id"],
        "league":          league,
        "league_name":     LEAGUE_NAMES.get(league, league),
        "home_team":       raw["home_team"],
        "away_team":       raw["away_team"],
        "matchup":         f"{raw['away_team']} @ {raw['home_team']}",
        "commence_time":   raw["commence_time"],
        "consensus_total": round(sum(totals) / len(totals), 1),
        "total_range":     [min(totals), max(totals)],
        "books":           lines,
        "fetched_at":      datetime.utcnow().isoformat(),
    }


def get_all_games(use_cache: bool = False) -> list[dict]:
    """
    Fetch all basketball games across every league.
    Returns a flat list sorted by commence time.
    Caches to disk for the day to save API quota.
    """
    cache_file = CACHE_DIR / f"all_games_{datetime.today().strftime('%Y%m%d')}.json"

    if use_cache and cache_file.exists():
        log.info("Using cached game data")
        with open(cache_file) as f:
            return json.load(f)

    all_games = []
    for league in LEAGUES:
        raw_games = fetch_league_games(league)
        for raw in raw_games:
            parsed = parse_game(raw, league)
            if parsed:
                all_games.append(parsed)

    # Sort by start time
    all_games.sort(key=lambda g: g["commence_time"])

    # Cache
    with open(cache_file, "w") as f:
        json.dump(all_games, f, indent=2)

    log.info(f"Total: {len(all_games)} games across {len(LEAGUES)} leagues")
    return all_games


def get_scores(league: str, days_from: int = 1) -> list[dict]:
    """Fetch completed game scores for a league (to evaluate predictions)."""
    params = {"apiKey": API_KEY, "daysFrom": days_from}
    try:
        resp = requests.get(f"{BASE_URL}/sports/{league}/scores", params=params, timeout=10)
        resp.raise_for_status()
        results = []
        for game in resp.json():
            if not game.get("completed"):
                continue
            scores = {s["name"]: s["score"] for s in (game.get("scores") or [])}
            home, away = game["home_team"], game["away_team"]
            if home in scores and away in scores:
                try:
                    results.append({
                        "game_id":       game["id"],
                        "league":        league,
                        "home_team":     home,
                        "away_team":     away,
                        "home_score":    int(scores[home]),
                        "away_score":    int(scores[away]),
                        "actual_total":  int(scores[home]) + int(scores[away]),
                        "commence_time": game["commence_time"],
                    })
                except (ValueError, TypeError):
                    pass
        return results
    except Exception as e:
        log.error(f"Scores fetch failed for {league}: {e}")
        return []


def get_all_scores(days_from: int = 1) -> list[dict]:
    """Get completed scores across all leagues."""
    all_scores = []
    for league in LEAGUES:
        all_scores.extend(get_scores(league, days_from))
    log.info(f"Completed games: {len(all_scores)} across all leagues")
    return all_scores


class LineMovementTracker:
    """Snapshots lines every time pipeline runs. Detects movement over time."""

    HISTORY_FILE = CACHE_DIR / "line_history.json"

    def __init__(self):
        self.history = self._load()

    def _load(self):
        if self.HISTORY_FILE.exists():
            with open(self.HISTORY_FILE) as f:
                return json.load(f)
        return {}

    def _save(self):
        with open(self.HISTORY_FILE, "w") as f:
            json.dump(self.history, f, indent=2)

    def snapshot(self, games: list[dict]):
        ts = datetime.utcnow().isoformat()
        for g in games:
            gid = g["game_id"]
            if gid not in self.history:
                self.history[gid] = {
                    "matchup": g["matchup"],
                    "league":  g["league_name"],
                    "snapshots": [],
                }
            self.history[gid]["snapshots"].append({
                "ts":    ts,
                "total": g["consensus_total"],
            })
        self._save()
        log.info(f"Line snapshot saved: {len(games)} games")

    def get_movement(self, game_id: str) -> dict | None:
        if game_id not in self.history:
            return None
        snaps = self.history[game_id]["snapshots"]
        if len(snaps) < 2:
            return None
        opening = snaps[0]["total"]
        current = snaps[-1]["total"]
        move    = round(current - opening, 1)
        return {
            "game_id":      game_id,
            "matchup":      self.history[game_id]["matchup"],
            "league":       self.history[game_id]["league"],
            "opening_total":opening,
            "current_total":current,
            "movement":     move,
            "direction":    "UP" if move > 0 else "DOWN" if move < 0 else "FLAT",
        }

    def get_all_movements(self) -> list[dict]:
        return [m for gid in self.history if (m := self.get_movement(gid))]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    print("\n=== MULTI-LEAGUE ODDS TEST ===\n")

    if not API_KEY:
        print("No ODDS_API_KEY found in .env file")
        print("Get your free key at: https://the-odds-api.com")
    else:
        games = get_all_games()
        print(f"\nGames found today: {len(games)}\n")
        by_league = {}
        for g in games:
            by_league.setdefault(g["league_name"], []).append(g)
        for league, gs in by_league.items():
            print(f"  {league}: {len(gs)} games")
            for g in gs[:3]:
                print(f"    {g['matchup']}  O/U {g['consensus_total']}")
