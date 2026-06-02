"""
XGBoost Over/Under Model
Trains, calibrates, evaluates, and saves the prediction model.

The model predicts P(actual_total > betting_line) — not the raw score.
This is a binary classification problem: Over (1) vs Under (0).

Install: pip install xgboost scikit-learn imbalanced-learn joblib
"""

import json
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional

import joblib
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    accuracy_score, roc_auc_score, brier_score_loss,
    classification_report, log_loss,
)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

from training.features import (
    ALL_FEATURES, TARGET_COL, assert_no_leakage
)

log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH      = MODELS_DIR / "xgb_totals.joblib"
METADATA_PATH   = MODELS_DIR / "xgb_totals_meta.json"
SCALER_PATH     = MODELS_DIR / "scaler.joblib"


# ---------------------------------------------------------------------------
# XGBoost hyperparameters
# Tuned conservatively for small sports datasets (~500-3000 rows).
# ---------------------------------------------------------------------------

XGB_PARAMS = {
    "n_estimators":       400,
    "max_depth":          4,       # shallow: prevents overfit on small data
    "learning_rate":      0.03,
    "subsample":          0.8,
    "colsample_bytree":   0.7,
    "min_child_weight":   5,       # regularization: need 5+ samples per leaf
    "gamma":              1.0,     # min gain to make a split
    "reg_alpha":          0.1,     # L1 regularization
    "reg_lambda":         2.0,     # L2 regularization
    "objective":          "binary:logistic",
    "eval_metric":        "logloss",
    "use_label_encoder":  False,
    "random_state":       42,
    "n_jobs":             -1,
}


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------

def prepare_data(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    Extract feature matrix X and target y from a feature DataFrame.
    Enforces leakage check and validates feature availability.
    """
    available = [c for c in ALL_FEATURES if c in df.columns]
    missing = [c for c in ALL_FEATURES if c not in df.columns]
    if missing:
        log.warning(f"Missing features (will be filled with NaN): {missing}")

    # Re-index to full feature list so column order is always consistent
    X = df.reindex(columns=ALL_FEATURES)
    y = df[TARGET_COL].astype(int)

    assert_no_leakage(list(X.columns))
    log.info(f"Dataset: {len(X)} rows | {y.mean():.1%} overs | {X.shape[1]} features")
    return X, y


def build_pipeline(calibrate: bool = True) -> Pipeline:
    """
    Returns a full sklearn Pipeline:
      Imputer → Scaler → XGBoost → (optional) Probability Calibration

    Calibration maps raw probabilities onto true frequencies using
    isotonic regression — critical for EV calculations.
    """
    xgb_model = xgb.XGBClassifier(**XGB_PARAMS)

    if calibrate:
        # Isotonic calibration: better than Platt for non-monotone distortions
        calibrated = CalibratedClassifierCV(
            estimator=xgb_model,
            method="isotonic",
            cv=5,
        )
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler",  StandardScaler()),
            ("model",   calibrated),
        ])
    else:
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler",  StandardScaler()),
            ("model",   xgb_model),
        ])


def train(
    df: pd.DataFrame,
    calibrate: bool = True,
    save: bool = True,
) -> tuple[Pipeline, dict]:
    """
    Full training run with time-series cross-validation.

    Returns (fitted_pipeline, metrics_dict).

    Uses TimeSeriesSplit — critical for sports data. Never shuffle.
    Shuffling would let the model see future games during training,
    making CV scores wildly optimistic.
    """
    X, y = prepare_data(df)

    log.info("Running time-series cross-validation (5 folds)...")
    pipeline = build_pipeline(calibrate=calibrate)
    tscv = TimeSeriesSplit(n_splits=5)

    cv_auc = cross_val_score(pipeline, X, y, cv=tscv, scoring="roc_auc", n_jobs=-1)
    cv_ll  = cross_val_score(pipeline, X, y, cv=tscv, scoring="neg_log_loss", n_jobs=-1)
    cv_acc = cross_val_score(pipeline, X, y, cv=tscv, scoring="accuracy", n_jobs=-1)

    log.info(f"  CV ROC-AUC:  {cv_auc.mean():.4f} ± {cv_auc.std():.4f}")
    log.info(f"  CV Log-Loss: {(-cv_ll).mean():.4f} ± {cv_ll.std():.4f}")
    log.info(f"  CV Accuracy: {cv_acc.mean():.4f} ± {cv_acc.std():.4f}")

    # Final fit on all data
    log.info("Fitting final model on full dataset...")
    pipeline.fit(X, y)

    # In-sample metrics (for reference only — use CV metrics for real assessment)
    y_prob = pipeline.predict_proba(X)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    metrics = {
        "trained_at": datetime.utcnow().isoformat(),
        "n_samples": int(len(X)),
        "over_rate": float(y.mean()),
        "cv_roc_auc_mean":  float(cv_auc.mean()),
        "cv_roc_auc_std":   float(cv_auc.std()),
        "cv_log_loss_mean": float((-cv_ll).mean()),
        "cv_accuracy_mean": float(cv_acc.mean()),
        "train_accuracy":   float(accuracy_score(y, y_pred)),
        "train_roc_auc":    float(roc_auc_score(y, y_prob)),
        "train_brier":      float(brier_score_loss(y, y_prob)),
        "feature_count":    int(X.shape[1]),
        "calibrated":       calibrate,
    }

    if save:
        _save_model(pipeline, metrics)

    return pipeline, metrics


def _save_model(pipeline: Pipeline, metrics: dict):
    joblib.dump(pipeline, MODEL_PATH)
    with open(METADATA_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    log.info(f"Model saved to {MODEL_PATH}")
    log.info(f"Metadata saved to {METADATA_PATH}")


def load_model() -> Pipeline:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"No trained model at {MODEL_PATH}. Run train() first."
        )
    return joblib.load(MODEL_PATH)


def load_metadata() -> dict:
    if not METADATA_PATH.exists():
        return {}
    with open(METADATA_PATH) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Feature importance
# ---------------------------------------------------------------------------

def get_feature_importance(pipeline: Pipeline, top_n: int = 20) -> pd.DataFrame:
    """
    Extract XGBoost feature importances.
    Works with both calibrated and uncalibrated pipelines.
    """
    model = pipeline.named_steps["model"]
    # Unwrap calibration wrapper if present
    if hasattr(model, "estimator"):
        xgb_model = model.estimator
    elif hasattr(model, "calibrated_classifiers_"):
        # CalibratedClassifierCV fitted: average over folds
        importances = np.mean([
            clf.estimator.feature_importances_
            for clf in model.calibrated_classifiers_
        ], axis=0)
        return pd.DataFrame({
            "feature": ALL_FEATURES,
            "importance": importances,
        }).sort_values("importance", ascending=False).head(top_n)
    else:
        xgb_model = model

    imp = xgb_model.feature_importances_
    return pd.DataFrame({
        "feature": ALL_FEATURES[:len(imp)],
        "importance": imp,
    }).sort_values("importance", ascending=False).head(top_n)


# ---------------------------------------------------------------------------
# Evaluation on a held-out test set
# ---------------------------------------------------------------------------

def evaluate(
    pipeline: Pipeline,
    df: pd.DataFrame,
    confidence_threshold: float = 0.58,
) -> dict:
    """
    Evaluate model on a test DataFrame.
    Reports both raw accuracy and filtered accuracy (high-confidence bets only).

    confidence_threshold: only consider predictions where P(over) or P(under) > this.
    58% is a common sharp threshold — below that, edge is likely noise.
    """
    X, y = prepare_data(df)
    y_prob = pipeline.predict_proba(X)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    # Calibration quality
    fraction_pos, mean_pred = calibration_curve(y, y_prob, n_bins=10)

    # High-confidence filter
    high_conf_mask = (y_prob >= confidence_threshold) | (y_prob <= (1 - confidence_threshold))
    hc_acc = accuracy_score(y[high_conf_mask], y_pred[high_conf_mask]) if high_conf_mask.sum() > 0 else np.nan
    hc_count = int(high_conf_mask.sum())

    results = {
        "n_test": int(len(X)),
        "accuracy": float(accuracy_score(y, y_pred)),
        "roc_auc": float(roc_auc_score(y, y_prob)),
        "log_loss": float(log_loss(y, y_prob)),
        "brier_score": float(brier_score_loss(y, y_prob)),
        "high_conf_count": hc_count,
        "high_conf_pct": float(hc_count / len(X)),
        "high_conf_accuracy": float(hc_acc) if not np.isnan(hc_acc) else None,
        "calibration": {
            "fraction_pos": fraction_pos.tolist(),
            "mean_pred":    mean_pred.tolist(),
        },
    }

    log.info(f"Test accuracy:            {results['accuracy']:.4f}")
    log.info(f"Test ROC-AUC:             {results['roc_auc']:.4f}")
    log.info(f"High-confidence accuracy: {results['high_conf_accuracy']}")
    log.info(f"High-confidence bets:     {hc_count} / {len(X)} ({results['high_conf_pct']:.1%})")

    return results


# ---------------------------------------------------------------------------
# EV calculator
# ---------------------------------------------------------------------------

def expected_value(prob_over: float, american_odds: int = -110) -> float:
    """
    Calculate Expected Value for a bet given model probability and odds.

    For American odds -110: you risk $110 to win $100.
    Decimal odds = 100/110 + 1 = 1.909

    EV = (P_win × profit) - (P_lose × stake)
    Positive EV = take the bet. Negative EV = pass.
    """
    if american_odds < 0:
        implied_prob = abs(american_odds) / (abs(american_odds) + 100)
        win_amount = 100 / abs(american_odds)   # per $1 staked
    else:
        implied_prob = 100 / (american_odds + 100)
        win_amount = american_odds / 100

    ev = (prob_over * win_amount) - ((1 - prob_over) * 1.0)
    edge = prob_over - implied_prob
    return {
        "prob_over": prob_over,
        "implied_prob": implied_prob,
        "edge": edge,
        "ev_per_dollar": ev,
        "bet_recommended": ev > 0,
    }


def kelly_stake(prob_win: float, american_odds: int = -110, bankroll: float = 1000) -> dict:
    """
    Kelly Criterion: optimal fractional bet size.
    Full Kelly is aggressive — we use 0.25× (quarter Kelly) for safety.
    """
    if american_odds < 0:
        b = 100 / abs(american_odds)
    else:
        b = american_odds / 100

    q = 1 - prob_win
    full_kelly = (b * prob_win - q) / b
    quarter_kelly = max(0, full_kelly * 0.25)   # never negative
    stake = round(bankroll * quarter_kelly, 2)

    return {
        "full_kelly_fraction": round(full_kelly, 4),
        "quarter_kelly_fraction": round(quarter_kelly, 4),
        "recommended_stake": stake,
        "bankroll": bankroll,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("\n=== XGBoost TOTALS MODEL — DEMO ===\n")
    print("Generating synthetic training data for demonstration...")
    print("(In production: load from database.get_training_data() + merge with features)\n")

    np.random.seed(42)
    n = 500

    # Synthetic dataset that mimics real NBA distributions
    df_demo = pd.DataFrame({
        "home_pace":          np.random.normal(100, 2.5, n),
        "away_pace":          np.random.normal(100, 2.5, n),
        "pace_sum":           np.random.normal(200, 4,   n),
        "pace_diff":          np.abs(np.random.normal(0, 3, n)),
        "home_ortg":          np.random.normal(114, 4, n),
        "home_drtg":          np.random.normal(114, 4, n),
        "home_net_rtg":       np.random.normal(0, 5, n),
        "away_ortg":          np.random.normal(114, 4, n),
        "away_drtg":          np.random.normal(114, 4, n),
        "away_net_rtg":       np.random.normal(0, 5, n),
        "combined_ortg":      np.random.normal(228, 6, n),
        "combined_drtg":      np.random.normal(228, 6, n),
        "home_efg":           np.random.normal(0.535, 0.025, n),
        "away_efg":           np.random.normal(0.535, 0.025, n),
        "home_ts":            np.random.normal(0.585, 0.025, n),
        "away_ts":            np.random.normal(0.585, 0.025, n),
        "home_pts_last5":     np.random.normal(115, 8, n),
        "away_pts_last5":     np.random.normal(115, 8, n),
        "home_pts_last10":    np.random.normal(115, 6, n),
        "away_pts_last10":    np.random.normal(115, 6, n),
        "home_opp_pts_last5": np.random.normal(114, 8, n),
        "away_opp_pts_last5": np.random.normal(114, 8, n),
        "home_total_last5":   np.random.normal(229, 10, n),
        "away_total_last5":   np.random.normal(229, 10, n),
        "home_pts_trend":     np.random.normal(0, 4, n),
        "away_pts_trend":     np.random.normal(0, 4, n),
        "home_rest_days":     np.random.choice([1, 2, 3, 4], n, p=[0.25, 0.4, 0.25, 0.1]),
        "away_rest_days":     np.random.choice([1, 2, 3, 4], n, p=[0.25, 0.4, 0.25, 0.1]),
        "home_b2b":           np.random.binomial(1, 0.15, n),
        "away_b2b":           np.random.binomial(1, 0.15, n),
        "rest_advantage":     np.random.normal(0, 1.5, n),
        "consensus_total":    np.random.normal(228, 8, n),
        "line_movement":      np.random.normal(0, 1.5, n),
        "abs_line_movement":  np.abs(np.random.normal(0, 1.5, n)),
        "line_spread":        np.random.uniform(0.5, 2.5, n),
        "move_direction":     np.random.choice([-1, 0, 1], n),
    })

    # Synthetic target: over hits ~52% (realistic, slightly above 50%)
    # True signal: higher pace_sum and higher recent totals → more overs
    signal = (
        0.4 * (df_demo["pace_sum"] - 200) / 4
        + 0.3 * (df_demo["home_total_last5"] - 229) / 10
        + 0.2 * (df_demo["away_total_last5"] - 229) / 10
        + 0.1 * df_demo["line_movement"] / 1.5
        + np.random.normal(0, 1, n)         # noise
    )
    df_demo[TARGET_COL] = (signal > 0).astype(int)

    print(f"Synthetic dataset: {len(df_demo)} games | {df_demo[TARGET_COL].mean():.1%} overs\n")

    # Train / test split (time-ordered, no shuffle)
    split = int(len(df_demo) * 0.8)
    train_df = df_demo.iloc[:split]
    test_df  = df_demo.iloc[split:]

    print("Training model...")
    pipeline, metrics = train(train_df, calibrate=True, save=True)

    print("\nModel metrics:")
    for k, v in metrics.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        elif isinstance(v, (int, str, bool)):
            print(f"  {k}: {v}")

    print("\nEvaluating on held-out test set...")
    test_metrics = evaluate(pipeline, test_df)

    print("\nFeature importance (top 10):")
    fi = get_feature_importance(pipeline, top_n=10)
    print(fi.to_string(index=False))

    # EV demo
    print("\nEV calculation demo:")
    sample_prob = 0.60
    ev = expected_value(sample_prob, american_odds=-110)
    kelly = kelly_stake(sample_prob, american_odds=-110, bankroll=1000)
    print(f"  Model says P(over) = {sample_prob:.0%}")
    print(f"  Market implied:     {ev['implied_prob']:.1%}")
    print(f"  Edge:               {ev['edge']:+.1%}")
    print(f"  EV per $1:          ${ev['ev_per_dollar']:.4f}")
    print(f"  Recommended stake:  ${kelly['recommended_stake']} (quarter Kelly)")
    print(f"  Bet recommended:    {'✓ YES' if ev['bet_recommended'] else '✗ NO'}")
