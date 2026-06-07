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

      {/* Bottom nav — mobile only */}
      <div className="bai-bottom-nav">
        {[
          {id:"predictions",icon:"🏀",label:"Picks"},
          {id:"history",    icon:"📊",label:"History"},
          {id:"analytics",  icon:"📈",label:"Stats"},
        ].map(({id,icon,label})=>(
          <button key={id} onClick={()=>setActiveTab(id)} className={activeTab===id?"bnav-act":""}>
            <span className="bni">{icon}</span>{label}
          </button>
        ))}
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

      {/* Bottom nav — mobile only */}
      <div className="bai-bottom-nav">
        {[
          {id:"predictions",icon:"🏀",label:"Picks"},
          {id:"history",    icon:"📊",label:"History"},
          {id:"analytics",  icon:"📈",label:"Stats"},
        ].map(({id,icon,label})=>(
          <button key={id} onClick={()=>setActiveTab(id)} className={activeTab===id?"bnav-act":""}>
            <span className="bni">{icon}</span>{label}
          </button>
        ))}
      </div>
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
      background: expanded ? "linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.07))" : "rgba(255,255,255,0.07)",
      backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(20px)",
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
        marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.12)"}}>
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
              <div key={label} style={{background:"rgba(255,255,255,0.09)",borderRadius:10,
                padding:"10px 12px",border:"1px solid rgba(255,255,255,0.12)"}}>
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

      {/* Bottom nav — mobile only */}
      <div className="bai-bottom-nav">
        {[
          {id:"predictions",icon:"🏀",label:"Picks"},
          {id:"history",    icon:"📊",label:"History"},
          {id:"analytics",  icon:"📈",label:"Stats"},
        ].map(({id,icon,label})=>(
          <button key={id} onClick={()=>setActiveTab(id)} className={activeTab===id?"bnav-act":""}>
            <span className="bni">{icon}</span>{label}
          </button>
        ))}
      </div>
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

  const glass = {background:"rgba(255,255,255,0.09)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
    border:"1px solid rgba(255,255,255,0.15)",borderRadius:12};

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
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",
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
                   
