import { useState, useEffect, useRef } from "react";

// ─── Data fetcher ──────────────────────────────────────────────────────────
async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

// ─── League colours — keyed by league_name (what the API actually returns) ──
const LEAGUE_COLOR = {
  "NBA":                       "#3b82f6",
  "WNBA":                      "#f97316",
  "NCAA Men":                  "#8b5cf6",
  "NCAA Women":                "#ec4899",
  "NBA Summer":                "#06b6d4",
  "EuroLeague":                "#14b8a6",
  "EuroCup":                   "#0ea5e9",
  "Greece Basket":             "#3b82f6",
  "Spain ACB": "#ef4444", "ACB": "#ef4444",
  "Italy Lega": "#22c55e", "Lega A": "#22c55e",
  "France Pro A": "#2563eb", "Pro A": "#2563eb",
  "Germany BBL": "#eab308", "BBL": "#eab308",
  "Turkey BSL":                "#dc2626",
  "Lithuania LKL":             "#15803d",
  "NBL Australia": "#f59e0b", "NBL": "#f59e0b",
  "CBA China":                 "#ef4444",
  "FIBA":                      "#6366f1",
  "BSN":                       "#a855f7",
  "LNB":                       "#0ea5e9",
  "Liga Uruguaya":             "#4ade80",
  "MPBL":                      "#f59e0b",
  "VBA":                       "#06b6d4",
  "Division 1":                "#8b5cf6",
  "ABA League":                "#ef4444",
  "Superliga":                 "#3b82f6",
  "Liga Leumit":               "#60a5fa",
  "Super League":              "#f97316",
  "Prva A Liga":               "#a78bfa",
  "NBB":                       "#22c55e",
  "LBF WOmen":                 "#ec4899",
  "CEBL":                      "#ef4444",
  "BNXT Pro Basketball League":"#14b8a6",
};
function leagueColor(pred) {
  const name = pred.league_name || pred.league || "";
  return LEAGUE_COLOR[name] || "#6366f1";
}
function leagueLabel(pred) {
  const name = pred.league_name || pred.league || "Basketball";
  if (name.length > 12) return name.slice(0, 11) + "…";
  return name;
}

// ─── Confidence colour tiers ──────────────────────────────────────────────
function confColor(pct) {
  if (pct >= 90) return { ring:"#22c55e", glow:"rgba(34,197,94,0.4)",  label:"Strong",   bg:"rgba(34,197,94,0.15)",  border:"rgba(34,197,94,0.4)"  };
  if (pct >= 80) return { ring:"#3b82f6", glow:"rgba(59,130,246,0.4)", label:"Good",     bg:"rgba(59,130,246,0.15)", border:"rgba(59,130,246,0.4)" };
  if (pct >= 70) return { ring:"#f97316", glow:"rgba(249,115,22,0.4)", label:"Moderate", bg:"rgba(249,115,22,0.15)", border:"rgba(249,115,22,0.4)" };
  return           { ring:"#ef4444", glow:"rgba(239,68,68,0.4)",  label:"Avoid",    bg:"rgba(239,68,68,0.15)",  border:"rgba(239,68,68,0.4)"  };
}

// ─── Formatters ───────────────────────────────────────────────────────────
function fmtDate(t) {
  if (!t) return "";
  try { return new Date(t).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
  catch { return ""; }
}
function fmtTime(t) {
  if (!t) return "";
  try { return new Date(t).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}); }
  catch { return ""; }
}
function fmtSign(n) { return `${n>=0?"+":""}${(n*100).toFixed(1)}%`; }

// ─── SVG Confidence Ring ─────────────────────────────────────────────────
function ConfRing({ prob, size = 76 }) {
  const pct  = Math.round(prob * 100);
  const cc   = confColor(pct);
  const r    = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const fs   = size >= 70 ? 18 : 14;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)", display:"block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={7}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cc.ring} strokeWidth={7}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 5px ${cc.ring})` }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:0 }}>
        <span style={{ fontSize:fs, fontWeight:900, color:cc.ring, lineHeight:1, letterSpacing:"-1px" }}>{pct}%</span>
        <span style={{ fontSize:8, color:"rgba(255,255,255,0.35)", letterSpacing:"0.08em", marginTop:1 }}>CONF</span>
      </div>
    </div>
  );
}

// ─── Model agreement dots ─────────────────────────────────────────────────
function ModelDots({ prob }) {
  const score = prob>=0.90?5 : prob>=0.80?4 : prob>=0.70?3 : prob>=0.57?2 : 1;
  const cc = confColor(Math.round(prob * 100));
  return (
    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width:6, height:6, borderRadius:"50%",
          background: i <= score ? cc.ring : "rgba(255,255,255,0.1)",
          boxShadow:  i <= score ? `0 0 4px ${cc.ring}` : "none",
        }}/>
      ))}
      <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)", marginLeft:3 }}>{score}/5</span>
    </div>
  );
}

// ─── Single Prediction Card ───────────────────────────────────────────────
function PredCard({ pred, expanded, onToggle }) {
  const isAct    = pred.play !== "PASS";
  const pct      = Math.round(pred.play_probability * 100);
  const cc       = confColor(pct);
  const lColor   = leagueColor(pred);
  const lLabel   = leagueLabel(pred);
  const isGraded = pred.graded;
  const correct  = pred.correct;

  const parts = pred.matchup?.split(" @ ") ?? [];
  const away  = parts[0] ?? pred.matchup ?? "";
  const home  = parts[1] ?? "";

  // Card background — solid dark, not transparent blur
  const bgCard = isAct
    ? expanded ? "#0f1d35" : "#0d1829"
    : "#080e1a";

  return (
    <div
      onClick={onToggle}
      style={{
        background:   bgCard,
        border:       `1px solid ${expanded ? cc.border : isAct ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}`,
        borderLeft:   `3px solid ${isAct ? cc.ring : "rgba(255,255,255,0.12)"}`,
        borderRadius: 14,
        padding:      "16px 18px",
        marginBottom: 8,
        cursor:       "pointer",
        opacity:      isAct ? 1 : 0.6,
        transition:   "border-color 0.2s, background 0.2s",
        boxShadow:    expanded && isAct ? `0 0 24px ${cc.glow}` : "none",
      }}
    >
      {/* Row 1: league + date + grade badge */}
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:11, flexWrap:"wrap" }}>
        <span style={{
          fontSize:10, fontWeight:800, letterSpacing:"0.06em",
          background:`${lColor}20`, border:`1px solid ${lColor}50`,
          color:lColor, padding:"2px 9px", borderRadius:20,
        }}>{lLabel}</span>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{fmtDate(pred.commence_time)}</span>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.2)" }}>·</span>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{fmtTime(pred.commence_time)}</span>
        {pred.line_movement != null && pred.line_movement !== 0 && (
          <span style={{ fontSize:10, fontWeight:700,
            color: pred.line_movement > 0 ? "#4ade80" : "#f87171" }}>
            {pred.line_movement > 0 ? "▲" : "▼"} {Math.abs(pred.line_movement).toFixed(1)}
          </span>
        )}
        {isGraded && isAct && (
          <span style={{
            marginLeft:"auto", fontSize:10, fontWeight:800, padding:"2px 10px", borderRadius:20,
            background: correct === true ? "rgba(34,197,94,0.18)" : correct === false ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.07)",
            border:     correct === true ? "1px solid #22c55e" : correct === false ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.15)",
            color:      correct === true ? "#4ade80" : correct === false ? "#f87171" : "rgba(255,255,255,0.5)",
          }}>
            {correct === true ? "✓ WIN" : correct === false ? "✗ LOSS" : "PUSH"}
          </span>
        )}
        {!isGraded && isAct && (
          <span style={{ marginLeft:"auto", fontSize:10, color:"rgba(255,255,255,0.25)", fontStyle:"italic" }}>
            Pending
          </span>
        )}
      </div>

      {/* Row 2: matchup | pick | ring */}
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        {/* Teams */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginBottom:1,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{away}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.2)", margin:"2px 0" }}>@</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#f1f5f9",
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{home}</div>
          {isGraded && pred.actual_total != null && (
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:5 }}>
              Final: <span style={{ color:"#f1f5f9", fontWeight:700 }}>{pred.actual_total}</span>
              {" "}vs line {pred.line}
            </div>
          )}
        </div>

        {/* Pick block */}
        {isAct ? (
          <div style={{ textAlign:"center", flexShrink:0, minWidth:72 }}>
            <div style={{ fontSize:9, fontWeight:800, letterSpacing:"0.1em",
              color:"rgba(255,255,255,0.4)", marginBottom:4 }}>PICK</div>
            <div style={{ fontSize:20, fontWeight:900, lineHeight:1,
              color: pred.play === "OVER" ? "#60a5fa" : "#fb923c" }}>
              {pred.play === "OVER" ? "↑ OVER" : "↓ UNDER"}
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:"rgba(255,255,255,0.75)", marginTop:3 }}>
              {pred.line}
            </div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
              Proj {pred.mc_mean?.toFixed(1)}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", flexShrink:0, minWidth:56 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"rgba(255,255,255,0.2)" }}>PASS</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.2)" }}>{pred.line}</div>
          </div>
        )}

        {/* Ring */}
        <ConfRing prob={pred.play_probability} size={isAct ? 76 : 60} />
      </div>

      {/* Row 3: footer */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginTop:13, paddingTop:11, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:"0.05em", marginBottom:4 }}>
            MODEL AGREEMENT
          </div>
          <ModelDots prob={pred.play_probability} />
        </div>
        <div style={{ textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          <span style={{
            fontSize:9, fontWeight:800, letterSpacing:"0.08em", padding:"3px 11px", borderRadius:20,
            background:cc.bg, border:`1px solid ${cc.border}`, color:cc.ring,
          }}>{cc.label.toUpperCase()}</span>
          {isAct && pred.kelly_stake && (
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)" }}>
              Kelly <span style={{ color:cc.ring, fontWeight:700 }}>${pred.kelly_stake}</span>
            </span>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ marginTop:14, borderTop:`1px solid ${cc.border}`, paddingTop:14 }}>
          {/* Monte Carlo grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {[
              ["Projected",  pred.mc_mean?.toFixed(1)],
              ["Std Dev",    `±${pred.mc_std?.toFixed(1)}`],
              ["10th pct",   pred.mc_p10?.toFixed(1)],
              ["90th pct",   pred.mc_p90?.toFixed(1)],
              ["Home Proj",  pred.mc_home?.toFixed(1)],
              ["Away Proj",  pred.mc_away?.toFixed(1)],
            ].map(([label, val]) => (
              <div key={label} style={{
                background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, padding:"10px 12px",
              }}>
                <div style={{ fontSize:8, color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em", marginBottom:4 }}>
                  {label.toUpperCase()}
                </div>
                <div style={{ fontSize:17, fontWeight:700, color:"#f1f5f9" }}>{val || "—"}</div>
              </div>
            ))}
          </div>

          {/* Over/Under probability bar */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10,
              color:"rgba(255,255,255,0.45)", marginBottom:5 }}>
              <span>OVER {(pred.prob_over * 100).toFixed(1)}%</span>
              <span>UNDER {(pred.prob_under * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height:7, borderRadius:99, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${pred.prob_over * 100}%`,
                background:"linear-gradient(90deg,#60a5fa,#3b82f6)", borderRadius:99 }}/>
            </div>
          </div>

          {/* EV / Edge row */}
          {isAct && (
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", background:cc.bg,
              border:`1px solid ${cc.border}`, borderRadius:10, padding:"10px 14px" }}>
              {[
                ["Edge",      fmtSign(pred.edge ?? 0),                      pred.edge > 0 ? "#4ade80" : "#f87171"],
                ["EV/$",      `$${(pred.ev_per_dollar ?? 0).toFixed(3)}`,    pred.ev_per_dollar > 0 ? "#4ade80" : "#f87171"],
                pred.kelly_stake ? ["Kelly", `$${pred.kelly_stake}`, cc.ring] : null,
                ["Model",     (pred.model || "statistical").toUpperCase(),   "rgba(255,255,255,0.4)"],
              ].filter(Boolean).map(([lbl, val, col]) => (
                <div key={lbl}>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.3)", marginBottom:2 }}>{lbl}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:col }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  const [openDay, setOpenDay] = useState(null);
  const graded     = history.filter(h => h.graded > 0);
  const totalBets  = graded.reduce((s, h) => s + h.bets, 0);
  const totalWins  = graded.reduce((s, h) => s + h.wins, 0);
  const totalPnL   = graded.reduce((s, h) => s + h.pnl, 0);
  const winRate    = totalBets > 0 ? totalWins / totalBets : 0;
  const card = { background:"#0d1829", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12 };

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:16 }}>
        {[
          ["Record",     `${totalWins}W – ${totalBets - totalWins}L`,             winRate >= 0.55 ? "#4ade80" : "#fbbf24"],
          ["Win Rate",   `${(winRate * 100).toFixed(1)}%`,                         winRate >= 0.55 ? "#4ade80" : "#fbbf24"],
          ["P&L",        `${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}u`,    totalPnL >= 0 ? "#4ade80" : "#f87171"],
          ["Days Graded",`${graded.length}`,                                        "#a78bfa"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ ...card, padding:"14px 16px" }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em", marginBottom:6 }}>
              {label.toUpperCase()}
            </div>
            <div style={{ fontSize:22, fontWeight:800, color, letterSpacing:"-0.5px" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* P&L sparkline */}
      {history.length > 1 && (() => {
        let run = 0;
        const pts = history.map(h => { run += h.pnl; return run; });
        const mn  = Math.min(...pts, 0), mx = Math.max(...pts, 0.01), rng = mx - mn || 1;
        const W = 500, H = 56;
        const x = i => (i / (pts.length - 1)) * W;
        const y = v => H - ((v - mn) / rng) * H;
        const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const last = pts[pts.length - 1];
        const col  = last >= 0 ? "#4ade80" : "#f87171";
        return (
          <div style={{ ...card, padding:"14px 16px", marginBottom:14 }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:"0.06em", marginBottom:10 }}>
              CUMULATIVE P&L · {history.length} DAYS
            </div>
            <svg width="100%" viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none" style={{ height:56 }}>
              <line x1={0} y1={y(0)} x2={W} y2={y(0)} stroke="rgba(255,255,255,0.08)" strokeDasharray="4"/>
              <path d={d} fill="none" stroke={col} strokeWidth={2} style={{ filter:`drop-shadow(0 0 3px ${col})` }}/>
              <circle cx={x(pts.length - 1)} cy={y(last)} r={4} fill={col}/>
            </svg>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9,
              color:"rgba(255,255,255,0.25)", marginTop:6 }}>
              <span>{history[0]?.date}</span>
              <span style={{ color:col, fontWeight:700 }}>{last >= 0 ? "+" : ""}{last.toFixed(2)}u</span>
              <span>{history[history.length - 1]?.date}</span>
            </div>
          </div>
        );
      })()}

      {/* Daily rows */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {[...history].reverse().map((h, i) => {
          const wr   = h.graded > 0 ? h.wins / h.graded : null;
          const col  = wr === null ? "rgba(255,255,255,0.2)" : wr >= 0.6 ? "#4ade80" : wr >= 0.5 ? "#fbbf24" : "#f87171";
          const open = openDay === i;
          return (
            <div key={i}>
              <div onClick={() => setOpenDay(open ? null : i)} style={{
                ...card, padding:"13px 15px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:12,
                borderLeft:`3px solid ${col}`,
              }}>
                <div style={{ width:48, flexShrink:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#f1f5f9" }}>{h.date}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom: h.graded > 0 ? 6 : 0 }}>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>
                      <span style={{ color:"#f1f5f9", fontWeight:700 }}>{h.bets}</span> bets
                    </span>
                    {h.graded > 0 ? (
                      <>
                        <span style={{ fontSize:12, color:"#4ade80", fontWeight:700 }}>{h.wins}W</span>
                        <span style={{ fontSize:12, color:"#f87171", fontWeight:700 }}>{h.losses}L</span>
                        {h.pushes > 0 && <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>{h.pushes}P</span>}
                      </>
                    ) : (
                      <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontStyle:"italic" }}>
                        {h.pending || h.bets} pending
                      </span>
                    )}
                  </div>
                  {h.graded > 0 && (
                    <div style={{ height:3, borderRadius:99, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
                      <div style={{ h
