import { useState, useEffect } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const THEMES = {
  orange:{ name:"Orange", primary:"#f97316", glow:"rgba(249,115,22,.35)", grad:"linear-gradient(135deg,#7c2d12 0%,#0c0400 100%)", accent:"#fb923c" },
  purple:{ name:"Purple", primary:"#a855f7", glow:"rgba(168,85,247,.35)", grad:"linear-gradient(135deg,#3b0764 0%,#060010 100%)", accent:"#c084fc" },
  red:   { name:"Red",    primary:"#ef4444", glow:"rgba(239,68,68,.35)",  grad:"linear-gradient(135deg,#7f1d1d 0%,#080000 100%)", accent:"#f87171" },
  blue:  { name:"Blue",   primary:"#3b82f6", glow:"rgba(59,130,246,.35)", grad:"linear-gradient(135deg,#1e3a8a 0%,#00020f 100%)", accent:"#60a5fa" },
  lemon: { name:"Lemon",  primary:"#a3e635", glow:"rgba(163,230,53,.35)", grad:"linear-gradient(135deg,#365314 0%,#020800 100%)", accent:"#bef264" },
  white: { name:"White",  primary:"#f1f5f9", glow:"rgba(241,245,249,.2)", grad:"linear-gradient(135deg,#1e293b 0%,#020617 100%)", accent:"#ffffff" },
};

const LC = {
  basketball_nba:                { label:"NBA",         color:"#3b82f6" },
  basketball_wnba:               { label:"WNBA",        color:"#f97316" },
  basketball_ncaab:              { label:"NCAA M",      color:"#8b5cf6" },
  basketball_ncaaw:              { label:"NCAA W",      color:"#ec4899" },
  basketball_nba_summer_league:  { label:"NBA Summer",  color:"#06b6d4" },
  basketball_euroleague:         { label:"EuroLeague",  color:"#14b8a6" },
  basketball_eurocup:            { label:"EuroCup",     color:"#0ea5e9" },
  basketball_greece_basket_league:{ label:"Greece",     color:"#3b82f6" },
  basketball_spain_acb:          { label:"Spain ACB",   color:"#ef4444" },
  basketball_italy_lega:         { label:"Italy",       color:"#16a34a" },
  basketball_france_pro_a:       { label:"France",      color:"#2563eb" },
  basketball_germany_bbl:        { label:"Germany",     color:"#eab308" },
  basketball_turkey_bsl:         { label:"Turkey",      color:"#dc2626" },
  basketball_lithuania_lkl:      { label:"Lithuania",   color:"#15803d" },
  basketball_nbl:                { label:"NBL AUS",     color:"#f59e0b" },
  basketball_cba:                { label:"CBA",         color:"#ef4444" },
};
const DLC = { label:"Basketball", color:"#6366f1" };

// Stat explanations
const STAT_INFO = {
  "Proj. total":   { what:"The model's best estimate of the final combined score of both teams.", impact:"If this is significantly higher than the Line, the model sees value in OVER. If lower, value in UNDER." },
  "Std dev":       { what:"How much the final score typically varies from the projection. ±12 means 68% of simulated games land within 12 points of the projection.", impact:"A large std dev means high uncertainty — be cautious. Small std dev means the model is more confident." },
  "Low (10th)":    { what:"Only 10% of simulated games scored this low or lower. Think of it as the realistic worst case.", impact:"If the Line is near this number, the OVER is very likely according to the model." },
  "High (90th)":   { what:"Only 10% of simulated games scored this high or higher. The realistic best case ceiling.", impact:"If the Line is near this number, the UNDER is very likely according to the model." },
  "Home proj.":    { what:"Projected points for the home team alone, based on their pace and offensive rating vs the away team's defense.", impact:"Compare to the team's season average. If much higher, conditions favour a big home scoring night." },
  "Away proj.":    { what:"Projected points for the away team alone.", impact:"Away teams typically score slightly less due to travel fatigue. A high away projection is a bullish signal for the OVER." },
};

const MOCK = [
  {game_id:"d1",league:"basketball_wnba",matchup:"Connecticut Sun @ Atlanta Dream",line:159.5,prob_over:0.54,prob_under:0.46,play:"OVER",confidence:"MEDIUM",edge:0.042,ev_per_dollar:0.038,kelly_stake:8.25,line_movement:1.5,mc_mean:162.0,mc_std:12.0,mc_p10:143.9,mc_p90:174.7,mc_home:81.0,mc_away:81.0,commence_time:"2026-06-03T23:00:00Z"},
  {game_id:"d2",league:"basketball_nba",matchup:"New York Knicks @ San Antonio Spurs",line:218.0,prob_over:0.505,prob_under:0.495,play:"PASS",confidence:"LOW",edge:0.005,ev_per_dollar:-0.018,kelly_stake:null,line_movement:0,mc_mean:218.1,mc_std:12.0,mc_p10:202.7,mc_p90:233.5,mc_home:109.0,mc_away:109.1,commence_time:"2026-06-04T01:30:00Z"},
  {game_id:"d3",league:"basketball_wnba",matchup:"Chicago Sky @ Washington Mystics",line:160.5,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.008,ev_per_dollar:-0.015,kelly_stake:null,line_movement:0.5,mc_mean:160.5,mc_std:12.0,mc_p10:145.1,mc_p90:175.9,mc_home:80.2,mc_away:80.3,commence_time:"2026-06-03T23:00:00Z"},
];
const MOCK_HIST=[{date:"May 27",bets:3,wins:2,losses:1,pnl:.82},{date:"May 28",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 29",bets:4,wins:2,losses:2,pnl:-.18},{date:"May 30",bets:3,wins:1,losses:2,pnl:-1.09},{date:"May 31",bets:2,wins:2,losses:0,pnl:1.82},{date:"Jun 1",bets:5,wins:3,losses:2,pnl:.73},{date:"Jun 2",bets:3,wins:2,losses:1,pnl:.82}];

const pct=(n,d=1)=>`${(n*100).toFixed(d)}%`;
const sign=(n,d=1)=>`${n>=0?"+":""}${(n*100).toFixed(d)}%`;

function formatDateTime(t) {
  if (!t) return "";
  try {
    const d = new Date(t);
    const date = d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
    const time = d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    return `${date} · ${time}`;
  } catch { return t; }
}

function StatRow({ label, value, T }) {
  const [open, setOpen] = useState(false);
  const info = STAT_INFO[label];
  return (
    <div style={{borderBottom:"1px solid rgba(255,255,255,.06)",paddingBottom:8,marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:info?"pointer":"default"}}
           onClick={()=>info&&setOpen(!open)}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{label}</span>
          {info && <span style={{fontSize:9,color:T.primary,border:`1px solid ${T.primary}44`,borderRadius:10,padding:"0 5px",lineHeight:"16px"}}>{open?"▲":"?"}</span>}
        </div>
        <span style={{fontSize:13,fontWeight:700,color:T.accent}}>{value||"—"}</span>
      </div>
      {open && info && (
        <div style={{marginTop:8,background:"rgba(0,0,0,.3)",borderRadius:8,padding:"10px 12px",borderLeft:`2px solid ${T.primary}`}}>
          <p style={{fontSize:11,color:"rgba(255,255,255,.6)",margin:"0 0 6px",lineHeight:1.6}}><strong style={{color:T.accent}}>What it is:</strong> {info.what}</p>
          <p style={{fontSize:11,color:"rgba(255,255,255,.6)",margin:0,lineHeight:1.6}}><strong style={{color:T.accent}}>Betting impact:</strong> {info.impact}</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [preds,setPreds]=useState(MOCK);
  const [history,setHistory]=useState(MOCK_HIST);
  const [genAt,setGenAt]=useState(null);
  const [live,setLive]=useState(false);
  const [theme,setTheme]=useState("orange");
  const [filter,setFilter]=useState("ALL");
  const [leagueFilter,setLeagueFilter]=useState("ALL");
  const [sel,setSel]=useState(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [explainOpen,setExplainOpen]=useState(false);

  const T=THEMES[theme];

  useEffect(()=>{(async()=>{
    const[pd,hd]=await Promise.all([loadJSON("/predictions.json"),loadJSON("/history.json")]);
    if(pd?.predictions?.length){setPreds(pd.predictions);setGenAt(pd.generated_at);setLive(true);}
    if(hd?.length)setHistory(hd);
  })();},[]);

  const leagues=[...new Set(preds.map(p=>p.league).filter(Boolean))];
  let filtered=filter==="ALL"?preds:filter==="BETS"?preds.filter(p=>p.play!=="PASS"):preds.filter(p=>p.play===filter);
  if(leagueFilter!=="ALL") filtered=filtered.filter(p=>p.league===leagueFilter);

  const actionable=preds.filter(p=>p.play!=="PASS");
  const totalPnL=history.reduce((s,h)=>s+h.pnl,0);
  const totalBets=history.reduce((s,h)=>s+h.bets,0);
  const totalWins=history.reduce((s,h)=>s+h.wins,0);

  const glass={background:"rgba(255,255,255,.05)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,.10)",borderRadius:16};

  return(
    <div style={{minHeight:"100vh",background:T.grad,color:"#e2e8f0",fontFamily:"'Inter',system-ui,sans-serif",position:"relative",overflowX:"hidden"}}>
      <div style={{position:"fixed",top:-120,left:-120,width:380,height:380,borderRadius:"50%",background:T.glow,filter:"blur(90px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:-100,right:-100,width:320,height:320,borderRadius:"50%",background:T.glow,filter:"blur(80px)",pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"relative",zIndex:1,maxWidth:640,margin:"0 auto",padding:"16px 12px 48px"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontSize:20}}>🏀</span>
              <span style={{fontSize:17,fontWeight:800,letterSpacing:"-1px",background:`linear-gradient(90deg,${T.accent},#fff)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BASKETBALL-AI</span>
              <span style={{background:live?"rgba(34,197,94,.2)":"rgba(100,116,139,.2)",border:`1px solid ${live?"#4ade80":"#475569"}`,color:live?"#4ade80":"#64748b",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{live?"● LIVE":"○ DEMO"}</span>
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>
              {genAt?`Updated ${new Date(genAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})} at ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`:"Auto-updates daily 9AM ET"}
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{display:"flex",gap:3}}>
              {Object.entries(THEMES).map(([k,t])=>(
                <button key={k} onClick={()=>setTheme(k)} title={t.name}
                  style={{width:15,height:15,borderRadius:"50%",background:t.primary,border:`2px solid ${theme===k?"#fff":"transparent"}`,cursor:"pointer",padding:0,transition:"transform .15s",transform:theme===k?"scale(1.4)":"scale(1)"}}/>
              ))}
            </div>
            <button onClick={()=>setMenuOpen(!menuOpen)}
              style={{...glass,width:34,height:34,borderRadius:10,cursor:"pointer",fontSize:16,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,.15)"}}>
              {menuOpen?"×":"≡"}
            </button>
          </div>
        </div>

        {/* Info panel */}
        {menuOpen&&(
          <div style={{...glass,padding:16,marginBottom:12}}>
            <p style={{fontSize:12,fontWeight:700,color:T.accent,margin:"0 0 10px"}}>How this works</p>
            <p style={{fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.7,margin:"0 0 10px"}}>
              Every day at 9 AM, GitHub Actions pulls live betting lines from The Odds API across 15+ basketball leagues. It runs 10,000 Monte Carlo simulations per game, calculates Expected Value against the bookmaker line, and flags bets where EV is positive. Kelly Criterion sizes each bet. Results commit to GitHub and Vercel auto-deploys — you just open the app.
            </p>
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <p style={{fontSize:11,color:T.accent,margin:"0 0 6px",fontWeight:700}}>Data sources</p>
              {leagues.map(l=>{
                const lc=LC[l]||DLC;
                return(<div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:lc.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.6)",flex:1}}>{lc.label}</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>{preds.filter(p=>p.league===l).length} games</span>
                  <span style={{fontSize:9,background:`${lc.color}20`,border:`1px solid ${lc.color}40`,color:lc.color,padding:"1px 6px",borderRadius:8}}>Odds API</span>
                </div>);
              })}
              <div style={{fontSize:10,color:"rgba(255,255,255,.25)",marginTop:8}}>NBA team stats → nba_api (free, no key needed)</div>
            </div>
            {/* Automation explainer */}
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10,marginTop:4}}>
              <p style={{fontSize:11,color:T.accent,margin:"0 0 6px",fontWeight:700}}>Is this automated?</p>
              <p style={{fontSize:11,color:"rgba(255,255,255,.4)",lineHeight:1.7,margin:0}}>
                Yes. GitHub Actions runs the pipeline every day at 9 AM and 2 PM US Eastern automatically — no action needed from you. To confirm it ran, go to your GitHub repo → Actions tab. Green tick = success. Red X = check the logs.
              </p>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {[
            ["Today","Bets",`${actionable.length}/${preds.length}`,"actionable / total"],
            ["Record","7-Day",`${totalWins}W–${totalBets-totalWins}L`,`${(totalWins/(totalBets||1)*100).toFixed(0)}% win rate`],
            ["P&L","7-Day",`${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`,"units ($1k bankroll)"],
            ["Leagues","Active",leagues.length||"—","covering today"],
          ].map(([top,sub,val,foot])=>(
            <div key={top+sub} style={{...glass,padding:"12px 14px"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:".08em",marginBottom:1}}>{top.toUpperCase()}</div>
              <div style={{fontSize:9,color:T.primary,letterSpacing:".06em",marginBottom:6}}>{sub.toUpperCase()}</div>
              <div style={{fontSize:22,fontWeight:800,color:T.accent,letterSpacing:"-1px",lineHeight:1}}>{val}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.25)",marginTop:4}}>{foot}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{display:"flex",gap:5,marginBottom:8,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
          {["ALL","BETS","OVER","UNDER"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?T.primary:"rgba(255,255,255,.07)",color:filter===f?"#000":"rgba(255,255,255,.5)",border:`1px solid ${filter===f?T.primary:"rgba(255,255,255,.1)"}`,padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .15s"}}>{f}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:5,marginBottom:12,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
          <button onClick={()=>setLeagueFilter("ALL")} style={{background:leagueFilter==="ALL"?"rgba(255,255,255,.15)":"rgba(255,255,255,.05)",color:leagueFilter==="ALL"?"#fff":"rgba(255,255,255,.4)",border:`1px solid ${leagueFilter==="ALL"?"rgba(255,255,255,.3)":"rgba(255,255,255,.08)"}`,padding:"5px 12px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>ALL LEAGUES</button>
          {leagues.map(l=>{
            const lc=LC[l]||DLC; const active=leagueFilter===l;
            return(<button key={l} onClick={()=>setLeagueFilter(active?"ALL":l)} style={{background:active?`${lc.color}25`:"rgba(255,255,255,.04)",color:active?lc.color:"rgba(255,255,255,.35)",border:`1px solid ${active?lc.color:"rgba(255,255,255,.08)"}`,padding:"5px 12px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:lc.color}}/>{lc.label}
            </button>);
          })}
        </div>

        {filtered.length===0&&<div style={{textAlign:"center",color:"rgba(255,255,255,.2)",padding:"48px 0",fontSize:13}}>No games match this filter.</div>}

        {/* Game cards */}
        {filtered.map(pred=>{
          const lc=LC[pred.league]||DLC;
          const isSel=sel===pred.game_id;
          const isAct=pred.play!=="PASS";
          const playCol=pred.play==="OVER"?"#60a5fa":pred.play==="UNDER"?"#c084fc":"rgba(255,255,255,.2)";
          const confCol=pred.confidence==="HIGH"?"#4ade80":pred.confidence==="MEDIUM"?"#fbbf24":"rgba(255,255,255,.2)";

          return(
            <div key={pred.game_id} style={{background:isSel?`${lc.color}12`:"rgba(255,255,255,.04)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${isSel?lc.color:"rgba(255,255,255,.09)"}`,borderLeft:`3px solid ${lc.color}`,borderRadius:14,padding:"14px 14px",marginBottom:9,cursor:"pointer",opacity:isAct?1:.65,transition:"all .2s",boxShadow:isSel?`0 0 24px ${lc.color}30`:"none"}}
              onClick={()=>setSel(isSel?null:pred.game_id)}>

              {/* League + date row */}
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7,flexWrap:"wrap"}}>
                <span style={{background:`${lc.color}25`,border:`1px solid ${lc.color}50`,color:lc.color,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:10,letterSpacing:".06em",whiteSpace:"nowrap"}}>{lc.label}</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.35)",whiteSpace:"nowrap"}}>{formatDateTime(pred.commence_time)}</span>
                {pred.line_movement!==0&&pred.line_movement!=null&&(
                  <span style={{fontSize:10,color:pred.line_movement>0?"#4ade80":"#f87171",fontWeight:700,whiteSpace:"nowrap"}}>
                    {pred.line_movement>0?"▲":"▼"} {Math.abs(pred.line_movement).toFixed(1)} pts moved
                  </span>
                )}
              </div>

              {/* Teams + badges */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",lineHeight:1.3}}>{pred.matchup}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:3}}>Line {pred.line} · MC {pred.mc_mean?.toFixed(1)}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end",flexShrink:0}}>
                  <span style={{background:`${confCol}18`,border:`1px solid ${confCol}44`,color:confCol,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:10,letterSpacing:".08em"}}>{pred.confidence==="MEDIUM"?"MED":pred.confidence}</span>
                  <span style={{background:`${playCol}18`,border:`1px solid ${playCol}44`,color:playCol,fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:10,whiteSpace:"nowrap"}}>
                    {pred.play==="OVER"?"↑ OVER":pred.play==="UNDER"?"↓ UNDER":"— PASS"}
                  </span>
                </div>
              </div>

              {/* Prob bar */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:11,color:"#60a5fa",width:36,textAlign:"right"}}>{pct(pred.prob_over)}</span>
                <div style={{flex:1,height:6,borderRadius:99,background:"rgba(255,255,255,.08)",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pred.prob_over*100}%`,background:`linear-gradient(90deg,${lc.color},${T.accent})`,borderRadius:99,transition:"width .5s"}}/>
                </div>
                <span style={{fontSize:11,color:"#c084fc",width:36}}>{pct(pred.prob_under)}</span>
              </div>

              {/* MC range */}
              {pred.mc_mean&&(()=>{
                const mn=pred.mc_p10||0,mx=pred.mc_p90||0,rng=mx-mn||1;
                const lpos=Math.min(Math.max((pred.line-mn)/rng,0),1)*100;
                const mpos=Math.min(Math.max((pred.mc_mean-mn)/rng,0),1)*100;
                return(
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.2)",marginBottom:3,letterSpacing:".05em"}}>SIMULATION RANGE · {mn.toFixed(0)}–{mx.toFixed(0)} pts</div>
                    <div style={{position:"relative",height:14}}>
                      <div style={{position:"absolute",top:4,left:0,right:0,height:6,background:"rgba(255,255,255,.07)",borderRadius:3}}/>
                      <div style={{position:"absolute",top:0,left:`${mpos}%`,width:2,height:14,background:lc.color,borderRadius:1,transform:"translateX(-50%)",boxShadow:`0 0 6px ${lc.color}`}}/>
                      <div style={{position:"absolute",top:0,left:`${lpos}%`,width:1.5,height:14,background:"#f59e0b",borderRadius:1,transform:"translateX(-50%)"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(255,255,255,.25)",marginTop:2}}>
                      <span style={{color:lc.color}}>◆ Mean {pred.mc_mean.toFixed(1)}</span>
                      <span style={{color:"#f59e0b"}}>| Line {pred.line}</span>
                      <span>±{pred.mc_std?.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* EV row */}
              {isAct&&<div style={{display:"flex",gap:14,fontSize:11,flexWrap:"wrap",borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:8,marginTop:4}}>
                <span style={{color:"rgba(255,255,255,.35)"}}>Edge <span style={{color:pred.edge>0?"#4ade80":"#f87171",fontWeight:700}}>{sign(pred.edge)}</span></span>
                <span style={{color:"rgba(255,255,255,.35)"}}>EV <span style={{color:pred.ev_per_dollar>0?"#4ade80":"#f87171",fontWeight:700}}>${pred.ev_per_dollar?.toFixed(3)}/u</span></span>
                {pred.kelly_stake&&<span style={{color:"rgba(255,255,255,.35)"}}>Kelly <span style={{color:T.accent,fontWeight:700}}>${pred.kelly_stake}</span></span>}
              </div>}

              {/* Expanded stats with explanations */}
              {isSel&&pred.mc_mean&&(
                <div style={{marginTop:12,background:"rgba(0,0,0,.3)",borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:10,color:T.primary,fontWeight:700,letterSpacing:".08em",marginBottom:12}}>MONTE CARLO BREAKDOWN · tap ? to learn what each means</div>
                  {[
                    ["Proj. total",    pred.mc_mean?.toFixed(1)],
                    ["Std dev",        `±${pred.mc_std?.toFixed(1)}`],
                    ["Low (10th)",     pred.mc_p10?.toFixed(1)],
                    ["High (90th)",    pred.mc_p90?.toFixed(1)],
                    ["Home proj.",     pred.mc_home?.toFixed(1)],
                    ["Away proj.",     pred.mc_away?.toFixed(1)],
                  ].map(([l,v])=><StatRow key={l} label={l} value={v} T={T}/>)}

                  {isAct&&<div style={{marginTop:8,background:`${T.primary}18`,border:`1px solid ${T.primary}44`,borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:12,color:T.accent,fontWeight:800,marginBottom:4}}>
                      {pred.play==="OVER"?"↑":"↓"} {pred.play} {pred.line} · {pred.confidence} confidence
                    </div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.6}}>
                      Quarter Kelly stake: <strong style={{color:"#fff"}}>${pred.kelly_stake}</strong> of $1,000 bankroll<br/>
                      <span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>Only bet when EV is positive. This model is still building accuracy — track results before scaling stakes.</span>
                    </div>
                  </div>}
                </div>
              )}
            </div>
          );
        })}

        {/* History */}
        <div style={{...glass,padding:"14px",marginTop:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,color:"rgba(255,255,255,.35)",fontWeight:700,letterSpacing:".08em"}}>7-DAY RECORD</span>
            <span style={{fontSize:12,color:totalPnL>=0?"#4ade80":"#f87171",fontWeight:800}}>{totalPnL>=0?"+":""}{totalPnL.toFixed(2)} units</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {history.map(h=>{
              const wr=h.wins/(h.bets||1);
              const col=wr>=.6?"#4ade80":wr>=.5?"#fbbf24":"#f87171";
              return(<div key={h.date} style={{background:"rgba(0,0,0,.25)",borderRadius:8,padding:"8px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{fontSize:8,color:"rgba(255,255,255,.25)",marginBottom:4}}>{h.date}</div>
                <div style={{fontSize:12,fontWeight:800,color:col}}>{h.wins}–{h.losses}</div>
                <div style={{fontSize:9,color:h.pnl>=0?"#4ade80":"#f87171",marginTop:2}}>{h.pnl>=0?"+":""}{h.pnl.toFixed(2)}u</div>
              </div>);
            })}
          </div>
        </div>

        <div style={{marginTop:14,textAlign:"center",fontSize:9,color:"rgba(255,255,255,.15)",lineHeight:1.8}}>
          Statistical model · Monte Carlo simulation · Quarter Kelly<br/>Not financial advice · Track your own results
        </div>
      </div>
    </div>
  );
}
