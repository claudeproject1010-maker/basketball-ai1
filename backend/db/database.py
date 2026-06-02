"""
Database Layer — SQLite (local dev) / Supabase-compatible schema
Creates and manages all tables for the basketball prediction system.

Install: pip install sqlalchemy pandas
For production: swap SQLite URL for postgresql://... (Supabase)
"""

import logging
import pandas as pd
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, Float, String,
    Boolean, DateTime, Text, JSON, UniqueConstraint,
    text
)
from sqlalchemy.orm import DeclarativeBase, Session

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine setup
# ---------------------------------------------------------------------------

# SQLite for local dev
DB_URL = "sqlite:///basketball_ai.db"
# Production (Supabase): "postgresql://user:pass@host:5432/dbname"

engine = create_engine(DB_URL, echo=False)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

class Team(Base):
    """Static NBA team reference table."""
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)          # nba_api team_id
    abbreviation = Column(String(5), unique=True)
    full_name = Column(String(60))
    conference = Column(String(4))                  # East / West
    division = Column(String(30))


class TeamStats(Base):
    """
    Per-season advanced stats snapshot.
    Refreshed daily. Keeps one row per team per season.
    """
    __tablename__ = "team_stats"
    __table_args__ = (UniqueConstraint("team_id", "season", name="uq_team_season"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer)
    season = Column(String(10))                     # "2024-25"
    fetched_at = Column(DateTime, default=datetime.utcnow)

    # Pace & efficiency (core totals features)
    pace = Column(Float)
    off_rating = Column(Float)
    def_rating = Column(Float)
    net_rating = Column(Float)

    # Shooting
    efg_pct = Column(Float)
    ts_pct = Column(Float)
    fg3a_rate = Column(Float)

    # Misc
    tov_pct = Column(Float)
    oreb_pct = Column(Float)
    dreb_pct = Column(Float)


class GameLog(Base):
    """
    Individual game results used to compute rolling features.
    One row per team per game.
    """
    __tablename__ = "game_logs"
    __table_args__ = (UniqueConstraint("game_id", "team_id", name="uq_game_team"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(20))
    team_id = Column(Integer)
    game_date = Column(DateTime)
    matchup = Column(String(20))
    is_home = Column(Boolean)
    rest_days = Column(Integer)
    is_back_to_back = Column(Boolean)

    # Box score
    pts = Column(Integer)
    fga = Column(Integer)
    fg3a = Column(Integer)
    fta = Column(Integer)
    tov = Column(Integer)
    reb = Column(Integer)
    ast = Column(Integer)
    plus_minus = Column(Float)
    win = Column(Boolean)


class Game(Base):
    """
    Scheduled and completed games. The central table.
    """
    __tablename__ = "games"

    id = Column(String(30), primary_key=True)       # odds API game_id
    home_team = Column(String(60))
    away_team = Column(String(60))
    commence_time = Column(DateTime)
    completed = Column(Boolean, default=False)

    # Actuals (filled after game)
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)
    actual_total = Column(Integer, nullable=True)


class OddsSnapshot(Base):
    """
    Stores odds snapshots for line movement tracking.
    One row per game per fetch timestamp.
    """
    __tablename__ = "odds_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(30))
    fetched_at = Column(DateTime, default=datetime.utcnow)
    consensus_total = Column(Float)
    total_low = Column(Float)           # lowest book
    total_high = Column(Float)          # highest book
    books_json = Column(JSON)           # full breakdown per book


class Prediction(Base):
    """
    Model predictions and post-game evaluation.
    """
    __tablename__ = "predictions"
    __table_args__ = (UniqueConstraint("game_id", "model_version", name="uq_pred_game_model"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(30))
    model_version = Column(String(20))
    predicted_at = Column(DateTime, default=datetime.utcnow)

    # Prediction
    predicted_total = Column(Float)
    line_at_prediction = Column(Float)
    over_probability = Column(Float)    # 0.0 – 1.0
    edge = Column(Float)                # predicted_total - line
    confidence = Column(String(10))     # LOW / MEDIUM / HIGH

    # Evaluation (filled post-game)
    actual_total = Column(Integer, nullable=True)
    over_hit = Column(Boolean, nullable=True)
    correct = Column(Boolean, nullable=True)


# ---------------------------------------------------------------------------
# DB setup and helpers
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(engine)
    log.info("Database initialized.")


def save_odds_snapshots(games: list[dict]):
    """Persist a batch of parsed odds snapshots."""
    with Session(engine) as session:
        for g in games:
            snap = OddsSnapshot(
                game_id=g["game_id"],
                consensus_total=g["consensus_total"],
                total_low=g["total_range"][0],
                total_high=g["total_range"][1],
                books_json=g["books"],
            )
            # Upsert game record if new
            existing = session.get(Game, g["game_id"])
            if not existing:
                from datetime import timezone
                commence = g["commence_time"]
                session.add(Game(
                    id=g["game_id"],
                    home_team=g["home_team"],
                    away_team=g["away_team"],
                    commence_time=commence,
                ))
            session.add(snap)
        session.commit()
    log.info(f"Saved {len(games)} odds snapshots.")


def save_game_results(results: list[dict]):
    """Update games table with actual scores."""
    with Session(engine) as session:
        for r in results:
            game = session.get(Game, r["game_id"])
            if game:
                game.completed = True
                game.home_score = r["home_score"]
                game.away_score = r["away_score"]
                game.actual_total = r["actual_total"]
            else:
                session.add(Game(
                    id=r["game_id"],
                    home_team=r["home_team"],
                    away_team=r["away_team"],
                    commence_time=r["commence_time"],
                    completed=True,
                    home_score=r["home_score"],
                    away_score=r["away_score"],
                    actual_total=r["actual_total"],
                ))
        session.commit()
    log.info(f"Saved {len(results)} game results.")


def get_training_data() -> pd.DataFrame:
    """
    Pull completed games with their consensus totals for ML training.
    Returns one row per game with features and target (actual_total).
    """
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
    df["over_hit"] = (df["actual_total"] > df["line"]).astype(int)
    return df


if __name__ == "__main__":
    init_db()
    print("Tables created:")
    with engine.connect() as conn:
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        for row in result:
            print(f"  - {row[0]}")
