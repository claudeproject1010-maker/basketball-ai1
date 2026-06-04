"""
Multi-Source Basketball Collector
Source 1: The Odds API    — real betting lines (most important)
Source 2: ESPN hidden API — upcoming game schedule (free, no key)
Source 3: BallDontLie    — NBA schedule (free with key)
Source 4: Highlightly    — international leagues (RapidAPI free tier)
"""

import os, json, logging, requests
from datetime import datetime, date, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

ODDS_KEY  = os.getenv("ODDS_API_KEY", "")
RAPID_KEY = os.getenv("RAPID_API_KEY", "")
BDL_KEY   = os.getenv("BALLDONTLIE_KEY", "")

ODDS_BASE  = "https://api.the-odds-api.com/v4"
BDL_BASE   = "https://api.balldontlie.io/v1"
ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports/basketball"
RAPID_BASE = "https://basketball-highlights-api.p.rapidapi.com"

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
}

# ESPN sport slugs for schedule fetching
ESPN_SPORTS = {
    "basketball_nba":   "nba",
    "basketball_wnba":  "wnba",
    "basketball_ncaab": "mens-college-basketball",
    "basketball_ncaaw": "womens-college-basketball",
}

CACHE_DIR = Path(__file__).parent.parent / "data" / "odds_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
BOOKMAKERS = ["fanduel","draftkings","betmgm","bovada","pointsbread","betonlineag"]

HEADERS = {"User-Agent": "BasketballAI/1.0", "Accept": "application/json"}


def _safe_str(val) -> str:
    """Safely convert any value to string — fixes dict.lower() errors."""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        # Try common team name keys
        for key in ("full_name","name","displayName","abbreviation"):
            if key in val and isinstance(val[key], str):
                return val[key]
        return str(val)
    return str(val) if val else ""


# ── Source 1: The Odds API ─────────────────────────────────────────────────

def fetch_odds_league(league: str) -> list[dict]:
    if not ODDS_KEY:
        return []
    try:
        resp = requests.get(f"{ODDS_BASE}/sports/{league}/odds", params={
            "apiKey": ODDS_KEY, "regions": "us,uk,eu,au",
            "markets": "totals", "oddsFormat": "american",
            "bookmakers": ",".join(BOOKMAKERS),
        }, timeout=10)
        if resp.status_code in (404, 422):
            return []
        resp.raise_for_status()
        remaining = resp.headers.get("x-requests-remaining", "?")
        log.info(f"  [{LEAGUE_NAMES.get(league,league)}] {len(resp.json())} games · {remaining} calls left")
        return resp.json()
    except Exception as e:
        log.warning(f"  Odds API [{league}]: {e}")
        return []


def parse_odds_game(raw: dict, league: str) -> dict | None:
    lines = {}
    for bm in raw.get("bookmakers", []):
        for market in bm.get("markets", []):
            if market["key"] != "totals":
                continue
            over  = next((o for o in market["outcomes"] if o["name"] == "Over"),  None)
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
    home = _safe_str(raw.get("home_team",""))
    away = _safe_str(raw.get("away_team",""))
    return {
        "game_id":         raw["id"],
        "league":          league,
        "league_name":     LEAGUE_NAMES.get(league, league),
        "home_team":       home,
        "away_team":       away,
        "matchup":         f"{away} @ {home}",
        "commence_time":   raw["commence_time"],
        "consensus_total": round(sum(totals) / len(totals), 1),
        "total_range":     [min(totals), max(totals)],
        "books":           lines,
        "has_line":        True,
        "source":          "odds_api",
        "fetched_at":      datetime.utcnow().isoformat(),
    }


def get_odds_games() -> list[dict]:
    games = []
    for league in ODDS_LEAGUES:
        for raw in fetch_odds_league(league):
            parsed = parse_odds_game(raw, league)
            if parsed:
                games.append(parsed)
    log.info(f"Odds API: {len(games)} games with lines")
    return games


# ── Source 2: ESPN schedule (free, no key needed) ──────────────────────────

def get_espn_schedule_games() -> list[dict]:
    """
    Pull today's and tomorrow's upcoming games from ESPN's hidden API.
    No key needed. Covers NBA, WNBA, NCAA Men, NCAA Women.
    """
    games = []
    for offset in range(2):
        d = (date.today() + timedelta(days=offset)).strftime("%Y%m%d")
        for league_key, sport in ESPN_SPORTS.items():
            try:
                resp = requests.get(
                    f"{ESPN_BASE}/{sport}/scoreboard",
                    params={"dates": d},
                    headers=HEADERS, timeout=10
                )
                resp.raise_for_status()
                data = resp.json()
                for event in data.get("events", []):
                    try:
                        comp = event["competitions"][0]
                        status = comp["status"]["type"]["name"]
                        # Only upcoming or scheduled games
                        if status in ("STATUS_FINAL","STATUS_FINAL_OT"):
                            continue
                        home_c = next((c for c in comp["competitors"] if c["homeAway"]=="home"), None)
                        away_c = next((c for c in comp["competitors"] if c["homeAway"]=="away"), None)
                        if not home_c or not away_c:
                            continue
                        home = home_c["team"]["displayName"]
                        away = away_c["team"]["displayName"]
                        commence = event.get("date","")
                        games.append({
                            "game_id":         f"espn_{event['id']}",
                            "league":          league_key,
                            "league_name":     LEAGUE_NAMES.get(league_key, league_key),
                            "home_team":       home,
                            "away_team":       away,
                            "matchup":         f"{away} @ {home}",
                            "commence_time":   commence,
                            "consensus_total": None,
                            "total_range":     [None, None],
                            "books":           {},
                            "has_line":        False,
                            "source":          "espn",
                            "status":          status,
                        })
                    except (KeyError, TypeError, IndexError):
                        continue
            except Exception as e:
                log.warning(f"  ESPN [{sport} {d}]: {e}")

    log.info(f"ESPN schedule: {len(games)} upcoming games")
    return games


# ── Source 3: BallDontLie ──────────────────────────────────────────────────

def get_balldontlie_games() -> list[dict]:
    if not BDL_KEY:
        log.info("No BALLDONTLIE_KEY — skipping BallDontLie")
        return []

    games = []
    headers = {"Authorization": BDL_KEY}
    endpoints = [
        (f"{BDL_BASE}/games",      "basketball_nba",  "NBA"),
        (f"{BDL_BASE}/wnba/games", "basketball_wnba", "WNBA"),
    ]

    for offset in range(2):
        d = (date.today() + timedelta(days=offset)).strftime("%Y-%m-%d")
        for url, league_key, league_name in endpoints:
            try:
                resp = requests.get(url, headers=headers,
                                    params={"dates[]": d, "per_page": 100},
                                    timeout=10)
                if resp.status_code == 401:
                    log.warning("  BallDontLie: 401 Unauthorized — check BALLDONTLIE_KEY")
                    return []
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                for g in resp.json().get("data", []):
                    home = _safe_str((g.get("home_team") or {}).get("full_name",""))
                    away = _safe_str((g.get("visitor_team") or {}).get("full_name",""))
                    if not home or not away:
                        continue
                    games.append({
                        "game_id":         f"bdl_{g['id']}",
                        "league":          league_key,
                        "league_name":     league_name,
                        "home_team":       home,
                        "away_team":       away,
                        "matchup":         f"{away} @ {home}",
                        "commence_time":   d + "T00:00:00Z",
                        "consensus_total": None,
                        "total_range":     [None, None],
                        "books":           {},
                        "has_line":        False,
                        "source":          "balldontlie",
                        "status":          _safe_str(g.get("status","")),
                    })
            except Exception as e:
                log.warning(f"  BallDontLie [{league_name} {d}]: {e}")

    log.info(f"BallDontLie: {len(games)} games")
    return games


# ── Source 4: Highlightly (international) ─────────────────────────────────

def get_highlightly_games() -> list[dict]:
    if not RAPID_KEY:
        log.info("No RAPID_API_KEY — skipping Highlightly international leagues")
        return []

    today = date.today().strftime("%Y-%m-%d")
    headers = {
        "x-rapidapi-key":  RAPID_KEY,
        "x-rapidapi-host": "basketball-highlights-api.p.rapidapi.com",
    }
    games = []
    try:
        resp = requests.get(f"{RAPID_BASE}/matches", headers=headers,
                            params={"date": today}, timeout=15)
        if resp.status_code in (401, 403):
            log.warning(f"  Highlightly: {resp.status_code} — check RAPID_API_KEY in GitHub Secrets")
            return []
        if resp.status_code == 429:
            log.warning("  Highlightly: rate limit hit")
            return []
        resp.raise_for_status()

        data = resp.json()
        raw_games = data if isinstance(data, list) else data.get("data", [])
        skip = {"NBA","WNBA","NCAA"}

        for g in raw_games:
            league_name = _safe_str(g.get("leagueName","") or g.get("league",""))
            home = _safe_str(g.get("homeTeam","") or g.get("home",""))
            away = _safe_str(g.get("awayTeam","") or g.get("away",""))
            if not home or not away:
                continue
            if any(s in league_name for s in skip):
                continue
            gid = _safe_str(g.get("id", f"{home}_{away}_{today}"))
            games.append({
                "game_id":         f"hl_{gid}",
                "league":          league_name.lower().replace(" ","_"),
                "league_name":     league_name,
                "home_team":       home,
                "away_team":       away,
                "matchup":         f"{away} @ {home}",
                "commence_time":   _safe_str(g.get("date", today + "T00:00:00Z")),
                "consensus_total": None,
                "total_range":     [None, None],
                "books":           {},
                "has_line":        False,
                "source":          "highlightly",
                "status":          _safe_str(g.get("status","")),
            })

        log.info(f"Highlightly: {len(games)} international games")
        by_league = {}
        for g in games:
            by_league.setdefault(g["league_name"], 0)
            by_league[g["league_name"]] += 1
        for lg, ct in sorted(by_league.items(), key=lambda x: -x[1])[:8]:
            log.info(f"   {lg}: {ct}")

    except Exception as e:
        log.warning(f"  Highlightly error: {e}")

    return games


# ── Master fetcher ─────────────────────────────────────────────────────────

def get_all_games(use_cache: bool = False) -> list[dict]:
    cache_file = CACHE_DIR / f"all_games_{datetime.today().strftime('%Y%m%d')}.json"
    if use_cache and cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)

    odds_games  = get_odds_games()
    espn_games  = get_espn_schedule_games()
    bdl_games   = get_balldontlie_games()
    intl_games  = get_highlightly_games()

    # Deduplicate — odds_api games take priority (they have real lines)
    seen = set()
    for g in odds_games:
        h = _safe_str(g["home_team"]).lower().strip()
        a = _safe_str(g["away_team"]).lower().strip()
        seen.add((h, a))

    all_games = list(odds_games)
    for g in espn_games + bdl_games + intl_games:
        h = _safe_str(g["home_team"]).lower().strip()
        a = _safe_str(g["away_team"]).lower().strip()
        if not h or not a:
            continue
        if (h, a) not in seen:
            seen.add((h, a))
            all_games.append(g)

    all_games.sort(key=lambda g: _safe_str(g.get("commence_time","")))

    with open(cache_file, "w") as f:
        json.dump(all_games, f, indent=2)

    with_lines = sum(1 for g in all_games if g.get("has_line"))
    log.info(f"TOTAL: {len(all_games)} games | {with_lines} with lines | {len(all_games)-with_lines} schedule-only")
    return all_games


# ── Scores ─────────────────────────────────────────────────────────────────

def get_odds_scores(league: str, days_from: int = 1) -> list[dict]:
    if not ODDS_KEY:
        return []
    try:
        resp = requests.get(f"{ODDS_BASE}/sports/{league}/scores",
                            params={"apiKey": ODDS_KEY, "daysFrom": days_from},
                            timeout=10)
        resp.raise_for_status()
        results = []
        for game in resp.json():
            if not game.get("completed"):
                continue
            scores = {s["name"]: s["score"] for s in (game.get("scores") or [])}
            h = _safe_str(game.get("home_team",""))
            a = _safe_str(game.get("away_team",""))
            if h in scores and a in scores:
                try:
                    results.append({
                        "game_id":       game["id"],
                        "league":        league,
                        "home_team":     h,
                        "away_team":     a,
                        "home_score":    int(scores[h]),
                        "away_score":    int(scores[a]),
                        "actual_total":  int(scores[h]) + int(scores[a]),
                        "commence_time": game["commence_time"],
                    })
                except (ValueError, TypeError):
                    pass
        return results
    except Exception as e:
        log.warning(f"Scores [{league}]: {e}")
        return []


def get_all_scores(days_from: int = 1) -> list[dict]:
    all_scores = []
    for league in ODDS_LEAGUES:
        all_scores.extend(get_odds_scores(league, days_from))
    log.info(f"Completed games fetched: {len(all_scores)}")
    return all_scores


# ── Line movement ──────────────────────────────────────────────────────────

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
        with open(self.HISTORY_FILE, "w") as f:
            json.dump(self.history, f, indent=2)

    def snapshot(self, games: list[dict]):
        ts = datetime.utcnow().isoformat()
        for g in games:
            if not g.get("consensus_total"):
                continue
            gid = g["game_id"]
            if gid not in self.history:
                self.history[gid] = {"matchup": g["matchup"], "snapshots": []}
            self.history[gid]["snapshots"].append({"ts": ts, "total": g["consensus_total"]})
        self._save()

    def get_movement(self, game_id: str) -> float:
        if game_id not in self.history:
            return 0
        snaps = self.history[game_id]["snapshots"]
        if len(snaps) < 2:
            return 0
        return round(snaps[-1]["total"] - snaps[0]["total"], 1)

    def get_all_movements(self) -> list[dict]:
        return [{"game_id": gid, "movement": self.get_movement(gid),
                 "matchup": self.history[gid].get("matchup","")}
                for gid in self.history if self.get_movement(gid) != 0]
