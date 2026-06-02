"""
Database Layer — SQLite
Fixed: datetime strings from Odds API now properly converted to Python datetime objects.
"""

import logging
import pandas as pd
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, Integer, Float, String,
    Boolean, DateTime, JSON, UniqueConstraint, text
)
from sqlalchemy.orm import DeclarativeBase, Session

log = logging.getLogger(__name__)

DB_URL = "sqlite:///basketball_ai.db"
engine = create_engine(DB_URL, echo=False)


class Base(DeclarativeBase):
    pass


# ── Tables ─────────────────────────────────────────────────────────────────

class Game(Base):
    __tablename__ = "games"
    id            = Column(String(30), primary_key=True)
    league        = Column(String(40), default="basketball_nba")
    home_team     = Column(String(60))
    away_team     = Column(String(60))
    commence_time = Column(DateTime)
    completed     = Column(Boolean, default=False)
    home_score    = Column(Integer, nullable=True)
    away_score    = Column(Integer, nullable=True)
    actual_total  = Column(Integer, nullable=True)


class OddsSnapshot(Base):
    __tablename__    = "odds_snapshots"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    game_id          = Column(String(30))
    fetched_at       = Column(DateTime, default=datetime.utcnow)
    consensus_total  = Column(Float)
    total_low        = Column(Float)
    total_high       = Column(Float)
    books_json       = Column(JSON)


class Prediction(Base):
    __tablename__  = "predictions"
    __table_args__ = (UniqueConstraint("game_id", "model_version", name="uq_pred_game_model"),)
    id             = Column(Integer, primary_key=True, autoincrement=True)
    game_id        = Column(String(30))
    model_version  = Column(String(20))
    predicted_at   = Column(DateTime, default=datetime.utcnow)
    predicted_total    = Column(Float)
    line_at_prediction = Column(Float)
    over_probability   = Column(Float)
    edge               = Column(Float)
    confidence         = Column(String(10))
    actual_total       = Column(Integer, nullable=True)
    over_hit           = Column(Boolean, nullable=True)
    correct            = Column(Boolean, nullable=True)


# ── Helper: convert any date string to datetime ────────────────────────────

def _to_dt(value) -> datetime | None:
    """
    Accepts a datetime object, ISO string, or None.
    Always returns a timezone-naive datetime (SQLite doesn't support tz).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        # Strip timezone info so SQLite is happy
        return value.replace(tzinfo=None)
    if isinstance(value, str):
        # Handle formats: "2026-06-02T19:00:00Z" or "2026-06-02T19:00:00+00:00"
        value = value.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(value)
            return dt.replace(tzinfo=None)
        except ValueError:
            # Fallback: try parsing without timezone
            try:
                return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                return None
    return None


# ── DB functions ───────────────────────────────────────────────────────────

def init_db():
    Base.metadata.create_all(engine)
    log.info("Database ready.")


def save_odds_snapshots(games: list[dict]):
    with Session(engine) as session:
        for g in games:
            # Save odds snapshot
            snap = OddsSnapshot(
                game_id        = g["game_id"],
                consensus_total= g["consensus_total"],
                total_low      = g["total_range"][0],
                total_high     = g["total_range"][1],
                books_json     = g["books"],
            )
            session.add(snap)

            # Save game record if new
            if not session.get(Game, g["game_id"]):
                session.add(Game(
                    id           = g["game_id"],
                    league       = g.get("league", "basketball_nba"),
                    home_team    = g["home_team"],
                    away_team    = g["away_team"],
                    commence_time= _to_dt(g["commence_time"]),   # ← fixed
                ))
        session.commit()
    log.info(f"Saved {len(games)} odds snapshots.")


def save_game_results(results: list[dict]):
    with Session(engine) as session:
        for r in results:
            game = session.get(Game, r["game_id"])
            if game:
                game.completed    = True
                game.home_score   = r["home_score"]
                game.away_score   = r["away_score"]
                game.actual_total = r["actual_total"]
            else:
                session.add(Game(
                    id           = r["game_id"],
                    league       = r.get("league", "basketball_nba"),
                    home_team    = r["home_team"],
                    away_team    = r["away_team"],
                    commence_time= _to_dt(r["commence_time"]),   # ← fixed
                    completed    = True,
                    home_score   = r["home_score"],
                    away_score   = r["away_score"],
                    actual_total = r["actual_total"],
                ))
        session.commit()
    log.info(f"Saved {len(results)} game results.")


def get_training_data() -> pd.DataFrame:
    query = """
        SELECT
            g.id AS game_id,
            g.home_team,
            g.away_team,
            g.actual_total,
            g.commence_time,
            o.consensus_total AS line,
            o.total_high - o.total_low AS line_spread,
            (SELECT consensus_total FROM odds_snapshots
             WHERE game_id = g.id ORDER BY fetched_at ASC LIMIT 1) AS opening_line
        FROM games g
        JOIN (
            SELECT game_id, consensus_total, total_high, total_low,
                   ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY fetched_at DESC) AS rn
            FROM odds_snapshots
        ) o ON o.game_id = g.id AND o.rn = 1
        WHERE g.completed = 1
        ORDER BY g.commence_time DESC
    """
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)
    df["line_movement"] = df["consensus_total"] - df["opening_line"]
    df["over_hit"]      = (df["actual_total"] > df["line"]).astype(int)
    return df


if __name__ == "__main__":
    init_db()
    print("Tables created.")
