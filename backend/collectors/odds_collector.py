"""
Multi-Source Basketball Data Collector
Source 1: The Odds API — games WITH bookmaker lines (most accurate)
Source 2: BallDontLie API — NBA schedule (free, no key needed)
Source 3: API-Basketball via RapidAPI — international leagues (free tier)

Strategy: pull every game we can find, generate predictions for all of them.
Games with real lines get market-informed predictions.
Games without lines get pure statistical predictions from our model.
"""

import os, json, logging, requests
from datetime import datetime, date, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

ODDS_API_KEY     = os.getenv("ODDS_API_KEY", "")
RAPID_API_KEY    = os.getenv("RAPID_API_KEY", "")   # free at rapidapi.com
BALLDONTLIE_KEY  = os.getenv("BALLDONTLIE_KEY", "")  # free at balldontlie.io

ODDS_BASE = "https://api.the-odds-api.com/v4"
BDL_BASE  = "https://api.balldontlie.io/v1"
RAPID_BASE= "https://v1.basketball.api-sports.io"

# All basketball league keys on The Odds API free tier
ODDS_LEAGUES = [
    "basketball_nba",
    "basketball_wnba",
    "basketball_ncaab",
    "basketball_ncaaw",
    "basketball_nba_summer_league",
    "basketball_euroleague",
    "basketball_eurocup",
]

LEAGUE_NAMES = {
    "basketball_nba":               "NBA",
    "basketball_wnba":              "WNBA",
    "basketball_ncaab":             "NCAA Men",
    "basketball_ncaaw":             "NCAA Women",
    "basketball_nba_summer_league": "NBA Summer",
    "basketball_euroleague":        "EuroLeague",
    "basketball_eurocup":           "EuroCup",
    # From API-Basketball via RapidAPI
    "ACB":       "Spain ACB",
    "Lega":      "Italy Lega",
    "ProA":      "France Pro A",
    "BBL":       "Germany BBL",
    "BSL":       "Turkey BSL",
    "LKL":       "Lithuania LKL",
    "HEBA":      "Greece HEBA",
    "NBL":       "NBL Australia",
    "CBA":       "CBA China",
    "EuroLeague":"EuroLeague",
    "EuroCup":   "EuroCup",
}

# RapidAPI league IDs for api-basketball
RAPID_LEAGUES = [
    {"id":120, "name":"Spain ACB",    "key":"ACB"},
    {"id":122, "name":"Italy Lega",   "key":"Lega"},
    {"id":113, "name":"France Pro A", "key":"ProA"},
    {"id":114, "name":"Germany BBL",  "key":"BBL"},
    {"id":116, "name":"Turkey BSL",   "key":"BSL"},
    {"id":128, "name":"Lithuania LKL","key":"LKL"},
    {"id":119, "name":"Greece HEBA",  "key":"HEBA"},
    {"id":6,   "name":"NBL Australia","key":"NBL"},
    {"id":7,   "name":"CBA China",    "key":"CBA"},
]

CACHE_DIR = Path(__file__).parent.parent / "data" / "odds_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

BOOKMAKERS = ["fanduel","draftkings","betmgm","bovada","pointsbread","betonlineag","mybookieag"]


# ── Source 1: The Odds API ─────────────────────────────────────────────────

def fetch_odds_league(league: str) -> list[dict]:
    if not ODDS_API_KEY:
        return []
    try:
        resp = requests.get(f"{ODDS_BASE}/sports/{league}/odds", params={
            "apiKey": ODDS_API_KEY, "regions":"us,uk,eu,au",
            "markets":"totals", "oddsFormat":"american",
            "bookmakers":",".join(BOOKMAKERS),
        }, timeout=10)
        if resp.status_code in (404,422):
            return []
        resp.raise_for_status()
        remaining = resp.headers.get("x-requests-remaining","?")
        log.info(f"  [{LEAGUE_NAMES.get(league,league)}] {len(resp.json())} games · {remaining} calls left")
        return resp.json()
    except Exception as e:
        log.warning(f"  Odds API [{league}]: {e}")
        return []


def parse_odds_game(raw: dict, league: str) -> dict | None:
    lines = {}
    for bm in raw.get("bookmakers",[]):
        for market in bm.get("markets",[]):
            if market["key"] != "totals": continue
            over  = next((o for o in market["outcomes"] if o["name"]=="Over"), None)
            under = next((o for o in market["outcomes"] if o["name"]=="Under"),None)
            if over:
                lines[bm["key"]] = {
                    "total": over["point"],
                    "over_price": over["price"],
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
        "has_line":        True,
        "source":          "odds_api",
        "fetched_at":      datetime.utcnow().isoformat(),
    }


def get_odds_games() -> list[dict]:
    """Fetch all games with bookmaker lines from The Odds API."""
    games = []
    for league in ODDS_LEAGUES:
        for raw in fetch_odds_league(league):
            parsed = parse_odds_game(raw, league)
            if parsed:
                games.append(parsed)
    log.info(f"Odds API: {len(games)} games with lines")
    return games


# ── Source 2: BallDontLie (NBA schedule, free) ─────────────────────────────

def get_nba_schedule_today() -> list[dict]:
    """
    Pull today's and tomorrow's NBA games from BallDontLie.
    Free tier, no key needed for basic endpoints.
    Returns games in our standard format with has_line=False.
    """
    games = []
    headers = {}
    if BALLDONTLIE_KEY:
        headers["Authorization"] = BALLDONTLIE_KEY

    for offset in range(3):   # today + next 2 days
        d = (date.today() + timedelta(days=offset)).strftime("%Y-%m-%d")
        try:
            resp = requests.get(f"{BDL_BASE}/games", params={
                "dates[]": d, "per_page": 100,
            }, headers=headers, timeout=10)
            resp.raise_for_status()
            for g in resp.json().get("data", []):
                game_id = f"bdl_{g['id']}"
                home = g.get("home_team",{}).get("full_name","")
                away = g.get("visitor_team",{}).get("full_name","")
                if not home or not away:
                    continue
                games.append({
                    "game_id":       game_id,
                    "league":        "basketball_nba",
                    "league_name":   "NBA",
                    "home_team":     home,
                    "away_team":     away,
                    "matchup":       f"{away} @ {home}",
                    "commence_time": g.get("date","") + "T00:00:00Z",
                    "consensus_total": None,
                    "total_range":   [None, None],
                    "books":         {},
                    "has_line":      False,
                    "source":        "balldontlie",
                    "status":        g.get("status",""),
                })
        except Exception as e:
            log.warning(f"BallDontLie [{d}]: {e}")

    log.info(f"BallDontLie: {len(games)} NBA games")
    return games


# ── Source 3: API-Basketball via RapidAPI (free tier) ─────────────────────

def get_rapidapi_games() -> list[dict]:
    """
    Pull international league games from api-basketball on RapidAPI.
    Free tier: 100 requests/day.
    Set RAPID_API_KEY in your GitHub secrets.
    """
    if not RAPID_API_KEY:
        log.info("No RAPID_API_KEY — skipping international leagues")
        return []

    headers = {
        "x-apisports-key": RAPID_API_KEY,
        
    }
    games = []
    today = date.today().strftime("%Y-%m-%d")
    season = "2024-2025"

    for league in RAPID_LEAGUES:
        try:
            resp = requests.get(f"{RAPID_BASE}/games", headers=headers, params={
                "league": league["id"],
                "season": season,
                "date":   today,
            }, timeout=10)
            if resp.status_code == 429:
                log.warning("RapidAPI rate limit hit — stopping international fetch")
                break
            resp.raise_for_status()
            for g in resp.json().get("response", []):
                teams  = g.get("teams",{})
                home   = teams.get("home",{}).get("name","")
                away   = teams.get("away",{}).get("name","")
                scores = g.get("scores",{})
                status = g.get("status",{}).get("short","")
                if not home or not away:
                    continue
                # Try to get total if game already started
                home_pts = scores.get("home",{}).get("total")
                away_pts = scores.get("away",{}).get("total")
                actual   = (home_pts + away_pts) if home_pts and away_pts else None

                games.append({
                    "game_id":         f"rapid_{g['id']}",
                    "league":          league["key"],
                    "league_name":     league["name"],
                    "home_team":       home,
                    "away_team":       away,
                    "matchup":         f"{away} @ {home}",
                    "commence_time":   g.get("date",""),
                    "consensus_total": None,
                    "total_range":     [None, None],
                    "books":           {},
                    "has_line":        False,
                    "source":          "rapidapi",
                    "status":          status,
                    "actual_total":    actual,
                })
            if games:
                log.info(f"  [{league['name']}] {len([g for g in games if g['league']==league['key']])} games")
        except Exception as e:
            log.warning(f"  RapidAPI [{league['name']}]: {e}")

    log.info(f"RapidAPI: {len(games)} international games")
    return games


# ── Master fetcher ─────────────────────────────────────────────────────────

def get_all_games(use_cache: bool = False) -> list[dict]:
    """
    Combine all sources. Deduplicate by team names.
    Games from Odds API (has real lines) take priority over duplicates from other sources.
    """
    cache_file = CACHE_DIR / f"all_games_{datetime.today().strftime('%Y%m%d')}.json"
    if use_cache and cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)

    # 1. Games with real bookmaker lines
    odds_games = get_odds_games()

    # 2. NBA schedule (fills in NBA games the odds API might miss)
    bdl_games = get_nba_schedule_today()

    # 3. International leagues
    rapid_games = get_rapidapi_games()

    # Deduplicate: build set of (home, away) pairs already seen from odds_games
    seen = {(g["home_team"].lower(), g["away_team"].lower()) for g in odds_games}
    all_games = list(odds_games)

    for g in bdl_games + rapid_games:
        key = (g["home_team"].lower(), g["away_team"].lower())
        if key not in seen:
            seen.add(key)
            all_games.append(g)

    all_games.sort(key=lambda g: g.get("commence_time",""))

    with open(cache_file,"w") as f:
        json.dump(all_games, f, indent=2)

    by_league = {}
    for g in all_games:
        by_league.setdefault(g["league_name"],0)
        by_league[g["league_name"]] += 1
    log.info("Games by league:")
    for league, count in sorted(by_league.items(), key=lambda x:-x[1]):
        log.info(f"   {league}: {count}")
    log.info(f"TOTAL: {len(all_games)} games")
    return all_games


# ── Scores (for evaluating predictions) ───────────────────────────────────

def get_odds_scores(league: str, days_from: int=1) -> list[dict]:
    if not ODDS_API_KEY:
        return []
    try:
        resp = requests.get(f"{ODDS_BASE}/sports/{league}/scores",
                            params={"apiKey":ODDS_API_KEY,"daysFrom":days_from}, timeout=10)
        resp.raise_for_status()
        results = []
        for game in resp.json():
            if not game.get("completed"): continue
            scores = {s["name"]:s["score"] for s in (game.get("scores") or [])}
            h,a = game["home_team"],game["away_team"]
            if h in scores and a in scores:
                try:
                    results.append({
                        "game_id":game["id"],"league":league,
                        "home_team":h,"away_team":a,
                        "home_score":int(scores[h]),"away_score":int(scores[a]),
                        "actual_total":int(scores[h])+int(scores[a]),
                        "commence_time":game["commence_time"],
                    })
                except (ValueError,TypeError):
                    pass
        return results
    except Exception as e:
        log.warning(f"Scores [{league}]: {e}")
        return []


def get_all_scores(days_from: int=1) -> list[dict]:
    all_scores = []
    for league in ODDS_LEAGUES:
        all_scores.extend(get_odds_scores(league, days_from))
    log.info(f"Completed games: {len(all_scores)}")
    return all_scores


# ── Line movement tracker ──────────────────────────────────────────────────

class LineMovementTracker:
    HISTORY_FILE = CACHE_DIR / "line_history.json"

    def __init__(self):
        self.history = {}
        if self.HISTORY_FILE.exists():
            try:
                with open(self.HISTORY_FILE) as f:
                    self.history = json.load(f)
            except Exception:
                pass

    def _save(self):
        with open(self.HISTORY_FILE,"w") as f:
            json.dump(self.history, f, indent=2)

    def snapshot(self, games: list[dict]):
        ts = datetime.utcnow().isoformat()
        for g in games:
            if not g.get("consensus_total"):
                continue
            gid = g["game_id"]
            if gid not in self.history:
                self.history[gid] = {"matchup":g["matchup"],"snapshots":[]}
            self.history[gid]["snapshots"].append({"ts":ts,"total":g["consensus_total"]})
        self._save()

    def get_movement(self, game_id: str) -> float:
        if game_id not in self.history: return 0
        snaps = self.history[game_id]["snapshots"]
        if len(snaps) < 2: return 0
        return round(snaps[-1]["total"] - snaps[0]["total"], 1)

    def get_all_movements(self) -> list[dict]:
        out = []
        for gid in self.history:
            mv = self.get_movement(gid)
            if mv != 0:
                out.append({"game_id":gid,"movement":mv,
                            "matchup":self.history[gid].get("matchup","")})
        return out
