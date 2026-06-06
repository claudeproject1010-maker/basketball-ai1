"""
Free Basketball Data Collectors
Supplements the Odds API with zero-cost data sources.

Sources:
  1. Ball Don't Lie  — NBA scores, team stats, season averages (no key needed)
  2. ESPN hidden API — Live scores, game status, team metadata (no key needed)
  3. TheSportsDB     — Game schedules, team logos (no key needed)

Usage (from pipeline.py):
    from collectors.free_collectors import get_free_scores, get_espn_scores, get_sports_db_schedule
"""

import requests
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

log = logging.getLogger(__name__)

def _bdl_headers() -> dict:
    """Build headers — include Authorization if key available."""
    h = {
        "User-Agent": "BasketballAI/1.0",
        "Accept":     "application/json",
    }
    if BDL_KEY:
        h["Authorization"] = BDL_KEY
    return h

HEADERS = _bdl_headers()


# ─────────────────────────────────────────────────────────────────────────────
# 1. BALL DON'T LIE  (balldontlie.io)
#    Free tier: no API key required for basic endpoints.
#    Docs: https://www.balldontlie.io
# ─────────────────────────────────────────────────────────────────────────────

BDL_KEY  = os.getenv("BALLDONTLIE_KEY", "")
BDL_BASE = "https://api.balldontlie.io/v1"


def _bdl_get(path: str, params: dict = {}) -> Optional[dict]:
    try:
        headers = _bdl_headers()
        r = requests.get(f"{BDL_BASE}/{path}", params=params, headers=headers, timeout=10)
        if r.status_code == 401:
            log.warning(f"[BDL] 401 Unauthorized — check BALLDONTLIE_KEY in GitHub Secrets")
            return None
        if r.status_code == 401:
            log.warning("[BDL] 401 Unauthorized — check BALLDONTLIE_KEY")
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f"[BDL] {path} failed: {e}")
        return None


def get_bdl_scores(date_str: Optional[str] = None) -> list[dict]:
    """
    Fetch NBA game scores from Ball Don't Lie for a given date (YYYY-MM-DD).
    Returns a list of normalised result dicts compatible with save_game_results().
    """
    if not date_str:
        date_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    data = _bdl_get("games", {"dates[]": date_str, "per_page": 100})
    if not data:
        return []

    results = []
    for g in data.get("data", []):
        if g.get("status") != "Final":
            continue
        try:
            home_score = int(g["home_team_score"])
            away_score = int(g["visitor_team_score"])
            results.append({
                "game_id":      f"bdl_{g['id']}",
                "league":       "basketball_nba",
                "home_team":    g["home_team"]["full_name"],
                "away_team":    g["visitor_team"]["full_name"],
                "home_score":   home_score,
                "away_score":   away_score,
                "actual_total": home_score + away_score,
                "commence_time": g.get("date", date_str),
                "source":       "balldontlie",
            })
        except (KeyError, TypeError, ValueError):
            continue
    log.info(f"[BDL] {len(results)} completed NBA games on {date_str}")
    return results


def get_bdl_team_stats(season: int = 2024) -> dict[str, dict]:
    """
    Fetch NBA season averages per team (points, assists, rebounds).
    Returns dict keyed by full team name.
    """
    data = _bdl_get("season_averages", {"season": season, "per_page": 100})
    if not data:
        return {}

    stats = {}
    for row in data.get("data", []):
        team = row.get("team", {})
        name = team.get("full_name")
        if not name:
            continue
        stats[name] = {
            "pts":  row.get("pts", 0),
            "ast":  row.get("ast", 0),
            "reb":  row.get("reb", 0),
            "fg3_pct": row.get("fg3_pct", 0),
            "fg_pct":  row.get("fg_pct", 0),
            "source": "balldontlie",
        }
    log.info(f"[BDL] {len(stats)} team season averages loaded")
    return stats


def get_bdl_recent_games(team_id: int, last_n: int = 10) -> list[dict]:
    """
    Fetch last N game results for a specific team (by Ball Don't Lie team ID).
    Useful for computing rolling totals.
    """
    data = _bdl_get("games", {
        "team_ids[]": team_id,
        "per_page": last_n,
        "seasons[]": datetime.now().year - (1 if datetime.now().month < 8 else 0),
    })
    if not data:
        return []
    results = []
    for g in data.get("data", []):
        if g.get("status") != "Final":
            continue
        try:
            results.append({
                "game_id":       f"bdl_{g['id']}",
                "home_team":     g["home_team"]["full_name"],
                "away_team":     g["visitor_team"]["full_name"],
                "home_score":    g["home_team_score"],
                "away_score":    g["visitor_team_score"],
                "actual_total":  g["home_team_score"] + g["visitor_team_score"],
                "date":          g.get("date", ""),
            })
        except Exception:
            continue
    return results


def get_bdl_team_id_map() -> dict[str, int]:
    """Returns {full_team_name: bdl_team_id} for all NBA teams."""
    data = _bdl_get("teams", {"per_page": 100})
    if not data:
        return {}
    return {t["full_name"]: t["id"] for t in data.get("data", [])}


# ─────────────────────────────────────────────────────────────────────────────
# 2. ESPN HIDDEN API
#    No key required. Gives live scores + game status for NBA/WNBA.
#    Base: https://site.api.espn.com/apis/site/v2/sports/basketball
# ─────────────────────────────────────────────────────────────────────────────

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball"

ESPN_LEAGUES = {
    "basketball_nba":  "nba",
    "basketball_wnba": "wnba",
    "basketball_ncaab":"mens-college-basketball",
    "basketball_ncaaw":"womens-college-basketball",
}


def _espn_scoreboard(sport_league: str, date_str: Optional[str] = None) -> Optional[dict]:
    """sport_league e.g. 'nba', 'wnba'"""
    params = {}
    if date_str:
        params["dates"] = date_str.replace("-", "")
    try:
        url = f"{ESPN_BASE}/{sport_league}/scoreboard"
        r = requests.get(url, params=params, headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f"[ESPN] {sport_league} scoreboard failed: {e}")
        return None


def get_espn_scores(league_key: str = "basketball_nba",
                    date_str: Optional[str] = None) -> list[dict]:
    """
    Fetch completed game scores from ESPN for a given league + date.
    league_key must be one of ESPN_LEAGUES keys.
    Returns list of result dicts compatible with save_game_results().
    """
    sport = ESPN_LEAGUES.get(league_key, "nba")
    data  = _espn_scoreboard(sport, date_str)
    if not data:
        return []

    results = []
    for event in data.get("events", []):
        try:
            comp = event["competitions"][0]
            status = comp["status"]["type"]["name"]
            if status not in ("STATUS_FINAL", "STATUS_FINAL_OT", "STATUS_FINAL_AET"):
                continue

            home_comp = next((c for c in comp["competitors"] if c["homeAway"] == "home"), None)
            away_comp = next((c for c in comp["competitors"] if c["homeAway"] == "away"), None)
            if not home_comp or not away_comp:
                continue

            home_score = int(home_comp["score"])
            away_score = int(away_comp["score"])
            results.append({
                "game_id":      f"espn_{event['id']}",
                "league":       league_key,
                "home_team":    home_comp["team"]["displayName"],
                "away_team":    away_comp["team"]["displayName"],
                "home_score":   home_score,
                "away_score":   away_score,
                "actual_total": home_score + away_score,
                "commence_time": event.get("date", ""),
                "source":       "espn",
            })
        except (KeyError, TypeError, ValueError, IndexError):
            continue
    log.info(f"[ESPN] {len(results)} completed {league_key} games")
    return results


def get_espn_scores_all_leagues(date_str: Optional[str] = None) -> list[dict]:
    """Fetch completed scores across all ESPN-supported leagues."""
    all_results = []
    for league_key in ESPN_LEAGUES:
        all_results.extend(get_espn_scores(league_key, date_str))
    return all_results


def get_espn_live_scores(league_key: str = "basketball_nba") -> list[dict]:
    """
    Fetch currently in-progress games (for live monitoring).
    Returns simplified dicts with current scores and quarter.
    """
    sport = ESPN_LEAGUES.get(league_key, "nba")
    data  = _espn_scoreboard(sport)
    if not data:
        return []

    live = []
    for event in data.get("events", []):
        try:
            comp   = event["competitions"][0]
            status = comp["status"]["type"]["name"]
            if "STATUS_IN_PROGRESS" not in status and "STATUS_HALFTIME" not in status:
                continue

            home_comp = next((c for c in comp["competitors"] if c["homeAway"] == "home"), None)
            away_comp = next((c for c in comp["competitors"] if c["homeAway"] == "away"), None)
            if not home_comp or not away_comp:
                continue

            live.append({
                "game_id":       f"espn_{event['id']}",
                "league":        league_key,
                "home_team":     home_comp["team"]["displayName"],
                "away_team":     away_comp["team"]["displayName"],
                "home_score":    int(home_comp.get("score", 0)),
                "away_score":    int(away_comp.get("score", 0)),
                "period":        comp["status"].get("period", 0),
                "clock":         comp["status"].get("displayClock", ""),
                "status":        status,
            })
        except Exception:
            continue
    return live


# ─────────────────────────────────────────────────────────────────────────────
# 3. THE SPORTS DB  (thesportsdb.com)
#    Free tier (Patreon): returns schedules + team logo URLs.
#    No key required for free endpoints.
# ─────────────────────────────────────────────────────────────────────────────

TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3"

# League IDs on TheSportsDB
TSDB_LEAGUES = {
    "basketball_nba":       "4387",
    "basketball_wnba":      "4405",
    "basketball_euroleague":"4398",
    "basketball_nbl":       "4388",
}


def _tsdb_get(path: str) -> Optional[dict]:
    try:
        r = requests.get(f"{TSDB_BASE}/{path}", headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f"[TSDB] {path} failed: {e}")
        return None


def get_sports_db_schedule(league_key: str = "basketball_nba",
                           date_str: Optional[str] = None) -> list[dict]:
    """
    Fetch upcoming or past schedule for a league from TheSportsDB.
    Returns lightweight game dicts (no scores — use for logos + scheduling).
    """
    league_id = TSDB_LEAGUES.get(league_key)
    if not league_id:
        log.info(f"[TSDB] No league ID for {league_key}")
        return []

    if not date_str:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    data = _tsdb_get(f"eventsday.php?d={date_str}&l={league_id}")
    if not data or not data.get("events"):
        return []

    games = []
    for ev in data["events"]:
        try:
            games.append({
                "game_id":       f"tsdb_{ev['idEvent']}",
                "league":        league_key,
                "home_team":     ev.get("strHomeTeam", ""),
                "away_team":     ev.get("strAwayTeam", ""),
                "home_logo":     ev.get("strHomeTeamBadge", ""),
                "away_logo":     ev.get("strAwayTeamBadge", ""),
                "commence_time": ev.get("strTimestamp", date_str),
                "venue":         ev.get("strVenue", ""),
                "source":        "thesportsdb",
            })
        except Exception:
            continue
    log.info(f"[TSDB] {len(games)} {league_key} games on {date_str}")
    return games


def get_team_logos(team_names: list[str]) -> dict[str, str]:
    """
    Best-effort: search TheSportsDB for team logos by name.
    Returns {team_name: logo_url}.
    """
    logos = {}
    for name in team_names:
        query = name.replace(" ", "_")
        data  = _tsdb_get(f"searchteams.php?t={query}")
        if data and data.get("teams"):
            team = data["teams"][0]
            logos[name] = team.get("strTeamBadge", "")
    return logos


# ─────────────────────────────────────────────────────────────────────────────
# 4. CONVENIENCE: combined free score fetcher
# ─────────────────────────────────────────────────────────────────────────────

def get_free_scores(date_str: Optional[str] = None, leagues: Optional[list[str]] = None) -> list[dict]:
    """
    Pull completed game scores from all free sources (ESPN + Ball Don't Lie).
    Deduplicates by matching on team names + date.
    date_str: YYYY-MM-DD, defaults to yesterday UTC.
    leagues:  list of Odds API league keys to fetch; defaults to NBA + WNBA.
    """
    if not date_str:
        date_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    if not leagues:
        leagues = list(ESPN_LEAGUES.keys())

    all_results = []
    seen_matchups = set()

    # ESPN first (covers more leagues)
    for league_key in leagues:
        for r in get_espn_scores(league_key, date_str):
            key = (r["home_team"], r["away_team"], date_str)
            if key not in seen_matchups:
                seen_matchups.add(key)
                all_results.append(r)

    # Ball Don't Lie as NBA backup/supplement
    for r in get_bdl_scores(date_str):
        key = (r["home_team"], r["away_team"], date_str)
        if key not in seen_matchups:
            seen_matchups.add(key)
            all_results.append(r)

    log.info(f"[FREE] Total free-source scores: {len(all_results)} games on {date_str}")
    return all_results
