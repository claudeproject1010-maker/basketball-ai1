import { useState, useEffect, useRef } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

// ── League config ──────────────────────────────────────────────────────────
const LC = {
  basketball_nba:                 { label: "NBA",        color: "#3b82f6" },
  basketball_wnba:                { label: "WNBA",       color: "#f97316" },
  basketball_ncaab:               { label: "NCAA M",     color: "#8b5cf6" },
  basketball_ncaaw:               { label: "NCAA W",     color: "#ec4899" },
  basketball_nba_summer_league:   { label: "NBA Summer", color: "#06b6d4" },
  basketball_euroleague:          { label: "EuroLeague", color: "#14b8a6" },
  basketball_eurocup:             { label: "EuroCup",    color: "#0ea5e9" },
  basketball_greece_basket_league:{ label: "Greece",     color: "#3b82f6" },
  basketball_spain_acb:           { label: "Spain ACB",  color: "#ef4444" },
  basketball_italy_lega:          { label: "Italy",      color: "#16a34a" },
  basketball_france_pro_a:        { label: "France",     color: "#2563eb" },
  basketball_germany_bbl:         { label: "Germany",    color: "#eab308" },
  basketball_turkey_bsl:          { label: "Turkey",     color: "#dc2626" },
  basketball_lithuania_lkl:       { label: "Lithuania",  color: "#15803d" },
  basketball_nbl:                 { label: "NBL AUS",    color: "#f59e0b" },
  basketball_cba:                 { label: "CBA",        color: "#ef4444" },
  basketball_fiba:                { label: "FIBA",       color: "#6366f1" },
};
const DLC = { label: "Basketball", color: "#6366f1" };

// ── Confidence colour system ────────────────────────────────────────────────
function confColor(pct) {
  if (pct >= 90) return { ring: "#22c55e", glow: "rgba(34,197,94,0.35)", label: "Strong",  bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)"  };
  if (pct >= 80) return { ring: "#3b82f6", glow: "rgba(59,130,246,0.35)", label: "Good",    bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)"  };
  if (pct >= 70) return { ring: "#f97316", glow: "rgba(249,115,22,0.35)", label: "Moderate",bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.35)"  };
  return           { ring: "#ef4444", glow: "rgba(239,68,68,0.35)",  label: "Avoid",   bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)"   };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const pct  = (n, d=1) => `${(n * 100).toFixed(d)}%`;
const sign = (n, d=1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%`;

function formatDate(t) {
  if (!t) return "";
  try {
    const d = new Date(t);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return t; }
}
function formatTime(t) {
  if (!t) return "";
  try {
    return new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ── Animated confidence ring ────────────────────────────────────────────────
function ConfRing({ prob, size = 80 }) {
  const confPct = Math.round(prob * 100);
  const cc = confColor(confPct);
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (confPct / 100) * circ;
  const fontSize = size >= 80 ? 20 : size >= 60 ? 16 : 13;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={cc.ring}
          strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${cc.ring})`, transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        <span style={{ fontSize, fontWeight: 800, color: cc.ring, lineHeight: 1, letterSpacing: "-1px" }}>{confPct}%</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em", marginTop: 2 }}>CONF</span>
      </div>
    </div>
  );
}

// ── Mock data (fallback when no live feed) ──────────────────────────────────
const MOCK = [
  { game_id:"d1", league:"basketball_wnba",  matchup:"Connecticut Sun @ Atlanta Dream",      home_team:"Atlanta Dream",     away_team:"Connecticut Sun",     commence_time:"2026-06-03T23:00:00Z", line:159.5, prob_over:0.64, prob_under:0.36, play:"OVER",  play_probability:0.64, confidence:"MEDIUM", edge:0.042,  ev_per_dollar:0.038, kelly_stake:8.25,  line_movement:1.5,  mc_mean:162.0, mc_std:12.0, mc_p10:143.9, mc_p90:174.7, mc_home:81.0, mc_away:81.0, model:"statistical" },
  { game_id:"d2", league:"basketball_nba",   matchup:"New York Knicks @ San Antonio Spurs",  home_team:"San Antonio Spurs", away_team:"New York Knicks",     commence_time:"2026-06-04T01:30:00Z", line:218.0, prob_over:0.91, prob_under:0.09, play:"OVER",  play_probability:0.91, confidence:"HIGH",   edge:0.088,  ev_per_dollar:0.12,  kelly_stake:22.5,  line_movement:2.0,  mc_mean:221.4, mc_std:11.5, mc_p10:206.3, mc_p90:236.5, mc_home:112.0,mc_away:109.4,model:"statistical" },
  { game_id:"d3", league:"basketball_nba",   matchup:"Boston Celtics @ Miami Heat",          home_team:"Miami Heat",        away_team:"Boston Celtics",      commence_time:"2026-06-04T00:00:00Z", line:214.5, prob_over:0.85, prob_under:0.15, play:"OVER",  play_probability:0.85, confidence:"HIGH",   edge:0.072,  ev_per_dollar:0.093, kelly_stake:18.0,  line_movement:0.5,  mc_mean:217.3, mc_std:12.0, mc_p10:201.9, mc_p90:232.7, mc_home:108.0,mc_away:109.3,model:"statistical" },
  { game_id:"d4", league:"basketball_wnba",  matchup:"Chicago Sky @ Washington Mystics",     home_team:"Washington Mystics",away_team:"Chicago Sky",         commence_time:"2026-06-03T23:00:00Z", line:160.5, prob_over:0.50, prob_under:0.50, play:"PASS",  play_probability:0.50, confidence:"LOW",    edge:-0.008, ev_per_dollar:-0.015,kelly_stake:null,  line_movement:0.5,  mc_mean:160.5, mc_std:12.0, mc_p10:145.1, mc_p90:175.9, mc_home:80.2, mc_away:80.3, model:"statistical" },
  { game_id:"d5", league:"basketball_euroleague", matchup:"Real Madrid @ Fenerbahçe",        home_team:"Fenerbahçe",        away_team:"Real Madrid",         commence_time:"2026-06-05T17:00:00Z", line:155.0, prob_over:0.78, prob_under:0.22, play:"OVER",  play_probability:0.78, confidence:"MEDIUM", edge:0.055,  ev_per_dollar:0.065, kelly_stake:11.0,  line_movement:-0.5, mc_mean:157.8, mc_std:11.2, mc_p10:143.5, mc_p90:172.1, mc_home:78.0, mc_away:79.8, model:"statistical" },
  { game_id:"d6", league:"basketball_nba",   matchup:"Golden State Warriors @ Denver Nuggets",home_team:"Denver Nuggets",   away_team:"Golden State Warriors",commence_time:"2026-06-04T03:00:00Z", line:226.0, prob_over:0.32, prob_under:0.68, play:"UNDER", play_probability:0.68, confidence:"MEDIUM", edge:0.031,  ev_per_dollar:0.041, kelly_stake:7.5,   line_movement:-1.0, mc_mean:223.5, mc_std:12.5, mc_p10:207.5, mc_p90:239.5, mc_home:113.0,mc_away:110.5,model:"statistical" },
];

const MOCK_HIST = [
  { date:"May 27", bets:3, wins:2, losses:1, pnl:0.82,  correct:true  },
  { date:"May 28", bets:2, wins:2, losses:0, pnl:1.82,  correct:true  },
  { date:"May 29", bets:4, wins:2, losses:2, pnl:-0.18, correct:false },
  { date:"May 30", bets:3, wins:1, losses:2, pnl:-1.09, correct:false },
  { date:"May 31", bets:2, wins:2, losses:0, pnl:1.82,  correct:true  },
  { date:"Jun 1",  bets:5, wins:3, losses:2, pnl:0.73,  correct:true  },
  { date:"Jun 2",  bets:3, wins:2, losses:1, pnl:0.82,  correct:true  },
];

// ── Model dots component ────────────────────────────────────────────────────
function ModelDots({ prob }) {
  const score = prob >= 0.90 ? 5 : prob >= 0.80 ? 4 : prob >= 0.70 ? 3 : prob >= 0.57 ? 2 : 1;
  const cc = confColor(Math.round(prob * 100));
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%",
          background: i <= score ? cc.ring : "rgba(255,255,255,0.12)",
          boxShadow: i <= score ? `0 0 5px ${cc.ring}` : "none",
          transition: "all 0.3s",
        }}/>
      ))}
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>{score}/5</span>
    </div>
  );
}

// ── Prediction Card ─────────────────────────────────────────────────────────
function PredCard({ pred, expanded, onToggle }) {
  const lc = LC[pred.league] || DLC;
  const isAct = pred.play !== "PASS";
  const confPct = Math.round(pred.play_probability * 100);
  const cc = confColor(confPct);
  const [away, home] = pred.matchup.includes(" @ ")
    ? pred.matchup.split(" @ ")
    : [pred.matchup, ""];

  return (
    <div
      onClick={onToggle}
      style={{
        background: expanded
          ? `linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%)`
          : "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${expanded ? cc.border : "rgba(255,255,255,0.08)"}`,
        borderLeft: `3px solid ${isAct ? cc.ring : "rgba(255,255,255,0.15)"}`,
        borderRadius: 16,
        padding: "18px 20px",
        marginBottom: 10,
        cursor: "pointer",
        opacity: isAct ? 1 : 0.55,
        transition: "all 0.25s ease",
        boxShadow: expanded ? `0 8px 32px ${cc.glow}` : isAct ? `0 2px 12px rgba(0,0,0,0.3)` : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow overlay on expand */}
      {expanded && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 16,
          background: `radial-gradient(ellipse at 80% 50%, ${cc.glow} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}/>
      )}

      {/* League + time row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{
          background: `${lc.color}22`, border: `1px solid ${lc.color}55`,
          color: lc.color, fontSize: 10, fontWeight: 800,
          padding: "2px 10px", borderRadius: 20, letterSpacing: "0.06em",
        }}>{lc.label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{formatDate(pred.commence_time)}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>·</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{formatTime(pred.commence_time)}</span>
        {pred.line_movement !== 0 && pred.line_movement != null && (
          <span style={{ fontSize: 10, color: pred.line_movement > 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
            {pred.line_movement > 0 ? "▲" : "▼"} {Math.abs(pred.line_movement).toFixed(1)} moved
          </span>
        )}
      </div>

      {/* Main row: teams + recommendation + ring */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Teams */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>{away}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 2 }}>@</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{home}</div>
        </div>

        {/* Recommendation block */}
        {isAct && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.4)", marginBottom: 4,
            }}>PICK</div>
            <div style={{
              fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px",
              color: pred.play === "OVER" ? "#60a5fa" : "#f97316",
              lineHeight: 1,
            }}>
              {pred.play === "OVER" ? "↑ OVER" : "↓ UNDER"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              {pred.line}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              Proj. {pred.mc_mean?.toFixed(1)}
            </div>
          </div>
        )}

        {!isAct && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.2)" }}>PASS</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{pred.line}</div>
          </div>
        )}

        {/* Confidence ring */}
        <ConfRing prob={pred.play_probability} size={isAct ? 80 : 64} />
      </div>

      {/* Bottom row: model dots + confidence label */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 14, paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.05em" }}>MODEL AGREEMENT</div>
          <ModelDots prob={pred.play_probability} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-block",
            background: cc.bg, border: `1px solid ${cc.border}`,
            color: cc.ring, fontSize: 10, fontWeight: 800,
            padding: "3px 12px", borderRadius: 20, letterSpacing: "0.08em",
          }}>{cc.label.toUpperCase()}</div>
          {isAct && pred.kelly_stake && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              Kelly: <span style={{ color: cc.ring, fontWeight: 700 }}>${pred.kelly_stake}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          marginTop: 16, background: "rgba(0,0,0,0.3)",
          borderRadius: 12, padding: "16px",
          borderTop: `1px solid ${cc.border}`,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              ["Proj. Total", pred.mc_mean?.toFixed(1)],
              ["Std Dev",     `±${pred.mc_std?.toFixed(1)}`],
              ["Low (10th)", pred.mc_p10?.toFixed(1)],
              ["High (90th)", pred.mc_p90?.toFixed(1)],
              ["Home Proj.", pred.mc_home?.toFixed(1)],
              ["Away Proj.", pred.mc_away?.toFixed(1)],
            ].map(([label, val]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 10,
                padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em", marginBottom: 4 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{val || "—"}</div>
              </div>
            ))}
          </div>

          {/* Probability bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
              <span>OVER {pct(pred.prob_over)}</span>
              <span>UNDER {pct(pred.prob_under)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pred.prob_over * 100}%`,
                background: `linear-gradient(90deg, #60a5fa, #3b82f6)`,
                borderRadius: 99, transition: "width 0.6s ease",
              }}/>
            </div>
          </div>

          {/* MC range visualiser */}
          {pred.mc_mean && (() => {
            const mn = pred.mc_p10 || 0, mx = pred.mc_p90 || 0, rng = mx - mn || 1;
            const lpos = Math.min(Math.max((pred.line - mn) / rng, 0), 1) * 100;
            const mpos = Math.min(Math.max((pred.mc_mean - mn) / rng, 0), 1) * 100;
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em", marginBottom: 6 }}>
                  SIMULATION RANGE · {mn.toFixed(0)} – {mx.toFixed(0)} pts
                </div>
                <div style={{ position: "relative", height: 20 }}>
                  <div style={{ position: "absolute", top: 7, left: 0, right: 0, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}/>
                  <div style={{ position: "absolute", top: 2, left: `${mpos}%`, width: 3, height: 16, background: cc.ring, borderRadius: 2, transform: "translateX(-50%)", boxShadow: `0 0 8px ${cc.ring}` }}/>
                  <div style={{ position: "absolute", top: 2, left: `${lpos}%`, width: 2, height: 16, background: "#f59e0b", borderRadius: 2, transform: "translateX(-50%)" }}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                  <span style={{ color: cc.ring }}>◆ Mean {pred.mc_mean.toFixed(1)}</span>
                  <span style={{ color: "#f59e0b" }}>| Line {pred.line}</span>
                  <span>±{pred.mc_std?.toFixed(1)}</span>
                </div>
              </div>
            );
          })()}

          {/* EV row */}
          {isAct && (
            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap",
              background: `${cc.bg}`, border: `1px solid ${cc.border}`,
              borderRadius: 10, padding: "10px 14px",
            }}>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EDGE</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: pred.edge > 0 ? "#4ade80" : "#f87171" }}>{sign(pred.edge)}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EV / DOLLAR</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: pred.ev_per_dollar > 0 ? "#4ade80" : "#f87171" }}>${pred.ev_per_dollar?.toFixed(3)}</div>
              </div>
              {pred.kelly_stake && (
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>KELLY STAKE</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: cc.ring }}>${pred.kelly_stake}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>MODEL</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{pred.model}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History Tab ─────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  const totalBets = history.reduce((s, h) => s + h.bets, 0);
  const totalWins = history.reduce((s, h) => s + h.wins, 0);
  const totalPnL  = history.reduce((s, h) => s + h.pnl, 0);
  const winRate   = totalBets > 0 ? totalWins / totalBets : 0;

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          ["7-Day Record", `${totalWins}W – ${totalBets - totalWins}L`, winRate >= 0.55 ? "#4ade80" : winRate >= 0.5 ? "#fbbf24" : "#f87171"],
          ["Win Rate",     `${(winRate * 100).toFixed(1)}%`,            winRate >= 0.55 ? "#4ade80" : "#fbbf24"],
          ["P&L",          `${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}u`, totalPnL >= 0 ? "#4ade80" : "#f87171"],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px",
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 6 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Daily log */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {history.map((h, i) => {
          const wr = h.wins / (h.bets || 1);
          const col = wr >= 0.6 ? "#4ade80" : wr >= 0.5 ? "#fbbf24" : "#f87171";
          return (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{ width: 56, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{h.date}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{h.bets}</span> bets
                  </span>
                  <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>{h.wins}W</span>
                  <span style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>{h.losses}L</span>
                </div>
                {/* Mini win bar */}
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.07)", marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${wr * 100}%`, background: col, borderRadius: 99 }}/>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                  {h.pnl >= 0 ? "+" : ""}{h.pnl.toFixed(2)}u
                </div>
                <div style={{
                  fontSize: 9, marginTop: 4,
                  color: col, fontWeight: 700, letterSpacing: "0.06em",
                }}>{(wr * 100).toFixed(0)}% WR</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: "rgba(255,255,255,0.15)", textAlign: "center" }}>
        Showing last {history.length} days · Auto-updated nightly
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [preds,     setPreds]     = useState(MOCK);
  const [history,   setHistory]   = useState(MOCK_HIST);
  const [genAt,     setGenAt]     = useState(null);
  const [live,      setLive]      = useState(false);
  const [activeTab, setActiveTab] = useState("predictions");  // predictions | history | analytics
  const [filter,    setFilter]    = useState("ALL");          // ALL | OVER | UNDER | STRONG | MEDIUM | AVOID
  const [leagueFilter, setLeagueFilter] = useState("ALL");
  const [topN,      setTopN]      = useState("ALL");          // ALL | 10 | 20
  const [sortBy,    setSortBy]    = useState("confidence");   // confidence | date | ev
  const [expanded,  setExpanded]  = useState(null);
  const [menuOpen,  setMenuOpen]  = useState(false);

  // Load live data
  useEffect(() => {
    (async () => {
      const [pd, hd] = await Promise.all([loadJSON("/predictions.json"), loadJSON("/history.json")]);
      if (pd?.predictions?.length) { setPreds(pd.predictions); setGenAt(pd.generated_at); setLive(true); }
      if (hd?.length) setHistory(hd);
    })();
  }, []);

  const leagues = [...new Set(preds.map(p => p.league).filter(Boolean))];

  // Derived stats for header
  const actionable   = preds.filter(p => p.play !== "PASS");
  const strongPicks  = preds.filter(p => Math.round(p.play_probability * 100) >= 80 && p.play !== "PASS");
  const mediumPicks  = preds.filter(p => Math.round(p.play_probability * 100) >= 70 && Math.round(p.play_probability * 100) < 80 && p.play !== "PASS");
  const avoidPicks   = preds.filter(p => p.play === "PASS");
  const totalPnL     = history.reduce((s, h) => s + h.pnl, 0);
  const totalBets    = history.reduce((s, h) => s + h.bets, 0);
  const totalWins    = history.reduce((s, h) => s + h.wins, 0);
  const modelAcc     = totalBets > 0 ? (totalWins / totalBets * 100).toFixed(1) + "%" : "—";

  // Filtering
  let filtered = [...preds];
  if (filter === "OVER")   filtered = filtered.filter(p => p.play === "OVER");
  if (filter === "UNDER")  filtered = filtered.filter(p => p.play === "UNDER");
  if (filter === "STRONG") filtered = filtered.filter(p => Math.round(p.play_probability * 100) >= 80 && p.play !== "PASS");
  if (filter === "MEDIUM") filtered = filtered.filter(p => Math.round(p.play_probability * 100) >= 70 && Math.round(p.play_probability * 100) < 80);
  if (filter === "AVOID")  filtered = filtered.filter(p => p.play === "PASS");
  if (leagueFilter !== "ALL") filtered = filtered.filter(p => p.league === leagueFilter);

  // Sorting
  if (sortBy === "confidence") filtered.sort((a, b) => b.play_probability - a.play_probability);
  if (sortBy === "date")       filtered.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
  if (sortBy === "ev")         filtered.sort((a, b) => (b.ev_per_dollar || -99) - (a.ev_per_dollar || -99));

  // Top N
  if (topN !== "ALL") filtered = filtered.slice(0, parseInt(topN));

  // Sidebar items
  const sidebar = [
    { id: "predictions", icon: "ti-chart-bar",   label: "Predictions" },
    { id: "history",     icon: "ti-history",      label: "History"     },
    { id: "analytics",   icon: "ti-device-analytics", label: "Analytics" },
  ];

  const glass = {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
  };

  // ── Render ──
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #060d1f 0%, #0b1629 40%, #060d1f 100%)",
      color: "#e2e8f0",
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      display: "flex",
    }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", top: -180, left: -180, width: 500, height: 500, borderRadius: "50%", background: "rgba(59,130,246,0.08)", filter: "blur(100px)", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", bottom: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(99,102,241,0.07)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }}/>

      {/* ── Sidebar ── */}
      <div style={{
        width: 220, flexShrink: 0,
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column",
        padding: "28px 0", position: "sticky", top: 0, height: "100vh",
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: "0 20px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              🏀
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.5px", color: "#f1f5f9" }}>BASKETBALL</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}>AI INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#22c55e" : "#64748b", boxShadow: live ? "0 0 6px #22c55e" : "none" }}/>
            <span style={{ fontSize: 10, color: live ? "#4ade80" : "#64748b" }}>{live ? "Live Data" : "Demo Mode"}</span>
          </div>
        </div>

        {/* Nav */}
        {sidebar.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 20px", margin: "2px 8px", borderRadius: 10,
            background: activeTab === id ? "rgba(59,130,246,0.15)" : "transparent",
            border: activeTab === id ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
            color: activeTab === id ? "#60a5fa" : "rgba(255,255,255,0.4)",
            fontSize: 13, fontWeight: activeTab === id ? 700 : 400,
            cursor: "pointer", transition: "all 0.2s", textAlign: "left",
            letterSpacing: "0.01em",
          }}>
            <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true"/>
            {label}
          </button>
        ))}

        {/* Bottom: update time */}
        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: 1.6 }}>
            {genAt
              ? `Updated ${new Date(genAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${new Date(genAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
              : "Auto-updates daily 9AM ET"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", marginTop: 4 }}>Monte Carlo · XGBoost · Kelly</div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0, padding: "28px 28px 60px", overflowY: "auto", position: "relative", zIndex: 1 }}>

        {/* ── PREDICTIONS TAB ── */}
        {activeTab === "predictions" && (
          <>
            {/* Page title */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px", color: "#f1f5f9", margin: 0 }}>
                Today's Best Over/Under Picks
              </h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: "6px 0 0" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>

            {/* Summary KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
              {[
                ["Games Analyzed", preds.length,       "#f1f5f9",  "ti-basketball"],
                ["Strong Picks",   strongPicks.length,  "#22c55e",  "ti-trending-up"],
                ["Medium Picks",   mediumPicks.length,  "#3b82f6",  "ti-equal"],
                ["Avoid",          avoidPicks.length,   "#ef4444",  "ti-x"],
                ["Model Accuracy", modelAcc,            "#a78bfa",  "ti-target"],
              ].map(([label, val, color, icon]) => (
                <div key={label} style={{ ...glass, padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 14, color }} aria-hidden="true"/>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>{label.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: "-1px", lineHeight: 1 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Controls bar */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Filter pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["ALL", "OVER", "UNDER", "STRONG", "MEDIUM", "AVOID"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    background: filter === f ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${filter === f ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                    color: filter === f ? "#60a5fa" : "rgba(255,255,255,0.4)",
                    padding: "6px 14px", borderRadius: 20,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.15s", letterSpacing: "0.05em",
                  }}>{f}</button>
                ))}
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }}/>

              {/* Sort dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sort</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f1f5f9", borderRadius: 8, padding: "6px 10px", fontSize: 11,
                  cursor: "pointer", outline: "none",
                }}>
                  <option value="confidence">Confidence</option>
                  <option value="date">Date</option>
                  <option value="ev">Expected Value</option>
                </select>
              </div>

              {/* Top N dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Show</span>
                <select value={topN} onChange={e => setTopN(e.target.value)} style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f1f5f9", borderRadius: 8, padding: "6px 10px", fontSize: 11,
                  cursor: "pointer", outline: "none",
                }}>
                  <option value="ALL">All Picks</option>
                  <option value="10">Best 10</option>
                  <option value="20">Best 20</option>
                </select>
              </div>
            </div>

            {/* League filter pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={() => setLeagueFilter("ALL")} style={{
                background: leagueFilter === "ALL" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${leagueFilter === "ALL" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)"}`,
                color: leagueFilter === "ALL" ? "#f1f5f9" : "rgba(255,255,255,0.35)",
                padding: "5px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
              }}>All Leagues</button>
              {leagues.map(l => {
                const lc = LC[l] || DLC;
                const active = leagueFilter === l;
                return (
                  <button key={l} onClick={() => setLeagueFilter(active ? "ALL" : l)} style={{
                    background: active ? `${lc.color}22` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? lc.color : "rgba(255,255,255,0.07)"}`,
                    color: active ? lc.color : "rgba(255,255,255,0.3)",
                    padding: "5px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: lc.color }}/>
                    {lc.label}
                    <span style={{ color: "rgba(255,255,255,0.2)" }}>({preds.filter(p => p.league === l).length})</span>
                  </button>
                );
              })}
            </div>

            {/* Cards */}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", padding: "64px 0", fontSize: 14 }}>
                No games match this filter.
              </div>
            )}
            {filtered.map(pred => (
              <PredCard
                key={pred.game_id}
                pred={pred}
                expanded={expanded === pred.game_id}
                onToggle={() => setExpanded(expanded === pred.game_id ? null : pred.game_id)}
              />
            ))}

            <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.12)", marginTop: 16 }}>
              Statistical model · Monte Carlo simulation · Quarter Kelly sizing · Not financial advice
            </div>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px", color: "#f1f5f9", margin: 0 }}>Prediction History</h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: "6px 0 0" }}>
                Graded daily results — actual outcomes vs model predictions
              </p>
            </div>
            <HistoryTab history={history} />
          </>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px", color: "#f1f5f9", margin: 0 }}>Analytics</h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: "6px 0 0" }}>
                Model performance by league, confidence tier, and direction
              </p>
            </div>

            {/* Confidence distribution */}
            <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 16 }}>CONFIDENCE DISTRIBUTION</div>
              {[
                { label: "Strong (≥90%)", count: preds.filter(p => Math.round(p.play_probability*100) >= 90 && p.play !== "PASS").length, color: "#22c55e", total: actionable.length },
                { label: "Good (80–89%)", count: preds.filter(p => { const c = Math.round(p.play_probability*100); return c >= 80 && c < 90 && p.play !== "PASS"; }).length, color: "#3b82f6", total: actionable.length },
                { label: "Moderate (70–79%)", count: preds.filter(p => { const c = Math.round(p.play_probability*100); return c >= 70 && c < 80 && p.play !== "PASS"; }).length, color: "#f97316", total: actionable.length },
                { label: "Avoid (<70%)", count: avoidPicks.length, color: "#ef4444", total: preds.length },
              ].map(({ label, count, color, total }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                    <span style={{ color, fontWeight: 700 }}>{count} picks</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${total > 0 ? (count / total) * 100 : 0}%`, background: color, borderRadius: 99, transition: "width 0.5s" }}/>
                  </div>
                </div>
              ))}
            </div>

            {/* League breakdown */}
            <div style={{ ...glass, padding: 20 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 16 }}>GAMES BY LEAGUE</div>
              {leagues.map(l => {
                const lc = LC[l] || DLC;
                const count = preds.filter(p => p.league === l).length;
                const bets  = preds.filter(p => p.league === l && p.play !== "PASS").length;
                return (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: lc.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>{lc.label}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{count} games</span>
                    <span style={{ fontSize: 11, color: lc.color, fontWeight: 700 }}>{bets} bets</span>
                  </div>
                );
              })}
              {leagues.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>No data yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
