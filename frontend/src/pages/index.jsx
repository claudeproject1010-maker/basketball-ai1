import { useState, useEffect } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const THEMES = {
  purple: { name:"Purple", primary:"#a855f7", glow:"rgba(168,85,247,.4)",  grad:"linear-gradient(145deg,#1a0533 0%,#0d0120 50%,#050010 100%)", accent:"#c084fc", soft:"rgba(168,85,247,.12)" },
  blue:   { name:"Blue",   primary:"#3b82f6", glow:"rgba(59,130,246,.4)",  grad:"linear-gradient(145deg,#0a1628 0%,#050d1a 50%,#020710 100%)", accent:"#60a5fa", soft:"rgba(59,130,246,.12)" },
  white:  { name:"White",  primary:"#e2e8f0", glow:"rgba(226,232,240,.2)", grad:"linear-gradient(145deg,#1e293b 0%,#0f172a 50%,#020617 100%)", accent:"#ffffff", soft:"rgba(226,232,240,.08)" },
};

const LC = {
  basketball_nba:                 { label:"NBA",        color:"#3b82f6" },
  basketball_wnba:                { label:"WNBA",       color:"#f97316" },
  basketball_ncaab:               { label:"NCAA M",     color:"#8b5cf6" },
  basketball_ncaaw:               { label:"NCAA W",     color:"#ec4899" },
  basketball_nba_summer_league:   { label:"NBA Summer", color:"#06b6d4" },
  basketball_euroleague:          { label:"EuroLeague", color:"#14b8a6" },
  basketball_eurocup:             { label:"EuroCup",    color:"#0ea5e9" },
  basketball_greece_basket_league:{ label:"Greece",     color:"#3b82f6" },
  basketball_spain_acb:           { label:"Spain ACB",  color:"#ef4444" },
  basketball_italy_lega:          { label:"Italy",      color:"#16a34a" },
  basketball_france_pro_a:        { label:"France",     color:"#2563eb" },
  basketball_germany_bbl:         { label:"Germany",    color:"#eab308" },
  basketball_turkey_bsl:          { label:"Turkey",     color:"#dc2626" },
  basketball_lithuania_lkl:       { label:"Lithuania",  color:"#15803d" },
  basketball_nbl:                 { label:"NBL AUS",    color:"#f59e0b" },
  basketball_cba:                 { label:"CBA",        color:"#ef4444" },
};
const DLC = { label:"Basketball", color:"#6366f1" };

const STAT_INFO = {
  "Proj. total": {
    what: "The model's best estimate of the combined final score of both teams after running 10,000 simulated games.",
    impact: "If this number is noticeably higher than the Line — bet OVER. If lower — bet UNDER. The bigger the gap, the stronger the signal."
  },
  "Std dev": {
    what: "Standard deviation. Measures how wildly the score could swing. ±12 means 68% of simulated games land within 12 points of the projection.",
    impact: "High std dev = uncertain game, be cautious with your stake. Low std dev = model is confident, you can lean harder on the pick."
  },
  "Low (10th)": {
    what: "Only 1 in 10 simulated games scored this low or lower. Think of it as the realistic floor — a genuinely bad scoring night.",
    impact: "If the Line is close to this number, the OVER is very likely. The market has priced it too low."
  },
  "High (90th)": {
    what: "Only 1 in 10 simulated games scored this high or higher. The realistic ceiling for this matchup.",
    impact: "If the Line is near this number, the UNDER looks attractive. The market may be pricing in an unusually high-scoring game."
  },
  "Home proj.": {
    what: "Projected points for the home team alone, based on their offensive pace vs the away team's defense across 10,000 simulations.",
    impact: "If this is well above their season average, conditions strongly favour a big home scoring night — bullish for OVER."
  },
  "Away proj.": {
    what: "Projected points for the away team. Away teams often score slightly less due to travel and crowd noise.",
    impact: "A high away projection despite travel disadvantage is a strong OVER signal. A suppressed one leans UNDER."
  },
};

const MOCK = [
  {game_id:"d1",league:"basketball_wnba",matchup:"Toronto Tempo @ New York Liberty",line:172.7,prob_over:0.49,prob_under:0.51,play:"PASS",confidence:"LOW",edge:0.005,ev_per_dollar:-0.018,kelly_stake:null,line_movement:0,mc_mean:172.7,mc_std:12.0,mc_p10:157.3,mc_p90:188.1,mc_home:86.3,mc_away:86.4,commence_time:"2026-06-04T01:00:00Z"},
  {game_id:"d2",league:"basketball_wnba",matchup:"Chicago Sky @ Atlanta Dream",line:158.5,prob_over:0.55,prob_under:0.45,play:"OVER",confidence:"MEDIUM",edge:0.051,ev_per_dollar:0.046,kelly_stake:9.50,line_movement:1.5,mc_mean:161.2,mc_std:11.8,mc_p10:146.1,mc_p90:176.3,mc_home:80.6,mc_away:80.6,commence_time:"2026-06-04T00:00:00Z"},
  {game_id:"d3",league:"basketball_nba",matchup:"New York Knicks @ San Antonio Spurs",line:218.0,prob_over:0.505,prob_under:0.495,play:"PASS",confidence:"LOW",edge:0.005,ev_per_dollar:-0.018,kelly_stake:null,line_movement:0,mc_mean:218.1,mc_std:12.0,mc_p10:202.7,mc_p90:233.5,mc_home:109.0,mc_away:109.1,commence_time:"2026-06-04T02:30:00Z"},
  {game_id:"d4",league:"basketball_wnba",matchup:"Las Vegas Aces @ Los Angeles Sparks",line:175.5,prob_over:0.48,prob_under:0.52,play:"PASS",confidence:"LOW",edge:-0.002,ev_per_dollar:-0.024,kelly_stake:null,line_movement:-0.5,mc_mean:174.8,mc_std:12.0,mc_p10:159.4,mc_p90:190.2,mc_home:87.4,mc_away:87.4,commence_time:"2026-06-04T03:00:00Z"},
  {game_id:"d5",league:"basketball_wnba",matchup:"Phoenix Mercury @ Seattle Storm",line:162.0,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.001,ev_per_dollar:-0.021,kelly_stake:null,line_movement:0,mc_mean:162.1,mc_std:12.0,mc_p10:146.7,mc_p90:177.5,mc_home:81.0,mc_away:81.1,commence_time:"2026-06-04T02:00:00Z"},
];
const MOCK_HIST=[{date:"May 28",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 29",bets:4,wins:2,losses:2,pnl:-.18},{date:"May 30",bets:3,wins:1,losses:2,pnl:-1.09},{date:"May 31",bets:2,wins:2,losses:0,pnl:1.82},{date:"Jun 1",bets:5,wins:3,losses:2,pnl:.73},{date:"Jun 2",bets:3,wins:2,losses:1,pnl:.82},{date:"Jun 3",bets:3,wins:2,losses:1,pnl:.82}];

const pct = (n,d=1) => `${(n*100).toFixed(d)}%`;
const sign = (n,d=1) => `${n>=0?"+":""}${(n*100).toFixed(d)}%`;

function formatDateTime(t) {
  if (!t) return "";
  try {
    const d = new Date(t);
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) + " · " +
           d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  } catch { return t; }
}

// StatRow: the ? button stops propagation so it doesn't close the card
function StatRow({ label, value, T }) {
  const [open, setOpen] = useState(false);
  const info = STAT_INFO[label];
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
          <span style={{fontSize:13,color:"rgba(255,255,255,.45)",flex:1}}>{label}</span>
          {info && (
            <button
              onClick={e => { e.stopPropagation(); setOpen(!open); }}
              style={{
                width:20,height:20,borderRadius:"50%",
                background:open?T.primary:"rgba(255,255,255,.08)",
                border:`1px solid ${open?T.primary:"rgba(255,255,255,.2)"}`,
                color:open?"#000":"rgba(255,255,255,.5)",
                fontSize:10,fontWeight:800,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,transition:"all .15s",lineHeight:1,padding:0,
              }}>?</button>
          )}
        </div>
        <span style={{fontSize:14,fontWeight:700,color:T.accent,minWidth:50,textAlign:"right"}}>{value||"—"}</span>
      </div>
      {open && info && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop:8,marginLeft:4,
            background:"rgba(0,0,0,.4)",
            border:`1px solid ${T.primary}44`,
            borderLeft:`3px solid ${T.primary}`,
            borderRadius:10,padding:"12px 14px",
          }}>
          <p style={{fontSize:11,color:"rgba(255,255,255,.55)",margin:"0 0 8px",lineHeight:1.7}}>
            <span style={{color:T.accent,fontWeight:700}}>What it is: </span>{info.what}
          </p>
          <p style={{fontSize:11,color:"rgba(255,255,255,.55)",margin:0,lineHeight:1.7}}>
            <span style={{color:T.accent,fontWeight:700}}>Betting impact: </span>{info.impact}
          </p>
        </div>
      )}
      <div style={{height:1,background:"rgba(255,255,255,.05)",marginTop:10}}/>
    </div>
  );
}

function Sparkline({ history, T }) {
  const cum = history.reduce((a,h)=>{a.push((a.at(-1)??0)+h.pnl);return a;},[]);
  const mn=Math.min(...cum),mx=Math.max(...cum),rng=mx-mn||1,W=80,H=24,p=3;
  const pts=cum.map((v,i)=>`${p+(i/(cum.length-1))*(W-p*2)},${H-p-((v-mn)/rng)*(H-p*2)}`).join(" ");
  const col=cum.at(-1)>=0?"#4ade80":"#f87171";
  return(
    <svg width={W} height={H} style={{flexShrink:0}}>
      <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={T.primary}/><stop offset="100%" stopColor={col}/></linearGradient></defs>
      <polyline points={pts} fill="none" stroke="url(#sg)" strokeWidth={2} strokeLinejoin="round"/>
      {cum.map((v,i)=>{const x=p+(i/(cum.length-1))*(W-p*2),y=H-p-((v-mn)/rng)*(H-p*2);return<circle key={i} cx={x} cy={y} r={2.5} fill={col}/>;} )}
    </svg>
  );
}

export default function App() {
  const [preds,setPreds]     = useState(MOCK);
  const [history,setHistory] = useState(MOCK_HIST);
  const [genAt,setGenAt]     = useState(null);
  const [live,setLive]       = useState(false);
  const [theme,setTheme]     = useState("purple");
  const [filter,setFilter]   = useState("ALL");
  const [lFilter,setLFilter] = useState("ALL");
  const [sel,setSel]         = useState(null);
  const [menuOpen,setMenuOpen] = useState(false);

  const T = THEMES[theme];

  useEffect(()=>{(async()=>{
    const[pd,hd]=await Promise.all([loadJSON("/predictions.json"),loadJSON("/history.json")]);
    if(pd?.predictions?.length){setPreds(pd.predictions);setGenAt(pd.generated_at);setLive(true);}
    if(hd?.length)setHistory(hd);
  })();},[]);

  const leagues = [...new Set(preds.map(p=>p.league).filter(Boolean))];
  let filtered = filter==="ALL" ? preds : filter==="BETS" ? preds.filter(p=>p.play!=="PASS") : preds.filter(p=>p.play===filter);
  if (lFilter!=="ALL") filtered = filtered.filter(p=>p.league===lFilter);

  const actionable = preds.filter(p=>p.play!=="PASS");
  const totalPnL   = history.reduce((s,h)=>s+h.pnl,0);
  const totalBets  = history.reduce((s,h)=>s+h.bets,0);
  const totalWins  = history.reduce((s,h)=>s+h.wins,0);

  const glassBase = {
    backdropFilter:"blur(24px)",
    WebkitBackdropFilter:"blur(24px)",
    borderRadius:18,
  };

  const pill = (active, col="#fff") => ({
    background: active ? T.primary : "rgba(255,255,255,.06)",
    color: active ? (theme==="white"?"#000":"#fff") : "rgba(255,255,255,.4)",
    border: `1px solid ${active ? T.primary : "rgba(255,255,255,.1)"}`,
    borderRadius:20, padding:"7px 16px",
    fontSize:11, fontWeight:700, cursor:"pointer",
    whiteSpace:"nowrap", flexShrink:0,
    transition:"all .15s",
  });

  return (
    <div style={{minHeight:"100vh", background:T.grad, color:"#e2e8f0", fontFamily:"'Inter',system-ui,sans-serif", position:"relative", overflowX:"hidden"}}>

      {/* Ambient glow orbs */}
      <div style={{position:"fixed",top:-150,left:-100,width:450,height:450,borderRadius:"50%",background:T.glow,filter:"blur(100px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:-100,right:-80,width:380,height:380,borderRadius:"50%",background:T.glow,filter:"blur(90px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",top:"40%",right:"-10%",width:250,height:250,borderRadius:"50%",background:T.glow,filter:"blur(120px)",opacity:.4,pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto",padding:"20px 14px 56px"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:24}}>🏀</span>
              <span style={{
                fontSize:20,fontWeight:900,letterSpacing:"-1.5px",
                background:`linear-gradient(100deg,${T.accent} 0%,rgba(255,255,255,.9) 100%)`,
                WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              }}>BASKETBALL-AI</span>
              <span style={{
                background:live?"rgba(34,197,94,.15)":"rgba(100,116,139,.15)",
                border:`1px solid ${live?"#4ade80":"#475569"}`,
                color:live?"#4ade80":"#64748b",
                fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:20,letterSpacing:".1em",
              }}>{live?"● LIVE":"○ DEMO"}</span>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>
              {genAt
                ? `Updated ${new Date(genAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`
                : "Auto-updates daily · 9 AM ET"}
            </div>
          </div>

          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Theme dots — only 3 */}
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {Object.entries(THEMES).map(([k,t])=>(
                <button key={k} onClick={()=>setTheme(k)} title={t.name}
                  style={{
                    width:18,height:18,borderRadius:"50%",background:t.primary,
                    border:`2.5px solid ${theme===k?"#fff":"transparent"}`,
                    cursor:"pointer",padding:0,
                    transition:"transform .2s",transform:theme===k?"scale(1.35)":"scale(1)",
                    boxShadow:theme===k?`0 0 10px ${t.primary}`:"none",
                  }}/>
              ))}
            </div>
            {/* Menu button */}
            <button onClick={()=>setMenuOpen(!menuOpen)}
              style={{
                ...glassBase,
                background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.14)",
                width:38,height:38,borderRadius:12,cursor:"pointer",
                fontSize:18,color:"rgba(255,255,255,.7)",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>{menuOpen?"✕":"≡"}</button>
          </div>
        </div>

        {/* ── Info menu ── */}
        {menuOpen && (
          <div style={{...glassBase,background:"rgba(15,5,30,.7)",border:"1px solid rgba(255,255,255,.1)",padding:"20px",marginBottom:14}}>
            <p style={{fontSize:13,fontWeight:700,color:T.accent,margin:"0 0 12px",letterSpacing:".04em"}}>HOW THIS WORKS</p>
            <p style={{fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.8,margin:"0 0 16px"}}>
              GitHub Actions runs automatically every day at <strong style={{color:"rgba(255,255,255,.7)"}}>9 AM and 2 PM ET</strong>. It pulls live betting lines from The Odds API across 15+ basketball leagues, runs 10,000 Monte Carlo simulations per game, calculates Expected Value, and sizes bets using the Kelly Criterion. The results are saved to this dashboard automatically — you do nothing.
            </p>
            <p style={{fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.8,margin:"0 0 16px"}}>
              To confirm it ran: open your <strong style={{color:"rgba(255,255,255,.7)"}}>GitHub repo → Actions tab</strong>. Green tick = ran successfully. Red X = check the logs.
            </p>
            <div style={{height:1,background:"rgba(255,255,255,.08)",margin:"12px 0"}}/>
            <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:".08em",margin:"0 0 10px"}}>DATA SOURCES TODAY</p>
            {leagues.map(l=>{
              const lc=LC[l]||DLC;
              return(
                <div key={l} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:lc.color,flexShrink:0,boxShadow:`0 0 6px ${lc.color}`}}/>
                  <span style={{fontSize:12,color:"rgba(255,255,255,.55)",flex:1}}>{lc.label}</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.25)"}}>{preds.filter(p=>p.league===l).length} games</span>
                  <span style={{fontSize:9,background:`${lc.color}18`,border:`1px solid ${lc.color}40`,color:lc.color,padding:"2px 7px",borderRadius:10}}>Odds API</span>
                </div>
              );
            })}
            <div style={{fontSize:10,color:"rgba(255,255,255,.2)",marginTop:10}}>NBA team stats pulled free from nba_api — no key needed</div>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {[
            ["TODAY","BETS",`${actionable.length}/${preds.length}`,"actionable / total games"],
            ["7-DAY","RECORD",`${totalWins}W–${totalBets-totalWins}L`,`${(totalWins/(totalBets||1)*100).toFixed(0)}% win rate`],
            ["7-DAY","P&L",`${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`,"units · $1,000 bankroll"],
            ["ACTIVE","LEAGUES",`${leagues.length||"—"}`,"covering today"],
          ].map(([top,sub,val,foot])=>(
            <div key={top+sub} style={{
              ...glassBase,
              background:"rgba(255,255,255,.05)",
              border:"1px solid rgba(255,255,255,.09)",
              padding:"16px 18px",
              position:"relative",overflow:"hidden",
            }}>
              {/* Subtle inner glow */}
              <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:T.glow,filter:"blur(30px)",opacity:.5,pointerEvents:"none"}}/>
              <div style={{fontSize:9,color:"rgba(255,255,255,.25)",letterSpacing:".1em",marginBottom:1}}>{top}</div>
              <div style={{fontSize:9,color:T.primary,letterSpacing:".08em",fontWeight:700,marginBottom:8}}>{sub}</div>
              <div style={{fontSize:24,fontWeight:900,color:T.accent,letterSpacing:"-1px",lineHeight:1}}>{val}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.25)",marginTop:6}}>{foot}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{display:"flex",gap:6,marginBottom:8,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch"}}>
          {["ALL","BETS","OVER","UNDER"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={pill(filter===f)}>{f}</button>
          ))}
        </div>
        {leagues.length > 0 && (
          <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch"}}>
            <button onClick={()=>setLFilter("ALL")} style={pill(lFilter==="ALL")}>ALL LEAGUES</button>
            {leagues.map(l=>{
              const lc=LC[l]||DLC; const active=lFilter===l;
              return(
                <button key={l} onClick={()=>setLFilter(active?"ALL":l)}
                  style={{...pill(active,lc.color), background:active?`${lc.color}25`:"rgba(255,255,255,.05)", border:`1px solid ${active?lc.color:"rgba(255,255,255,.1)"}`, color:active?lc.color:"rgba(255,255,255,.4)"}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:lc.color,display:"inline-block",marginRight:5,verticalAlign:"middle",boxShadow:`0 0 4px ${lc.color}`}}/>
                  {lc.label}
                </button>
              );
            })}
          </div>
        )}

        {filtered.length===0 && (
          <div style={{textAlign:"center",color:"rgba(255,255,255,.2)",padding:"60px 0",fontSize:14}}>No games match this filter.</div>
        )}

        {/* ── Game Cards ── */}
        {filtered.map(pred => {
          const lc  = LC[pred.league]||DLC;
          const isSel = sel===pred.game_id;
          const isAct = pred.play!=="PASS";
          const playCol = pred.play==="OVER"?"#60a5fa":pred.play==="UNDER"?"#c084fc":"rgba(255,255,255,.22)";
          const confCol = pred.confidence==="HIGH"?"#4ade80":pred.confidence==="MEDIUM"?"#fbbf24":"rgba(255,255,255,.22)";

          return (
            <div key={pred.game_id}
              onClick={()=>setSel(isSel?null:pred.game_id)}
              style={{
                ...glassBase,
                background: isSel ? `rgba(${lc.color==="white"?"255,255,255":"168,85,247"},.08)` : "rgba(255,255,255,.045)",
                border:`1px solid ${isSel?lc.color:"rgba(255,255,255,.08)"}`,
                borderLeft:`4px solid ${lc.color}`,
                padding:"16px 16px",marginBottom:10,cursor:"pointer",
                opacity:isAct?1:.7,
                transition:"all .25s",
                boxShadow:isSel?`0 8px 32px ${lc.color}25, inset 0 1px 0 rgba(255,255,255,.08)`:"inset 0 1px 0 rgba(255,255,255,.06)",
              }}>

              {/* League + datetime */}
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{
                  background:`${lc.color}22`,border:`1px solid ${lc.color}55`,color:lc.color,
                  fontSize:9,fontWeight:800,padding:"3px 9px",borderRadius:10,letterSpacing:".07em",
                  boxShadow:`0 0 8px ${lc.color}30`,
                }}>{lc.label}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>{formatDateTime(pred.commence_time)}</span>
                {pred.line_movement!==0&&pred.line_movement!=null&&(
                  <span style={{fontSize:10,color:pred.line_movement>0?"#4ade80":"#f87171",fontWeight:700}}>
                    {pred.line_movement>0?"▲":"▼"} {Math.abs(pred.line_movement).toFixed(1)} moved
                  </span>
                )}
              </div>

              {/* Teams + badges */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:15,color:"#f8fafc",lineHeight:1.3,marginBottom:4}}>{pred.matchup}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.28)"}}>Line {pred.line} &nbsp;·&nbsp; MC {pred.mc_mean?.toFixed(1)}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",flexShrink:0}}>
                  <span style={{background:`${confCol}15`,border:`1px solid ${confCol}40`,color:confCol,fontSize:9,fontWeight:800,padding:"3px 9px",borderRadius:10,letterSpacing:".08em"}}>
                    {pred.confidence==="MEDIUM"?"MED":pred.confidence}
                  </span>
                  <span style={{background:`${playCol}15`,border:`1px solid ${playCol}40`,color:playCol,fontSize:12,fontWeight:800,padding:"4px 12px",borderRadius:10}}>
                    {pred.play==="OVER"?"↑ OVER":pred.play==="UNDER"?"↓ UNDER":"— PASS"}
                  </span>
                </div>
              </div>

              {/* Probability bar */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:12,color:"#60a5fa",width:38,textAlign:"right",fontWeight:700}}>{pct(pred.prob_over)}</span>
                <div style={{flex:1,height:8,borderRadius:99,background:"rgba(255,255,255,.07)",overflow:"hidden",position:"relative"}}>
                  <div style={{
                    position:"absolute",left:0,top:0,height:"100%",
                    width:`${pred.prob_over*100}%`,
                    background:`linear-gradient(90deg,${lc.color},${T.accent})`,
                    borderRadius:99,transition:"width .6s ease",
                    boxShadow:`0 0 8px ${lc.color}60`,
                  }}/>
                </div>
                <span style={{fontSize:12,color:"#c084fc",width:38,fontWeight:700}}>{pct(pred.prob_under)}</span>
              </div>

              {/* MC range bar */}
              {pred.mc_mean&&(()=>{
                const mn=pred.mc_p10||0,mx=pred.mc_p90||0,rng=mx-mn||1;
                const lpos=Math.min(Math.max((pred.line-mn)/rng,0),1)*100;
                const mpos=Math.min(Math.max((pred.mc_mean-mn)/rng,0),1)*100;
                return(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.2)",marginBottom:4,letterSpacing:".06em"}}>SIMULATION RANGE · {mn.toFixed(0)}–{mx.toFixed(0)} pts</div>
                    <div style={{position:"relative",height:16}}>
                      <div style={{position:"absolute",top:5,left:0,right:0,height:6,background:"rgba(255,255,255,.06)",borderRadius:3}}/>
                      {/* Mean marker — league colour */}
                      <div style={{position:"absolute",top:0,left:`${mpos}%`,width:3,height:16,background:lc.color,borderRadius:2,transform:"translateX(-50%)",boxShadow:`0 0 8px ${lc.color}`,transition:"left .5s"}}/>
                      {/* Line marker — amber */}
                      <div style={{position:"absolute",top:0,left:`${lpos}%`,width:2,height:16,background:"#f59e0b",borderRadius:2,transform:"translateX(-50%)"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,.25)",marginTop:4}}>
                      <span style={{color:lc.color,fontWeight:600}}>◆ Mean {pred.mc_mean.toFixed(1)}</span>
                      <span style={{color:"#f59e0b"}}>| Line {pred.line}</span>
                      <span>±{pred.mc_std?.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* EV row */}
              {isAct&&(
                <div style={{display:"flex",gap:16,fontSize:12,flexWrap:"wrap",borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:10,marginTop:4}}>
                  <span style={{color:"rgba(255,255,255,.35)"}}>Edge <span style={{color:pred.edge>0?"#4ade80":"#f87171",fontWeight:700}}>{sign(pred.edge)}</span></span>
                  <span style={{color:"rgba(255,255,255,.35)"}}>EV <span style={{color:pred.ev_per_dollar>0?"#4ade80":"#f87171",fontWeight:700}}>${pred.ev_per_dollar?.toFixed(3)}/u</span></span>
                  {pred.kelly_stake&&<span style={{color:"rgba(255,255,255,.35)"}}>Kelly <span style={{color:T.accent,fontWeight:700}}>${pred.kelly_stake}</span></span>}
                </div>
              )}

              {/* Expanded Monte Carlo detail */}
              {isSel&&pred.mc_mean&&(
                <div
                  onClick={e=>e.stopPropagation()}
                  style={{marginTop:14,background:"rgba(0,0,0,.35)",borderRadius:14,padding:"16px",border:"1px solid rgba(255,255,255,.07)"}}>
                  <div style={{fontSize:10,color:T.primary,fontWeight:800,letterSpacing:".1em",marginBottom:14}}>MONTE CARLO BREAKDOWN · tap ? to learn what each number means</div>
                  {[
                    ["Proj. total", pred.mc_mean?.toFixed(1)],
                    ["Std dev",     `±${pred.mc_std?.toFixed(1)}`],
                    ["Low (10th)", pred.mc_p10?.toFixed(1)],
                    ["High (90th)",pred.mc_p90?.toFixed(1)],
                    ["Home proj.", pred.mc_home?.toFixed(1)],
                    ["Away proj.", pred.mc_away?.toFixed(1)],
                  ].map(([l,v])=><StatRow key={l} label={l} value={v} T={T}/>)}

                  {isAct&&(
                    <div style={{marginTop:10,background:`${T.primary}14`,border:`1px solid ${T.primary}44`,borderRadius:10,padding:"14px"}}>
                      <div style={{fontSize:13,color:T.accent,fontWeight:800,marginBottom:6}}>
                        {pred.play==="OVER"?"↑":"↓"} {pred.play} {pred.line} &nbsp;·&nbsp; {pred.confidence} confidence
                      </div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.7}}>
                        Recommended stake: <strong style={{color:"#fff"}}>${pred.kelly_stake}</strong> of $1,000<br/>
                        <span style={{fontSize:10,color:"rgba(255,255,255,.25)"}}>Quarter Kelly · −110 juice assumed · not financial advice</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── History ── */}
        <div style={{...glassBase,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",padding:"16px",marginTop:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.25)",letterSpacing:".1em",marginBottom:2}}>PERFORMANCE</div>
              <div style={{fontSize:10,color:T.primary,fontWeight:700,letterSpacing:".06em"}}>7-DAY RECORD</div>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:13,color:totalPnL>=0?"#4ade80":"#f87171",fontWeight:800}}>{totalPnL>=0?"+":""}{totalPnL.toFixed(2)}u</span>
              <Sparkline history={history} T={T}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {history.map(h=>{
              const wr=h.wins/(h.bets||1);
              const col=wr>=.6?"#4ade80":wr>=.5?"#fbbf24":"#f87171";
              return(
                <div key={h.date} style={{background:"rgba(0,0,0,.25)",borderRadius:10,padding:"8px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.05)"}}>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.22)",marginBottom:5}}>{h.date}</div>
                  <div style={{fontSize:13,fontWeight:800,color:col}}>{h.wins}–{h.losses}</div>
                  <div style={{fontSize:9,color:h.pnl>=0?"#4ade80":"#f87171",marginTop:3}}>{h.pnl>=0?"+":""}{h.pnl.toFixed(2)}u</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{marginTop:16,textAlign:"center",fontSize:10,color:"rgba(255,255,255,.15)",lineHeight:2}}>
          Statistical model · Monte Carlo simulation · Quarter Kelly<br/>
          Not financial advice · Track your own results carefully
        </div>
      </div>
    </div>
  );
}
