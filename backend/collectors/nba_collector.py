"""
NBA Stats Collector — fixed for all nba_api versions
"""

import time
import logging
import pandas as pd

log = logging.getLogger(__name__)
DELAY = 1.5


def get_all_teams() -> pd.DataFrame:
    try:
        from nba_api.stats.static import teams
        return pd.DataFrame(teams.get_teams())
    except Exception as e:
        log.error(f"get_all_teams failed: {e}")
        return pd.DataFrame()


def get_team_advanced_stats(season: str = "2024-25") -> pd.DataFrame:
    log.info(f"Pulling NBA advanced stats for {season}...")
    time.sleep(DELAY)

    from nba_api.stats.endpoints import leaguedashteamstats

    # Try every known argument combination across nba_api versions
    attempts = [
        {"per_mode_simple": "PerGame", "measure_type_simple": "Advanced"},
        {"per_mode_simple": "PerGame", "measure_type_simple_nullable": "Advanced"},
        {"per_mode": "PerGame", "measure_type": "Advanced"},
        {"per_mode_simple": "PerGame"},   # minimal args
        {},                                # absolute fallback
    ]

    for kwargs in attempts:
        try:
            df = leaguedashteamstats.LeagueDashTeamStats(
                season=season,
                season_type_all_star="Regular Season",
                **kwargs
            ).get_data_frames()[0]
            log.info(f"  NBA stats: {len(df)} teams (args: {list(kwargs.keys())})")
            keep = ["TEAM_ID","TEAM_NAME","PACE","E_PACE",
                    "OFF_RATING","DEF_RATING","NET_RATING",
                    "EFG_PCT","TS_PCT","TM_TOV_PCT"]
            return df[[c for c in keep if c in df.columns]]
        except TypeError:
            continue
        except Exception as e:
            log.warning(f"  NBA stats attempt failed: {e}")
            continue

    log.error("All NBA stats attempts failed — returning empty DataFrame")
    return pd.DataFrame()


def get_team_game_logs(team_id: int, season: str = "2024-25", last_n: int = 10) -> pd.DataFrame:
    log.info(f"Pulling game logs for team {team_id}...")
    time.sleep(DELAY)
    try:
        from nba_api.stats.endpoints import teamgamelogs
        df = teamgamelogs.TeamGameLogs(
            team_id_nullable=team_id,
            season_nullable=season,
            season_type_nullable="Regular Season",
        ).get_data_frames()[0].head(last_n)
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
        df["HOME"] = df["MATCHUP"].apply(lambda x: 1 if "vs." in x else 0)
        if "PTS" in df.columns and "PLUS_MINUS" in df.columns:
            df["OPP_PTS"] = df["PTS"] - df["PLUS_MINUS"]
        return df
    except Exception as e:
        log.error(f"Game logs failed for team {team_id}: {e}")
        return pd.DataFrame()


def build_team_stats_lookup(season: str = "2024-25") -> dict:
    adv = get_team_advanced_stats(season)
    if adv.empty:
        return {}
    result = {}
    for _, row in adv.iterrows():
        result[row.get("TEAM_NAME","")] = {
            "pace":       row.get("PACE"),
            "off_rating": row.get("OFF_RATING"),
            "def_rating": row.get("DEF_RATING"),
            "net_rating": row.get("NET_RATING"),
            "efg_pct":    row.get("EFG_PCT"),
            "ts_pct":     row.get("TS_PCT"),
        }
    log.info(f"  {len(result)} NBA teams with stats")
    return result
