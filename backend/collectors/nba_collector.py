"""
NBA Stats Collector
Pulls pace, offensive rating, defensive rating, and game logs
from the official NBA stats website. Completely free — no API key needed.
"""

import time
import logging
import pandas as pd
from nba_api.stats.endpoints import leaguedashteamstats, teamgamelogs
from nba_api.stats.static import teams

log = logging.getLogger(__name__)
DELAY = 1.2   # seconds between requests (NBA blocks fast requests)


def get_all_teams() -> pd.DataFrame:
    return pd.DataFrame(teams.get_teams())


def get_team_advanced_stats(season: str = "2024-25") -> pd.DataFrame:
    log.info(f"Pulling NBA advanced stats for {season}...")
    time.sleep(DELAY)
    df = leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        season_type_all_star="Regular Season",
        per_mode_simple="PerGame",
        measure_type_simple="Advanced",
    ).get_data_frames()[0]

    keep = ["TEAM_ID","TEAM_NAME","PACE","E_PACE","OFF_RATING","DEF_RATING",
            "NET_RATING","EFG_PCT","TS_PCT","TM_TOV_PCT","OREB_PCT","DREB_PCT"]
    return df[[c for c in keep if c in df.columns]]


def get_team_game_logs(team_id: int, season: str = "2024-25", last_n: int = 10) -> pd.DataFrame:
    log.info(f"Pulling game logs for team {team_id}...")
    time.sleep(DELAY)
    df = teamgamelogs.TeamGameLogs(
        team_id_nullable=team_id,
        season_nullable=season,
        season_type_nullable="Regular Season",
    ).get_data_frames()[0].head(last_n)

    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["HOME"]      = df["MATCHUP"].apply(lambda x: 1 if "vs." in x else 0)
    if "PTS" in df.columns and "PLUS_MINUS" in df.columns:
        df["OPP_PTS"] = df["PTS"] - df["PLUS_MINUS"]
    return df


def build_team_stats_lookup(season: str = "2024-25") -> dict:
    """Returns {team_name: {pace, off_rating, def_rating, ...}}"""
    adv = get_team_advanced_stats(season)
    result = {}
    for _, row in adv.iterrows():
        result[row["TEAM_NAME"]] = {
            "pace":       row.get("PACE"),
            "off_rating": row.get("OFF_RATING"),
            "def_rating": row.get("DEF_RATING"),
            "net_rating": row.get("NET_RATING"),
            "efg_pct":    row.get("EFG_PCT"),
            "ts_pct":     row.get("TS_PCT"),
        }
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("\n=== NBA COLLECTOR TEST ===")
    adv = get_team_advanced_stats()
    print(f"Teams loaded: {len(adv)}")
    print(adv[["TEAM_NAME","PACE","OFF_RATING","DEF_RATING"]].head(5).to_string(index=False))
