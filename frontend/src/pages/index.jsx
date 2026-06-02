import { useState, useEffect } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const LEAGUE_CONFIG = {
  "basketball_nba":        { label:"NBA",         color:"#3b82f6", dot:"#60a5fa", source:"nba_api (free)" },
  "basketball_wnba":       { label:"WNBA",         color:"#f97316", dot:"#fb923c", source:"The Odds API" },
  "basketball_ncaab":      { label:"NCAA Men",     color:"#8b5cf6", dot:"#a78bfa", source:"The Odds API" },
  "basketball_ncaaw":      { label:"NCAA Women",   color:"#ec4899", dot:"#f472b6", source:"The Odds API" },
  "basketball_euroleague": { label:"EuroLeague",   color:"#14b8a6", dot:"#2dd4bf", source:"The Odds API" },
  "basketball_nbl":        { label:"NBL Australia",color:"#eab308", dot:"#facc15", source:"The Odds API" },
  "basketball_cba":        { label:"CBA China",    color:"#ef4444", dot:"#f87171", source:"The Odds API" },
};
const DEFAULT_LC = { label:"Basketball", color:"#6366f1", dot:"#818cf8", source:"The Odds API" };

const MOCK = [
  {game_id:"d1",league:"basketball_wnba",league_name:"WNBA",matchup:"Connecticut Sun @ Atlanta Dream",home_team:"Atlanta Dream",away_team:"Connecticut Sun",line:159.5,prob_over:0.505,prob_under:0.495,play:"PASS",confidence:"LOW",edge:0.012,ev_per_dollar:-0.011,kelly_stake:null,line_movement:0,mc_mean:159.3,mc_std:12.0,mc_p10:143.9,mc_p90:174.7,commence_time:"7:00 PM"},
  {game_id:"d2",league:"basketball_wnba",league_name:"WNBA",matchup:"Chicago Sky @ Washington Mystics",home_team:"Washington Mystics",away_team:"Chicago Sky",line:160.5,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.008,ev_per_dollar:-0.015,kelly_stake:null,line_movement:0.5,mc_mean:160.5,mc_std:12.0,mc_p10:145.1,mc_p90:175.9,commence_time:"7:00 PM"},
  {game_id:"d3",league:"basketball_nba",league_name:"NBA",matchup:"New York Knicks @ San Antonio Spurs",home_team:"San Antonio Spurs",away_team:"New York Knicks",line:218.0,prob_over:0.50,prob_under:0.50,play:"PASS",confidence:"LOW",edge:0.005,ev_per_dollar:-0.018,kelly_stake:null,line_movement:0,mc_mean:218.1,mc_std:12.0,mc_p10:202.7,mc_p90:233.5,commence_time:"8:30 PM"},
];
const MOCK_HIST=[{date:"May 27",bets:3,wins:2,losses:1,pnl:.82},{date:"May 28",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 29",bets:4,wins:2,losses:2,pnl:-.18},{date:"May 30",bets:3,wins:1,losses:2,pnl:-1.09},{date:"May 31",bets:2,wins:2,losses:0,pnl:1.82},{date:"Jun 1",bets:5,wins:3,losses:2,pnl:.73},{date:"Jun 2",bets:3,wins:2,losses:1,pnl:.82}];

const pct=(n,d=1)=>`${(n*100).toFixed(d)}%`;
const sign=(n,d=1)=>`${n>=0?"+":""}${(n*100).toFixed(d)}%`;
const PLAY={OVER:{text:"#60a5fa",icon:"↑"},UNDER:{text:"#c084fc",icon:"↓"},PASS:{text:"#475569",icon:"—"}};

function LeaguePill({league}){
  const lc=LEAGUE_CONFIG[league]||DEFAULT_LC;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,background:`${lc.color}18`,border:`1px solid ${lc.color}44`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,color:lc.color,letterSpacing:".06em"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:lc.color,flexShrink:0}}/>
      {lc.label}
    </span>
  );
}

function SourceTag({league}){
  const lc=LEAGUE_CONFIG[league]||DEFAULT_LC;
  return(
    <span style={{fontSize:10,color:"#334155",display:"flex",alignItems:"center",gap:4}}>
      <i className="ti ti-database" style={{fontSize:11,color:lc.color}} aria-hidden="true"/>
      {lc.source}
    </span>
  );
}

function ProbBar({p,league}){
  const lc=LEAGUE_CONFIG[league]||DEFAULT_LC;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:11,color:"#60a5fa",width:40,textAlign:"right"}}>{pct(p)}</span>
      <div style={{flex:1,height:5,borderRadius:99,background:"#1e293b",overflow:"hidden"}}>
        <div style={{width:`${p*100}%`,height:"100%",background:lc.color,transition:"width .5s"}}/>
      </div>
      <span style={{fontSize:11,color:"#94a3b8",width:40}}>{pct(1-p)}</span>
    </div>
  );
}

function DistBar({pred}){
  if(!pred.mc_mean)return null;
  const mn=pred.mc_p10||0,mx=pred.mc_p90||0,rng=mx-mn||1;
  const lc=LEAGUE_CONFIG[pred.league]||DEFAULT_LC;
  const lp=Math.min(Math.max((pred.line-mn)/rng,0),1)*100;
  const mp=Math.min(Math.max((pred.mc_mean-mn)/rng,0),1)*100;
  return(
    <div style={{marginTop:10}}>
      <div style={{fontSize:9,color:"#1e3a5f",letterSpacing:".07em",marginBottom:5}}>SIMULATION RANGE {mn.toFixed(0)}–{mx.toFixed(0)} pts</div>
      <div style={{position:"relative",height:16}}>
        <div style={{position:"absolute",top:5,left:0,right:0,height:6,background:"#1e293b",borderRadius:3}}/>
        <div style={{position:"absolute",top:1,left:`${mp}%`,width:2,height:14,background:lc.color,borderRadius:1,transform:"translateX(-50%)"}}/>
        <div style={{position:"absolute",top:0,left:`${lp}%`,width:1.5,height:16,background:"#f59e0b",borderRadius:1,transform:"translateX(-50%)"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#334155",marginTop:3}}>
        <span style={{color:lc.color}}>◆ Mean {pred.mc_mean.toFixed(1)}</span>
        <span style={{color:"#f59e0b"}}>| Line {pred.line}</span>
        <span>±{pred.mc_std?.toFixed(1)}</span>
      </div>
    </div>
  );
}

function Sparkline({history}){
  if(!history?.length)return null;
  const cum=history.reduce((a,h)=>{a.push((a.at(-1)??0)+h.pnl);return a;},[]);
  const mn=Math.min(...cum),mx=Math.max(...cum),rng=mx-mn||1,W=90,H=26,p=3;
  const pts=cum.map((v,i)=>`${p+(i/(cum.length-1))*(W-p*2)},${H-p-((v-mn)/rng)*(H-p*2)}`).join(" ");
  const col=cum.at(-1)>=0?"#4ade80":"#f87171";
  return(<svg width={W} height={H}><polyline points={pts} fill="none" stroke={col} strokeWidth={1.5} strokeLinejoin="round"/>{cum.map((v,i)=>{const x=p+(i/(cum.length-1))*(W-p*2),y=H-p-((v-mn)/rng)*(H-p*2);return<circle key={i} cx={x} cy={y} r={2} fill={col}/>;})}</svg>);
}

function KPI({label,value,sub,accent}){
  return(
    <div style={{background:"#080f1e",border:"1px solid #0f2040",borderTop:`2px solid ${accent}`,borderRadius:8,padding:"12px 16px"}}>
      <div style={{fontSize:9,color:"#334155",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color:"#f1f5f9",letterSpacing:"-.5px"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#334155",marginTop:3}}>{sub}</div>}
    </div>
  );
}

export default function App(){
  const [preds,setPreds]=useState(MOCK);
  const [history,setHistory]=useState(MOCK_HIST);
  const [genAt,setGenAt]=useState(null);
  const [live,setLive]=useState(false);
  const [filter,setFilter]=useState("ALL");
  const [leagueFilter,setLeagueFilter]=useState("ALL");
  const [sel,setSel]=useState(null);

  useEffect(()=>{(async()=>{
    const[pd,hd]=await Promise.all([loadJSON("/predictions.json"),loadJSON("/history.json")]);
    if(pd?.predictions?.length){setPreds(pd.predictions);setGenAt(pd.generated_at);setLive(true);}
    if(hd?.length)setHistory(hd);
  })();},[]);

  const leagues=[...new Set(preds.map(p=>p.league))].filter(Boolean);
  let filtered=filter==="ALL"?preds:filter==="BETS"?preds.filter(p=>p.play!=="PASS"):preds.filter(p=>p.play===filter);
  if(leagueFilter!=="ALL") filtered=filtered.filter(p=>p.league===leagueFilter);

  const selP=preds.find(p=>p.game_id===sel);
  const actionable=preds.filter(p=>p.play!=="PASS");
  const totalPnL=history.reduce((s,h)=>s+h.pnl,0);
  const totalBets=history.reduce((s,h)=>s+h.bets,0);
  const totalWins=history.reduce((s,h)=>s+h.wins,0);

  return(
    <div style={{minHeight:"100vh",background:"#020710",backgroundImage:"radial-gradient(ellipse at 20% 0%,#0a1628,transparent 55%),radial-gradient(ellipse at 80% 0%,#0d0a28,transparent 55%)",color:"#cbd5e1",fontFamily:"'JetBrains Mono','Fira Code',monospace",padding:"20px 16px",maxWidth:980,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontSize:18}}>🏀</span>
            <span style={{fontSize:17,fontWeight:800,letterSpacing:"-.3px",color:"#f1f5f9"}}>BASKETBALL-AI</span>
            <span style={{background:live?"rgba(34,197,94,.12)":"rgba(100,116,139,.1)",border:`1px solid ${live?"rgba(34,197,94,.3)":"rgba(100,116,139,.2)"}`,color:live?"#4ade80":"#475569",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:3,letterSpacing:".08em"}}>{live?"LIVE":"DEMO"}</span>
          </div>
          <div style={{fontSize:10,color:"#1e3a5f"}}>XGBoost + Monte Carlo · {genAt?`Updated ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`:"Daily via GitHub Actions"}</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {["ALL","BETS","OVER","UNDER"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?"#0f2040":"transparent",color:filter===f?"#60a5fa":"#334155",border:`1px solid ${filter===f?"#1d4ed8":"#0f2040"}`,padding:"5px 10px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{f}</button>)}
        </div>
      </div>

      {/* League legend + filter */}
      <div style={{background:"#060d1c",border:"1px solid #0f2040",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,color:"#334155",letterSpacing:".07em",marginRight:4}}>DATA SOURCE:</span>
        <button onClick={()=>setLeagueFilter("ALL")} style={{background:leagueFilter==="ALL"?"#1e293b":"transparent",border:"1px solid #1e293b",borderRadius:4,padding:"3px 10px",fontSize:10,color:leagueFilter==="ALL"?"#f1f5f9":"#475569",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>ALL</button>
        {leagues.map(l=>{
          const lc=LEAGUE_CONFIG[l]||DEFAULT_LC;
          return(
            <button key={l} onClick={()=>setLeagueFilter(leagueFilter===l?"ALL":l)} style={{display:"flex",alignItems:"center",gap:5,background:leagueFilter===l?`${lc.color}20`:"transparent",border:`1px solid ${leagueFilter===l?lc.color:"#1e293b"}`,borderRadius:4,padding:"3px 10px",fontSize:10,color:leagueFilter===l?lc.color:"#475569",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:lc.color}}/>
              {lc.label}
              <span style={{fontSize:9,color:"#334155",marginLeft:2}}>({preds.filter(p=>p.league===l).length})</span>
            </button>
          );
        })}
        <span style={{marginLeft:"auto",fontSize:10,color:"#334155",display:"flex",alignItems:"center",gap:4}}>
          <i className="ti ti-database" aria-hidden="true" style={{fontSize:11}}/>
          nba_api (free) + The Odds API
        </span>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        <KPI label="Today's Games" value={`${actionable.length}/${preds.length}`} sub="actionable plays" accent="#3b82f6"/>
        <KPI label="7-Day Win Rate" value={`${(totalWins/(totalBets||1)*100).toFixed(1)}%`} sub={`${totalWins}W–${totalBets-totalWins}L`} accent={totalWins/totalBets>=.54?"#4ade80":"#f87171"}/>
        <KPI label="7-Day P&L" value={`${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`} sub="units at $1,000 bankroll" accent={totalPnL>=0?"#4ade80":"#f87171"}/>
        <KPI label="Leagues Active" value={leagues.length||7} sub="across all regions" accent="#a78bfa"/>
      </div>

      {/* Main content */}
      <div style={{display:"grid",gridTemplateColumns:selP?"1fr 290px":"1fr",gap:14}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.length===0&&<div style={{color:"#334155",textAlign:"center",padding:"40px 0",fontSize:12}}>No games match this filter.</div>}
          {filtered.map(pred=>{
            const lc=LEAGUE_CONFIG[pred.league]||DEFAULT_LC;
            const ps=PLAY[pred.play]||PLAY.PASS;
            const isActionable=pred.play!=="PASS";
            return(
              <div key={pred.game_id} onClick={()=>setSel(sel===pred.game_id?null:pred.game_id)} style={{background:sel===pred.game_id?"#0a1f3d":"#060d1c",border:`1px solid ${sel===pred.game_id?"#1d4ed8":isActionable?`${lc.color}44`:"#0a1525"}`,borderLeft:`3px solid ${lc.color}`,borderRadius:8,padding:"14px 16px",cursor:"pointer",opacity:isActionable?1:.7,transition:"all .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <LeaguePill league={pred.league}/>
                      <SourceTag league={pred.league}/>
                    </div>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{pred.matchup}</div>
                    <div style={{fontSize:11,color:"#334155",display:"flex",gap:12,flexWrap:"wrap"}}>
                      <span>Line <span style={{color:"#475569"}}>{pred.line}</span></span>
                      {pred.line_movement!==0&&pred.line_movement!=null&&<span style={{color:pred.line_movement>0?"#4ade80":"#f87171"}}>{pred.line_movement>0?"▲":"▼"} {Math.abs(pred.line_movement).toFixed(1)}</span>}
                      {pred.mc_mean&&<span style={{color:lc.color}}>MC {pred.mc_mean.toFixed(1)}</span>}
                      <span style={{color:"#1e3a5f"}}>{typeof pred.commence_time==="string"&&pred.commence_time.includes("T")?new Date(pred.commence_time).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}):pred.commence_time}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                    <span style={{background:pred.confidence==="HIGH"?"rgba(34,197,94,.12)":pred.confidence==="MEDIUM"?"rgba(251,191,36,.10)":"rgba(100,116,139,.10)",border:`1px solid ${pred.confidence==="HIGH"?"rgba(34,197,94,.28)":pred.confidence==="MEDIUM"?"rgba(251,191,36,.28)":"rgba(100,116,139,.22)"}`,color:pred.confidence==="HIGH"?"#4ade80":pred.confidence==="MEDIUM"?"#fbbf24":"#64748b",fontSize:10,fontWeight:800,letterSpacing:".1em",padding:"2px 8px",borderRadius:4}}>{pred.confidence==="MEDIUM"?"MED":pred.confidence}</span>
                    <span style={{background:`${ps.text}18`,border:`1px solid ${ps.text}44`,color:ps.text,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:5}}>{ps.icon} {pred.play}</span>
                  </div>
                </div>
                <ProbBar p={pred.prob_over} league={pred.league}/>
                <DistBar pred={pred}/>
                {isActionable&&<div style={{display:"flex",gap:16,marginTop:10,fontSize:11,color:"#334155",flexWrap:"wrap"}}>
                  <span>Edge <span style={{color:pred.edge>0?"#4ade80":"#f87171",fontWeight:700}}>{sign(pred.edge)}</span></span>
                  <span>EV <span style={{color:pred.ev_per_dollar>0?"#4ade80":"#f87171",fontWeight:700}}>${pred.ev_per_dollar.toFixed(3)}/u</span></span>
                  {pred.kelly_stake&&<span>Kelly <span style={{color:"#94a3b8",fontWeight:600}}>${pred.kelly_stake}</span></span>}
                </div>}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selP&&(()=>{
          const lc=LEAGUE_CONFIG[selP.league]||DEFAULT_LC;
          const ps=PLAY[selP.play]||PLAY.PASS;
          return(
            <div style={{background:"#060d1c",border:`1px solid ${lc.color}44`,borderTop:`2px solid ${lc.color}`,borderRadius:8,padding:20,alignSelf:"start",position:"sticky",top:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <LeaguePill league={selP.league}/>
                  <div style={{fontWeight:700,fontSize:14,margin:"6px 0 2px"}}>{selP.matchup}</div>
                  <SourceTag league={selP.league}/>
                </div>
                <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:"#334155",fontSize:18,cursor:"pointer"}}>×</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                {[["OVER",selP.prob_over,"#3b82f6"],["UNDER",selP.prob_under,"#a855f7"]].map(([label,prob,col])=>(
                  <div key={label} style={{background:"#080f1e",border:`1px solid ${col}22`,borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#334155",letterSpacing:".1em",marginBottom:6}}>{label}</div>
                    <div style={{fontSize:20,fontWeight:800,color:col}}>{pct(prob,1)}</div>
                    <div style={{height:3,borderRadius:99,background:"#1e293b",marginTop:8,overflow:"hidden"}}><div style={{width:`${prob*100}%`,height:"100%",background:col}}/></div>
                  </div>
                ))}
              </div>

              {selP.mc_mean&&<>
                <div style={{fontSize:10,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Monte Carlo (10k sims)</div>
                {[["Projected total",selP.mc_mean?.toFixed(1)],["Std deviation",`±${selP.mc_std?.toFixed(1)}`],["10th pct (low)",selP.mc_p10?.toFixed(1)],["90th pct (high)",selP.mc_p90?.toFixed(1)],["Home proj.",selP.mc_home?.toFixed(1)],["Away proj.",selP.mc_away?.toFixed(1)]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                    <span style={{color:"#334155"}}>{l}</span><span style={{color:"#64748b",fontWeight:600}}>{v||"—"}</span>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #1e293b",margin:"12px 0"}}/>
              </>}

              {selP.play!=="PASS"&&<div style={{background:`${ps.text}10`,border:`1px solid ${ps.text}44`,borderRadius:7,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:ps.text,fontWeight:800,marginBottom:6}}>{ps.icon} {selP.play} {selP.line}</div>
                <div style={{fontSize:12,color:"#64748b"}}>Quarter Kelly: <strong style={{color:"#e2e8f0"}}>${selP.kelly_stake}</strong></div>
                <div style={{fontSize:11,color:"#334155",marginTop:4}}>Edge {sign(selP.edge)} · EV ${selP.ev_per_dollar?.toFixed(3)}/unit</div>
              </div>}
            </div>
          );
        })()}
      </div>

      {/* History */}
      <div style={{marginTop:16,background:"#060d1c",border:"1px solid #0f2040",borderRadius:8,padding:"14px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#334155"}}>7-DAY PERFORMANCE</span>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:11,color:totalPnL>=0?"#4ade80":"#f87171",fontWeight:700}}>{totalPnL>=0?"+":""}{totalPnL.toFixed(2)}u</span>
            <Sparkline history={history}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {history.map(h=>{const wr=h.wins/(h.bets||1),col=wr>=.6?"#4ade80":wr>=.5?"#fbbf24":"#f87171";return(
            <div key={h.date} style={{background:"#080f1e",border:"1px solid #0f2040",borderRadius:6,padding:"8px 6px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#1e3a5f",marginBottom:5}}>{h.date}</div>
              <div style={{fontSize:12,fontWeight:800,color:col}}>{h.wins}–{h.losses}</div>
              <div style={{fontSize:10,color:h.pnl>=0?"#4ade80":"#f87171",marginTop:2}}>{h.pnl>=0?"+":""}{h.pnl.toFixed(2)}u</div>
            </div>
          );})}
        </div>
      </div>

      <div style={{marginTop:12,display:"flex",justifyContent:"space-between",fontSize:9,color:"#0f2040",flexWrap:"wrap",gap:6}}>
        <span>XGBoost + Monte Carlo · IsotonicCalibration · QuarterKelly · −110 juice</span>
        <span>Predictions updated daily via GitHub Actions → Vercel</span>
      </div>
    </div>
  );
}
