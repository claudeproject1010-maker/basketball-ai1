import { useState, useEffect } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const LC = {
  basketball_nba:                  { label:"NBA",        color:"#3b82f6" },
  basketball_wnba:                 { label:"WNBA",       color:"#f97316" },
  basketball_ncaab:                { label:"NCAA M",     color:"#8b5cf6" },
  basketball_ncaaw:                { label:"NCAA W",     color:"#ec4899" },
  basketball_nba_summer_league:    { label:"NBA Summer", color:"#06b6d4" },
  basketball_euroleague:           { label:"EuroLeague", color:"#14b8a6" },
  basketball_eurocup:              { label:"EuroCup",    color:"#0ea5e9" },
  basketball_greece_basket_league: { label:"Greece",     color:"#3b82f6" },
  basketball_spain_acb:            { label:"Spain ACB",  color:"#ef4444" },
  basketball_italy_lega:           { label:"Italy",      color:"#16a34a" },
  basketball_france_pro_a:         { label:"France",     color:"#2563eb" },
  basketball_germany_bbl:          { label:"Germany",    color:"#eab308" },
  basketball_turkey_bsl:           { label:"Turkey",     color:"#dc2626" },
  basketball_lithuania_lkl:        { label:"Lithuania",  color:"#15803d" },
  basketball_nbl:                  { label:"NBL AUS",    color:"#f59e0b" },
  basketball_cba:                  { label:"CBA",        color:"#ef4444" },
  basketball_fiba:                 { label:"FIBA",       color:"#6366f1" },
};
const DLC = { label:"Basketball", color:"#6366f1" };

function confColor(pct) {
  if (pct >= 90) return { ring:"#22c55e", glow:"rgba(34,197,94,0.35)",  label:"Strong",   bg:"rgba(34,197,94,0.12)",  border:"rgba(34,197,94,0.35)"  };
  if (pct >= 80) return { ring:"#3b82f6", glow:"rgba(59,130,246,0.35)", label:"Good",     bg:"rgba(59,130,246,0.12)", border:"rgba(59,130,246,0.35)" };
  if (pct >= 70) return { ring:"#f97316", glow:"rgba(249,115,22,0.35)", label:"Moderate", bg:"rgba(249,115,22,0.12)", border:"rgba(249,115,22,0.35)" };
  return           { ring:"#ef4444", glow:"rgba(239,68,68,0.35)",  label:"Avoid",    bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.35)"  };
}

const sign = (n,d=1) => `${n>=0?"+":""}${(n*100).toFixed(d)}%`;

function formatDate(t) {
  if (!t) return "";
  try { return new Date(t).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
  catch { return t; }
}
function formatTime(t) {
  if (!t) return "";
  try { return new Date(t).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}); }
  catch { return ""; }
}

// ── Confidence ring ──────────────────────────────────────────────────────────
function ConfRing({ prob, size=80 }) {
  const pct = Math.round(prob * 100);
  const cc  = confColor(pct);
  const r   = (size-10)/2;
  const circ = 2*Math.PI*r;
  const dash = (pct/100)*circ;
  const fs   = size>=80?20:size>=60?16:13;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cc.ring} strokeWidth={6}
          strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 6px ${cc.ring})`,transition:"stroke-dasharray 0.8s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:fs,fontWeight:800,color:cc.ring,lineHeight:1,letterSpacing:"-1px"}}>{pct}%</span>
        <span style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.04em",marginTop:2}}>CONF</span>
      </div>
    </div>
  );
}

// ── Model agreement dots ────────────────────────────────────────────────────
function ModelDots({ prob }) {
  const score = prob>=0.90?5:prob>=0.80?4:prob>=0.70?3:prob>=0.57?2:1;
  const cc = confColor(Math.round(prob*100));
  return (
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      {[1,2,3,4,5].map(i=>(
        <div key={i} style={{width:7,height:7,borderRadius:"50%",
          background:i<=score?cc.ring:"rgba(255,255,255,0.1)",
          boxShadow:i<=score?`0 0 5px ${cc.ring}`:"none"}}/>
      ))}
      <span style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginLeft:4}}>{score}/5</span>
    </div>
  );
}

// ── Prediction Card ──────────────────────────────────────────────────────────
function PredCard({ pred, expanded, onToggle }) {
  const lc = LC[pred.league] || DLC;
  const isAct = pred.play !== "PASS";
  const pct = Math.round(pred.play_probability*100);
  const cc  = confColor(pct);
  const [away,home] = pred.matchup?.includes(" @ ")
    ? pred.matchup.split(" @ ") : [pred.matchup||"", ""];
  const isGraded = pred.graded;
  const correct  = pred.correct;

  return (
    <div onClick={onToggle} style={{
      background: expanded ? "linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))" : "rgba(255,255,255,0.04)",
      backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${expanded?cc.border:"rgba(255,255,255,0.08)"}`,
      borderLeft:`3px solid ${isAct?cc.ring:"rgba(255,255,255,0.15)"}`,
      borderRadius:16, padding:"18px 20px", marginBottom:10,
      cursor:"pointer", opacity:isAct?1:0.5, transition:"all 0.25s ease",
      boxShadow:expanded?`0 8px 32px ${cc.glow}`:isAct?"0 2px 12px rgba(0,0,0,0.3)":"none",
      position:"relative", overflow:"hidden",
    }}>
      {expanded && <div style={{position:"absolute",inset:0,borderRadius:16,
        background:`radial-gradient(ellipse at 80% 50%,${cc.glow},transparent 70%)`,
        pointerEvents:"none"}}/>}

      {/* League + time + grade badge */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{background:`${lc.color}22`,border:`1px solid ${lc.color}55`,color:lc.color,
          fontSize:10,fontWeight:800,padding:"2px 10px",borderRadius:20,letterSpacing:"0.06em"}}>{lc.label}</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{formatDate(pred.commence_time)}</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>·</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{formatTime(pred.commence_time)}</span>
        {pred.line_movement!==0&&pred.line_movement!=null&&(
          <span style={{fontSize:10,color:pred.line_movement>0?"#4ade80":"#f87171",fontWeight:700}}>
            {pred.line_movement>0?"▲":"▼"} {Math.abs(pred.line_movement).toFixed(1)} moved
          </span>
        )}
        {/* Grade badge */}
        {isGraded && isAct && (
          <span style={{
            marginLeft:"auto", fontSize:10, fontWeight:800, padding:"2px 10px", borderRadius:20,
            letterSpacing:"0.06em",
            background: correct===true  ? "rgba(34,197,94,0.15)"
                       : correct===false ? "rgba(239,68,68,0.15)"
                       : "rgba(255,255,255,0.08)",
            border: correct===true  ? "1px solid rgba(34,197,94,0.4)"
                   : correct===false ? "1px solid rgba(239,68,68,0.4)"
                   : "1px solid rgba(255,255,255,0.12)",
            color: correct===true  ? "#4ade80"
                  : correct===false ? "#f87171"
                  : "rgba(255,255,255,0.4)",
          }}>
            {correct===true?"✓ WIN":correct===false?"✗ LOSS":"PUSH"}
          </span>
        )}
        {!isGraded && isAct && (
          <span style={{marginLeft:"auto",fontSize:10,color:"rgba(255,255,255,0.2)",fontStyle:"italic"}}>
            Pending result
          </span>
        )}
      </div>

      {/* Main body */}
      <div style={{display:"flex",alignItems:"center",gap:16}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:2}}>{away}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginBottom:2}}>@</div>
          <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{home}</div>
          {/* Actual result if graded */}
          {isGraded && pred.actual_total!=null && (
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:6}}>
              Actual: <span style={{color:"#f1f5f9",fontWeight:700}}>{pred.actual_total} pts</span>
              {" "}(line {pred.line}) — {pred.over_hit?"went OVER":"went UNDER"}
            </div>
          )}
        </div>

        {isAct && (
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"rgba(255,255,255,0.4)",marginBottom:4}}>PICK</div>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.5px",lineHeight:1,
              color:pred.play==="OVER"?"#60a5fa":"#f97316"}}>
              {pred.play==="OVER"?"↑ OVER":"↓ UNDER"}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:"rgba(255,255,255,0.7)",marginTop:4}}>{pred.line}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2}}>Proj. {pred.mc_mean?.toFixed(1)}</div>
          </div>
        )}
        {!isAct && (
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:18,fontWeight:800,color:"rgba(255,255,255,0.2)"}}>PASS</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.2)"}}>{pred.line}</div>
          </div>
        )}
        <ConfRing prob={pred.play_probability} size={isAct?80:64}/>
      </div>

      {/* Footer */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.07)"}}>
        <div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginBottom:4,letterSpacing:"0.05em"}}>MODEL AGREEMENT</div>
          <ModelDots prob={pred.play_probability}/>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{display:"inline-block",background:cc.bg,border:`1px solid ${cc.border}`,
            color:cc.ring,fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20,letterSpacing:"0.08em"}}>
            {cc.label.toUpperCase()}
          </div>
          {isAct&&pred.kelly_stake&&(
            <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:4}}>
              Kelly: <span style={{color:cc.ring,fontWeight:700}}>${pred.kelly_stake}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{marginTop:16,background:"rgba(0,0,0,0.3)",borderRadius:12,padding:"16px",
          borderTop:`1px solid ${cc.border}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
            {[
              ["Proj. Total",pred.mc_mean?.toFixed(1)],
              ["Std Dev",`±${pred.mc_std?.toFixed(1)}`],
              ["Low (10th)",pred.mc_p10?.toFixed(1)],
              ["High (90th)",pred.mc_p90?.toFixed(1)],
              ["Home Proj.",pred.mc_home?.toFixed(1)],
              ["Away Proj.",pred.mc_away?.toFixed(1)],
            ].map(([label,val])=>(
              <div key={label} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,
                padding:"10px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.05em",marginBottom:4}}>{label.toUpperCase()}</div>
                <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9"}}>{val||"—"}</div>
              </div>
            ))}
          </div>
          {/* Probability bar */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:6}}>
              <span>OVER {(pred.prob_over*100).toFixed(1)}%</span>
              <span>UNDER {(pred.prob_under*100).toFixed(1)}%</span>
            </div>
            <div style={{height:8,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pred.prob_over*100}%`,
                background:"linear-gradient(90deg,#60a5fa,#3b82f6)",borderRadius:99}}/>
            </div>
          </div>
          {/* EV row */}
          {isAct&&(
            <div style={{display:"flex",gap:16,flexWrap:"wrap",background:cc.bg,
              border:`1px solid ${cc.border}`,borderRadius:10,padding:"10px 14px"}}>
              {[
                ["Edge",sign(pred.edge),pred.edge>0?"#4ade80":"#f87171"],
                ["EV/Dollar",`$${pred.ev_per_dollar?.toFixed(3)}`,pred.ev_per_dollar>0?"#4ade80":"#f87171"],
                pred.kelly_stake?["Kelly Stake",`$${pred.kelly_stake}`,cc.ring]:null,
                ["Model",pred.model||"statistical","rgba(255,255,255,0.4)"],
              ].filter(Boolean).map(([label,val,color])=>(
                <div key={label}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginBottom:2}}>{label.toUpperCase()}</div>
                  <div style={{fontSize:15,fontWeight:700,color,textTransform:"uppercase"}}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  const [expandedDay, setExpandedDay] = useState(null);

  const gradedDays = history.filter(h => h.graded > 0);
  const totalBets  = gradedDays.reduce((s,h)=>s+h.bets,0);
  const totalWins  = gradedDays.reduce((s,h)=>s+h.wins,0);
  const totalPnL   = gradedDays.reduce((s,h)=>s+h.pnl,0);
  const winRate    = totalBets>0 ? totalWins/totalBets : 0;

  const glass = {background:"rgba(255,255,255,0.04)",backdropFilter:"blur(12px)",
    border:"1px solid rgba(255,255,255,0.08)",borderRadius:12};

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
        {[
          ["Record",    `${totalWins}W–${totalBets-totalWins}L`, winRate>=0.55?"#4ade80":winRate>=0.5?"#fbbf24":"#f87171"],
          ["Win Rate",  `${(winRate*100).toFixed(1)}%`,           winRate>=0.55?"#4ade80":"#fbbf24"],
          ["Total P&L", `${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`, totalPnL>=0?"#4ade80":"#f87171"],
          ["Days Graded",`${gradedDays.length}`,                  "#a78bfa"],
        ].map(([label,val,color])=>(
          <div key={label} style={{...glass,padding:"14px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.06em",marginBottom:6}}>{label.toUpperCase()}</div>
            <div style={{fontSize:22,fontWeight:800,color,letterSpacing:"-0.5px"}}>{val}</div>
          </div>
        ))}
      </div>

      {/* P&L running total mini chart */}
      {history.length > 1 && (() => {
        let running = 0;
        const points = history.map(h=>{ running+=h.pnl; return running; });
        const mn = Math.min(...points,0), mx = Math.max(...points,0.01);
        const rng = mx-mn||1;
        const w = 600, h2 = 60;
        const toX = (i) => (i/(history.length-1))*w;
        const toY = (v) => h2 - ((v-mn)/rng)*h2;
        const pathD = points.map((v,i)=>`${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
        const last = points[points.length-1];
        const color = last>=0?"#4ade80":"#f87171";
        return (
          <div style={{...glass,padding:"16px 20px",marginBottom:16}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:"0.06em",marginBottom:12}}>
              CUMULATIVE P&L ({history.length} days)
            </div>
            <svg width="100%" viewBox={`0 0 ${w} ${h2+10}`} preserveAspectRatio="none" style={{height:60}}>
              <line x1={0} y1={toY(0)} x2={w} y2={toY(0)} stroke="rgba(255,255,255,0.1)" strokeDasharray="4"/>
              <path d={pathD} fill="none" stroke={color} strokeWidth={2}
                style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
              <circle cx={toX(points.length-1)} cy={toY(last)} r={4} fill={color}/>
            </svg>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:4}}>
              <span>{history[0]?.date}</span>
              <span style={{color,fontWeight:700}}>{last>=0?"+":""}{last.toFixed(2)}u total</span>
              <span>{history[history.length-1]?.date}</span>
            </div>
          </div>
        );
      })()}

      {/* Daily log */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {[...history].reverse().map((h,i)=>{
          const wr     = h.graded>0 ? h.wins/h.graded : null;
          const col    = wr===null ? "rgba(255,255,255,0.2)" : wr>=0.6?"#4ade80":wr>=0.5?"#fbbf24":"#f87171";
          const isOpen = expandedDay===i;
          return (
            <div key={i}>
              <div onClick={()=>setExpandedDay(isOpen?null:i)} style={{
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:12,padding:"14px 16px",cursor:"pointer",
                display:"flex",alignItems:"center",gap:14,transition:"all 0.2s",
                borderLeft:`3px solid ${col}`,
              }}>
                <div style={{width:52,flexShrink:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>{h.date}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:2}}>{h.date_full||""}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:6}}>
                    <span style={{fontSize:12,color:"rgba(255,255,255,0.45)"}}>
                      <span style={{color:"#f1f5f9",fontWeight:700}}>{h.bets}</span> bets
                    </span>
                    {h.graded>0 ? (
                      <>
                        <span style={{fontSize:12,color:"#4ade80",fontWeight:700}}>{h.wins}W</span>
                        <span style={{fontSize:12,color:"#f87171",fontWeight:700}}>{h.losses}L</span>
                        {h.pushes>0&&<span style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>{h.pushes}P</span>}
                      </>
                    ) : (
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.25)",fontStyle:"italic"}}>
                        {h.pending||h.bets} pending
                      </span>
                    )}
                  </div>
                  {h.graded>0&&(
                    <div style={{height:4,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${(h.wins/h.graded)*100}%`,background:col,borderRadius:99}}/>
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:h.pnl>=0?"#4ade80":"#f87171"}}>
                    {h.pnl>=0?"+":""}{h.pnl.toFixed(2)}u
                  </div>
                  {wr!==null&&(
                    <div style={{fontSize:9,color:col,fontWeight:700,marginTop:3}}>{(wr*100).toFixed(0)}% WR</div>
                  )}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.2)"}}>{isOpen?"▲":"▼"}</div>
              </div>

              {/* Per-game breakdown */}
              {isOpen && h.games?.length>0 && (
                <div style={{background:"rgba(0,0,0,0.25)",borderRadius:"0 0 12px 12px",
                  border:"1px solid rgba(255,255,255,0.06)",borderTop:"none",padding:"12px 14px"}}>
                  {h.games.filter(g=>g.play!=="PASS").map((g,j)=>{
                    const gc  = confColor(Math.round((g.play_probability||0.5)*100));
                    const lc2 = LC[g.league]||DLC;
                    return (
                      <div key={j} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"10px 0",borderBottom:j<h.games.filter(x=>x.play!=="PASS").length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                        <span style={{fontSize:9,background:`${lc2.color}22`,border:`1px solid ${lc2.color}44`,
                          color:lc2.color,padding:"2px 7px",borderRadius:20,fontWeight:800,whiteSpace:"nowrap"}}>
                          {lc2.label}
                        </span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:"#e2e8f0",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.matchup}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:2}}>
                            {g.play} {g.line} · {g.result_note||""}
                          </div>
                        </div>
                        <div style={{flexShrink:0,textAlign:"right"}}>
                          {g.graded ? (
                            <span style={{
                              fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:20,
                              background:g.correct===true?"rgba(34,197,94,0.15)":g.correct===false?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.06)",
                              color:g.correct===true?"#4ade80":g.correct===false?"#f87171":"rgba(255,255,255,0.4)",
                            }}>{g.correct===true?"✓ WIN":g.correct===false?"✗ LOSS":"PUSH"}</span>
                          ) : (
                            <span style={{fontSize:10,color:"rgba(255,255,255,0.2)",fontStyle:"italic"}}>pending</span>
                          )}
                          {g.actual_total!=null&&(
                            <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:3}}>
                              Actual: {g.actual_total}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {history.length===0&&(
          <div style={{textAlign:"center",color:"rgba(255,255,255,0.2)",padding:"48px 0",fontSize:13}}>
            No prediction history yet. Results appear after games complete.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ preds, history }) {
  const glass = {background:"rgba(255,255,255,0.04)",backdropFilter:"blur(20px)",
    border:"1px solid rgba(255,255,255,0.08)",borderRadius:16};
  const actionable = preds.filter(p=>p.play!=="PASS");
  const avoidPicks = preds.filter(p=>p.play==="PASS");
  const leagues    = [...new Set(preds.map(p=>p.league).filter(Boolean))];

  // Accuracy by confidence tier from history
  const allGames = history.flatMap(h=>h.games||[]).filter(g=>g.graded&&g.play!=="PASS");
  const tierAcc  = {strong:null,good:null,moderate:null};
  const tierSets = {
    strong:   allGames.filter(g=>Math.round((g.play_probability||0)*100)>=90),
    good:     allGames.filter(g=>{const c=Math.round((g.play_probability||0)*100);return c>=80&&c<90;}),
    moderate: allGames.filter(g=>{const c=Math.round((g.play_probability||0)*100);return c>=70&&c<80;}),
  };
  Object.entries(tierSets).forEach(([k,arr])=>{
    if(arr.length>0) tierAcc[k] = arr.filter(g=>g.correct===true).length/arr.length;
  });

  return (
    <div>
      {/* Confidence distribution */}
      <div style={{...glass,padding:20,marginBottom:12}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",letterSpacing:"0.06em",marginBottom:16}}>TODAY'S CONFIDENCE DISTRIBUTION</div>
        {[
          {label:"Strong (≥90%)", count:preds.filter(p=>Math.round(p.play_probability*100)>=90&&p.play!=="PASS").length, color:"#22c55e", total:actionable.length, acc:tierAcc.strong},
          {label:"Good (80–89%)", count:preds.filter(p=>{const c=Math.round(p.play_probability*100);return c>=80&&c<90&&p.play!=="PASS";}).length, color:"#3b82f6", total:actionable.length, acc:tierAcc.good},
          {label:"Moderate (70–79%)", count:preds.filter(p=>{const c=Math.round(p.play_probability*100);return c>=70&&c<80&&p.play!=="PASS";}).length, color:"#f97316", total:actionable.length, acc:tierAcc.moderate},
          {label:"Avoid (<70%)", count:avoidPicks.length, color:"#ef4444", total:preds.length, acc:null},
        ].map(({label,count,color,total,acc})=>(
          <div key={label} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
              <span style={{color:"rgba(255,255,255,0.5)"}}>{label}</span>
              <div style={{display:"flex",gap:12}}>
                {acc!==null&&<span style={{color:acc>=0.55?"#4ade80":acc>=0.5?"#fbbf24":"#f87171",fontSize:11}}>
                  {(acc*100).toFixed(0)}% hist. accuracy
                </span>}
                <span style={{color,fontWeight:700}}>{count} picks</span>
              </div>
            </div>
            <div style={{height:6,borderRadius:99,background:"rgba(255,255,255,0.06)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${total>0?(count/total)*100:0}%`,background:color,borderRadius:99}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Over vs Under split */}
      <div style={{...glass,padding:20,marginBottom:12}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",letterSpacing:"0.06em",marginBottom:16}}>OVER vs UNDER SPLIT</div>
        {(()=>{
          const overs  = actionable.filter(p=>p.play==="OVER").length;
          const unders = actionable.filter(p=>p.play==="UNDER").length;
          const total  = overs+unders||1;
          return (
            <>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                <span style={{color:"#60a5fa"}}>↑ OVER ({overs})</span>
                <span style={{color:"#f97316"}}>↓ UNDER ({unders})</span>
              </div>
              <div style={{height:10,borderRadius:99,background:"rgba(249,115,22,0.3)",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(overs/total)*100}%`,
                  background:"linear-gradient(90deg,#60a5fa,#3b82f6)",borderRadius:99}}/>
              </div>
            </>
          );
        })()}
      </div>

      {/* League breakdown */}
      <div style={{...glass,padding:20}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",letterSpacing:"0.06em",marginBottom:16}}>GAMES BY LEAGUE</div>
        {leagues.map(l=>{
          const lc    = LC[l]||DLC;
          const count = preds.filter(p=>p.league===l).length;
          const bets  = preds.filter(p=>p.league===l&&p.play!=="PASS").length;
          const lHist = history.flatMap(h=>h.games||[]).filter(g=>g.league===l&&g.graded&&g.correct!==null);
          const lAcc  = lHist.length>0 ? lHist.filter(g=>g.correct).length/lHist.length : null;
          return (
            <div key={l} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:lc.color,flexShrink:0}}/>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.5)",flex:1}}>{lc.label}</span>
              {lAcc!==null&&<span style={{fontSize:11,color:lAcc>=0.55?"#4ade80":lAcc>=0.5?"#fbbf24":"#f87171"}}>
                {(lAcc*100).toFixed(0)}% acc
              </span>}
              <span style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>{count} games</span>
              <span style={{fontSize:11,color:lc.color,fontWeight:700}}>{bets} bets</span>
            </div>
          );
        })}
        {leagues.length===0&&<div style={{fontSize:12,color:"rgba(255,255,255,0.2)"}}>No data.</div>}
      </div>
    </div>
  );
}

// ── Mock data for demo mode ──────────────────────────────────────────────────
const MOCK_PREDS = [
  {game_id:"d1",league:"basketball_nba",matchup:"New York Knicks @ San Antonio Spurs",home_team:"San Antonio Spurs",away_team:"New York Knicks",commence_time:"2026-06-04T01:30:00Z",line:218.0,prob_over:0.91,prob_under:0.09,play:"OVER",play_probability:0.91,confidence:"HIGH",edge:0.088,ev_per_dollar:0.12,kelly_stake:22.5,line_movement:2.0,mc_mean:221.4,mc_std:11.5,mc_p10:206.3,mc_p90:236.5,mc_home:112.0,mc_away:109.4,model:"statistical",graded:false,correct:null,actual_total:null,result_note:""},
  {game_id:"d2",league:"basketball_nba",matchup:"Boston Celtics @ Miami Heat",home_team:"Miami Heat",away_team:"Boston Celtics",commence_time:"2026-06-04T00:00:00Z",line:214.5,prob_over:0.85,prob_under:0.15,play:"OVER",play_probability:0.85,confidence:"HIGH",edge:0.072,ev_per_dollar:0.093,kelly_stake:18.0,line_movement:0.5,mc_mean:217.3,mc_std:12.0,mc_p10:201.9,mc_p90:232.7,mc_home:108.0,mc_away:109.3,model:"statistical",graded:false,correct:null,actual_total:null,result_note:""},
  {game_id:"d3",league:"basketball_euroleague",matchup:"Real Madrid @ Fenerbahçe",home_team:"Fenerbahçe",away_team:"Real Madrid",commence_time:"2026-06-05T17:00:00Z",line:155.0,prob_over:0.78,prob_under:0.22,play:"OVER",play_probability:0.78,confidence:"MEDIUM",edge:0.055,ev_per_dollar:0.065,kelly_stake:11.0,line_movement:-0.5,mc_mean:157.8,mc_std:11.2,mc_p10:143.5,mc_p90:172.1,mc_home:78.0,mc_away:79.8,model:"statistical",graded:false,correct:null,actual_total:null,result_note:""},
  {game_id:"d4",league:"basketball_nba",matchup:"Golden State Warriors @ Denver Nuggets",home_team:"Denver Nuggets",away_team:"Golden State Warriors",commence_time:"2026-06-04T03:00:00Z",line:226.0,prob_over:0.32,prob_under:0.68,play:"UNDER",play_probability:0.68,confidence:"MEDIUM",edge:0.031,ev_per_dollar:0.041,kelly_stake:7.5,line_movement:-1.0,mc_mean:223.5,mc_std:12.5,mc_p10:207.5,mc_p90:239.5,mc_home:113.0,mc_away:110.5,model:"statistical",graded:false,correct:null,actual_total:null,result_note:""},
  {game_id:"d5",league:"basketball_wnba",matchup:"Chicago Sky @ Washington Mystics",home_team:"Washington Mystics",away_team:"Chicago Sky",commence_time:"2026-06-03T23:00:00Z",line:160.5,prob_over:0.50,prob_under:0.50,play:"PASS",play_probability:0.50,confidence:"LOW",edge:-0.008,ev_per_dollar:-0.015,kelly_stake:null,line_movement:0.5,mc_mean:160.5,mc_std:12.0,mc_p10:145.1,mc_p90:175.9,mc_home:80.2,mc_away:80.3,model:"statistical",graded:false,correct:null,actual_total:null,result_note:""},
];

const MOCK_HIST = [
  {date:"May 28",date_full:"2026-05-28",bets:3,graded:3,wins:2,losses:1,pushes:0,pending:0,win_rate:0.667,pnl:0.818,games:[
    {matchup:"Celtics @ Heat",league:"basketball_nba",play:"OVER",line:214.5,play_probability:0.85,actual_total:219,over_hit:true,correct:true,result_note:"✓ WIN · actual 219 > line 214.5",graded:true},
    {matchup:"Knicks @ Spurs",league:"basketball_nba",play:"OVER",line:218.0,play_probability:0.91,actual_total:223,over_hit:true,correct:true,result_note:"✓ WIN · actual 223 > line 218.0",graded:true},
    {matchup:"Warriors @ Nuggets",league:"basketball_nba",play:"UNDER",line:226.0,play_probability:0.68,actual_total:229,over_hit:true,correct:false,result_note:"✗ LOSS · actual 229 > line 226.0",graded:true},
  ]},
  {date:"May 29",date_full:"2026-05-29",bets:2,graded:2,wins:2,losses:0,pushes:0,pending:0,win_rate:1.0,pnl:1.818,games:[
    {matchup:"Real Madrid @ Fenerbahçe",league:"basketball_euroleague",play:"OVER",line:155.0,play_probability:0.78,actual_total:161,over_hit:true,correct:true,result_note:"✓ WIN · actual 161 > line 155.0",graded:true},
    {matchup:"Sky @ Mystics",league:"basketball_wnba",play:"OVER",line:160.5,play_probability:0.64,actual_total:167,over_hit:true,correct:true,result_note:"✓ WIN · actual 167 > line 160.5",graded:true},
  ]},
  {date:"May 30",date_full:"2026-05-30",bets:4,graded:4,wins:1,losses:3,pushes:0,pending:0,win_rate:0.25,pnl:-2.091,games:[
    {matchup:"Lakers @ Clippers",league:"basketball_nba",play:"OVER",line:220.0,play_probability:0.82,actual_total:214,over_hit:false,correct:false,result_note:"✗ LOSS · actual 214 < line 220.0",graded:true},
    {matchup:"Bucks @ Bulls",league:"basketball_nba",play:"OVER",line:218.5,play_probability:0.79,actual_total:212,over_hit:false,correct:false,result_note:"✗ LOSS · actual 212 < line 218.5",graded:true},
    {matchup:"Nets @ Sixers",league:"basketball_nba",play:"UNDER",line:215.0,play_probability:0.74,actual_total:211,over_hit:false,correct:true,result_note:"✓ WIN · actual 211 < line 215.0",graded:true},
    {matchup:"Raptors @ Pistons",league:"basketball_nba",play:"OVER",line:213.0,play_probability:0.77,actual_total:208,over_hit:false,correct:false,result_note:"✗ LOSS · actual 208 < line 213.0",graded:true},
  ]},
  {date:"Jun 1",date_full:"2026-06-01",bets:3,graded:3,wins:2,losses:1,pushes:0,pending:0,win_rate:0.667,pnl:0.818,games:[
    {matchup:"Heat @ Celtics",league:"basketball_nba",play:"OVER",line:217.0,play_probability:0.88,actual_total:221,over_hit:true,correct:true,result_note:"✓ WIN · actual 221 > line 217.0",graded:true},
    {matchup:"Nuggets @ Warriors",league:"basketball_nba",play:"UNDER",line:229.0,play_probability:0.71,actual_total:224,over_hit:false,correct:true,result_note:"✓ WIN · actual 224 < line 229.0",graded:true},
    {matchup:"Sky @ Dream",league:"basketball_wnba",play:"OVER",line:162.0,play_probability:0.66,actual_total:158,over_hit:false,correct:false,result_note:"✗ LOSS · actual 158 < line 162.0",graded:true},
  ]},
  {date:"Jun 2",date_full:"2026-06-02",bets:3,graded:0,wins:0,losses:0,pushes:0,pending:3,win_rate:null,pnl:0,games:[
    {matchup:"Knicks @ Spurs",league:"basketball_nba",play:"OVER",line:218.0,play_probability:0.91,actual_total:null,over_hit:null,correct:null,result_note:"",graded:false},
    {matchup:"Celtics @ Heat",league:"basketball_nba",play:"OVER",line:214.5,play_probability:0.85,actual_total:null,over_hit:null,correct:null,result_note:"",graded:false},
    {matchup:"Real Madrid @ Fenerbahçe",league:"basketball_euroleague",play:"OVER",line:155.0,play_probability:0.78,actual_total:null,over_hit:null,correct:null,result_note:"",graded:false},
  ]},
];

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [preds,      setPreds]      = useState(MOCK_PREDS);
  const [history,    setHistory]    = useState(MOCK_HIST);
  const [genAt,      setGenAt]      = useState(null);
  const [live,       setLive]       = useState(false);
  const [activeTab,  setActiveTab]  = useState("predictions");
  const [filter,     setFilter]     = useState("ALL");
  const [leagueFilter,setLeagueFilter]=useState("ALL");
  const [topN,       setTopN]       = useState("ALL");
  const [sortBy,     setSortBy]     = useState("confidence");
  const [expanded,   setExpanded]   = useState(null);

  useEffect(()=>{
    (async()=>{
      const [pd,hd] = await Promise.all([loadJSON("/predictions.json"),loadJSON("/history.json")]);
      if(pd?.predictions?.length){ setPreds(pd.predictions); setGenAt(pd.generated_at); setLive(true); }
      if(hd?.length) setHistory(hd);
    })();
  },[]);

  const leagues = [...new Set(preds.map(p=>p.league).filter(Boolean))];
  const actionable  = preds.filter(p=>p.play!=="PASS");
  const strongPicks = preds.filter(p=>Math.round(p.play_probability*100)>=80&&p.play!=="PASS");
  const mediumPicks = preds.filter(p=>{const c=Math.round(p.play_probability*100);return c>=70&&c<80&&p.play!=="PASS";});
  const avoidPicks  = preds.filter(p=>p.play==="PASS");

  const gradedAll = history.flatMap(h=>h.games||[]).filter(g=>g.graded&&g.correct!==null);
  const modelAcc  = gradedAll.length>0
    ? `${(gradedAll.filter(g=>g.correct).length/gradedAll.length*100).toFixed(1)}%` : "—";

  let filtered = [...preds];
  if(filter==="OVER")   filtered=filtered.filter(p=>p.play==="OVER");
  if(filter==="UNDER")  filtered=filtered.filter(p=>p.play==="UNDER");
  if(filter==="STRONG") filtered=filtered.filter(p=>Math.round(p.play_probability*100)>=80&&p.play!=="PASS");
  if(filter==="MEDIUM") filtered=filtered.filter(p=>{const c=Math.round(p.play_probability*100);return c>=70&&c<80;});
  if(filter==="AVOID")  filtered=filtered.filter(p=>p.play==="PASS");
  if(filter==="WINS")   filtered=filtered.filter(p=>p.correct===true);
  if(leagueFilter!=="ALL") filtered=filtered.filter(p=>p.league===leagueFilter);
  if(sortBy==="confidence") filtered.sort((a,b)=>b.play_probability-a.play_probability);
  if(sortBy==="date")       filtered.sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
  if(sortBy==="ev")         filtered.sort((a,b)=>(b.ev_per_dollar||-99)-(a.ev_per_dollar||-99));
  if(topN!=="ALL") filtered=filtered.slice(0,parseInt(topN));

  const glass = {background:"rgba(255,255,255,0.04)",backdropFilter:"blur(20px)",
    WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16};

  const TABS = [
    {id:"predictions",label:"Predictions"},
    {id:"history",    label:"History"},
    {id:"analytics",  label:"Analytics"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#060d1f 0%,#0b1629 40%,#060d1f 100%)",
      color:"#e2e8f0",fontFamily:"'DM Sans','Inter',system-ui,sans-serif",display:"flex"}}>
      <div style={{position:"fixed",top:-180,left:-180,width:500,height:500,borderRadius:"50%",
        background:"rgba(59,130,246,0.08)",filter:"blur(100px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:-100,right:-100,width:400,height:400,borderRadius:"50%",
        background:"rgba(99,102,241,0.07)",filter:"blur(80px)",pointerEvents:"none",zIndex:0}}/>

      {/* Sidebar */}
      <div style={{width:210,flexShrink:0,background:"rgba(255,255,255,0.02)",
        borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",
        padding:"24px 0",position:"sticky",top:0,height:"100vh",zIndex:10}}>
        <div style={{padding:"0 18px 22px",borderBottom:"1px solid rgba(255,255,255,0.06)",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:36,height:36,borderRadius:10,
              background:"linear-gradient(135deg,#3b82f6,#6366f1)",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:18}}>🏀</div>
            <div>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:"-0.3px",color:"#f1f5f9"}}>BASKETBALL</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.1em"}}>AI INTELLIGENCE</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:live?"#22c55e":"#64748b",
              boxShadow:live?"0 0 6px #22c55e":"none"}}/>
            <span style={{fontSize:10,color:live?"#4ade80":"#64748b"}}>{live?"Live Data":"Demo Mode"}</span>
          </div>
        </div>

        {TABS.map(({id,label})=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{
            display:"flex",alignItems:"center",gap:10,padding:"11px 18px",margin:"2px 8px",
            borderRadius:10,background:activeTab===id?"rgba(59,130,246,0.15)":"transparent",
            border:activeTab===id?"1px solid rgba(59,130,246,0.3)":"1px solid transparent",
            color:activeTab===id?"#60a5fa":"rgba(255,255,255,0.4)",
            fontSize:12,fontWeight:activeTab===id?700:400,cursor:"pointer",transition:"all 0.2s",textAlign:"left",
          }}>{label}</button>
        ))}

        <div style={{marginTop:"auto",padding:"16px 18px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.18)",lineHeight:1.7}}>
            {genAt ? `Updated ${new Date(genAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}` : "Auto-updates 9AM · 2PM · 2AM ET"}
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.1)",marginTop:3}}>
            Monte Carlo · XGBoost · Kelly · ESPN · BDL
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,minWidth:0,padding:"26px 26px 60px",overflowY:"auto",position:"relative",zIndex:1}}>

        {/* ── PREDICTIONS ── */}
        {activeTab==="predictions"&&(
          <>
            <div style={{marginBottom:22}}>
              <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-0.8px",color:"#f1f5f9",margin:0}}>
                Today's Best Over/Under Picks
              </h1>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.3)",margin:"6px 0 0"}}>
                {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
              </p>
            </div>

            {/* KPI row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:20}}>
              {[
                ["Games Analyzed",preds.length,         "#f1f5f9"],
                ["Strong Picks",  strongPicks.length,    "#22c55e"],
                ["Medium Picks",  mediumPicks.length,    "#3b82f6"],
                ["Avoid",         avoidPicks.length,     "#ef4444"],
                ["Model Accuracy",modelAcc,              "#a78bfa"],
              ].map(([label,val,color])=>(
                <div key={label} style={{...glass,padding:"14px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.05em",marginBottom:8}}>
                    {label.toUpperCase()}
                  </div>
                  <div style={{fontSize:26,fontWeight:800,color,letterSpacing:"-1px",lineHeight:1}}>{val}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["ALL","OVER","UNDER","STRONG","MEDIUM","AVOID"].map(f=>(
                  <button key={f} onClick={()=>setFilter(f)} style={{
                    background:filter===f?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.05)",
                    border:`1px solid ${filter===f?"rgba(59,130,246,0.45)":"rgba(255,255,255,0.09)"}`,
                    color:filter===f?"#60a5fa":"rgba(255,255,255,0.4)",
                    padding:"5px 13px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",
                    letterSpacing:"0.05em",transition:"all 0.15s",
                  }}>{f}</button>
                ))}
              </div>
              <div style={{flex:1}}/>
              {[
                ["Sort",sortBy,setSortBy,[["confidence","Confidence"],["date","Date"],["ev","Expected Value"]]],
                ["Show",topN,  setTopN,  [["ALL","All Picks"],["10","Best 10"],["20","Best 20"]]],
              ].map(([label,val,setter,opts])=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{label}</span>
                  <select value={val} onChange={e=>setter(e.target.value)} style={{
                    background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",
                    color:"#f1f5f9",borderRadius:8,padding:"5px 10px",fontSize:10,
                    fontFamily:"inherit",outline:"none",cursor:"pointer",
                  }}>
                    {opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* League pills */}
            <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
              <button onClick={()=>setLeagueFilter("ALL")} style={{
                background:leagueFilter==="ALL"?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.03)",
                border:`1px solid ${leagueFilter==="ALL"?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)"}`,
                color:leagueFilter==="ALL"?"#f1f5f9":"rgba(255,255,255,0.3)",
                padding:"5px 14px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",
              }}>All Leagues</button>
              {leagues.map(l=>{
                const lc=LC[l]||DLC; const active=leagueFilter===l;
                return (
                  <button key={l} onClick={()=>setLeagueFilter(active?"ALL":l)} style={{
                    background:active?`${lc.color}22`:"rgba(255,255,255,0.03)",
                    border:`1px solid ${active?lc.color:"rgba(255,255,255,0.07)"}`,
                    color:active?lc.color:"rgba(255,255,255,0.3)",
                    padding:"5px 14px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",
                    display:"flex",alignItems:"center",gap:5,
                  }}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:lc.color}}/>
                    {lc.label}
                    <span style={{color:"rgba(255,255,255,0.2)"}}>({preds.filter(p=>p.league===l).length})</span>
                  </button>
                );
              })}
            </div>

            {filtered.length===0&&(
              <div style={{textAlign:"center",color:"rgba(255,255,255,0.2)",padding:"64px 0",fontSize:14}}>
                No games match this filter.
              </div>
            )}
            {filtered.map(pred=>(
              <PredCard key={pred.game_id} pred={pred}
                expanded={expanded===pred.game_id}
                onToggle={()=>setExpanded(expanded===pred.game_id?null:pred.game_id)}/>
            ))}
            <div style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.1)",marginTop:16}}>
              Statistical model · Monte Carlo · Kelly sizing · ESPN · Ball Don't Lie · Not financial advice
            </div>
          </>
        )}

        {/* ── HISTORY ── */}
        {activeTab==="history"&&(
          <>
            <div style={{marginBottom:22}}>
              <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-0.8px",color:"#f1f5f9",margin:0}}>Prediction History</h1>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.3)",margin:"6px 0 0"}}>
                Daily graded results — expand any day for per-game breakdown
              </p>
            </div>
            <HistoryTab history={history}/>
          </>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab==="analytics"&&(
          <>
            <div style={{marginBottom:22}}>
              <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-0.8px",color:"#f1f5f9",margin:0}}>Analytics</h1>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.3)",margin:"6px 0 0"}}>
                Historical accuracy by confidence tier and league
              </p>
            </div>
            <AnalyticsTab preds={preds} history={history}/>
          </>
        )}
      </div>
    </div>
  );
}
