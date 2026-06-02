/**
 * Basketball-AI Dashboard
 * Reads /public/predictions.json committed daily by GitHub Actions.
 * No backend server needed. Deploy to Vercel as-is.
 */

import { useState, useEffect } from "react";

async function loadJSON(path) {
  try { const r = await fetch(path); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return null; }
}

const MOCK_PREDS = [
  { game_id:"d1",matchup:"Celtics @ Nuggets", home_team:"Nuggets",away_team:"Celtics",  line:228.5,prob_over:0.641,prob_under:0.359,play:"OVER", confidence:"HIGH",  edge:0.094,ev_per_dollar:0.086,kelly_stake:18.50,line_movement:1.5, mc_mean:231.2,mc_std:12.4,mc_p10:215.1,mc_p90:247.8,mc_home:117.3,mc_away:113.9,commence_time:"7:00 PM"},
  { game_id:"d2",matchup:"Warriors @ Bucks",  home_team:"Bucks",  away_team:"Warriors", line:232.0,prob_over:0.388,prob_under:0.612,play:"UNDER",confidence:"MEDIUM",edge:0.067,ev_per_dollar:0.061,kelly_stake:11.00,line_movement:-1.0,mc_mean:228.4,mc_std:13.1,mc_p10:209.6,mc_p90:248.2,mc_home:116.8,mc_away:111.6,commence_time:"7:30 PM"},
  { game_id:"d3",matchup:"Lakers @ Heat",     home_team:"Heat",   away_team:"Lakers",   line:214.5,prob_over:0.603,prob_under:0.397,play:"OVER", confidence:"MEDIUM",edge:0.057,ev_per_dollar:0.052,kelly_stake:9.25, line_movement:2.0, mc_mean:217.8,mc_std:11.9,mc_p10:200.3,mc_p90:235.4,mc_home:109.2,mc_away:108.6,commence_time:"8:00 PM"},
  { game_id:"d4",matchup:"Suns @ Knicks",     home_team:"Knicks", away_team:"Suns",     line:220.5,prob_over:0.523,prob_under:0.477,play:"PASS", confidence:"LOW",   edge:0.012,ev_per_dollar:-0.011,kelly_stake:null,line_movement:0,   mc_mean:220.9,mc_std:12.2,mc_p10:203.0,mc_p90:238.7,mc_home:111.4,mc_away:109.5,commence_time:"8:30 PM"},
  { game_id:"d5",matchup:"Clippers @ Thunder",home_team:"Thunder",away_team:"Clippers",line:219.0,prob_over:0.441,prob_under:0.559,play:"PASS", confidence:"LOW",   edge:0.023,ev_per_dollar:0.021, kelly_stake:null,line_movement:-0.5,mc_mean:217.1,mc_std:11.6,mc_p10:200.4,mc_p90:233.8,mc_home:109.6,mc_away:107.5,commence_time:"10:00 PM"},
];
const MOCK_HIST=[{date:"May 23",bets:3,wins:2,losses:1,pnl:.82},{date:"May 24",bets:5,wins:3,losses:2,pnl:.73},{date:"May 25",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 26",bets:3,wins:1,losses:2,pnl:-1.09},{date:"May 27",bets:4,wins:2,losses:2,pnl:-.18},{date:"May 28",bets:2,wins:2,losses:0,pnl:1.82},{date:"May 29",bets:3,wins:2,losses:1,pnl:.82}];
const MOCK_META={cv_roc_auc_mean:0.612,n_samples:480};

const pct=(n,d=1)=>`${(n*100).toFixed(d)}%`;
const sign=(n,d=1)=>`${n>=0?"+":""}${(n*100).toFixed(d)}%`;
const C={HIGH:{bg:"rgba(34,197,94,.12)",border:"rgba(34,197,94,.28)",text:"#4ade80"},MEDIUM:{bg:"rgba(251,191,36,.10)",border:"rgba(251,191,36,.28)",text:"#fbbf24"},LOW:{bg:"rgba(100,116,139,.10)",border:"rgba(100,116,139,.22)",text:"#64748b"}};
const PL={OVER:{bg:"rgba(59,130,246,.12)",border:"rgba(59,130,246,.28)",text:"#60a5fa",icon:"↑"},UNDER:{bg:"rgba(168,85,247,.12)",border:"rgba(168,85,247,.28)",text:"#c084fc",icon:"↓"},PASS:{bg:"rgba(71,85,105,.08)",border:"rgba(71,85,105,.18)",text:"#475569",icon:"—"}};

function Badge({label,s}){return <span style={{background:s.bg,border:`1px solid ${s.border}`,color:s.text,fontSize:10,fontWeight:800,letterSpacing:".1em",padding:"2px 8px",borderRadius:4}}>{label}</span>;}
function ProbBar({p}){return(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"#60a5fa",width:40,textAlign:"right"}}>{pct(p)}</span><div style={{flex:1,height:5,borderRadius:99,background:"#1e293b",overflow:"hidden"}}><div style={{width:`${p*100}%`,height:"100%",background:"linear-gradient(90deg,#3b82f6,#818cf8)",transition:"width .5s"}}/></div><span style={{fontSize:11,color:"#c084fc",width:40}}>{pct(1-p)}</span></div>);}
function DistBar({pred,line}){
  if(!pred.mc_mean)return null;
  const mn=pred.mc_p10||0,mx=pred.mc_p90||0,rng=mx-mn||1;
  const lp=Math.min(Math.max((line-mn)/rng,0),1)*100;
  const mp=Math.min(Math.max((pred.mc_mean-mn)/rng,0),1)*100;
  return(<div style={{marginTop:10}}><div style={{fontSize:10,color:"#334155",marginBottom:5}}>SIMULATION RANGE {mn.toFixed(0)}–{mx.toFixed(0)} pts</div><div style={{position:"relative",height:18}}><div style={{position:"absolute",top:6,left:0,right:0,height:6,background:"#1e293b",borderRadius:3}}/><div style={{position:"absolute",top:2,left:`${mp}%`,width:2,height:14,background:"#818cf8",borderRadius:1,transform:"translateX(-50%)"}}/><div style={{position:"absolute",top:0,left:`${lp}%`,width:1.5,height:18,background:"#f59e0b",borderRadius:1,transform:"translateX(-50%)"}}/></div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#334155",marginTop:4}}><span style={{color:"#818cf8"}}>◆ Mean {pred.mc_mean.toFixed(1)}</span><span style={{color:"#f59e0b"}}>| Line {line}</span><span>±{pred.mc_std?.toFixed(1)}</span></div></div>);
}
function Sparkline({history}){
  if(!history?.length)return null;
  const cum=history.reduce((a,h)=>{a.push((a.at(-1)??0)+h.pnl);return a;},[]);
  const mn=Math.min(...cum),mx=Math.max(...cum),rng=mx-mn||1,W=96,H=28,p=3;
  const pts=cum.map((v,i)=>`${p+(i/(cum.length-1))*(W-p*2)},${H-p-((v-mn)/rng)*(H-p*2)}`).join(" ");
  const col=cum.at(-1)>=0?"#4ade80":"#f87171";
  return(<svg width={W} height={H}><polyline points={pts} fill="none" stroke={col} strokeWidth={1.5} strokeLinejoin="round"/>{cum.map((v,i)=>{const x=p+(i/(cum.length-1))*(W-p*2),y=H-p-((v-mn)/rng)*(H-p*2);return<circle key={i} cx={x} cy={y} r={2} fill={col}/>;})}</svg>);
}
function KPI({label,value,sub,accent}){return(<div style={{background:"#080f1e",border:"1px solid #0f2040",borderTop:`2px solid ${accent}`,borderRadius:8,padding:"12px 16px"}}><div style={{fontSize:9,color:"#334155",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{label}</div><div style={{fontSize:21,fontWeight:800,color:"#f1f5f9",letterSpacing:"-.5px"}}>{value}</div>{sub&&<div style={{fontSize:11,color:"#334155",marginTop:3}}>{sub}</div>}</div>);}

export default function App(){
  const [preds,setPreds]=useState(MOCK_PREDS);
  const [history,setHistory]=useState(MOCK_HIST);
  const [meta,setMeta]=useState(MOCK_META);
  const [genAt,setGenAt]=useState(null);
  const [live,setLive]=useState(false);
  const [filter,setFilter]=useState("ALL");
  const [sel,setSel]=useState(null);

  useEffect(()=>{(async()=>{
    const[pd,hd,md]=await Promise.all([loadJSON("/predictions.json"),loadJSON("/history.json"),loadJSON("/model_meta.json")]);
    if(pd?.predictions?.length){setPreds(pd.predictions);setGenAt(pd.generated_at);setLive(true);}
    if(hd?.length)setHistory(hd);
    if(md?.cv_roc_auc_mean)setMeta(md);
  })();},[]);

  const filtered=filter==="ALL"?preds:filter==="BETS"?preds.filter(p=>p.play!=="PASS"):preds.filter(p=>p.play===filter);
  const selP=preds.find(p=>p.game_id===sel);
  const actionable=preds.filter(p=>p.play!=="PASS");
  const totalPnL=history.reduce((s,h)=>s+h.pnl,0);
  const totalBets=history.reduce((s,h)=>s+h.bets,0);
  const totalWins=history.reduce((s,h)=>s+h.wins,0);

  return(<div style={{minHeight:"100vh",background:"#020710",backgroundImage:"radial-gradient(ellipse at 20% 0%,#0a1628,transparent 55%),radial-gradient(ellipse at 80% 0%,#0d0a28,transparent 55%)",color:"#cbd5e1",fontFamily:"'JetBrains Mono','Fira Code',monospace",padding:"20px 16px",maxWidth:1000,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:12}}>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:18}}>🏀</span>
          <span style={{fontSize:17,fontWeight:800,letterSpacing:"-.3px",color:"#f1f5f9"}}>BASKETBALL-AI</span>
          <span style={{background:live?"rgba(34,197,94,.12)":"rgba(100,116,139,.1)",border:`1px solid ${live?"rgba(34,197,94,.3)":"rgba(100,116,139,.2)"}`,color:live?"#4ade80":"#475569",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:3,letterSpacing:".08em"}}>{live?"LIVE":"DEMO"}</span>
        </div>
        <div style={{fontSize:10,color:"#1e3a5f"}}>XGBoost + Monte Carlo · {genAt?`Updated ${new Date(genAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`:"Daily via GitHub Actions"}</div>
      </div>
      <div style={{display:"flex",gap:4}}>
        {["ALL","BETS","OVER","UNDER"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?"#0f2040":"transparent",color:filter===f?"#60a5fa":"#334155",border:`1px solid ${filter===f?"#1d4ed8":"#0f2040"}`,padding:"5px 11px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",letterSpacing:".08em",fontFamily:"inherit"}}>{f}</button>)}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
      <KPI label="Today's Bets" value={`${actionable.length}/${preds.length}`} sub="actionable plays" accent="#3b82f6"/>
      <KPI label="7-Day Win Rate" value={pct(totalWins/(totalBets||1))} sub={`${totalWins}W–${totalBets-totalWins}L`} accent={totalWins/totalBets>=.54?"#4ade80":"#f87171"}/>
      <KPI label="7-Day P&L" value={`${totalPnL>=0?"+":""}${totalPnL.toFixed(2)}u`} sub="units at $1,000 bankroll" accent={totalPnL>=0?"#4ade80":"#f87171"}/>
      <KPI label="Model AUC" value={(meta.cv_roc_auc_mean??0).toFixed(3)} sub={`${meta.n_samples??0} training games`} accent="#a78bfa"/>
    </div>

    <div style={{display:"grid",gridTemplateColumns:selP?"1fr 300px":"1fr",gap:14}}>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(pred=>{
          const ps=PL[pred.play]||PL.PASS,cs=C[pred.confidence]||C.LOW;
          return(<div key={pred.game_id} onClick={()=>setSel(sel===pred.game_id?null:pred.game_id)} style={{background:sel===pred.game_id?"#0a1f3d":"#060d1c",border:`1px solid ${sel===pred.game_id?"#1d4ed8":pred.play!=="PASS"?"#0f2040":"#0a1525"}`,borderLeft:`3px solid ${ps.text}`,borderRadius:8,padding:"14px 16px",cursor:"pointer",opacity:pred.play==="PASS"?.65:1,transition:"all .15s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8,flexWrap:"wrap"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{pred.matchup}</div>
                <div style={{fontSize:11,color:"#334155",display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span>Line <span style={{color:"#475569"}}>{pred.line}</span></span>
                  {pred.line_movement!==0&&pred.line_movement!=null&&<span style={{color:pred.line_movement>0?"#4ade80":"#f87171"}}>{pred.line_movement>0?"▲":"▼"} {Math.abs(pred.line_movement).toFixed(1)}</span>}
                  {pred.mc_mean&&<span style={{color:"#6366f1"}}>MC {pred.mc_mean.toFixed(1)}</span>}
                  <span style={{color:"#1e3a5f"}}>{pred.commence_time}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                <Badge label={pred.confidence==="MEDIUM"?"MED":pred.confidence} s={cs}/>
                <Badge label={`${ps.icon} ${pred.play}`} s={ps}/>
              </div>
            </div>
            <ProbBar p={pred.prob_over}/>
            <DistBar pred={pred} line={pred.line}/>
            {pred.play!=="PASS"&&<div style={{display:"flex",gap:16,marginTop:10,fontSize:11,color:"#334155",flexWrap:"wrap"}}>
              <span>Edge <span style={{color:pred.edge>0?"#4ade80":"#f87171",fontWeight:700}}>{sign(pred.edge)}</span></span>
              <span>EV <span style={{color:pred.ev_per_dollar>0?"#4ade80":"#f87171",fontWeight:700}}>${pred.ev_per_dollar.toFixed(3)}/u</span></span>
              <span>Kelly <span style={{color:"#94a3b8",fontWeight:600}}>${pred.kelly_stake}</span></span>
            </div>}
          </div>);
        })}
      </div>

      {selP&&(()=>{const ps=PL[selP.play]||PL.PASS;return(
        <div style={{background:"#060d1c",border:"1px solid #0f2040",borderRadius:8,padding:20,alignSelf:"start",position:"sticky",top:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div><div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{selP.matchup}</div><div style={{fontSize:11,color:"#334155"}}>{selP.commence_time}</div></div>
            <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:"#334155",fontSize:18,cursor:"pointer"}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[["OVER",selP.prob_over,"#3b82f6"],["UNDER",selP.prob_under,"#a855f7"]].map(([label,prob,col])=>(
              <div key={label} style={{background:"#080f1e",border:`1px solid ${col}22`,borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"#334155",letterSpacing:".1em",marginBottom:6}}>{label}</div>
                <div style={{fontSize:20,fontWeight:800,color:col}}>{pct(prob,1)}</div>
                <div style={{height:3,borderRadius:99,background:"#1e293b",marginTop:8,overflow:"hidden"}}><div style={{width:`${prob*100}%`,height:"100%",background:col}}/></div>
              </div>
            ))}
          </div>
          {selP.mc_mean&&<>
            <div style={{fontSize:10,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Monte Carlo (10k sims)</div>
            {[["Projected total",selP.mc_mean?.toFixed(1)],["Std deviation",`±${selP.mc_std?.toFixed(1)}`],["10th pct",selP.mc_p10?.toFixed(1)],["90th pct",selP.mc_p90?.toFixed(1)],["Home proj.",selP.mc_home?.toFixed(1)],["Away proj.",selP.mc_away?.toFixed(1)]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:7,fontSize:12}}>
                <span style={{color:"#334155"}}>{l}</span><span style={{color:"#64748b",fontWeight:600}}>{v??"-"}</span>
              </div>
            ))}
            <div style={{borderTop:"1px solid #1e293b",margin:"12px 0"}}/>
          </>}
          {selP.play!=="PASS"&&<div style={{background:ps.bg,border:`1px solid ${ps.border}`,borderRadius:7,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:ps.text,fontWeight:800,marginBottom:6}}>{ps.icon} {selP.play} {selP.line}</div>
            <div style={{fontSize:12,color:"#64748b"}}>Quarter Kelly: <strong style={{color:"#e2e8f0"}}>${selP.kelly_stake}</strong></div>
            <div style={{fontSize:11,color:"#334155",marginTop:4}}>Edge {sign(selP.edge)} · EV ${selP.ev_per_dollar?.toFixed(3)}/unit</div>
          </div>}
        </div>
      );})()}
    </div>

    <div style={{marginTop:20,background:"#060d1c",border:"1px solid #0f2040",borderRadius:8,padding:"16px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#334155"}}>7-DAY PERFORMANCE</span>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
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

    <div style={{marginTop:14,display:"flex",justifyContent:"space-between",fontSize:9,color:"#0f2040",flexWrap:"wrap",gap:6}}>
      <span>XGBoost + Monte Carlo · IsotonicCalibration · QuarterKelly · −110 juice</span>
      <span>/predictions.json updated daily · GitHub Actions → Vercel</span>
    </div>
  </div>);
}
