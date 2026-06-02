"""
Feature Engineering
Transforms raw NBA stats + odds data into an ML-ready feature matrix.

Key principle: NEVER use future data to build features (data leakage).
Every feature must be computable BEFORE the game tips off.
"""

import logging
import numpy as np
import pandas as pd
from typing import Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Column name constants (keeps everything consistent across modules)
# ---------------------------------------------------------------------------

PACE_FEATURES = ["home_pace", "away_pace", "pace_sum", "pace_diff"]

EFFICIENCY_FEATURES = [
    "home_ortg", "home_drtg", "home_net_rtg",
    "away_ortg", "away_drtg", "away_net_rtg",
    "combined_ortg", "combined_drtg",
    "home_efg", "away_efg", "home_ts", "away_ts",
]

ROLLING_FEATURES = [
    "home_pts_last5", "away_pts_last5",
    "home_pts_last10", "away_pts_last10",
    "home_opp_pts_last5", "away_opp_pts_last5",   # points ALLOWED
    "home_total_last5", "away_total_last5",         # combined game totals
    "home_pts_trend", "away_pts_trend",             # last3 - last10 (momentum)
]

SITUATIONAL_FEATURES = [
    "home_rest_days", "away_rest_days",
    "home_b2b", "away_b2b",
    "rest_advantage",                               # home_rest - away_rest
]

MARKET_FEATURES = [
    "consensus_total",
    "line_movement",                                # current - opening
    "line_spread",                                  # high_book - low_book (sharpness)
    "abs_line_movement",
    "move_direction",                               # +1 / -1 / 0
]

ALL_FEATURES = (
    PACE_FEATURES
    + EFFICIENCY_FEATURES
    + ROLLING_FEATURES
    + SITUATIONAL_FEATURES
    + MARKET_FEATURES
)

TARGET_COL = "over_hit"             # 1 = over hit, 0 = under hit
RAW_TARGET_COL = "actual_total"


# ---------------------------------------------------------------------------
# Core builders
# ---------------------------------------------------------------------------

def build_pace_features(home: dict, away: dict) -> dict:
    """
    Pace drives expected total more than any other single factor.

    Expected Total ≈ pace × (home_ppp + away_ppp)

    We let the model learn the exact coefficients — just give it clean pace inputs.
    """
    hp = home.get("pace", np.nan)
    ap = away.get("pace", np.nan)
    return {
        "home_pace": hp,
        "away_pace": ap,
        "pace_sum": _safe(hp + ap),
        "pace_diff": _safe(abs(hp - ap)),   # extreme mismatch = interesting
    }


def build_efficiency_features(home: dict, away: dict) -> dict:
    """
    Offensive/defensive ratings in points per 100 possessions.
    Combined ortg + combined drtg proxy for expected total scoring environment.
    """
    return {
        "home_ortg": home.get("off_rating", np.nan),
        "home_drtg": home.get("def_rating", np.nan),
        "home_net_rtg": _safe(home.get("off_rating", np.nan) - home.get("def_rating", np.nan)),
        "away_ortg": away.get("off_rating", np.nan),
        "away_drtg": away.get("def_rating", np.nan),
        "away_net_rtg": _safe(away.get("off_rating", np.nan) - away.get("def_rating", np.nan)),
        # The match-up: home offense vs away defense, and vice versa
        "combined_ortg": _safe(home.get("off_rating", np.nan) + away.get("off_rating", np.nan)),
        "combined_drtg": _safe(home.get("def_rating", np.nan) + away.get("def_rating", np.nan)),
        "home_efg": home.get("efg_pct", np.nan),
        "away_efg": away.get("efg_pct", np.nan),
        "home_ts": home.get("ts_pct", np.nan),
        "away_ts": away.get("ts_pct", np.nan),
    }


def build_rolling_features(home_logs: pd.DataFrame, away_logs: pd.DataFrame) -> dict:
    """
    Recent form — the most important time-varying signal.
    Uses last 5 and last 10 games to balance recency vs stability.
    Computes 'trend' = last3_avg - last10_avg (positive = heating up).

    home_logs / away_logs: game log DataFrames, sorted newest → oldest.
    Must contain columns: PTS (scored), OPP_PTS (allowed).
    """
    feats = {}

    for prefix, logs in [("home", home_logs), ("away", away_logs)]:
        pts = logs["PTS"].values if "PTS" in logs.columns else np.array([])
        opp = logs["OPP_PTS"].values if "OPP_PTS" in logs.columns else np.array([])

        feats[f"{prefix}_pts_last5"]     = _rolling_mean(pts, 5)
        feats[f"{prefix}_pts_last10"]    = _rolling_mean(pts, 10)
        feats[f"{prefix}_opp_pts_last5"] = _rolling_mean(opp, 5)

        # Game total (scored + allowed) for last 5
        if len(pts) > 0 and len(opp) > 0:
            totals = pts[:5] + opp[:5]
            feats[f"{prefix}_total_last5"] = totals.mean() if len(totals) > 0 else np.nan
        else:
            feats[f"{prefix}_total_last5"] = np.nan

        # Momentum: last3 minus last10 average
        last3  = _rolling_mean(pts, 3)
        last10 = _rolling_mean(pts, 10)
        feats[f"{prefix}_pts_trend"] = _safe(last3 - last10)

    return feats


def build_situational_features(home_meta: dict, away_meta: dict) -> dict:
    """
    Rest days and back-to-back status.
    Fatigued teams defend worse → more scoring → overs.
    Both teams on B2B = extreme fatigue signal.
    """
    hr = home_meta.get("rest_days", np.nan)
    ar = away_meta.get("rest_days", np.nan)
    return {
        "home_rest_days": hr,
        "away_rest_days": ar,
        "home_b2b": int(home_meta.get("is_back_to_back", 0)),
        "away_b2b": int(away_meta.get("is_back_to_back", 0)),
        "rest_advantage": _safe(hr - ar),
    }


def build_market_features(odds_snapshots: list[dict]) -> dict:
    """
    The betting market is the aggregate of many sharp models.
    Line movement direction and magnitude are predictive features —
    not because we bet with it, but because it encodes information.

    odds_snapshots: list of dicts with 'consensus_total', sorted oldest → newest.
    """
    if not odds_snapshots:
        return {k: np.nan for k in MARKET_FEATURES}

    opening = odds_snapshots[0].get("consensus_total", np.nan)
    current = odds_snapshots[-1].get("consensus_total", np.nan)
    spreads = [
        s.get("total_high", np.nan) - s.get("total_low", np.nan)
        for s in odds_snapshots
        if s.get("total_high") is not None and s.get("total_low") is not None
    ]
    movement = _safe(current - opening)

    return {
        "consensus_total": current,
        "line_movement": movement,
        "abs_line_movement": abs(movement) if not np.isnan(movement) else np.nan,
        "line_spread": np.nanmean(spreads) if spreads else np.nan,
        "move_direction": (
            1 if movement > 0.5
            else -1 if movement < -0.5
            else 0
        ) if not np.isnan(movement) else np.nan,
    }


# ---------------------------------------------------------------------------
# Master builder
# ---------------------------------------------------------------------------

def build_feature_row(
    home_stats: dict,
    away_stats: dict,
    home_logs: pd.DataFrame,
    away_logs: pd.DataFrame,
    home_meta: dict,
    away_meta: dict,
    odds_snapshots: list[dict],
    actual_total: Optional[int] = None,   # None for live predictions
) -> dict:
    """
    Assemble a complete feature row for one game.
    Pass actual_total=None when predicting; it will be excluded.
    """
    row = {}
    row.update(build_pace_features(home_stats, away_stats))
    row.update(build_efficiency_features(home_stats, away_stats))
    row.update(build_rolling_features(home_logs, away_logs))
    row.update(build_situational_features(home_meta, away_meta))
    row.update(build_market_features(odds_snapshots))

    if actual_total is not None and odds_snapshots:
        line = odds_snapshots[-1].get("consensus_total", np.nan)
        row[RAW_TARGET_COL] = actual_total
        row[TARGET_COL] = int(actual_total > line) if not np.isnan(line) else np.nan

    return row


def build_feature_matrix(game_records: list[dict]) -> pd.DataFrame:
    """
    Build a full feature matrix from a list of pre-assembled game records.
    Each record must be a dict from build_feature_row().
    Drops rows where target is NaN.
    """
    df = pd.DataFrame(game_records)
    available_features = [c for c in ALL_FEATURES if c in df.columns]
    cols = available_features + ([TARGET_COL] if TARGET_COL in df.columns else [])
    df = df[cols].dropna(subset=[TARGET_COL] if TARGET_COL in df.columns else [])
    log.info(f"Feature matrix: {df.shape[0]} rows × {len(available_features)} features")
    return df


# ---------------------------------------------------------------------------
# Leakage audit
# ---------------------------------------------------------------------------

FORBIDDEN_LEAKAGE_COLS = [
    "actual_total", "home_score", "away_score",
    "over_hit",        # target — OK in training df, never in prediction inputs
    "home_pts_this_game", "away_pts_this_game",
]


def assert_no_leakage(feature_cols: list[str]):
    """
    Call this before training. Raises ValueError if any future-data
    columns slipped into the feature set.
    """
    bad = [c for c in feature_cols if c in FORBIDDEN_LEAKAGE_COLS]
    if bad:
        raise ValueError(
            f"DATA LEAKAGE DETECTED — these columns must not be features:\n  {bad}"
        )
    log.info("Leakage check passed.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe(x):
    """Return x, or nan if computation failed."""
    try:
        v = float(x)
        return np.nan if np.isnan(v) else v
    except (TypeError, ValueError):
        return np.nan


def _rolling_mean(arr: np.ndarray, n: int) -> float:
    if len(arr) == 0:
        return np.nan
    return float(arr[:n].mean())
