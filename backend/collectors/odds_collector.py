"""
Multi-League Basketball Odds Collector
Expanded league list for 20-30+ daily predictions.
"""

import os, json, logging, requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

API_KEY  = os.getenv("ODDS_API_KEY", "")
BASE_URL = "https://api.the-odds-api.com/v4"
BOOKMAKERS = ["fanduel","draftkings","betmgm","bovada","pointsbread","mybookieag","betonlineag"]

# Expanded league list — covers year-round basketball globally
LEAGUES = [
    # USA
    "basketball_nba",
    "basketball_wnba",
    "basketball_ncaab",
    "basketball_ncaaw",
    "basketball_nba_summer_league",
    # Europe
    "basketball_euroleague",
    "basketball_eurocup",
    "basketball_greece_basket_league",
    "basketball_spain_acb",
    "basketball_italy_lega",
    "basketball_france_pro_a",
    "basketball_germany_bbl",
    "basketball_turkey_bsl",
    "basketball_lithuania_lkl",
    # International
    "basketball_nbl",          # Australia
    "basketball_cba",          # China
    "basketball_fiba",         # FIBA World Cup / qualifiers
]

LEAGUE_NAMES = {
    "basketball_nba":                "NBA",
    "basketball_wnba":               "WNBA",
    "basketball_ncaab":              "NCAA Men",
    "basketball_ncaaw":              "NCAA Women",
    "basketball_nba_summer_league":  "NBA Summer",
    "basketball_euroleague":         "EuroLeague",
    "basketball_eurocup":            "EuroCup",
    "basketball_greece_basket_league":"Greece Basket",
    "basketball_spain_acb":          "Spain ACB",
    "basketball_italy_lega":         "Italy Lega",
    "basketball_france_pro_a":       "France Pro A",
    "basketball_germany_bbl":        "Germany BBL",
    "basketball_turkey_bsl":         "Turkey BSL",
    "basketball_lithuania_lkl":      "Lithuania LKL",
    "basketball_nbl":                "NBL Australia",
    "basketball_cba":                "CBA China",
    "basketball_fiba":               "FIBA",
}

CACHE_DIR = Path(__file__).parent.parent / "data" / "odds_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_available_leagues() -> list[str]:
    """Ask the API which leagues actually have games today."""
    try:
        resp = requests.get(f"{BASE_URL}/sports", params={"apiKey": API_KEY}, timeout=10)
        resp.raise_for_status()
        active = [s["key"] for s in resp.json() if s.get("active") and "basketball" in s["key"]]
        log.info(f"Active basketball leagues today: {len(active)}")
        return active
    except Exception as e:
        log.warning(f"Could not fetch active leagues: {e} — using default list")
        return LEAGUES


def fetch_league_games(league: str) -> list[dict]:
    params = {
        "apiKey": API_KEY, "regions": "us,uk,eu,au",
        "markets": "totals", "oddsFormat": "american",
        "bookmakers": ",".join(BOOKMAKERS),
    }
    try:
        resp = requests.get(f"{BASE_URL}/sports/{league}/odds", params=params, timeout=10)
        resp.raise_for_status()
        remaining = resp.headers.get("x-requests-remaining", "?")
        data = resp.json()
        log.info(f"  [{LEAGUE_NAMES.get(league,league)}] {len(data)} games · {remaining} calls left")
        return data
    except requests.HTTPError as e:
        code = e.response.status_code if e.response else "?"
        if code in (404, 422):
            log.info(f"  [{league}] no games today ({code})")
        else:
            log.warning(f"  [{league}] HTTP {code}")
        return []
    except Exception as e:
        log.warning(f"  [{league}] failed: {e}")
        return []


def parse_game(raw: dict, league: str) -> dict | None:
    lines = {}
    for bm in raw.get("bookmakers", []):
        for market in bm.get("markets", []):
            if market["key"] != "totals":
                continue
            over  = next((o for o in market["outcomes"] if o["name"]=="Over"),  None)
            under = next((o for o in market["outcomes"] if o["name"]=="Under"), None)
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
        "consensus_total": round(sum(totals)/len(totals), 1),
        "total_range":     [min(totals), max(totals)],
        "books":           lines,
        "fetched_at":      datetime.utcnow().isoformat(),
    }


def get_all_games(use_cache: bool = False) -> list[dict]:
    cache_file = CACHE_DIR / f"all_games_{datetime.today().strftime('%Y%m%d')}.json"
    if use_cache and cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)

    # First find which leagues are actually active today (saves API calls)
    active_leagues = fetch_available_leagues()
    leagues_to_try = [l for l in LEAGUES if l in active_leagues] or LEAGUES

    all_games = []
    for league in leagues_to_try:
        for raw in fetch_league_games(league):
            parsed = parse_game(raw, league)
            if parsed:
                all_games.append(parsed)

    all_games.sort(key=lambda g: g["commence_time"])
    with open(cache_file, "w") as f:
        json.dump(all_games, f, indent=2)
    log.info(f"Total games today: {len(all_games)}")
    return all_games


def get_scores(league: str, days_from: int = 1) -> list[dict]:
    try:
        resp = requests.get(f"{BASE_URL}/sports/{league}/scores",
                            params={"apiKey": API_KEY, "daysFrom": days_from}, timeout=10)
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
                        "game_id": game["id"], "league": league,
                        "home_team": home, "away_team": away,
                        "home_score": int(scores[home]), "away_score": int(scores[away]),
                        "actual_total": int(scores[home])+int(scores[away]),
                        "commence_time": game["commence_time"],
                    })
                except (ValueError, TypeError):
                    pass
        return results
    except Exception as e:
        log.warning(f"Scores failed for {league}: {e}")
        return []


def get_all_scores(days_from: int = 1) -> list[dict]:
    all_scores = []
    for league in LEAGUES:
        all_scores.extend(get_scores(league, days_from))
    return all_scores


class LineMovementTracker:
    HISTORY_FILE = CACHE_DIR / "line_history.json"
    def __init__(self):
        self.history = json.load(open(self.HISTORY_FILE)) if self.HISTORY_FILE.exists() else {}
    def _save(self):
        with open(self.HISTORY_FILE,"w") as f: json.dump(self.history,f,indent=2)
    def snapshot(self, games):
        ts = datetime.utcnow().isoformat()
        for g in games:
            gid = g["game_id"]
            if gid not in self.history:
                self.history[gid] = {"matchup":g["matchup"],"league":g.get("league_name",""),"snapshots":[]}
            self.history[gid]["snapshots"].append({"ts":ts,"total":g["consensus_total"]})
        self._save()
    def get_movement(self, game_id):
        if game_id not in self.history: return None
        snaps = self.history[game_id]["snapshots"]
        if len(snaps) < 2: return None
        move = round(snaps[-1]["total"] - snaps[0]["total"], 1)
        return {"game_id":game_id,"matchup":self.history[game_id]["matchup"],
                "opening_total":snaps[0]["total"],"current_total":snaps[-1]["total"],
                "movement":move,"direction":"UP" if move>0 else "DOWN" if move<0 else "FLAT"}
    def get_all_movements(self):
        return [m for gid in self.history if (m:=self.get_movement(gid))]
