import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { Activity, Bell, Maximize2, Minimize2, Plus, Search, Star, X, Wifi, WifiOff, Minus, Square, Trash2 } from 'lucide-react';

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
type Pair={symbol:string;price:number;change:number;quoteVolume:number;high:number;low:number};
type AlertItem={id:string;symbol:string;price:number;direction:'above'|'below';enabled:boolean};
type Rect={x:number;y:number;w:number;h:number};
const API='https://fapi.binance.com';
const FRAMES=['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M'];
const DUR:Record<string,number>={'1m':60000,'3m':180000,'5m':300000,'9m':540000,'15m':900000,'30m':1800000,'45m':2700000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000,'1M':2592000000};
const NATIVE=new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']);
const fmt=(n:number)=>!Number.isFinite(n)?'—':n>=1000?n.toLocaleString('en-US',{maximumFractionDigits:2}):n>=1?n.toFixed(4).replace(/0+$/,'').replace(/\\.$/,''):n.toPrecision(5);
function aggregate(rows:Candle[],ms:number):Candle[]{const out:Candle[]=[];for(const c of rows){const t=Math.floor(c.time*1000/ms)*ms/1000;const p=out[out.length-1];if(p&&p.time===t){p.high=Math.max(p.high,c.high);p.low=Math.min(p.low,c.low);p.close=c.close;p.volume+=c.volume;}else out.push({...c,time:t});}return out;}
function App(){
 const host=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),candleSeries=useRef<any>(null),volumeSeries=useRef<any>(null),socket=useRef<WebSocket|null>(null);
 const [symbol,setSymbol]=useState('BTCUSDT'),[frame,setFrame]=useState('1m'),[customMinutes,setCustomMinutes]=useState(''),[customOpen,setCustomOpen]=useState(false),[priceType,setPriceType]=useState('LAST'),[candles,setCandles]=useState<Candle[]>([]),[pairs,setPairs]=useState<Pair[]>([]),[favorites,setFavorites]=useState<string[]>(()=>JSON.parse(localStorage.getItem('fav')||'["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]')),[alerts,setAlerts]=useState<AlertItem[]>(()=>JSON.parse(localStorage.getItem('alerts')||'[]')),[search,setSearch]=useState(''),[watchOpen,setWatchOpen]=useState(false),[alertOpen,setAlertOpen]=useState(false),[alertPrice,setAlertPrice]=useState(''),[alertDirection,setAlertDirection]=useState<'above'|'below'>('above'),[connected,setConnected]=useState(false),[loading,setLoading]=useState(true),[fullscreen,setFullscreen]=useState(false),[now,setNow]=useState(Date.now()),[lastPrice,setLastPrice]=useState(0),[error,setError]=useState(''),[marketTab,setMarketTab]=useState<'ALL'|'GAINERS'|'LOSERS'|'VOLUME'|'FAV'>('ALL'),[drawTool,setDrawTool]=useState<'none'|'horizontal'|'rectangle'>('none'),[rects,setRects]=useState<Rect[]>([]),[draftRect,setDraftRect]=useState<Rect|null>(null),[lineCount,setLineCount]=useState(0);
 const interval=DUR[frame]||60000; const current=candles[candles.length-1]; const countdown=current?Math.max(0,Math.ceil((current.time*1000+interval-now)/1000)):0;
 const sortedPairs=useMemo(()=>[...pairs].sort((a,b)=>b.quoteVolume-a.quoteVolume),[pairs]);
 const visiblePairs=useMemo(()=>{let list=sortedPairs;if(marketTab==='GAINERS')list=[...pairs].sort((a,b)=>b.change-a.change);if(marketTab==='LOSERS')list=[...pairs].sort((a,b)=>a.change-b.change);if(marketTab==='FAV')list=sortedPairs.filter(p=>favorites.includes(p.symbol));return list.filter(p=>p.symbol.includes(search.toUpperCase()));},[sortedPairs,pairs,marketTab,favorites,search]);
 const loadPairs=useCallback(async()=>{try{const r=await fetch(API+'/fapi/v1/ticker/24hr');if(!r.ok)throw Error();const d=await r.json();setPairs(d.filter((x:any)=>x.symbol.endsWith('USDT')&&+x.quoteVolume>0).map((x:any)=>({symbol:x.symbol,price:+x.lastPrice,change:+x.priceChangePercent,quoteVolume:+x.quoteVolume,high:+x.highPrice,low:+x.lowPrice})));}catch{setError('Binance market list load failed');}},[]);
 const loadCandles=useCallback(async()=>{setLoading(true);setError('');try{const custom=!NATIVE.has(frame);const base=custom?'1m':frame;let path='/fapi/v1/klines?symbol='+symbol+'&interval='+base+'&limit='+(custom?1500:500);if(priceType==='MARK')path='/fapi/v1/markPriceKlines?symbol='+symbol+'&interval='+base+'&limit='+(custom?1500:500);if(priceType==='INDEX')path='/fapi/v1/indexPriceKlines?pair='+symbol+'&interval='+base+'&limit='+(custom?1500:500);const r=await fetch(API+path);if(!r.ok)throw Error('Kline request failed ('+r.status+')');const d=await r.json();let rows:Candle[]=d.map((x:any)=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));if(custom)rows=aggregate(rows,interval);setCandles(rows);if(rows.length)setLastPrice(rows[rows.length-1].close);}catch(e:any){setError(e.message||'Chart data unavailable');}finally{setLoading(false);}},[symbol,frame,priceType,interval]);
 useEffect(()=>{loadPairs();const t=setInterval(loadPairs,30000);return()=>clearInterval(t);},[loadPairs]);
 useEffect(()=>{loadCandles();},[loadCandles]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(t);},[]);
 useEffect(()=>{if(!host.current)return;const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#0b0e11'},textColor:'#9aa4ad',fontFamily:'Inter,system-ui'},grid:{vertLines:{color:'#171d23'},horzLines:{color:'#171d23'}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:'#586574',labelBackgroundColor:'#29313a'},horzLine:{color:'#586574',labelBackgroundColor:'#29313a'}},rightPriceScale:{borderColor:'#29313a',scaleMargins:{top:.12,bottom:.18}},timeScale:{borderColor:'#29313a',timeVisible:true,secondsVisible:false},localization:{priceFormatter:fmt}});const cs=c.addSeries(CandlestickSeries,{upColor:'#0ecb81',downColor:'#f6465d',borderUpColor:'#0ecb81',borderDownColor:'#f6465d',wickUpColor:'#0ecb81',wickDownColor:'#f6465d'});const vs=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:false,priceLineVisible:false});vs.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});chart.current=c;candleSeries.current=cs;volumeSeries.current=vs;return()=>{c.remove();chart.current=null;};},[]);
 useEffect(()=>{if(!candles.length||!candleSeries.current)return;candleSeries.current.setData(candles.map(x=>({time:x.time as UTCTimestamp,open:x.open,high:x.high,low:x.low,close:x.close})));volumeSeries.current?.setData(candles.map(x=>({time:x.time as UTCTimestamp,value:x.volume,color:x.close>=x.open?'rgba(14,203,129,.35)':'rgba(246,70,93,.35)'})));chart.current?.timeScale().fitContent();},[candles]);
 useEffect(()=>{
  socket.current?.close();
  let alive=true;
  const custom=!NATIVE.has(frame);
  const baseInterval=custom?'1m':frame;
  const merge=(raw:Candle)=>{
   if(!alive)return;
   setLastPrice(raw.close);
   setCandles(old=>{
    const a=[...old];
    const t=custom?Math.floor(raw.time*1000/interval)*interval/1000:raw.time;
    const i=a.findIndex(x=>x.time===t);
    if(i>=0){
     const prev=a[i];
     a[i]={...raw,time:t,open:custom?prev.open:raw.open,high:custom?Math.max(prev.high,raw.high):raw.high,low:custom?Math.min(prev.low,raw.low):raw.low,volume:custom?prev.volume:raw.volume};
    }else a.push({...raw,time:t});
    return a.sort((x,y)=>x.time-y.time).slice(-600);
   });
  };
  let ws:WebSocket|null=null;
  if(priceType==='LAST'){
   try{
    ws=new WebSocket('wss://fstream.binance.com/ws/'+symbol.toLowerCase()+'@kline_'+baseInterval);
    socket.current=ws;
    ws.onopen=()=>{if(alive)setConnected(true);};
    ws.onclose=()=>{if(alive)setConnected(false);};
    ws.onerror=()=>{if(alive)setConnected(false);};
    ws.onmessage=e=>{
     try{const m=JSON.parse(e.data),k=m.k;if(!k)return;merge({time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v});}catch{}
    };
   }catch{setConnected(false);}
  }else setConnected(false);
  // REST polling is a fallback for dropped WebSockets and the MARK/INDEX price feeds.
  let busy=false;
  const poll=async()=>{
   if(busy||!alive)return;busy=true;
   try{
    let path='/fapi/v1/klines?symbol='+symbol+'&interval='+baseInterval+'&limit=2';
    if(priceType==='MARK')path='/fapi/v1/markPriceKlines?symbol='+symbol+'&interval='+baseInterval+'&limit=2';
    if(priceType==='INDEX')path='/fapi/v1/indexPriceKlines?pair='+symbol+'&interval='+baseInterval+'&limit=2';
    const response=await fetch(API+path,{cache:'no-store'});
    if(!response.ok)throw Error('poll '+response.status);
    const rows=await response.json();
    const x=rows[rows.length-1];if(!x)return;
    merge({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]});
   }catch{}finally{busy=false;}
  };
  poll();
  const timer=window.setInterval(poll,3000);
  return()=>{alive=false;window.clearInterval(timer);ws?.close();if(socket.current===ws)socket.current=null;};
 },[symbol,frame,priceType,interval]);
 useEffect(()=>{localStorage.setItem('fav',JSON.stringify(favorites));},[favorites]);useEffect(()=>{localStorage.setItem('alerts',JSON.stringify(alerts));},[alerts]);
 useEffect(()=>{if(!lastPrice)return;setAlerts(old=>old.map(a=>{if(!a.enabled||a.symbol!==symbol)return a;const hit=a.direction==='above'?lastPrice>=a.price:lastPrice<=a.price;if(hit){if('Notification'in window&&Notification.permission==='granted')new Notification('Price alert: '+a.symbol,{body:'Price reached '+fmt(lastPrice)});return {...a,enabled:false};}return a;}));},[lastPrice,symbol]);
 const toggleFav=(s:string)=>setFavorites(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s]);
 const addAlert=()=>{const p=Number(alertPrice);if(!p||p<=0)return;setAlerts(v=>[...v,{id:crypto.randomUUID(),symbol,price:p,direction:alertDirection,enabled:true}]);setAlertPrice('');setAlertOpen(false);if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();};
 const toggleFullscreen=async()=>{if(!document.fullscreenElement)await host.current?.parentElement?.parentElement?.requestFullscreen?.();else await document.exitFullscreen();};
 useEffect(()=>{const fn=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn);},[]);
 const addCustom=()=>{const n=Number(customMinutes);if(!Number.isInteger(n)||n<1||n>1440)return;const f=n+'m';setFrame(f);setCustomOpen(false);setCustomMinutes('');};
 const startDraw=(e:React.PointerEvent<SVGSVGElement>)=>{if(drawTool==='none')return;const b=e.currentTarget.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;if(drawTool==='horizontal'){const p=chart.current?.priceScale('right').coordinateToPrice(y);if(p!=null&&candleSeries.current){candleSeries.current.createPriceLine({price:p,color:'#f0b90b',lineWidth:2,lineStyle:0,axisLabelVisible:true,title:'水平'});setLineCount(v=>v+1);}}else{setDraftRect({x,y,w:0,h:0});e.currentTarget.setPointerCapture(e.pointerId);}};
 const moveDraw=(e:React.PointerEvent<SVGSVGElement>)=>{if(!draftRect)return;const b=e.currentTarget.getBoundingClientRect();setDraftRect(r=>r?({...r,w:e.clientX-b.left-r.x,h:e.clientY-b.top-r.y}):null);};
 const endDraw=()=>{if(draftRect){const r={x:Math.min(draftRect.x,draftRect.x+draftRect.w),y:Math.min(draftRect.y,draftRect.y+draftRect.h),w:Math.abs(draftRect.w),h:Math.abs(draftRect.h)};if(r.w>5&&r.h>5)setRects(v=>[...v,r]);setDraftRect(null);}};
 const price=lastPrice||current?.close||0;
 return <main className="app"><header className="topbar"><div className="brand"><Activity size={22}/><span>SURAJ <b>FUTURES</b></span></div><div className="market-status">{connected?<><Wifi size={14}/> LIVE</>:<><WifiOff size={14}/> {priceType==='LAST'?'CONNECTING':'POLLING'}</>}</div><button className="icon-btn" onClick={()=>setWatchOpen(true)}><Star size={18}/><span>Markets</span></button><button className="icon-btn" onClick={()=>setAlertOpen(true)}><Bell size={18}/><span>Alerts</span>{alerts.filter(a=>a.enabled).length>0&&<i className="count">{alerts.filter(a=>a.enabled).length}</i>}</button></header>
 <section className="ticker"><button className="pair-select" onClick={()=>setWatchOpen(true)}>{symbol}<span className="muted">USDT PERP</span></button><div className="last-price">{fmt(price)} <span className={(pairs.find(p=>p.symbol===symbol)?.change||0)>=0?'green':'red'}>{(pairs.find(p=>p.symbol===symbol)?.change||0).toFixed(2)}%</span></div><div className="ticker-meta"><span>24h High <b>{fmt(pairs.find(p=>p.symbol===symbol)?.high||0)}</b></span><span>24h Low <b>{fmt(pairs.find(p=>p.symbol===symbol)?.low||0)}</b></span><span>24h Vol <b>{((pairs.find(p=>p.symbol===symbol)?.quoteVolume||0)/1e6).toFixed(1)}M</b></span></div></section>
 <section className="toolbar"><div className="frames">{FRAMES.map(f=><button key={f} className={frame===f?'active':''} onClick={()=>setFrame(f)}>{f}</button>)}<button className="custom-add" onClick={()=>setCustomOpen(true)}><Plus size={14}/> Custom</button></div><div className="price-types">{['LAST','MARK','INDEX'].map(t=><button key={t} className={priceType===t?'selected':''} onClick={()=>setPriceType(t)}>{t}</button>)}<button className="icon-btn small" onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button></div></section>
 <section className="drawing-toolbar"><span>DRAW</span><button className={drawTool==='horizontal'?'draw-active':''} onClick={()=>setDrawTool(drawTool==='horizontal'?'none':'horizontal')}><Minus size={15}/> Horizontal line</button><button className={drawTool==='rectangle'?'draw-active':''} onClick={()=>setDrawTool(drawTool==='rectangle'?'none':'rectangle')}><Square size={15}/> Rectangle</button><button onClick={()=>{setRects([]);setDrawTool('none');}}><Trash2 size={15}/> Clear rectangles</button><small>{drawTool==='horizontal'?'Chart-এ ক্লিক করে লাইন বসাও':drawTool==='rectangle'?'চেপে ধরে টেনে rectangle আঁকো':'Drawing tool select করো'}</small></section>
 <section className="chart-panel"><div className="chart-legend"><span>{symbol} · {frame} · {priceType}</span>{current&&<span>O {fmt(current.open)}　H {fmt(current.high)}　L {fmt(current.low)}　C <b className={current.close>=current.open?'green':'red'}>{fmt(current.close)}</b></span>}</div><div className="chart-wrap"><div ref={host} className="chart"/><svg className={'draw-layer '+(drawTool!=='none'?'draw-enabled':'')} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw}>{rects.map((r,i)=><rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(240,185,11,.10)" stroke="#f0b90b" strokeWidth="1.5"/>)}{draftRect&&<rect x={Math.min(draftRect.x,draftRect.x+draftRect.w)} y={Math.min(draftRect.y,draftRect.y+draftRect.h)} width={Math.abs(draftRect.w)} height={Math.abs(draftRect.h)} fill="rgba(240,185,11,.12)" stroke="#f0b90b" strokeDasharray="5 3"/>}</svg>{loading&&<div className="overlay">Loading candles…</div>}{error&&<div className="error">{error}</div>}<div className="countdown">Candle closes in <b>{String(Math.floor(countdown/60)).padStart(2,'0')}:{String(countdown%60).padStart(2,'0')}</b></div></div></section>
 <section className="bottom-tools"><div><small>MARKET</small><b>Binance USD-M Futures</b></div><div><small>PRICE</small><b>{priceType}</b></div><div><small>LIVE PRICE</small><b>{fmt(price)}</b></div><button className="primary" onClick={()=>setAlertOpen(true)}><Plus size={16}/> Add price alert</button></section>
 {customOpen&&<div className="scrim" onClick={()=>setCustomOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="drawer-head"><h2>Add custom timeframe</h2><button className="icon-btn" onClick={()=>setCustomOpen(false)}><X/></button></div><p>১ থেকে ১৪৪০ মিনিটের মধ্যে timeframe দাও। যেমন 9, 20, 45, 120।</p><label>Minutes</label><input className="field" type="number" min="1" max="1440" value={customMinutes} onChange={e=>setCustomMinutes(e.target.value)} placeholder="e.g. 9"/><button className="primary full" onClick={addCustom}>Add timeframe</button></div></div>}
 {watchOpen&&<div className="scrim" onClick={()=>setWatchOpen(false)}><aside className="drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><h2>Binance Futures Markets</h2><button className="icon-btn" onClick={()=>setWatchOpen(false)}><X/></button></div><div className="search"><Search size={16}/><input placeholder="Search all USDT pairs…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="market-tabs">{(['ALL','GAINERS','LOSERS','VOLUME','FAV'] as const).map(t=><button key={t} className={marketTab===t?'tab-active':''} onClick={()=>setMarketTab(t)}>{t==='ALL'?'All Coins':t==='GAINERS'?'Top Gainers':t==='LOSERS'?'Top Losers':t==='VOLUME'?'Top Volume':'Watchlist'}</button>)}</div><div className="watch-tabs"><span>USDT PERPETUAL · {visiblePairs.length} PAIRS</span><span>{favorites.length} saved</span></div><div className="pair-list">{(marketTab==='VOLUME'?[...visiblePairs].sort((a,b)=>b.quoteVolume-a.quoteVolume):visiblePairs).map(p=><div className="pair-row" key={p.symbol}><button className="star-btn" onClick={()=>toggleFav(p.symbol)}><Star size={16} fill={favorites.includes(p.symbol)?'#f0b90b':'none'} color={favorites.includes(p.symbol)?'#f0b90b':'#66717d'}/></button><button className="pair-info" onClick={()=>{setSymbol(p.symbol);setWatchOpen(false);}}><b>{p.symbol}</b><small>{(p.quoteVolume/1e6).toFixed(1)}M USDT</small></button><div className="pair-price"><b>{fmt(p.price)}</b><small className={p.change>=0?'green':'red'}>{p.change.toFixed(2)}%</small></div></div>)}</div></aside></div>}
 {alertOpen&&<div className="scrim" onClick={()=>setAlertOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="drawer-head"><h2>Create price alert</h2><button className="icon-btn" onClick={()=>setAlertOpen(false)}><X/></button></div><p>Alert for <b>{symbol}</b> · Current price {fmt(price)}</p><label>Target price</label><input className="field" type="number" value={alertPrice} onChange={e=>setAlertPrice(e.target.value)} placeholder="Enter price"/><label>Trigger condition</label><select className="field" value={alertDirection} onChange={e=>setAlertDirection(e.target.value as any)}><option value="above">Price crosses above</option><option value="below">Price crosses below</option></select><button className="primary full" onClick={addAlert}>Create alert</button><div className="alert-list">{alerts.map(a=><div className="alert-row" key={a.id}><span>{a.symbol} {a.direction} {fmt(a.price)}</span><button onClick={()=>setAlerts(v=>v.filter(x=>x.id!==a.id))}><X size={15}/></button></div>)}</div></div></div>}
 <footer>Market data from Binance Futures public API · For charting and information only</footer></main>;
}
export default App;
