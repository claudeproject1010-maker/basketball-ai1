import { useState, useEffect, useCallback } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const THEMES = {
  orange: { name:"Orange",  primary:"#f97316", glow:"rgba(249,115,22,.35)",  grad:"linear-gradient(135deg,#7c2d12,#1c0a00)", accent:"#fb923c", muted:"#431407" },
  purple: { name:"Purple",  primary:"#a855f7", glow:"rgba(168,85,247,.35)",  grad:"linear-gradient(135deg,#3b0764,#0d001a)", accent:"#c084fc", muted:"#2e1065" },
  red:    { name:"Red",     primary:"#ef4444", glow:"rgba(239,68,68,.35)",   grad:"linear-gradient(135deg,#7f1d1d,#1a0000)", accent:"#f87171", muted:"#450a0a" },
  blue:   { name:"Blue",    primary:"#3b82f6", glow:"rgba(59,130,246,.35)",  grad:"linear-gradient(135deg,#1e3a8a,#00001a)", accent:"#60a5fa", muted:"#1e3a8a" },
  lemon:  { name:"Lemon",   primary:"#a3e635", glow:"rgba(163,230,53,.35)",  grad:"linear-gradient(135deg,#365314,#0a1200)", accent:"#bef264", muted:"#1a2e05" },
  white:  { name:"White",   primary:"#f1f5f9", glow:"rgba(241,245,249,.25)", grad:"linear-gradient(135deg,#1e293b,#020617)", accent:"#ffffff", muted:"#334155" },
};

const LEAGUE_COLORS = {
  basketball_nba:        "#3b82f6",
  basketball_wnba:       "#f97316",
  basketball_ncaab:      "#8b5cf6",
  basketball_ncaaw:      "#ec4899",
  basketball_euroleague: "#14b8a6",
  basketball_nbl:        "#eab308",
  basketball_cba:        "#ef4444",
};
const LEAGUE_LABELS = {
  basketball_nba:"NBA", basketball_wnba:"WNBA", basketball_ncaab:"NCAA M",
  basketball_ncaaw:"NCAA W", basketball_euroleague:"EuroLeague",
  basketball_nbl:"NBL AUS", basketball_cba:"CBA CHN",
};

const MOCK = [
  {game_id:"d1",league:"basketball_wnba",matchup:"Connecticut Sun @ Atlanta Dream",home_team:"Atlanta Dream",away_team:"Connecticut Sun",line:159.5,prob_over:0.505,prob_under:0.495,play:"PASS",confidence:"LOW",edge:0.012,ev_per_dollar:-0.011,kelly_stake:null,line_movement:0,mc_mean:159.3,mc_std:12.0,mc_p10:143.9,mc_p90:174.7,commence_time:"2026-06-02T23:00:00Z"},
  {game_id:"d2",league:"basketball_wnba",matchup:"Chicago Sky @ Washington Mystics",home_team:"Washington Mystics",away_team:"Chicago Sky",line:160.5,prob_over:0.54,prob_under:0.46,play:"OVER",confidence:"MEDIUM",edge:0.042,ev_per_dollar:0.038,kelly_stake:8.25,line_movement:1.5,mc_mean:162.0,mc_std:12.0,mc_p10:146.6,mc_p90:177.4,commence_time:"2026-06-02T23:00:00Z"},
  {game_id:"d3",league:"basketball_nba",matchup:"New York Knicks @ San Antonio Spurs",home_team:"San Antonio Spurs",away_team:"New York Knicks",line:218.0,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.005,ev_per_dollar:-0.018,kelly_stake:null,line_movement:0,mc_mean:218.1,mc_std:12.0,mc_p10:202.7,mc_p90:233.5,commence_time:"2026-06-03T01:30:00Z"},
  {game_id:"d4",league:"basketball_wnba",matchup:"Las Vegas Aces @ Los Angeles Sparks",home_team:"Los Angeles Sparks",away_team:"Las Vegas Aces",line:175.5,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.003,ev_per_dollar:-0.021,kelly_stake:null,line_movement:-0.5,mc_mean:175.2,mc_std:12.0,mc_p10:159.8,mc_p90:190.6,commence_time:"2026-06-03T02:00:00Z"},
];
const MOCK_HIST=[{date:"May 27",bets:3,wins:2,losses:1,pnl:.82},{date:"May 28",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 29",bets:4,wins:2,losses:2,pnl:-.18},{date:"May 30",bets:3,wins:1,losses:2,pnl:-1.09},{date:"May 31",bets:2,wins:2,losses:0,pnl:1.82},{date:"Jun 1",bets:5,wins:3,losses:2,pnl:.73},{date:"Jun 2",bets:3,wins:2,losses:1,pnl:.82}];

const pct = (n, d=1) => `${(n*100).toFixed(d)}%`;
const sign = (n, d=1) => `${n>=0?"+":""}${(n*100).toFixed(d)}%`;

function formatTime(t) {
  if (!t) return "";
  try {
    if (t.includes("T")) return new Date(t).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    return t;
  } catch { return t; }
}

export default function App() {
  const [preds, setPreds] = useState(MOCK);
  const [history, setHistory] = useState(MOCK_HIST);
  const [genAt, setGenAt] = useState(null);
  const [live, setLive] = useState(false);
  const [theme, setTheme] = useState("orange");
  const [filter, setFilter] = useState("ALL");
  const [leagueFilter, setLeagueFilter] = useState("ALL");
  const [sel, setSel] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const T = THEMES[theme];

  useEffect(() => {
    (async () => {
      const [pd, hd] = await Promise.all([loadJSON("/predictions.json"), loadJSON("/history.json")]);
      if (pd?.predictions?.length) { setPreds(pd.predictions); setGenAt(pd.generated_at); setLive(true); }
      if (hd?.length) setHistory(hd);
    })();
  }, []);

  const leagues = [...new Set(preds.map(p => p.league).filter(Boolean))];
  let filtered = filter === "ALL" ? preds : filter === "BETS" ? preds.filter(p => p.play !== "PASS") : preds.filter(p => p.play === filter);
  if (leagueFilter !== "ALL") filtered = filtered.filter(p => p.league === leagueFilter);

  const selP = preds.find(p => p.game_id === sel);
  const actionable = preds.filter(p => p.play !== "PASS");
  const totalPnL = history.reduce((s, h) => s + h.pnl, 0);
  const totalBets = history.reduce((s, h) => s + h.bets, 0);
  const totalWins = history.reduce((s, h) => s + h.wins, 0);

  const glass = {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid rgba(255,255,255,0.10)`,
    borderRadius: 16,
  };

  const glassCard = {
    ...glass,
    padding: "14px 16px",
    marginBottom: 10,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: T.grad,
      color: "#e2e8f0",
      fontFamily: "'Inter', system-ui, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow orbs */}
      <div style={{position:"fixed",top:-100,left:-100,width:400,height:400,borderRadius:"50%",background:T.glow,filter:"blur(80px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:-100,right:-100,width:350,height:350,borderRadius:"50%",background:T.glow,filter:"blur(80px)",pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"relative",zIndex:1,maxWidth:680,margin:"0 auto",padding:"16px 12px 40px"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{fontSize:22}}>🏀</span>
              <span style={{fontSize:18,fontWeight:800,letterSpacing:"-1px",background:`linear-gradient(90deg,${T.accent},#fff)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BASKETBALL-AI</span>
              <span style={{background:live?`${T.primary}30`:"rgba(100,116,139,.2)",border:`1px solid ${live?T.primary:"#475569"}`,color:live?T.accent:"#64748b",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,letterSpacing:".08em"}}>{live?"● LIVE":"○ DEMO"}</span>
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)",letterSpacing:".04em"}}>
              {genAt ? `Updated ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}` : "Updated daily · 9AM ET"}
            </div>
          </div>

          {/* Theme + menu */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Colour dots */}
            <div style={{display:"flex",gap:4}}>
              {Object.entries(THEMES).map(([key, t]) => (
                <button key={key} onClick={() => setTheme(key)} title={t.name} style={{width:16,height:16,borderRadius:"50%",background:t.primary,border:`2px solid ${theme===key?"#fff":"transparent"}`,cursor:"pointer",padding:0,transition:"transform .15s",transform:theme===key?"scale(1.3)":"scale(1)"}}/>
              ))}
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{...glass,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.08)",color:"#fff",width:36,height:36,borderRadius:10,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {menuOpen ? "×" : "≡"}
            </button>
          </div>
        </div>

        {/* Slide-down menu */}
        {menuOpen && (
          <div style={{...glass,padding:"16px",marginBottom:14,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",letterSpacing:".08em"}}>DATA SOURCES</div>
            {leagues.map(l => {
              const col = LEAGUE_COLORS[l] || T.primary;
              const label = LEAGUE_LABELS[l] || l;
              const count = preds.filter(p => p.league === l).length;
              return (
                <div key={l} style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:13,color:"#e2e8f0"}}>{label}</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{count} game{count!==1?"s":""}</span>
                  <span style={{fontSize:10,background:`${col}20`,border:`1px solid ${col}44`,color:col,padding:"1px 7px",borderRadius:10}}>The Odds API</span>
                </div>
              );
            })}
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10,fontSize:11,color:"rgba(255,255,255,.3)"}}>
              NBA team stats via nba_api (free · no key needed)<br/>
              Odds + lines via The Odds API (free tier · 500 calls/mo)
            </div>
          </div>
        )}

        {/* KPI strip */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
          {[
            ["Today", `${actionable.length}/${preds.length}`, "bets / games"],
            ["7-Day WR", `${(totalWins/(totalBets||1)*100).toFixed(0)}%`, `${totalWins}W – ${totalBets-totalWins}L`],
            ["7-Day P&L", `${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`, "$1,000 bankroll"],
            ["Leagues", leagues.length||"—", "active today"],
          ].map(([label,val,sub]) => (
            <div key={label} style={{...glass,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:".07em",marginBottom:4}}>{label.toUpperCase()}</div>
              <div style={{fontSize:22,fontWeight:800,color:T.accent,letterSpacing:"-1px",lineHeight:1}}>{val}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:3}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
          {["ALL","BETS","OVER","UNDER"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter===f ? T.primary : "rgba(255,255,255,.06)",
              color: filter===f ? "#000" : "rgba(255,255,255,.5)",
              border: `1px solid ${filter===f ? T.primary : "rgba(255,255,255,.1)"}`,
              padding:"6px 14px", borderRadius:20, fontSize:11, fontWeight:700,
              cursor:"pointer", whiteSpace:"nowrap", transition:"all .15s",
            }}>{f}</button>
          ))}
          <div style={{width:1,background:"rgba(255,255,255,.1)",margin:"0 2px"}}/>
          {leagues.map(l => {
            const col = LEAGUE_COLORS[l] || T.primary;
            const active = leagueFilter === l;
            return (
              <button key={l} onClick={() => setLeagueFilter(active ? "ALL" : l)} style={{
                background: active ? `${col}30` : "rgba(255,255,255,.04)",
                color: active ? col : "rgba(255,255,255,.4)",
                border: `1px solid ${active ? col : "rgba(255,255,255,.08)"}`,
                padding:"6px 12px", borderRadius:20, fontSize:10, fontWeight:700,
                cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5,
              }}>
                <span style={{width:5,height:5,borderRadius:"50%",background:col}}/>
                {LEAGUE_LABELS[l]||l}
              </button>
            );
          })}
        </div>

        {/* Game cards */}
        {filtered.length === 0 && (
          <div style={{textAlign:"center",color:"rgba(255,255,255,.2)",padding:"48px 0",fontSize:13}}>No games match this filter.</div>
        )}

        {filtered.map(pred => {
          const lc = LEAGUE_COLORS[pred.league] || T.primary;
          const isSel = sel === pred.game_id;
          const isActionable = pred.play !== "PASS";
          const playColor = pred.play==="OVER" ? "#60a5fa" : pred.play==="UNDER" ? "#c084fc" : "rgba(255,255,255,.25)";
          const confColor = pred.confidence==="HIGH" ? "#4ade80" : pred.confidence==="MEDIUM" ? "#fbbf24" : "rgba(255,255,255,.25)";

          return (
            <div key={pred.game_id} onClick={() => setSel(isSel ? null : pred.game_id)}
              style={{
                background: isSel ? `${lc}12` : "rgba(255,255,255,.04)",
                backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
                border: `1px solid ${isSel ? lc : "rgba(255,255,255,.09)"}`,
                borderLeft: `3px solid ${lc}`,
                borderRadius:14, padding:"14px 14px", marginBottom:9,
                cursor:"pointer", opacity:isActionable?1:.65,
                transition:"all .2s",
                boxShadow: isSel ? `0 0 20px ${lc}30` : "none",
              }}>

              {/* Top row */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                    <span style={{background:`${lc}25`,border:`1px solid ${lc}50`,color:lc,fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:10,letterSpacing:".06em",whiteSpace:"nowrap"}}>
                      {LEAGUE_LABELS[pred.league]||pred.league}
                    </span>
                    {pred.line_movement !== 0 && pred.line_movement != null && (
                      <span style={{fontSize:10,color:pred.line_movement>0?"#4ade80":"#f87171",fontWeight:700}}>
                        {pred.line_movement>0?"▲":""}{pred.line_movement>0?"":""}{pred.line_movement>0?"+":""}{pred.line_movement?.toFixed(1)} line move
                      </span>
                    )}
                    <span style={{fontSize:10,color:"rgba(255,255,255,.25)"}}>{formatTime(pred.commence_time)}</span>
                  </div>
                  <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",letterSpacing:"-.3px",lineHeight:1.3}}>{pred.matchup}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:3}}>Line: {pred.line} · MC: {pred.mc_mean?.toFixed(1)}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end",flexShrink:0}}>
                  <span style={{background:`${confColor}18`,border:`1px solid ${confColor}44`,color:confColor,fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:10,letterSpacing:".08em"}}>{pred.confidence==="MEDIUM"?"MED":pred.confidence}</span>
                  <span style={{background:`${playColor}18`,border:`1px solid ${playColor}44`,color:playColor,fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:10}}>
                    {pred.play==="OVER"?"↑ OVER":pred.play==="UNDER"?"↓ UNDER":"— PASS"}
                  </span>
                </div>
              </div>

              {/* Prob bar */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:11,color:"#60a5fa",width:38,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{pct(pred.prob_over)}</span>
                <div style={{flex:1,height:6,borderRadius:99,background:"rgba(255,255,255,.08)",overflow:"hidden",position:"relative"}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pred.prob_over*100}%`,background:`linear-gradient(90deg,${lc},${T.accent})`,borderRadius:99,transition:"width .5s"}}/>
                </div>
                <span style={{fontSize:11,color:"#c084fc",width:38,fontVariantNumeric:"tabular-nums"}}>{pct(pred.prob_under)}</span>
              </div>

              {/* MC range bar */}
              {pred.mc_mean && (() => {
                const mn=pred.mc_p10||0, mx=pred.mc_p90||0, rng=mx-mn||1;
                const lpos = Math.min(Math.max((pred.line-mn)/rng,0),1)*100;
                const mpos = Math.min(Math.max((pred.mc_mean-mn)/rng,0),1)*100;
                return (
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.2)",marginBottom:4,letterSpacing:".05em"}}>SIM RANGE {mn.toFixed(0)}–{mx.toFixed(0)} pts</div>
                    <div style={{position:"relative",height:14}}>
                      <div style={{position:"absolute",top:4,left:0,right:0,height:6,background:"rgba(255,255,255,.06)",borderRadius:3}}/>
                      <div style={{position:"absolute",top:0,left:`${mpos}%`,width:2,height:14,background:lc,borderRadius:1,transform:"translateX(-50%)",boxShadow:`0 0 6px ${lc}`}}/>
                      <div style={{position:"absolute",top:0,left:`${lpos}%`,width:1.5,height:14,background:"#f59e0b",borderRadius:1,transform:"translateX(-50%)"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(255,255,255,.25)",marginTop:3}}>
                      <span style={{color:lc}}>◆ {pred.mc_mean.toFixed(1)}</span>
                      <span style={{color:"#f59e0b"}}>| Line {pred.line}</span>
                      <span>±{pred.mc_std?.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* EV row */}
              {isActionable && (
                <div style={{display:"flex",gap:16,fontSize:11,flexWrap:"wrap",borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:8,marginTop:4}}>
                  <span style={{color:"rgba(255,255,255,.35)"}}>Edge <span style={{color:pred.edge>0?"#4ade80":"#f87171",fontWeight:700}}>{sign(pred.edge)}</span></span>
                  <span style={{color:"rgba(255,255,255,.35)"}}>EV <span style={{color:pred.ev_per_dollar>0?"#4ade80":"#f87171",fontWeight:700}}>${pred.ev_per_dollar?.toFixed(3)}/u</span></span>
                  {pred.kelly_stake && <span style={{color:"rgba(255,255,255,.35)"}}>Kelly <span style={{color:T.accent,fontWeight:700}}>${pred.kelly_stake}</span></span>}
                </div>
              )}

              {/* Expanded detail */}
              {isSel && pred.mc_mean && (
                <div style={{marginTop:12,padding:"12px",background:"rgba(0,0,0,.25)",borderRadius:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["Proj. total",pred.mc_mean?.toFixed(1)],["Std dev",`±${pred.mc_std?.toFixed(1)}`],["Low (10th)",pred.mc_p10?.toFixed(1)],["High (90th)",pred.mc_p90?.toFixed(1)],["Home proj.",pred.mc_home?.toFixed(1)],["Away proj.",pred.mc_away?.toFixed(1)]].map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,borderBottom:"1px solid rgba(255,255,255,.05)",paddingBottom:5}}>
                      <span style={{color:"rgba(255,255,255,.35)"}}>{l}</span>
                      <span style={{color:T.accent,fontWeight:700}}>{v||"—"}</span>
                    </div>
                  ))}
                  {pred.play!=="PASS"&&<div style={{gridColumn:"1/-1",background:`${T.primary}20`,border:`1px solid ${T.primary}44`,borderRadius:8,padding:"10px 12px",marginTop:4}}>
                    <div style={{fontSize:12,color:T.accent,fontWeight:800,marginBottom:4}}>{pred.play==="OVER"?"↑":"↓"} {pred.play} {pred.line}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Quarter Kelly stake: <strong style={{color:"#fff"}}>${pred.kelly_stake}</strong> of $1,000</div>
                  </div>}
                </div>
              )}
            </div>
          );
        })}

        {/* History strip */}
        <div style={{...glass,padding:"14px",marginTop:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:".08em",fontWeight:700}}>7-DAY RECORD</span>
            <span style={{fontSize:12,color:totalPnL>=0?"#4ade80":"#f87171",fontWeight:800}}>{totalPnL>=0?"+":""}{totalPnL.toFixed(2)} units</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {history.map(h=>{
              const wr=h.wins/(h.bets||1);
              const col=wr>=.6?"#4ade80":wr>=.5?"#fbbf24":"#f87171";
              return(
                <div key={h.date} style={{background:"rgba(0,0,0,.25)",borderRadius:8,padding:"8px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.05)"}}>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.25)",marginBottom:4}}>{h.date}</div>
                  <div style={{fontSize:12,fontWeight:800,color:col}}>{h.wins}–{h.losses}</div>
                  <div style={{fontSize:9,color:h.pnl>=0?"#4ade80":"#f87171",marginTop:2}}>{h.pnl>=0?"+":""}{h.pnl.toFixed(2)}u</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{marginTop:16,textAlign:"center",fontSize:9,color:"rgba(255,255,255,.15)",lineHeight:1.8}}>
          XGBoost + Monte Carlo simulation · Isotonic calibration<br/>
          Quarter Kelly · −110 juice · Not financial advice
        </div>
      </div>
    </div>
  );
}
