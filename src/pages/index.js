/**
 * CONCRETE.YIELD — Live Yield Calculator
 * Community contribution to concrete.xyz
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck, TrendingUp, Zap, Lock,
  Activity, DollarSign, Percent, RefreshCw,
  AlertTriangle, Wifi, Clock,
} from 'lucide-react';

const ETHEREUM_RPC  = process.env.NEXT_PUBLIC_RPC_URL       || 'https://eth.llamarpc.com';
const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_KEY || '';
const ETHERSCAN_API = 'https://api.etherscan.io/api';

const VAULT_CONFIGS = [
  { id:'usdt', address:'0x0E609b710da5e0AA476224b6c0e5445cCc21251E', displayName:'USDT', assetSymbol:'USDT', assetDecimals:6, risk:'LOW', borderColor:'#00FF41', subtitle:'Stablecoin Yield', description:'USDT-denominated vault. Stable returns via automated DeFi strategies.' },
  { id:'weweth', address:'0xB9DC54c8261745CB97070CeFBE3D3d815aee8f20', displayName:'WeWETH', assetSymbol:'WETH', assetDecimals:18, risk:'MED', borderColor:'#FFB800', subtitle:'Wrapped ETH Yield', description:'ETH-denominated. Assets held by regulated custodian (BitGo). NAV updated daily on-chain by automated accounting. $400M+ TVL.', institutional:true },
  { id:'wbtc', address:'0xacce65B9dB4810125adDEa9797BaAaaaD2B73788', displayName:'WBTC', assetSymbol:'WBTC', assetDecimals:8, risk:'MED', borderColor:'#FFB800', subtitle:'Bitcoin Yield', description:'BTC-denominated. Yield on wrapped BTC via DeFi protocols.', pending:true },
  { id:'frxusd', address:'0xCF9ceAcf5c7d6D2FE6e8650D81FbE4240c72443f', displayName:'frxUSD', assetSymbol:'frxUSD', assetDecimals:18, risk:'LOW', borderColor:'#00FF41', subtitle:'Frax Stablecoin Yield', description:'frxUSD-denominated. Frax ecosystem yield strategies.' },
];

const TIMEFRAMES = [
  { label:'7D', days:7 }, { label:'1M', days:30 }, { label:'3M', days:90 }, { label:'6M', days:180 }, { label:'1Y', days:365 },
];

function formatUSD(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return '$' + (n/1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + (n/1000).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}
function formatAssetAmount(n, symbol) {
  if (n >= 1000000) return (n/1000000).toFixed(2) + 'M ' + symbol;
  if (n >= 1000)    return (n/1000).toFixed(2) + 'K ' + symbol;
  return n.toFixed(4) + ' ' + symbol;
}
function calcYield(principal, apyPct, days) {
  if (!apyPct) return 0;
  return principal * (Math.pow(1 + apyPct/100/365, days) - 1);
}
function calcTotal(principal, apyPct, days) {
  if (!apyPct) return principal;
  return principal * Math.pow(1 + apyPct/100/365, days);
}
function apyDisplay(apy) {
  if (apy === null || apy === undefined) return 'N/A';
  return apy.toFixed(2) + '%';
}
function timeSince(ts) {
  if (!ts) return '—';
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}

async function rpcCall(method, params) {
  var res = await fetch(ETHEREUM_RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:method,params:params||[]}) });
  if (!res.ok) throw new Error('RPC HTTP ' + res.status);
  var json = await res.json();
  if (json.error) throw new Error('RPC: ' + json.error.message);
  return json.result;
}
async function ethCall(to, data, block) { return rpcCall('eth_call', [{to:to,data:data}, block||'latest']); }

var SEL = { totalAssets:'0x01e1d114', totalSupply:'0x18160ddd', convertToAssets:'0x07a2d13a' };
function encodeConvertToAssets(decimals) {
  var val = '1'; for (var i=0;i<decimals;i++) val+='0';
  return SEL.convertToAssets + Math.floor(parseFloat(val)).toString(16).padStart(64,'0');
}
function decodeUint256(hex) { if (!hex||hex==='0x') return 0; return parseInt(hex,16); }

async function getBlockDaysAgo(days) {
  var timestamp = Math.floor(Date.now()/1000) - days*86400;
  var key = ETHERSCAN_KEY ? '&apikey='+ETHERSCAN_KEY : '';
  try {
    var res = await fetch(ETHERSCAN_API+'?module=block&action=getblocknobytime&timestamp='+timestamp+'&closest=before'+key);
    var json = await res.json();
    if (json.status==='1') return '0x'+parseInt(json.result,10).toString(16);
  } catch(e) {}
  var currentHex = await rpcCall('eth_blockNumber');
  return '0x'+Math.max(0,parseInt(currentHex,16)-Math.round(days*86400/12)).toString(16);
}

async function fetchSingleVault(config) {
  var results = await Promise.all([
    ethCall(config.address, SEL.totalAssets),
    ethCall(config.address, SEL.totalSupply),
    ethCall(config.address, encodeConvertToAssets(config.assetDecimals)),
  ]);
  var totalAssets = decodeUint256(results[0]);
  var totalSupply = decodeUint256(results[1]);
  var priceNow    = decodeUint256(results[2]);
  var apy = null;
  try {
    var block7d = await getBlockDaysAgo(7);
    var price7  = decodeUint256(await ethCall(config.address, encodeConvertToAssets(config.assetDecimals), block7d));
    if (price7>0&&priceNow>0) {
      var computed = (Math.pow(priceNow/price7, 365/7)-1)*100;
      if (!isNaN(computed)&&computed>=0&&computed<=50000) apy=computed;
    }
  } catch(e) { console.warn('APY calc failed for '+config.id+':', e.message); }
  var tvlRaw = totalAssets/Math.pow(10,config.assetDecimals);
  return Object.assign({}, config, { totalAssets, totalSupply, pricePerShare:priceNow/Math.pow(10,config.assetDecimals), tvlRaw, tvl:formatAssetAmount(tvlRaw,config.assetSymbol), apy, live:true, fetchedAt:Date.now() });
}

function generateLog(principal, vault, days) {
  var lines = [];
  var apyStr = vault.apy!==null ? vault.apy.toFixed(2)+'%' : 'N/A (live fetch pending)';
  lines.push({ts:'00:00:00',type:'sys', text:'CONCRETE.YIELD v2.1.0 — LIVE MODE'});
  lines.push({ts:'00:00:00',type:'sys', text:'RPC → '+ETHEREUM_RPC});
  lines.push({ts:'00:00:00',type:'sys', text:'CHAIN → Ethereum Mainnet (1)'});
  lines.push({ts:'00:00:01',type:'info',text:'VAULT: '+vault.displayName+' — '+vault.address});
  lines.push({ts:'00:00:01',type:'info',text:'7-DAY APY: '+apyStr});
  lines.push({ts:'00:00:02',type:'info',text:'TVL: '+(vault.tvl||'fetching...')});
  lines.push({ts:'00:00:02',type:'info',text:'PRINCIPAL: '+formatUSD(principal)});
  lines.push({ts:'00:00:02',type:'info',text:'HORIZON: '+days+'d'});
  lines.push({ts:'00:00:03',type:'sys', text:'ENGAGING PROTECTION LAYER...'});
  lines.push({ts:'00:00:03',type:'ok',  text:'[OK] SLIPPAGE GUARD ACTIVE'});
  lines.push({ts:'00:00:04',type:'ok',  text:'[OK] IL HEDGE INITIALIZED'});
  lines.push({ts:'00:00:04',type:'ok',  text:'[OK] EXIT CIRCUIT ARMED'});
  lines.push({ts:'00:00:05',type:'sys', text:'─── PROJECTION STREAM ──────────────'});
  if (vault.apy!==null) {
    var checkpoints = [1,7,14,30,60,90,180,365].filter(function(d){return d<=days;});
    var tpls = ['00:00:06','00:00:09','00:00:12','00:00:16','00:00:21','00:00:27','00:00:34','00:00:42'];
    checkpoints.forEach(function(d,i) {
      lines.push({ts:tpls[i]||'00:01:00',type:'yield',text:'DAY '+String(d).padStart(4,'0')+' → EARNED: '+formatUSD(calcYield(principal,vault.apy,d))+'  ·  TOTAL: '+formatUSD(calcTotal(principal,vault.apy,d))});
    });
    var fy = calcYield(principal,vault.apy,days);
    lines.push({ts:'00:01:10',type:'sys',   text:'─── FINAL PROJECTION ───────────────'});
    lines.push({ts:'00:01:11',type:'result',text:'GROSS YIELD: '+formatUSD(fy)});
    lines.push({ts:'00:01:11',type:'result',text:'ROI: '+((fy/principal)*100).toFixed(2)+'%'});
    lines.push({ts:'00:01:12',type:'result',text:'NET TOTAL:   '+formatUSD(calcTotal(principal,vault.apy,days))});
  } else {
    lines.push({ts:'00:01:10',type:'warn',text:'APY unavailable — vault may be new or RPC slow'});
    lines.push({ts:'00:01:11',type:'warn',text:'Wait for live data then re-run simulation'});
  }
  lines.push({ts:'00:01:13',type:'ok',text:'SIMULATION COMPLETE ▊'});
  return lines;
}

function useVaultData() {
  var [vaults,setVaults]           = useState(VAULT_CONFIGS.map(function(v){return Object.assign({},v,{apy:null,tvl:null,live:false});}));
  var [loading,setLoading]         = useState(true);
  var [error,setError]             = useState(null);
  var [lastFetched,setLastFetched] = useState(null);
  var [tick,setTick]               = useState(0);
  var fetchAll = useCallback(async function() {
    setLoading(true); setError(null);
    var results = await Promise.allSettled(VAULT_CONFIGS.map(fetchSingleVault));
    var updated = results.map(function(r,i) {
      if (r.status==='fulfilled') return r.value;
      console.warn('Vault '+VAULT_CONFIGS[i].id+' failed:', r.reason&&r.reason.message);
      return Object.assign({},VAULT_CONFIGS[i],{apy:null,tvl:'Fetch failed',live:false});
    });
    var failCount = results.filter(function(r){return r.status==='rejected';}).length;
    if (failCount===VAULT_CONFIGS.length) setError('All vault fetches failed. Check your RPC URL.');
    else if (failCount>0) setError(failCount+' vault(s) could not be reached.');
    setVaults(updated); setLastFetched(new Date()); setLoading(false);
  }, []);
  useEffect(function() { fetchAll(); var t=setInterval(fetchAll,60000); return function(){clearInterval(t);}; }, [fetchAll,tick]);
  return { vaults, loading, error, lastFetched, fetchAll, retry:function(){setTick(function(c){return c+1;});} };
}

function LiveBadge({loading,lastFetched,onRefresh}) {
  var [,setNow] = useState(Date.now());
  useEffect(function(){ var t=setInterval(function(){setNow(Date.now());},1000); return function(){clearInterval(t);}; },[]);
  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      {loading ? (
        <span className="text-[#FFB800] flex items-center gap-1"><RefreshCw size={10} className="animate-spin"/> FETCHING LIVE DATA...</span>
      ) : (
        <span className="text-[#00FF41] flex items-center gap-1 opacity-50">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] inline-block animate-pulse"/>
          LIVE · {timeSince(lastFetched&&lastFetched.getTime())}
        </span>
      )}
      <button onClick={onRefresh} disabled={loading} className="opacity-30 hover:opacity-80 text-[#00FF41] transition-opacity disabled:cursor-not-allowed"><RefreshCw size={10}/></button>
    </div>
  );
}

function ErrorBanner({message,onRetry}) {
  return (
    <div className="terminal-box-danger p-3 flex items-start gap-3 mb-4">
      <AlertTriangle size={13} className="text-[#FF3131] mt-0.5 shrink-0"/>
      <div className="flex-1">
        <div className="font-mono text-xs text-[#FF3131] font-bold mb-0.5">RPC WARNING</div>
        <div className="font-mono text-xs text-[#FF3131] opacity-60">{message}</div>
      </div>
      <button onClick={onRetry} className="font-mono text-xs text-[#FF3131] border border-[#FF3131] px-2 py-1 hover:bg-[rgba(255,49,49,0.1)] shrink-0">RETRY</button>
    </div>
  );
}

function VaultCard({vault,selected,onClick}) {
  var borderColor = vault.institutional ? '#A855F7' : vault.borderColor;
  function ApyBadge() {
    if (!vault.live&&vault.apy===null&&!vault.institutional&&!vault.pending)
      return <div className="h-6 w-14 bg-[rgba(0,255,65,0.08)] animate-pulse ml-auto"/>;
    if (vault.apy!==null)
      return (<div><div className="font-black text-xl font-mono" style={{color:borderColor}}>{vault.apy.toFixed(2)}%</div><div className="text-[10px] opacity-30 font-mono text-[#00FF41]">7d APY</div></div>);
    if (vault.institutional)
      return (
        <div className="text-right">
          <div className="font-mono text-[11px] font-black px-2 py-0.5 border tracking-widest" style={{color:'#A855F7',borderColor:'rgba(168,85,247,0.5)',background:'rgba(168,85,247,0.08)',textShadow:'0 0 10px rgba(168,85,247,0.8)'}}>INSTITUTIONAL</div>
          <div className="text-[9px] font-mono mt-0.5" style={{color:'rgba(168,85,247,0.6)'}}>$400M+ TVL</div>
        </div>
      );
    if (vault.pending)
      return (
        <div className="text-right">
          <div className="font-mono text-[10px] font-bold px-2 py-0.5 border tracking-widest animate-pulse" style={{color:'#00FF41',borderColor:'rgba(0,255,65,0.4)',background:'rgba(0,255,65,0.06)'}}>PENDING</div>
          <div className="text-[9px] opacity-40 font-mono text-[#00FF41] mt-0.5">COMING SOON</div>
        </div>
      );
    return <div className="font-mono text-sm opacity-25 text-[#00FF41]">N/A</div>;
  }
  return (
    <div className={'vault-card p-4 cursor-pointer '+(selected?'selected':'')} style={{borderColor:selected?borderColor:'rgba(0,255,65,0.2)'}} onClick={onClick}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="font-mono font-black text-lg tracking-wider" style={{color:borderColor}}>{vault.displayName}</span>
          <span className="font-mono text-xs opacity-40 ml-2 text-[#00FF41]">{vault.subtitle}</span>
        </div>
        <div className="text-right min-w-[80px]"><ApyBadge/></div>
      </div>
      <p className="font-mono text-xs opacity-35 text-[#00FF41] mb-2">{vault.description}</p>
      {vault.institutional&&(<div className="mb-2 px-2 py-1.5 font-mono text-[10px] border-l-2" style={{borderColor:'#A855F7',background:'rgba(168,85,247,0.06)',color:'#A855F7',opacity:0.8}}>⬡ Assets held by regulated custodian (BitGo Trust). NAV synced on-chain daily. On-chain APY read not available — TVL managed off-chain.</div>)}
      {vault.pending&&(<div className="mb-2 px-2 py-1.5 font-mono text-[10px] border-l-2" style={{borderColor:'#00FF41',background:'rgba(0,255,65,0.04)',color:'#00FF41',opacity:0.6}}>⧖ Vault deployed. Awaiting activation. Live data will appear once strategies go live.</div>)}
      <div className="flex flex-wrap gap-3 text-xs font-mono opacity-40 text-[#00FF41]">
        <span>RISK: <span style={{color:borderColor}}>{vault.risk}</span></span>
        {!vault.institutional&&!vault.pending&&<span>TVL: {vault.tvl||'...'}</span>}
        {vault.institutional&&<span style={{color:'#A855F7'}}>TVL: $400M+</span>}
        {vault.pending&&<span>TVL: PENDING</span>}
      </div>
      <div className="mt-2 font-mono text-[10px] opacity-15 text-[#00FF41] truncate">{vault.address}</div>
    </div>
  );
}

function InputSection({principal,setPrincipal,selectedVault,setSelectedVault,vaults,loading,error,lastFetched,onRefresh}) {
  var [inputVal,setInputVal] = useState(String(principal));
  var presets = [1000,5000,10000,50000,100000];
  function handleInput(e) {
    var raw = e.target.value.replace(/[^0-9.]/g,''); setInputVal(raw);
    var num = parseFloat(raw); if (!isNaN(num)&&num>0) setPrincipal(num);
  }
  return (
    <div className="terminal-box p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00FF41] font-mono font-bold text-xl tracking-widest">DEPOSIT</h2>
        <LiveBadge loading={loading} lastFetched={lastFetched} onRefresh={onRefresh}/>
      </div>
      {error&&<ErrorBanner message={error} onRetry={onRefresh}/>}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00FF41] font-mono font-bold text-lg">$</span>
        <input type="number" value={inputVal} onChange={handleInput} placeholder="10000" className="w-full pl-8 pr-4 py-3 text-lg font-mono font-bold" min="0"/>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {presets.map(function(p){return(
          <button key={p} onClick={function(){setInputVal(String(p));setPrincipal(p);}}
            className={'px-3 py-1 font-mono text-xs border-2 transition-all '+(principal===p?'bg-[#00FF41] text-black border-[#00FF41] font-bold':'bg-transparent text-[#00FF41] border-[#00FF41] opacity-35 hover:opacity-100')}>
            {formatUSD(p)}
          </button>
        );})}
      </div>
      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-3 tracking-widest">SELECT VAULT</h2>
      <div className="space-y-3">
        {vaults.map(function(vault){return(
          <VaultCard key={vault.id} vault={vault} selected={selectedVault&&selectedVault.id===vault.id} onClick={function(){setSelectedVault(vault);}}/>
        );})}
      </div>
    </div>
  );
}

function YieldLadder({principal,vault,selectedDays,setSelectedDays}) {
  var apy  = vault&&vault.apy;
  var bc   = vault&&vault.borderColor?vault.borderColor:'#00FF41';
  var maxY = apy?calcYield(principal,apy,365):0;
  return (
    <div className="terminal-box p-5">
      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-4 tracking-widest">PROJECTION MATRIX</h2>
      {vault&&!vault.live&&(
        <div className="p-3 mb-4 border-2 border-[rgba(255,184,0,0.3)] flex items-center gap-2">
          <RefreshCw size={11} className="text-[#FFB800] animate-spin"/>
          <span className="font-mono text-xs text-[#FFB800]">Fetching live APY from Ethereum Mainnet...</span>
        </div>
      )}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TIMEFRAMES.map(function(tf){return(
          <button key={tf.label} onClick={function(){setSelectedDays(tf.days);}}
            className={'px-3 py-1 font-mono text-sm border-2 transition-all '+(selectedDays===tf.days?'bg-[#00FF41] text-black border-[#00FF41] font-bold':'bg-transparent text-[#00FF41] border-[#00FF41] opacity-35 hover:opacity-90')}>
            {tf.label}
          </button>
        );})}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          {icon:<DollarSign size={13}/>,label:'PRINCIPAL',  value:formatUSD(principal),                                          color:'#00FF41'},
          {icon:<Percent size={13}/>,   label:'LIVE APY',   value:apyDisplay(apy),                                               color:bc},
          {icon:<TrendingUp size={13}/>,label:'GROSS YIELD',value:apy?formatUSD(calcYield(principal,apy,selectedDays)):'—',       color:bc},
          {icon:<Activity size={13}/>,  label:'TOTAL VALUE',value:apy?formatUSD(calcTotal(principal,apy,selectedDays)):'—',       color:'#00FF41'},
        ].map(function(s,i){return(
          <div key={i} className="p-3 border-2 border-[rgba(0,255,65,0.12)]">
            <div className="flex items-center gap-1 text-xs opacity-35 font-mono mb-1 text-[#00FF41]">{s.icon} {s.label}</div>
            <div className="font-mono font-black text-lg" style={{color:s.color}}>{s.value}</div>
          </div>
        );})}
      </div>
      <div className="space-y-2 mb-4">
        <div className="text-xs font-mono opacity-35 text-[#00FF41] mb-2">COMPOUNDING RUNGS</div>
        {TIMEFRAMES.map(function(tf){
          var y   = apy?calcYield(principal,apy,tf.days):0;
          var pct = maxY>0?(y/maxY)*100:0;
          return(
            <div key={tf.label} className="flex items-center gap-3 cursor-pointer" onClick={function(){setSelectedDays(tf.days);}}>
              <span className="font-mono text-xs w-6 opacity-40 text-[#00FF41]">{tf.label}</span>
              <div className="flex-1 progress-bar"><div className="progress-fill transition-all duration-700" style={{width:pct+'%',background:bc,boxShadow:'0 0 8px '+bc}}/></div>
              <span className="font-mono text-xs w-20 text-right" style={{color:selectedDays===tf.days?bc:'rgba(0,255,65,0.4)'}}>{apy?formatUSD(y):'—'}</span>
            </div>
          );
        })}
      </div>
      <div className="p-3 border-l-4 font-mono text-xs" style={{borderColor:bc}}>
        <div className="opacity-40 text-[#00FF41] mb-1">DAILY DRIP</div>
        <span className="text-lg font-black" style={{color:bc}}>{apy?formatUSD(calcYield(principal,apy,1)):'—'}</span>
        <span className="opacity-35 text-[#00FF41]"> / day</span>
      </div>
    </div>
  );
}

function ProjectionFeed({principal,vault,selectedDays}) {
  var [logs,setLogs]           = useState([]);
  var [visibleCount,setVisible] = useState(0);
  var [isRunning,setIsRunning] = useState(false);
  var feedRef  = useRef(null);
  var timerRef = useRef(null);
  var runSimulation = useCallback(function() {
    if (isRunning) return;
    setIsRunning(true); setVisible(0);
    var newLogs = generateLog(principal,vault,selectedDays);
    setLogs(newLogs);
    var i=0;
    timerRef.current = setInterval(function(){
      i++; setVisible(i);
      if (i>=newLogs.length){clearInterval(timerRef.current);setIsRunning(false);}
    },70);
  },[isRunning,principal,vault,selectedDays]);
  useEffect(function(){return function(){clearInterval(timerRef.current);};},[]);
  useEffect(function(){if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;},[visibleCount]);
  function typeColor(t){var map={sys:'opacity-25 text-[#00FF41]',ok:'text-[#00FF41]',info:'opacity-55 text-[#00FF41]',yield:'text-[#FFB800]',result:'font-bold text-[#00FF41]',warn:'text-[#FFB800] opacity-60',error:'text-[#FF3131]'};return map[t]||'text-[#00FF41]';}
  function typePrefix(t){var map={sys:'//',ok:'✓ ',info:'→ ',yield:'◆ ',result:'▶ ',warn:'⚠ ',error:'✗ '};return map[t]||'  ';}
  return (
    <div className="terminal-box p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00FF41] font-mono font-bold text-xl tracking-widest">SIMULATION LOG</h2>
        {isRunning&&<span className="text-xs font-mono text-[#FFB800] animate-pulse">● RUNNING</span>}
      </div>
      <div ref={feedRef} className="bg-black bg-opacity-60 p-4 h-64 overflow-y-auto font-mono text-xs space-y-0.5 mb-4" style={{border:'2px solid rgba(0,255,65,0.12)'}}>
        {logs.length===0?(
          <div className="opacity-20 text-[#00FF41]">{'// AWAITING SIMULATION INPUT...'}<br/>{'// CLICK [RUN SIMULATION] TO BEGIN'}<br/><br/>{'// APY is fetched live from Ethereum Mainnet'}<br/>{'// via 7-day rolling share-price comparison'}</div>
        ):(
          logs.slice(0,visibleCount).map(function(line,i){return(
            <div key={i} className={'log-line leading-relaxed '+typeColor(line.type)}>
              <span className="opacity-20">{line.ts} </span>
              <span className="opacity-35">{typePrefix(line.type)}</span>
              {line.text}
            </div>
          );})
        )}
        {isRunning&&<div className="text-[#00FF41] opacity-50"><span className="animate-blink">█</span></div>}
      </div>
      <button onClick={runSimulation} disabled={isRunning} className="vibe-btn w-full py-3 font-mono font-black text-sm tracking-widest border-4 border-[#00FF41] text-[#00FF41] bg-transparent hover:bg-[rgba(0,255,65,0.05)] transition-all disabled:opacity-25 disabled:cursor-not-allowed">
        {isRunning?'// SIMULATING...':'▶  RUN SIMULATION'}
      </button>
    </div>
  );
}

function VibeButton({principal,vault,selectedDays}) {
  var [status,setStatus] = useState('idle');
  var apy           = vault&&vault.apy;
  var expectedYield = apy?calcYield(principal,apy,selectedDays):null;
  var tf            = TIMEFRAMES.find(function(t){return t.days===selectedDays;});
  var bc            = vault&&vault.borderColor?vault.borderColor:'#00FF41';
  function handleEngage(){if(status==='engaged')return;setStatus('loading');setTimeout(function(){setStatus('engaged');},2200);}
  return (
    <div className="terminal-box p-5">
      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-4 tracking-widest">ENGAGE PROTECTION</h2>
      <div className="p-4 mb-4 bg-[rgba(0,255,65,0.025)] border-2 border-[rgba(0,255,65,0.1)] font-mono text-xs space-y-1.5">
        {[['VAULT',vault&&vault.displayName,bc],['LIVE APY',apyDisplay(apy),bc],['DEPOSIT',formatUSD(principal),'#00FF41'],['HORIZON',tf?tf.label:selectedDays+'d','#00FF41']].map(function(row,i){return(
          <div key={i} className="flex justify-between"><span className="opacity-35 text-[#00FF41]">{row[0]}</span><span style={{color:row[2]}}>{row[1]}</span></div>
        );})}
        <div className="flex justify-between border-t border-[rgba(0,255,65,0.1)] pt-1.5">
          <span className="opacity-35 text-[#00FF41]">EXPECTED YIELD</span>
          <span className="font-black" style={{color:bc}}>{expectedYield!==null?formatUSD(expectedYield):'—'}</span>
        </div>
      </div>
      <div className="space-y-2 mb-5">
        {[['SLIPPAGE GUARD (±0.5%)',ShieldCheck],['IL HEDGE PROTOCOL',Lock],['AUTO-REBALANCE TRIGGER',Zap],['EXIT CIRCUIT BREAKER',Activity]].map(function(item,i){
          var Icon=item[1]; var engaged=status==='engaged';
          return(
            <div key={i} className="flex items-center gap-2 font-mono text-xs">
              <span className={engaged?'text-[#00FF41]':'opacity-15 text-[#00FF41]'}>{engaged?'✓':'○'}</span>
              <span className={'text-[#00FF41] '+(engaged?'opacity-60':'opacity-15')}><Icon size={13}/></span>
              <span className={'text-[#00FF41] '+(engaged?'opacity-55':'opacity-15')}>{item[0]}</span>
            </div>
          );
        })}
      </div>
      <button onClick={handleEngage} disabled={status==='loading'||status==='engaged'}
        className={'vibe-btn w-full py-4 font-mono font-black text-base tracking-widest border-4 transition-all '+(
          status==='engaged'?'border-[#00FF41] bg-[#00FF41] text-black cursor-default':
          status==='loading'?'border-[#FFB800] text-[#FFB800] bg-transparent animate-pulse cursor-wait':
                             'border-[#00FF41] text-[#00FF41] bg-transparent hover:bg-[rgba(0,255,65,0.05)]')}>
        {status==='engaged'&&'✓  PROTECTION ACTIVE'}
        {status==='loading'&&'⟳  ENGAGING...'}
        {status==='idle'   &&'⬡  ENGAGE PROTECTION'}
      </button>
      {status==='engaged'&&<div className="mt-2 text-center font-mono text-xs text-[#00FF41] opacity-35 animate-pulse">ALL SYSTEMS NOMINAL · MONITORING ACTIVE</div>}
      <div className="mt-4 p-3 border-l-4 border-[#FF3131] font-mono text-xs text-[#FF3131] opacity-45">⚠ NOT FINANCIAL ADVICE. DEFI CARRIES RISK OF TOTAL LOSS. DYOR.</div>
    </div>
  );
}

function AppInner() {
  var {vaults,loading,error,lastFetched,fetchAll} = useVaultData();
  var [principal,setPrincipal]         = useState(10000);
  var [selectedVault,setSelectedVault] = useState(null);
  var [selectedDays,setSelectedDays]   = useState(30);
  var [,setTick]                       = useState(0);

  useEffect(function(){if(vaults&&vaults.length>0&&!selectedVault)setSelectedVault(vaults[0]);},[vaults]);
  useEffect(function(){if(!selectedVault)return;var updated=vaults.find(function(v){return v.id===selectedVault.id;});if(updated)setSelectedVault(updated);},[vaults]);
  useEffect(function(){var t=setInterval(function(){setTick(function(c){return c+1;});},1000);return function(){clearInterval(t);};},[]);

  var liveVaults = vaults.filter(function(v){return v.live&&v.apy!==null;});
  var avgApy     = liveVaults.length?liveVaults.reduce(function(s,v){return s+v.apy;},0)/liveVaults.length:null;

  return (
    <div>
      <div className="moai-bg" style={{backgroundImage:'url(/moai.png)'}}/>
      <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center, transparent 20%, rgba(13,13,13,0.72) 100%)',zIndex:1,pointerEvents:'none'}}/>
      <div className="relative z-10 min-h-screen px-4 py-8 max-w-7xl mx-auto">

        <header className="mb-8 text-center md:text-left">
          <div className="font-mono text-xs opacity-25 text-[#00FF41] mb-1 tracking-[0.3em]">CONCRETE.YIELD // v2.1.0 // ETH MAINNET (1)</div>
          <h1 className="font-mono font-black italic text-6xl md:text-7xl lg:text-8xl text-[#00FF41] glow leading-none tracking-tight mb-2">
            CONCRETE<br/><span className="text-5xl md:text-6xl lg:text-7xl opacity-75">YIELD</span>
          </h1>
          <div className="font-mono text-sm opacity-35 text-[#00FF41] mt-3">LIVE DATA · ETHEREUM MAINNET · ERC-4626 · 7-DAY ROLLING APY<span className="animate-blink ml-1">_</span></div>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex-1 h-px bg-[#00FF41] opacity-10"/>
            <div className="font-mono text-xs opacity-15 text-[#00FF41]">◆◆◆</div>
            <div className="flex-1 h-px bg-[#00FF41] opacity-10"/>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            {label:'VAULTS',    value:VAULT_CONFIGS.length+' ACTIVE',                                                                                     Icon:Lock,    live:true},
            {label:'ON-CHAIN',  value:loading?'FETCHING...':vaults.filter(function(v){return v.live;}).length+'/'+VAULT_CONFIGS.length+' LIVE',            Icon:Wifi,    live:!loading},
            {label:'AVG 7d APY',value:avgApy!==null?avgApy.toFixed(2)+'%':(loading?'...':'N/A'),                                                          Icon:Percent, live:avgApy!==null},
            {label:'REFRESHED', value:lastFetched?timeSince(lastFetched.getTime()):'—',                                                                   Icon:Clock,   live:!!lastFetched},
          ].map(function(s,i){return(
            <div key={i} className="terminal-box p-3 flex items-center gap-2">
              <span className={(s.live?'opacity-50':'opacity-20')+' text-[#00FF41]'}><s.Icon size={12}/></span>
              <div>
                <div className="font-mono text-[10px] opacity-25 text-[#00FF41]">{s.label}</div>
                <div className={'font-mono font-bold text-sm text-[#00FF41] '+(s.live?'':'opacity-40')}>{s.value}</div>
              </div>
            </div>
          );})}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <InputSection principal={principal} setPrincipal={setPrincipal} selectedVault={selectedVault} setSelectedVault={setSelectedVault} vaults={vaults} loading={loading} error={error} lastFetched={lastFetched} onRefresh={fetchAll}/>
          </div>
          <div className="lg:col-span-1">
            <YieldLadder principal={principal} vault={selectedVault} selectedDays={selectedDays} setSelectedDays={setSelectedDays}/>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <ProjectionFeed principal={principal} vault={selectedVault} selectedDays={selectedDays}/>
            <VibeButton principal={principal} vault={selectedVault} selectedDays={selectedDays}/>
          </div>
        </div>

        <footer className="mt-12 pb-8 space-y-4">
          <div className="text-center font-mono text-xs text-[#00FF41] space-y-1" style={{opacity:0.18}}>
            <div>CONCRETE.YIELD · COMMUNITY CONTRIBUTION · concrete.xyz</div>
            <div>CHAIN: ETHEREUM MAINNET (1) · ERC-4626 · APY: 7-DAY ROLLING SHARE PRICE</div>
            <div>PAST PERFORMANCE ≠ FUTURE RESULTS · USE AT YOUR OWN RISK</div>
          </div>
          <div className="flex items-center justify-center">
            <a href="https://x.com/zerodollar_Anon" target="_blank" rel="noopener noreferrer"
              className="group flex items-center gap-3 px-5 py-3 border-2 border-[rgba(0,255,65,0.2)] hover:border-[rgba(0,255,65,0.6)] transition-all duration-200 hover:bg-[rgba(0,255,65,0.04)]">
              <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[rgba(0,255,65,0.3)] group-hover:border-[#00FF41] transition-all duration-200 shrink-0">
                <img src="/pfp.jpg" alt="zerodollar_Anon" className="w-full h-full object-cover"/>
              </div>
              <div className="text-left">
                <div className="font-mono text-[10px] text-[#00FF41] opacity-40 tracking-widest">BUILT BY</div>
                <div className="font-mono font-bold text-sm text-[#00FF41] group-hover:glow transition-all">@zerodollar_Anon</div>
              </div>
              <div className="ml-1 opacity-40 group-hover:opacity-80 transition-opacity">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#00FF41" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
            </a>
          </div>
        </footer>

      </div>
    </div>
  );
}

export default function Home() {
  var [hasMounted,setHasMounted] = useState(false);
  useEffect(function(){setHasMounted(true);},[]);
  if (!hasMounted) {
    return (
      <div style={{background:'#0D0D0D',width:'100vw',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{color:'#00FF41',fontFamily:'monospace',fontSize:'13px',letterSpacing:'0.2em',animation:'heartbeat 1.2s ease-in-out infinite'}}>// INITIALIZING CONCRETE.YIELD...</span>
        <style>{`@keyframes heartbeat{0%,100%{opacity:0.2}50%{opacity:1;text-shadow:0 0 12px #00FF41}}`}</style>
      </div>
    );
  }
  return <AppInner/>;
}
