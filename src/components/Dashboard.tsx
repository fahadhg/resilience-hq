'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  TariffItem, ImportOverlay, USRatesOverlay, SurtaxOverlay, CHAPTER_NAMES, FTA_LABELS, FTA_COLORS,
  GAZETTE_ALERTS, getHS6, getBestFTA, fmtVal, findSurtax
} from '@/lib/data';
import {
  assessRisk, parseBOM, estimateDrawback, runWhatIf,
  type BOMItem, type RiskAssessment, type WhatIfResult, type FTAGapItem
} from '@/lib/analysis';
import { type ROORule } from '@/lib/roo';
import { getROO } from '@/lib/roo';
import clsx from 'clsx';

const PG = 40;
const SEV_CLS = {
  high: 'bg-negative/10 text-negative',
  med: 'bg-warn/10 text-warn',
  low: 'bg-accent/10 text-accent',
};
const RISK_CLS = {
  low: { bg: 'bg-positive/10', text: 'text-positive', label: 'Low' },
  med: { bg: 'bg-warn/10', text: 'text-warn', label: 'Medium' },
  high: { bg: 'bg-negative/10', text: 'text-negative', label: 'High' },
  critical: { bg: 'bg-negative/20', text: 'text-negative', label: 'Critical' },
};
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#6b7280'];

const DEFAULT_WL = [
  '7318.15.00.00','7208.51.00.00','7604.10.00.00','8501.31.00.00',
  '8708.99.00.00','3920.10.00.00','8544.49.00.00','8412.21.00.00',
  '9032.89.90.00','8708.30.00.00'
];

interface Props { tariffData: TariffItem[]; importData: ImportOverlay; usRates: USRatesOverlay; surtaxData: SurtaxOverlay; }

function Badge({ t, s }: { t: string; s: 'high'|'med'|'low' }) {
  return <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded', SEV_CLS[s])}>{t}</span>;
}

function Metric({ label, value, sub, accent, large }: { label: string; value: string; sub?: string; accent?: string; large?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border">
      <div className="text-[10px] text-ink-muted mb-1 tracking-wider uppercase">{label}</div>
      <div className={clsx('font-mono font-medium', large ? 'text-2xl' : 'text-xl')} style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[11px] text-ink-faint mt-1">{sub}</div>}
    </div>
  );
}

function ImportBars({ imp, small }: { imp: any; small?: boolean }) {
  if (!imp) return <span className="text-[10px] text-ink-faint">—</span>;
  const max = imp.c[0]?.v || 1;
  return (
    <div className={clsx('flex items-center', small ? 'gap-1' : 'gap-2')}>
      {imp.c.map((c: any, i: number) => (
        <div key={c.k} className="flex items-center gap-1" title={`${c.n}: ${fmtVal(c.v)} (${Math.round(c.v/imp.t*100)}%)`}>
          <div className="rounded-sm" style={{ height: small?8:12, width: Math.max(Math.round(c.v/max*(small?32:52)),3), background: i===0?'#3b82f6':i===1?'#f59e0b':'#4a5060', opacity:1-i*0.2 }}/>
          <span className={clsx(small?'text-[10px]':'text-[11px]', i===0?'text-ink font-medium':'text-ink-muted')}>{c.n}</span>
        </div>
      ))}
    </div>
  );
}

function RiskDot({ level }: { level: string }) {
  const r = RISK_CLS[level as keyof typeof RISK_CLS] || RISK_CLS.low;
  return <span className={clsx('inline-block w-2 h-2 rounded-full', level==='critical'?'bg-negative animate-pulse':level==='high'?'bg-negative':level==='med'?'bg-warn':'bg-positive')} />;
}

export default function Dashboard({ tariffData, importData, usRates, surtaxData }: Props) {
  const D = tariffData;
  const IMP = importData;
  const USR = usRates;
  const STX = surtaxData;

  const [tab, setTab] = useState('home');
  const [wl, setWl] = useState<string[]>(DEFAULT_WL);
  const [q, setQ] = useState('');
  const [chF, setChF] = useState('all');
  const [rateF, setRateF] = useState('all');
  const [pg, setPg] = useState(0);
  const [sel, setSel] = useState('');
  const [surtax, setSurtax] = useState(25);
  const [addMode, setAddMode] = useState(false);
  const [addQ, setAddQ] = useState('');
  const [sortBy, setSortBy] = useState('imp');
  const [mounted, setMounted] = useState(false);
  const [detailHS, setDetailHS] = useState<string | null>(null);
  const openDetail = (hs: string) => setDetailHS(hs);

  // BOM state
  const [bomText, setBomText] = useState('');
  const [bomItems, setBomItems] = useState<BOMItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // What-If state
  const [wiChapters, setWiChapters] = useState('72,73,76');
  const [wiOrigins, setWiOrigins] = useState('CN');
  const [wiSurtax, setWiSurtax] = useState(25);
  const [wiResults, setWiResults] = useState<WhatIfResult[]>([]);

  // Drawback state
  const [dbImportHS, setDbImportHS] = useState('7318.15');
  const [dbExportHS, setDbExportHS] = useState('8708.99');
  const [dbValue, setDbValue] = useState(500000);

  // AI Classify state
  const [classifyDesc, setClassifyDesc] = useState('');
  const [classifyResults, setClassifyResults] = useState<any[]>([]);
  const [classifyLoading, setClassifyLoading] = useState(false);

  // Supply chain tree state
  type SCNode = { id: string; name: string; hs: string; origin: string; tier: number; qty: number; unitCost: number; children: SCNode[] };
  const [scTree, setScTree] = useState<SCNode[]>([
    { id: 'a1', name: 'Brake assembly', hs: '8708.30', origin: 'CA', tier: 0, qty: 5000, unitCost: 245, children: [
      { id: 'b1', name: 'Steel disc rotor', hs: '7218.99', origin: 'CN', tier: 1, qty: 10000, unitCost: 18, children: [
        { id: 'c1', name: 'Stainless steel billet', hs: '7218.10', origin: 'CN', tier: 2, qty: 50000, unitCost: 3.50, children: [] },
        { id: 'c2', name: 'Chromium alloy', hs: '8112.21', origin: 'TR', tier: 2, qty: 5000, unitCost: 12, children: [] },
      ]},
      { id: 'b2', name: 'Brake pads', hs: '6813.20', origin: 'MX', tier: 1, qty: 20000, unitCost: 6, children: [
        { id: 'c3', name: 'Aramid fibre', hs: '5402.11', origin: 'JP', tier: 1, qty: 2000, unitCost: 45, children: [] },
      ]},
      { id: 'b3', name: 'Hydraulic caliper', hs: '8412.21', origin: 'DE', tier: 1, qty: 5000, unitCost: 62, children: [
        { id: 'c4', name: 'Aluminum casting', hs: '7616.99', origin: 'CN', tier: 2, qty: 5000, unitCost: 22, children: [] },
        { id: 'c5', name: 'Piston seal kit', hs: '4016.93', origin: 'DE', tier: 2, qty: 10000, unitCost: 3, children: [] },
      ]},
      { id: 'b4', name: 'Copper brake line', hs: '7411.10', origin: 'US', tier: 1, qty: 5000, unitCost: 8, children: [] },
    ]},
  ]);
  const [scSurtaxFilter, setScSurtaxFilter] = useState('CN');
  const [scSurtaxRate, setScSurtaxRate] = useState(25);
  const [scAddParent, setScAddParent] = useState('');
  const [scNewNode, setScNewNode] = useState({ name: '', hs: '', origin: '', qty: 0, unitCost: 0 });

  useEffect(() => { setMounted(true); try { const s = localStorage.getItem('tm-wl2'); if(s) setWl(JSON.parse(s)); } catch{} }, []);
  useEffect(() => { if(mounted) try { localStorage.setItem('tm-wl2', JSON.stringify(wl)); } catch{} }, [wl, mounted]);

  const getImp = useCallback((hs: string) => IMP[hs] || IMP[getHS6(hs)] || null, [IMP]);
  const toggle = (hs: string) => setWl(p => p.includes(hs) ? p.filter(h=>h!==hs) : [...p,hs]);

  const wlItems = useMemo(() => wl.map(h => D.find(r => r.h===h)).filter(Boolean) as TariffItem[], [wl,D]);
  const selItem = useMemo(() => sel ? D.find(r => r.h===sel) || null : null, [sel,D]);
  const chapters = useMemo(() => [...new Set(D.map(r => r.c))].sort((a,b) => a-b), [D]);

  const filtered = useMemo(() => {
    let f = [...D];
    if(chF!=='all') f=f.filter(r=>r.c===Number(chF));
    if(rateF==='dutiable') f=f.filter(r=>r.m>0);
    else if(rateF==='free') f=f.filter(r=>r.m===0);
    if(q){ const lq=q.toLowerCase(); f=f.filter(r=>r.h.toLowerCase().includes(lq)||r.d.toLowerCase().includes(lq)); }
    if(sortBy==='imp') f.sort((a,b)=>(getImp(b.h)?.t||0)-(getImp(a.h)?.t||0));
    else if(sortBy==='rate') f.sort((a,b)=>(b.m||0)-(a.m||0));
    return f;
  }, [q,chF,rateF,sortBy,D,getImp]);

  // Reset page when filter inputs change (separately, not inside useMemo)
  useEffect(() => { setPg(0); }, [q, chF, rateF, sortBy]);

  const paged = useMemo(() => filtered.slice(pg*PG,(pg+1)*PG), [filtered,pg]);
  const totalPg = Math.ceil(filtered.length/PG);

  const addRes = useMemo(() => {
    if(!addQ||addQ.length<2) return [];
    const lq = addQ.toLowerCase();
    return D.filter(r => r.h.includes(lq)||r.d.toLowerCase().includes(lq)).slice(0,12);
  }, [addQ,D]);

  const stats = useMemo(() => {
    const dut = D.filter(r=>r.m>0);
    return { total:D.length, dutiable:dut.length, free:D.filter(r=>r.m===0).length, avgRate:dut.length?Math.round(dut.reduce((s,r)=>s+r.m,0)/dut.length*10)/10:0 };
  }, [D]);

  const wlAnalysis = useMemo(() => wlItems.filter(r=>r.m>0).map(r=>({
    ...r, imp:getImp(r.h), best:getBestFTA(r), topSource:getImp(r.h)?.c?.[0]||null, risk:assessRisk(r,getImp(r.h))
  })).sort((a,b)=>(b.imp?.t||0)-(a.imp?.t||0)), [wlItems,getImp]);

  const totalImpVal = wlAnalysis.reduce((s,r) => s+(r.imp?.t||0), 0);
  const affectedWatch = useMemo(() => {
    const wChs = new Set(wlItems.map(r=>r.c));
    return GAZETTE_ALERTS.filter(g=>g.sev==='high'&&(g.chs.length===0||g.chs.some(c=>wChs.has(c))));
  }, [wlItems]);

  // Risk analysis for all watchlist items
  const riskSummary = useMemo(() => {
    const all = wlItems.map(r => ({ ...r, risk: assessRisk(r, getImp(r.h)), imp: getImp(r.h) }));
    const counts = { low: 0, med: 0, high: 0, critical: 0 };
    all.forEach(r => { if(r.risk) counts[r.risk.level]++; });
    return { items: all.sort((a,b) => (b.risk?.score||0)-(a.risk?.score||0)), counts };
  }, [wlItems, getImp]);

  // Drawback estimate
  const drawback = useMemo(() => estimateDrawback(dbImportHS, dbExportHS, dbValue, D, USR), [dbImportHS, dbExportHS, dbValue, D, USR]);

  // BOM handlers
  const handleBOMUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setBomText(text);
      setBomItems(parseBOM(text, D, IMP));
    };
    reader.readAsText(file);
  };

  const handleBOMPaste = () => {
    if(bomText.trim()) setBomItems(parseBOM(bomText, D, IMP));
  };

  // What-If handler
  const runWhatIfCalc = () => {
    const chs = wiChapters.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n));
    const origins = wiOrigins.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    setWiResults(runWhatIf(D, IMP, chs, origins, wiSurtax));
  };

  // AI classify handler
  const handleClassify = async () => {
    if(!classifyDesc.trim()) return;
    setClassifyLoading(true);
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: classifyDesc })
      });
      const data = await res.json();
      setClassifyResults(data.suggestions || []);
    } catch(e) {
      setClassifyResults([]);
    }
    setClassifyLoading(false);
  };

  const tabs = [
    { id: 'home', label: 'Dashboard', group: 'main' },
    { id: 'browse', label: 'All codes', group: 'main' },
    { id: 'compare', label: 'Compare', group: 'main' },
    { id: 'bom', label: 'BOM upload', group: 'tools' },
    { id: 'supply', label: 'Supply chain', group: 'tools' },
    { id: 'whatif', label: 'What-if', group: 'tools' },
    { id: 'risk', label: 'Risk map', group: 'tools' },
    { id: 'classify', label: 'AI classify', group: 'intel' },
    { id: 'drawback', label: 'Drawback', group: 'intel' },
    { id: 'alerts', label: 'Alerts', group: 'main' },
  ];

  const bomTotalDuty = bomItems.reduce((s,r)=>s+r.annualDuty,0);
  const bomTotalSaving = bomItems.reduce((s,r)=>s+r.annualSaving,0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-positive animate-pulse" />
            <h1 className="font-display text-xl font-semibold tracking-tight">Tariff Monitor</h1>
          </div>
          <p className="text-xs text-ink-muted">CBSA T2026 · {stats.total.toLocaleString()} HS codes · StatsCan 2025 imports · Surtaxes: {STX.surtaxes.length} entries ({STX.generated})</p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-ink-faint tracking-wider uppercase">Sources</div>
          <div className="text-[11px] text-ink-muted">cbsa-asfc.gc.ca · statcan.gc.ca</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-5 overflow-x-auto">
        {tabs.map((t, i) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx(
              'relative px-4 py-2 text-xs whitespace-nowrap transition-colors shrink-0',
              tab === t.id ? 'text-ink font-medium tab-active' : 'text-ink-muted hover:text-ink',
              i > 0 && tabs[i-1].group !== t.group && 'ml-3'
            )}>
            {t.label}
            {t.id==='alerts'&&affectedWatch.length>0&&<span className="ml-1 text-[9px] bg-negative/20 text-negative px-1 py-0.5 rounded-full">{affectedWatch.length}</span>}
          </button>
        ))}
      </div>

      {/* ══════════ HOME ══════════ */}
      {tab==='home'&&(<div className="animate-fade-in">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display text-base font-medium">Your watchlist <span className="text-ink-muted font-normal text-xs">({wl.length} codes)</span></h2>
          <button onClick={()=>setAddMode(!addMode)} className="text-xs bg-surface-2 border border-border hover:border-border-hover text-ink-muted hover:text-ink px-3 py-1.5 rounded transition-all">{addMode?'Done':'+ Add codes'}</button>
        </div>

        {addMode&&(<div className="mb-4 p-3 bg-surface-1 border border-border rounded-lg">
          <input type="text" placeholder="Search HS code or keyword..." value={addQ} onChange={e=>setAddQ(e.target.value)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40 mb-2"/>
          {addRes.map(r=>{const imp=getImp(r.h);return(<div key={r.h} className="flex justify-between items-center py-1.5 border-b border-border last:border-0 text-xs">
            <span><span className="font-mono text-accent">{r.h}</span> <span className="text-ink-muted">{r.d.slice(0,40)}</span>{imp&&<span className="text-ink-faint ml-2">{fmtVal(imp.t)}</span>}</span>
            <button onClick={()=>toggle(r.h)} className="text-[11px] px-2 py-0.5 rounded border border-border hover:border-accent/40 text-ink-muted hover:text-accent">{wl.includes(r.h)?'Remove':'+ Add'}</button>
          </div>);})}
        </div>)}

        {affectedWatch.length>0&&<div className="mb-4 space-y-1">{affectedWatch.map(g=>(
          <div key={g.id} className="px-3 py-2 bg-negative/8 border border-negative/15 rounded text-xs pulse-alert">
            <span className="font-medium text-negative">{g.date}</span><span className="text-ink-muted ml-2">{g.title}</span>
          </div>
        ))}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5 stagger">
          <Metric label="Import value" value={fmtVal(totalImpVal)} sub="2025 watchlist" large/>
          <Metric label="Dutiable" value={`${wlAnalysis.length}/${wl.length}`} sub={`${wl.length-wlAnalysis.length} free`}/>
          <Metric label="Avg MFN" value={wlAnalysis.length?Math.round(wlAnalysis.reduce((s,r)=>s+r.m,0)/wlAnalysis.length*10)/10+'%':'—'} accent="#f59e0b"/>
          <Metric label="High risk" value={String(riskSummary.counts.high+riskSummary.counts.critical)} accent={riskSummary.counts.critical>0?'#ef4444':undefined} sub="Supply chain risk"/>
          <Metric label="Gazette" value={String(affectedWatch.length)} accent={affectedWatch.length>0?'#ef4444':undefined}/>
        </div>

        <h3 className="text-sm font-medium mb-2">Dutiable codes — volume, FTA, risk</h3>
        <div className="space-y-2 stagger">
          {wlAnalysis.map(r=>(<div key={r.h} onClick={()=>openDetail(r.h)} className="group px-4 py-3 bg-surface-1 border border-border rounded-lg cursor-pointer hover:border-border-hover hover:bg-surface-2/50 transition-all">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <RiskDot level={r.risk?.level||'low'}/>
                  <span className="font-mono text-sm font-medium text-accent">{r.h.slice(0,7)}</span>
                  <span className="text-xs text-ink-muted truncate">{r.d}</span>
                </div>
                <div className="text-xs mt-1">
                  <span className="text-warn font-medium">MFN {r.m}%</span>
                  {r.best&&<span className="text-positive ml-2">→ {r.best.label}: {r.best.rate===0?'Free':r.best.rate+'%'}</span>}
                  {r.risk&&r.risk.level!=='low'&&<span className="text-negative/70 ml-2 text-[10px]">{r.risk.factors[0]}</span>}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();toggle(r.h);}} className="text-ink-faint hover:text-negative text-xs opacity-0 group-hover:opacity-100">✕</button>
            </div>
            <div className="flex justify-between items-center gap-4">
              <div className="flex-1"><div className="text-[10px] text-ink-faint mb-1 uppercase tracking-wider">Top sources 2025</div><ImportBars imp={r.imp}/></div>
              <div className="text-right"><div className="font-mono text-base font-medium">{r.imp?fmtVal(r.imp.t):'—'}</div><div className="text-[10px] text-ink-faint">imports</div></div>
            </div>
          </div>))}
        </div>
      </div>)}

      {/* ══════════ BROWSE ══════════ */}
      {tab==='browse'&&(<div className="animate-fade-in">
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="text" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)} className="flex-1 min-w-[160px] bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40"/>
          <select value={chF} onChange={e=>setChF(e.target.value)} className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"><option value="all">All chapters</option>{chapters.map(c=><option key={c} value={c}>Ch {c}: {CHAPTER_NAMES[c]}</option>)}</select>
          <select value={rateF} onChange={e=>setRateF(e.target.value)} className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"><option value="all">All</option><option value="dutiable">Dutiable</option><option value="free">Free</option></select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"><option value="imp">Sort: imports</option><option value="rate">Sort: rate</option></select>
        </div>
        <div className="text-[11px] text-ink-faint mb-2">{filtered.length.toLocaleString()} results · page {pg+1}/{totalPg||1}</div>
        <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
          <thead><tr className="border-b border-border">{['','HS','Description','MFN','Best FTA','Imports','Sources'].map(h=><th key={h} className={clsx('py-2 px-2 font-medium text-ink-faint text-[10px] uppercase tracking-wider',['MFN','Best FTA','Imports'].includes(h)?'text-right':'text-left')}>{h}</th>)}</tr></thead>
          <tbody>{paged.map(r=>{const inW=wl.includes(r.h);const imp=getImp(r.h);const best=getBestFTA(r);return(
            <tr key={r.h} className="border-b border-border hover:bg-surface-2/30">
              <td className="py-1.5 px-2 text-center"><span onClick={()=>toggle(r.h)} className={clsx('cursor-pointer text-sm',inW?'text-warn':'text-ink-faint/30 hover:text-ink-faint')}>{inW?'★':'☆'}</span></td>
              <td className="py-1.5 px-2"><span onClick={()=>openDetail(r.h)} className="font-mono font-medium text-accent hover:underline cursor-pointer">{r.h}</span></td>
              <td className="py-1.5 px-2 max-w-[180px] truncate text-ink-muted">{r.d}</td>
              <td className={clsx('py-1.5 px-2 text-right font-mono font-medium',r.m>15?'text-negative':r.m>5?'text-warn':r.m===0?'text-positive':'text-ink')}>{r.m===-1?'Spec':r.m===0?'Free':r.m+'%'}{(()=>{const sx=findSurtax(STX,r.h,'US');return sx?<span className="ml-1 text-[9px] text-negative font-sans">+{sx.rate}%</span>:null;})()}</td>
              <td className={clsx('py-1.5 px-2 text-right font-mono',best&&best.rate===0?'text-positive':'text-ink-muted')}>{best?best.rate===0?'Free':best.rate+'%':'—'}</td>
              <td className="py-1.5 px-2 text-right font-mono text-ink-muted">{imp?fmtVal(imp.t):'—'}</td>
              <td className="py-1.5 px-2"><ImportBars imp={imp} small/></td>
            </tr>);})}</tbody>
        </table></div>
        {totalPg>1&&<div className="flex gap-2 mt-3 items-center justify-center">
          <button onClick={()=>setPg(0)} disabled={pg===0} className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">First</button>
          <button onClick={()=>setPg(Math.max(0,pg-1))} disabled={pg===0} className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Prev</button>
          <span className="text-xs text-ink-faint min-w-[60px] text-center">{pg+1}/{totalPg}</span>
          <button onClick={()=>setPg(Math.min(totalPg-1,pg+1))} disabled={pg>=totalPg-1} className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Next</button>
          <button onClick={()=>setPg(totalPg-1)} disabled={pg>=totalPg-1} className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Last</button>
        </div>}
      </div>)}

      {/* ══════════ COMPARE ══════════ */}
      {tab==='compare'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-4">Compare tariff by origin</h2>
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex-[2] min-w-[200px]"><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">HS code</label>
            <select value={sel} onChange={e=>setSel(e.target.value)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink">
              <option value="">Select...</option>
              <optgroup label="Watchlist">{wlItems.filter(r=>r.m>0).map(r=><option key={r.h} value={r.h}>{r.h} — {r.d.slice(0,40)}</option>)}</optgroup>
              <optgroup label="All dutiable">{D.filter(r=>r.m>0).slice(0,300).map(r=><option key={r.h} value={r.h}>{r.h} — {r.d.slice(0,40)}</option>)}</optgroup>
            </select></div>
          <div className="min-w-[100px]"><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Surtax %</label>
            <input type="number" value={surtax} onChange={e=>setSurtax(Number(e.target.value)||0)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"/></div>
        </div>
        {selItem&&selItem.m>0?(<div className="space-y-5">
          <div className="p-4 bg-surface-1 border border-border rounded-lg">
            <div className="font-mono text-base font-medium text-accent">{selItem.h}</div>
            <div className="text-sm text-ink-muted mt-1">{selItem.d}</div>
            <div className="flex gap-4 mt-2 text-xs text-ink-faint"><span>Ch {selItem.c}: {CHAPTER_NAMES[selItem.c]}</span><span>MFN: <span className="text-warn font-medium">{selItem.m}%</span></span></div>
          </div>
          {(()=>{const imp=getImp(selItem.h);return imp?<div><h3 className="text-sm font-medium mb-3">Import sources (2025)</h3>{imp.c.map((c:any,i:number)=>{const pct=Math.round(c.v/imp.t*100);return(<div key={c.k} className="flex items-center gap-3 mb-1.5"><div className="w-16 text-right text-xs font-medium" style={{color:i===0?'#3b82f6':i===1?'#f59e0b':'#6b7280'}}>{c.n}</div><div className="flex-1 h-5 bg-surface-2 rounded overflow-hidden"><div className="h-full rounded" style={{width:pct+'%',background:i===0?'#3b82f6':i===1?'#f59e0b':'#4a5060'}}/></div><div className="min-w-[80px] text-right text-xs font-mono">{fmtVal(c.v)} <span className="text-ink-faint">{pct}%</span></div></div>);})}<div className="text-right text-sm font-mono font-medium mt-1">Total: {fmtVal(imp.t)}</div></div>:null;})()}
          <div><h3 className="text-sm font-medium mb-3">Tariff rate by origin</h3>{(()=>{
            const keys=['us','mx','eu','cp','uk','jp','kr'] as const;
            const scenarios: {key:string;label:string;rate:number;color:string}[] = keys.filter(k=>selItem[k]!=null).map(k=>({key:k,label:FTA_LABELS[k],rate:selItem[k]||0,color:FTA_COLORS[k]}));
            scenarios.unshift({key:'mfn',label:'MFN'+(surtax>0?` +${surtax}%`:''),rate:selItem.m+surtax,color:FTA_COLORS.mfn});
            scenarios.sort((a,b)=>a.rate-b.rate);const maxR=Math.max(...scenarios.map(s=>s.rate),1);
            return <div className="space-y-1.5">{scenarios.map((s,i)=>(<div key={s.key} className="flex items-center gap-3"><div className={clsx('w-24 text-right text-xs',i===0?'font-medium text-positive':'text-ink-muted')}>{s.label}</div><div className="flex-1 h-5 bg-surface-2 rounded overflow-hidden"><div className="h-full rounded" style={{width:Math.max(s.rate/maxR*100,1)+'%',background:s.color,opacity:i===0?1:0.7}}/></div><div className={clsx('min-w-[50px] text-right text-xs font-mono',i===0?'font-medium text-positive':s.rate===0?'text-positive':'text-ink')}>{s.rate===0?'Free':s.rate+'%'}</div></div>))}</div>;
          })()}</div>
          <div><h3 className="text-sm font-medium mb-3">Sensitivity: per-$100 as surtax rises</h3><div className="h-48"><ResponsiveContainer><LineChart data={Array.from({length:11},(_,i)=>{const st=i*5;return{surtax:st+'%',MFN:Math.round(100*(1+(selItem.m+st)/100)*100)/100,'CUSMA':Math.round(100*(1+(selItem.us||0)/100)*100)/100,'CETA':Math.round(100*(1+(selItem.eu||0)/100)*100)/100};})} margin={{left:0,right:8,top:8,bottom:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/><XAxis dataKey="surtax" tick={{fontSize:11,fill:'#4a5060'}}/><YAxis tick={{fontSize:11,fill:'#4a5060'}}/>
            <Tooltip contentStyle={{fontSize:12,background:'#1a1e25',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#e8eaed'}}/>
            <Line type="monotone" dataKey="MFN" stroke="#6b7280" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="CUSMA" stroke="#3b82f6" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="CETA" stroke="#a78bfa" strokeWidth={2} dot={false}/>
            <Legend wrapperStyle={{fontSize:11}}/></LineChart></ResponsiveContainer></div></div>
        </div>):(<div className="py-16 text-center text-ink-faint text-sm">Select a dutiable HS code</div>)}
      </div>)}

      {/* ══════════ BOM UPLOAD ══════════ */}
      {tab==='bom'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">BOM exposure calculator</h2>
        <p className="text-xs text-ink-muted mb-4">Upload your bill of materials CSV to compute total tariff exposure and FTA savings</p>
        <div className="p-4 bg-surface-1 border border-border rounded-lg mb-4">
          <div className="flex gap-3 mb-3">
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleBOMUpload} className="hidden"/>
            <button onClick={()=>fileRef.current?.click()} className="text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded hover:bg-accent/20 transition-colors">Upload CSV</button>
            <span className="text-xs text-ink-faint self-center">or paste below</span>
          </div>
          <textarea value={bomText} onChange={e=>setBomText(e.target.value)} placeholder={'hs_code,description,unit_cost,annual_qty,origin\n7318.15,Steel bolts M8,2.50,50000,CN\n8501.31,DC motor 500W,85.00,2000,DE\n3920.10,PE film 50μm,1.20,100000,US'} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-ink font-mono h-28 placeholder:text-ink-faint focus:outline-none focus:border-accent/40 resize-none"/>
          <button onClick={handleBOMPaste} className="mt-2 text-xs bg-surface-2 border border-border text-ink-muted px-4 py-1.5 rounded hover:text-ink">Analyze BOM</button>
        </div>

        {bomItems.length>0&&(<div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric label="BOM lines" value={String(bomItems.length)} sub={`${bomItems.filter(r=>r.matchedTariff).length} matched`}/>
            <Metric label="Annual duty" value={'$'+bomTotalDuty.toLocaleString()} accent="#ef4444" sub="At MFN rates"/>
            <Metric label="FTA savings" value={'$'+bomTotalSaving.toLocaleString()} accent="#22c55e" sub="If sourced via best FTA"/>
            <Metric label="Potential reduction" value={bomTotalDuty>0?Math.round(bomTotalSaving/bomTotalDuty*100)+'%':'—'} accent="#22c55e"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-border">{['Part','HS','MFN','Best FTA','Annual duty','Saveable','Risk'].map(h=><th key={h} className="py-2 px-2 font-medium text-ink-faint text-[10px] uppercase tracking-wider text-left">{h}</th>)}</tr></thead>
            <tbody>{bomItems.map((r,i)=>(<tr key={i} className="border-b border-border">
              <td className="py-1.5 px-2 text-ink-muted">{r.description.slice(0,30)}</td>
              <td className="py-1.5 px-2 font-mono text-accent">{r.hsCode}</td>
              <td className="py-1.5 px-2 font-mono text-warn">{r.mfnRate}%</td>
              <td className="py-1.5 px-2 text-positive text-[11px]">{r.bestFTA} {r.preferentialRate===0?'Free':r.preferentialRate+'%'}</td>
              <td className="py-1.5 px-2 font-mono">${r.annualDuty.toLocaleString()}</td>
              <td className="py-1.5 px-2 font-mono text-positive">${r.annualSaving.toLocaleString()}</td>
              <td className="py-1.5 px-2">{r.risk&&<div className="flex items-center gap-1"><RiskDot level={r.risk.level}/><span className="text-[10px] text-ink-muted">{RISK_CLS[r.risk.level].label}</span></div>}</td>
            </tr>))}</tbody>
          </table></div>
        </div>)}
      </div>)}

      {/* ══════════ WHAT-IF ══════════ */}
      {tab==='whatif'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">What-if scenario modeler</h2>
        <p className="text-xs text-ink-muted mb-4">Model impact of tariff changes on specific origins or chapters</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Chapters (comma-sep)</label>
            <input value={wiChapters} onChange={e=>setWiChapters(e.target.value)} placeholder="72,73,76" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"/></div>
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Origins (ISO2)</label>
            <input value={wiOrigins} onChange={e=>setWiOrigins(e.target.value)} placeholder="CN,RU" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"/></div>
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Surtax change %</label>
            <input type="number" value={wiSurtax} onChange={e=>setWiSurtax(Number(e.target.value)||0)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink"/></div>
          <div className="flex items-end"><button onClick={runWhatIfCalc} className="w-full text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded hover:bg-accent/20">Run scenario</button></div>
        </div>
        {wiResults.length>0&&(<div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <Metric label="Codes affected" value={String(wiResults.length)}/>
            <Metric label="Total annual impact" value={fmtVal(Math.abs(wiResults.reduce((s,r)=>s+r.annualImpact,0)))} accent={wiSurtax>0?'#ef4444':'#22c55e'} sub={wiSurtax>0?'Additional cost':'Savings'}/>
            <Metric label="Avg rate change" value={`${wiResults[0]?.currentRate||0}% → ${wiResults[0]?.newRate||0}%`} accent="#f59e0b"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-border">{['HS','Description','Current','New','Annual impact','Import value'].map(h=><th key={h} className="py-2 px-2 font-medium text-ink-faint text-[10px] uppercase tracking-wider text-left">{h}</th>)}</tr></thead>
            <tbody>{wiResults.slice(0,30).map(r=>(<tr key={r.hsCode} className="border-b border-border">
              <td className="py-1.5 px-2 font-mono text-accent">{r.hsCode.slice(0,7)}</td>
              <td className="py-1.5 px-2 text-ink-muted truncate max-w-[200px]">{r.description}</td>
              <td className="py-1.5 px-2 font-mono">{r.currentRate}%</td>
              <td className="py-1.5 px-2 font-mono text-warn">{r.newRate}%</td>
              <td className="py-1.5 px-2 font-mono text-negative">{fmtVal(Math.abs(r.annualImpact))}</td>
              <td className="py-1.5 px-2 font-mono text-ink-muted">{fmtVal(r.importValue)}</td>
            </tr>))}</tbody>
          </table></div>
        </div>)}
      </div>)}

      {/* ══════════ RISK MAP ══════════ */}
      {tab==='risk'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">Supply chain risk map</h2>
        <p className="text-xs text-ink-muted mb-4">Concentration, geopolitical alignment, and FTA coverage for your watchlist</p>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {(['low','med','high','critical'] as const).map(lv=>(<div key={lv} className={clsx('rounded-lg p-3 border border-border text-center',RISK_CLS[lv].bg)}>
            <div className={clsx('text-2xl font-mono font-medium',RISK_CLS[lv].text)}>{riskSummary.counts[lv]}</div>
            <div className="text-[10px] text-ink-muted uppercase tracking-wider mt-1">{RISK_CLS[lv].label}</div>
          </div>))}
        </div>
        <div className="space-y-2">{riskSummary.items.filter(r=>r.risk).map(r=>(<div key={r.h} className={clsx('px-4 py-3 bg-surface-1 border border-border rounded-lg',r.risk!.level==='critical'&&'border-negative/30')}>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2"><RiskDot level={r.risk!.level}/><span className="font-mono text-sm font-medium text-accent">{r.h.slice(0,7)}</span><span className="text-xs text-ink-muted">{r.d}</span></div>
            <div className="flex items-center gap-2">
              <span className={clsx('text-xs font-mono font-medium px-2 py-0.5 rounded',RISK_CLS[r.risk!.level].bg,RISK_CLS[r.risk!.level].text)}>{r.risk!.score}/100</span>
            </div>
          </div>
          <div className="flex gap-4 text-xs text-ink-muted">
            <span>Top: <span className="text-ink font-medium">{r.risk!.topSource}</span> ({r.risk!.concentration}%) · HHI: {r.risk!.hhi}</span>
            <span>{r.risk!.isAllied?<span className="text-positive">Allied</span>:<span className="text-negative">Non-aligned</span>}</span>
            <span>{r.risk!.hasFTA?<span className="text-positive">FTA available ({r.risk!.ftaSaving}% saving)</span>:<span className="text-ink-faint">No FTA advantage</span>}</span>
          </div>
          {r.risk!.factors.length>0&&<div className="mt-1.5 text-[11px] text-ink-faint">{r.risk!.factors.join(' · ')}</div>}
        </div>))}</div>
      </div>)}

      {/* ══════════ AI CLASSIFY ══════════ */}
      {tab==='classify'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">AI tariff classification</h2>
        <p className="text-xs text-ink-muted mb-4">Describe a product in plain English to find the right HS code</p>
        <div className="flex gap-3 mb-4">
          <input value={classifyDesc} onChange={e=>setClassifyDesc(e.target.value)} placeholder="e.g. stainless steel M8 hex bolt, grade A4-80, for marine use" className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40"
            onKeyDown={e=>{if(e.key==='Enter')handleClassify();}}/>
          <button onClick={handleClassify} disabled={classifyLoading} className="text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded hover:bg-accent/20 disabled:opacity-50">{classifyLoading?'Classifying...':'Classify'}</button>
        </div>
        {classifyResults.length>0&&<div className="space-y-2">{classifyResults.map((r:any,i:number)=>(<div key={i} className="p-4 bg-surface-1 border border-border rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div><span className="font-mono text-base font-medium text-accent">{r.hs_formatted}</span><span className="text-sm text-ink-muted ml-3">{r.description}</span></div>
            <Badge t={r.confidence} s={r.confidence==='high'?'low':r.confidence==='medium'?'med':'high'}/>
          </div>
          <div className="text-xs text-ink-muted">{r.reasoning}</div>
          {(()=>{const match=D.find(t=>getHS6(t.h)===r.hs6);return match?<div className="mt-2 pt-2 border-t border-border text-xs">
            <span className="text-ink-faint">Matched T2026: </span><span className="text-ink">{match.h}</span>
            <span className="text-warn ml-3">MFN {match.m}%</span>
            {getBestFTA(match)&&<span className="text-positive ml-2">{getBestFTA(match)!.label}: {getBestFTA(match)!.rate===0?'Free':getBestFTA(match)!.rate+'%'}</span>}
            <button onClick={()=>toggle(match.h)} className="ml-3 text-accent hover:underline">{wl.includes(match.h)?'In watchlist':'+ Add to watchlist'}</button>
          </div>:null;})()}
        </div>))}</div>}
        {classifyResults.length===0&&!classifyLoading&&<div className="p-8 text-center text-ink-faint text-xs border border-dashed border-border rounded-lg">
          Enter a product description and press Classify. Works without API key (keyword matching) or with ANTHROPIC_API_KEY env var for AI classification.
        </div>}
      </div>)}

      {/* ══════════ DRAWBACK ══════════ */}
      {tab==='drawback'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">Duty drawback calculator</h2>
        <p className="text-xs text-ink-muted mb-4">Three estimation methods per Customs Act s.89 and CUSMA Article 2.5</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Import HS (input)</label>
            <input value={dbImportHS} onChange={e=>setDbImportHS(e.target.value)} placeholder="7318.15" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink font-mono"/></div>
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Export HS (finished good)</label>
            <input value={dbExportHS} onChange={e=>setDbExportHS(e.target.value)} placeholder="8708.99" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink font-mono"/></div>
          <div><label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Annual import value (CAD)</label>
            <input type="number" value={dbValue} onChange={e=>setDbValue(Number(e.target.value)||0)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink font-mono"/></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Metric label="Duty paid annually" value={'$'+drawback.dutyPaid.toLocaleString()} accent="#ef4444" sub={`Import: ${drawback.importDesc.slice(0,35)}`}/>
          <Metric label="Best refund estimate" value={'$'+(drawback.methods[drawback.recommended]?.refund||0).toLocaleString()} accent="#22c55e" sub={drawback.methods[drawback.recommended]?.name||''} large/>
        </div>
        
        <h3 className="text-sm font-medium mb-3">Three drawback methods</h3>
        <div className="space-y-2 mb-4">{drawback.methods.map((m,i)=>(<div key={i} className={clsx('p-4 bg-surface-1 border rounded-lg',i===drawback.recommended?'border-positive/30':'border-border')}>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              {i===drawback.recommended&&<span className="text-[10px] font-medium bg-positive/10 text-positive px-2 py-0.5 rounded">Recommended</span>}
              <span className="text-sm font-medium">{m.name}</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-medium" style={{color:m.refund>0?'#22c55e':'#6b7280'}}>${m.refund.toLocaleString()}</div>
              <div className="text-[10px] text-ink-faint">{Math.round(m.rate*100)}% of duty paid</div>
            </div>
          </div>
          <div className="text-xs text-ink-muted">{m.basis}</div>
        </div>))}</div>

        <div className={clsx('p-4 border rounded-lg text-sm',drawback.dutyPaid===0?'bg-surface-2 border-border text-ink-muted':'bg-positive/8 border-positive/15 text-positive')}>
          {drawback.notes}
        </div>
        <div className="mt-3 p-3 bg-surface-1 border border-border rounded-lg text-xs text-ink-faint">
          <strong className="text-ink-muted">Disclaimer:</strong> Estimates only — actual eligibility requires CBSA adjudication via K32 claim. Time limit: 4 years from import date. References: Customs Act s.89, CUSMA Art. 2.5, CBSA Memoranda D7-4-2 (same condition), D7-4-3 (processed goods). CUSMA cap applies only to US/MX exports.
        </div>
      </div>)}

      {/* ══════════ SUPPLY CHAIN ══════════ */}
      {tab==='supply'&&(()=>{
        // Compute tariff impact for each node
        type NodeAnalysis = SCNode & { mfnRate: number; tariffImp: any; risk: any; dutyAnnual: number; affectedBySurtax: boolean; surtaxCost: number };
        
        function analyzeNode(node: SCNode): NodeAnalysis {
          const tariffMatch = D.find(t => t.h.startsWith(node.hs));
          const mfnRate = tariffMatch?.m || 0;
          const imp = getImp(tariffMatch?.h || '');
          const affectedBySurtax = node.origin === scSurtaxFilter;
          const effectiveRate = mfnRate + (affectedBySurtax ? scSurtaxRate : 0);
          const dutyAnnual = Math.round(node.unitCost * node.qty * effectiveRate / 100);
          const surtaxCost = affectedBySurtax ? Math.round(node.unitCost * node.qty * scSurtaxRate / 100) : 0;
          return { ...node, mfnRate, tariffImp: imp, risk: null, dutyAnnual, affectedBySurtax, surtaxCost };
        }

        function flattenTree(nodes: SCNode[]): NodeAnalysis[] {
          const result: NodeAnalysis[] = [];
          function walk(ns: SCNode[]) { ns.forEach(n => { result.push(analyzeNode(n)); walk(n.children); }); }
          walk(nodes);
          return result;
        }

        const allNodes = flattenTree(scTree);
        const affectedNodes = allNodes.filter(n => n.affectedBySurtax);
        const totalDuty = allNodes.reduce((s, n) => s + n.dutyAnnual, 0);
        const totalSurtaxExposure = affectedNodes.reduce((s, n) => s + n.surtaxCost, 0);
        const deepestAffected = affectedNodes.reduce((max, n) => n.tier > max ? n.tier : max, 0);

        function renderNode(node: SCNode, depth: number): any {
          const a = analyzeNode(node);
          const best = D.find(t => t.h.startsWith(node.hs));
          const bestFTA = best ? getBestFTA(best) : null;
          return (
            <div key={node.id}>
              <div className={clsx('flex items-center gap-2 py-2 border-b border-border hover:bg-surface-2/30 transition-colors', a.affectedBySurtax && 'bg-negative/5')}
                style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
                {node.children.length > 0 && <span className="text-ink-faint text-[10px]">▼</span>}
                {node.children.length === 0 && <span className="text-ink-faint text-[10px] ml-2.5">·</span>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">{node.name}</span>
                    <span className="font-mono text-[10px] text-accent">{node.hs}</span>
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium',
                      a.affectedBySurtax ? 'bg-negative/15 text-negative' :
                      node.origin === 'CA' ? 'bg-positive/15 text-positive' :
                      'bg-surface-3 text-ink-muted'
                    )}>{node.origin}</span>
                    <span className="text-[10px] text-ink-faint">Tier {node.tier}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-4">
                  <div className="text-[10px] text-ink-muted">{a.mfnRate > 0 ? <span className="text-warn">{a.mfnRate}%</span> : <span className="text-positive">Free</span>}
                    {a.affectedBySurtax && <span className="text-negative ml-1">+{scSurtaxRate}%</span>}
                  </div>
                  {bestFTA && bestFTA.rate < a.mfnRate && <div className="text-[10px] text-positive">{bestFTA.label}: {bestFTA.rate === 0 ? 'Free' : bestFTA.rate + '%'}</div>}
                  <div className="min-w-[70px] text-right">
                    {a.dutyAnnual > 0 ? <span className={clsx('text-xs font-mono font-medium', a.affectedBySurtax ? 'text-negative' : 'text-warn')}>${a.dutyAnnual.toLocaleString()}</span> : <span className="text-[10px] text-ink-faint">$0</span>}
                  </div>
                </div>
              </div>
              {node.children.map(c => renderNode(c, depth + 1))}
            </div>
          );
        }

        return (
          <div className="animate-fade-in">
            <h2 className="font-display text-base font-medium mb-1">Multi-tier supply chain visibility</h2>
            <p className="text-xs text-ink-muted mb-4">Map your supply chain tree and see where tariffs and surtaxes hit — including hidden costs at Tier 2 and Tier 3</p>

            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Surtax scenario — origin</label>
                <input value={scSurtaxFilter} onChange={e => setScSurtaxFilter(e.target.value.toUpperCase())} placeholder="CN" className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink font-mono" />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-[10px] text-ink-faint block mb-1 uppercase tracking-wider">Surtax rate %</label>
                <input type="number" value={scSurtaxRate} onChange={e => setScSurtaxRate(Number(e.target.value) || 0)} className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Metric label="Total components" value={String(allNodes.length)} sub={`Across ${Math.max(...allNodes.map(n => n.tier)) + 1} tiers`} />
              <Metric label="Total annual duty" value={'$' + totalDuty.toLocaleString()} accent="#f59e0b" />
              <Metric label={`${scSurtaxFilter} surtax exposure`} value={'$' + totalSurtaxExposure.toLocaleString()} accent={totalSurtaxExposure > 0 ? '#ef4444' : undefined} sub={`${affectedNodes.length} components affected`} />
              <Metric label="Deepest affected tier" value={affectedNodes.length > 0 ? 'Tier ' + deepestAffected : 'None'} accent={deepestAffected >= 2 ? '#ef4444' : undefined} sub={deepestAffected >= 2 ? 'Hidden cost — not on invoice' : ''} />
            </div>

            {affectedNodes.length > 0 && (
              <div className="mb-4 px-3 py-2 bg-negative/8 border border-negative/15 rounded text-xs">
                <span className="font-medium text-negative">Surtax alert:</span>
                <span className="text-ink-muted ml-2">
                  A {scSurtaxRate}% surtax on {scSurtaxFilter}-origin goods hits {affectedNodes.length} components in your supply chain, 
                  adding ${totalSurtaxExposure.toLocaleString()}/year in duty.
                  {deepestAffected >= 2 && ` ${affectedNodes.filter(n => n.tier >= 2).length} are at Tier ${deepestAffected} — these costs are buried in sub-supplier invoices and may not be visible until contract renegotiation.`}
                </span>
              </div>
            )}

            <div className="bg-surface-1 border border-border rounded-lg overflow-hidden mb-4">
              <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface-2/50">
                <span className="text-[10px] text-ink-faint uppercase tracking-wider flex-1">Component / HS / Origin / Tier</span>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider w-16 text-right">Rate</span>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider w-20 text-right">Best FTA</span>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider w-[70px] text-right">Duty/yr</span>
              </div>
              {scTree.map(node => renderNode(node, 0))}
            </div>

            <div className="p-3 bg-surface-1 border border-border rounded-lg">
              <div className="text-xs font-medium text-ink mb-2">How to read this</div>
              <div className="text-[11px] text-ink-muted space-y-1">
                <div><span className="text-negative font-medium">Red-highlighted rows</span> are components from the surtax target country ({scSurtaxFilter}). Their duty includes the {scSurtaxRate}% surtax.</div>
                <div><span className="text-warn font-medium">Yellow rates</span> show the base MFN duty. <span className="text-positive font-medium">Green "Best FTA"</span> shows a cheaper available origin.</div>
                <div><span className="font-medium text-ink">Tier 2+ components</span> are sub-supplier inputs. These tariff costs are passed through in the sub-supplier's price — they won't appear as a line item on your Tier 1 invoice, but they affect your cost.</div>
                <div className="mt-2 text-ink-faint">The sample data shows a brake assembly. Replace with your actual supply chain using the JSON structure or contact us for CSV import support.</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════ ALERTS ══════════ */}
      {tab==='alerts'&&(<div className="animate-fade-in">
        <h2 className="font-display text-base font-medium mb-1">Regulatory alerts</h2>
        <p className="text-xs text-ink-muted mb-4">Canada Gazette SORs and customs notices</p>
        <div className="space-y-2 stagger">{GAZETTE_ALERTS.map(g=>{const affects=g.chs.length===0||g.chs.some(c=>wlItems.some(w=>w.c===c));return(
          <div key={g.id} className={clsx('p-4 border-l-[3px] bg-surface-1 border border-border rounded-r-lg',g.sev==='high'?'border-l-negative':g.sev==='med'?'border-l-warn':'border-l-accent')}>
            <div className="flex justify-between items-center mb-2">
              <div className="flex gap-2 items-center"><Badge t={g.sev} s={g.sev}/><Badge t={g.status} s={g.status==='In effect'?'high':g.status.includes('comment')?'med':'low'}/>{affects&&<span className="text-[10px] font-medium text-negative">Affects watchlist</span>}</div>
              <span className="text-[11px] text-ink-faint">{g.date}</span>
            </div>
            <div className="text-sm font-medium">{g.title}</div>
            <div className="text-xs text-ink-muted mt-1">{g.desc}</div>
            {g.chs.length>0&&<div className="text-[11px] text-ink-faint mt-1">Chapters: {g.chs.map(c=>'Ch '+c+' ('+CHAPTER_NAMES[c]+')').join(', ')}</div>}
          </div>
        );})}</div>
      </div>)}

      {/* ══════════ HS CODE DETAIL PANEL ══════════ */}
      {detailHS && (() => {
        const item = D.find(r => r.h === detailHS);
        if (!item) { setDetailHS(null); return null; }
        const imp = getImp(item.h);
        const best = getBestFTA(item);
        const risk = assessRisk(item, imp);
        const roo = getROO(item.c);
        const inWatchlist = wl.includes(item.h);
        const relatedAlerts = GAZETTE_ALERTS.filter(g => (g.chs as number[]).includes(item.c));
        const keys = ['us', 'mx', 'eu', 'cp', 'uk', 'jp', 'kr'] as const;
        const allRates: { key: string; label: string; rate: number; color: string }[] = keys
          .filter(k => item[k] != null)
          .map(k => ({ key: k, label: FTA_LABELS[k], rate: item[k] || 0, color: FTA_COLORS[k] }));
        allRates.push({ key: 'mfn', label: 'MFN', rate: item.m, color: FTA_COLORS.mfn });
        allRates.sort((a, b) => a.rate - b.rate);
        const maxRate = Math.max(...allRates.map(r => r.rate), 1);
        const usRate = USR[item.h.replace(/\./g, '').slice(0, 6)];
        const surtaxUS = findSurtax(STX, item.h, 'US');
        const surtaxCN = findSurtax(STX, item.h, 'CN');
        const surtaxAll = findSurtax(STX, item.h, 'ALL');

        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailHS(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-xl bg-surface-0 border-l border-border overflow-y-auto animate-slide-in"
              onClick={e => e.stopPropagation()} style={{ animation: 'slideIn 0.25s ease-out' }}>
              <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

              {/* Header */}
              <div className="sticky top-0 bg-surface-0 border-b border-border px-5 py-4 flex justify-between items-start z-10">
                <div>
                  <div className="font-mono text-lg font-medium text-accent">{item.h}</div>
                  <div className="text-sm text-ink-muted mt-0.5">{item.d}</div>
                  <div className="text-xs text-ink-faint mt-1">Ch {item.c}: {CHAPTER_NAMES[item.c]} · UOM: {item.u}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(item.h)}
                    className={clsx('text-xs px-3 py-1.5 rounded border transition-colors',
                      inWatchlist ? 'border-warn/30 bg-warn/10 text-warn' : 'border-border text-ink-muted hover:text-accent hover:border-accent/30')}>
                    {inWatchlist ? '★ In watchlist' : '☆ Add to watchlist'}
                  </button>
                  <button onClick={() => setDetailHS(null)} className="text-ink-faint hover:text-ink text-lg px-2">✕</button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Tariff rates */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Tariff rates by origin</h3>
                  <div className="space-y-1.5">
                    {allRates.map((r, i) => (
                      <div key={r.key} className="flex items-center gap-3">
                        <div className={clsx('w-24 text-right text-xs', i === 0 ? 'font-medium text-positive' : 'text-ink-muted')}>{r.label}</div>
                        <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: Math.max(r.rate / maxRate * 100, r.rate === 0 ? 1 : 2) + '%', background: r.color, opacity: i === 0 ? 1 : 0.7 }} />
                        </div>
                        <div className={clsx('min-w-[50px] text-right text-xs font-mono', i === 0 ? 'font-medium text-positive' : r.rate === 0 ? 'text-positive' : 'text-ink')}>
                          {r.rate === 0 ? 'Free' : r.rate + '%'}
                        </div>
                      </div>
                    ))}
                  </div>
                  {item.g != null && <div className="text-[11px] text-ink-faint mt-2">General tariff (Column 2): {item.g}%</div>}
                  {usRate !== undefined && <div className="text-[11px] text-ink-faint">US HTS general rate: {usRate}% <span className="text-ink-faint/60">(USITC)</span></div>}
                  {best && item.m > 0 && (
                    <div className="mt-2 px-3 py-2 bg-positive/8 border border-positive/15 rounded text-xs text-positive">
                      Best: {best.label} at {best.rate === 0 ? 'Free' : best.rate + '%'} — saves {Math.round((item.m - best.rate) / item.m * 100)}% vs MFN
                    </div>
                  )}
                  {(surtaxUS || surtaxCN || surtaxAll) && (
                    <div className="mt-2 space-y-1.5">
                      {surtaxUS && <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                        <span className="font-medium text-negative">US surtax active: +{surtaxUS.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxUS.order} ({surtaxUS.cn})</span>
                        <div className="text-ink-faint mt-0.5">Real US rate: {(item.us ?? item.m) + surtaxUS.rate}% (CUSMA {item.us ?? item.m}% + surtax {surtaxUS.rate}%)</div>
                      </div>}
                      {surtaxCN && <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                        <span className="font-medium text-negative">China surtax active: +{surtaxCN.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxCN.order} ({surtaxCN.cn})</span>
                        <div className="text-ink-faint mt-0.5">Real CN rate: {item.m + surtaxCN.rate}% (MFN {item.m}% + surtax {surtaxCN.rate}%)</div>
                      </div>}
                      {surtaxAll && !surtaxUS && <div className="px-3 py-2 bg-warn/10 border border-warn/20 rounded text-xs">
                        <span className="font-medium text-warn">Global surtax: +{surtaxAll.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxAll.order} ({surtaxAll.cn})</span>
                        <div className="text-ink-faint mt-0.5">Applies to all origins. Non-stackable: doesn't apply if US/CN steel surtax already applies.</div>
                      </div>}
                    </div>
                  )}
                </div>

                {/* Import data */}
                {imp && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Import sources (2025)</h3>
                    <div className="space-y-1.5">
                      {imp.c.map((c: any, i: number) => {
                        const pct = Math.round(c.v / imp.t * 100);
                        return (
                          <div key={c.k} className="flex items-center gap-3">
                            <div className="w-14 text-right text-xs font-medium" style={{ color: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#6b7280' }}>{c.n}</div>
                            <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                              <div className="h-full rounded" style={{ width: pct + '%', background: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#4a5060' }} />
                            </div>
                            <div className="min-w-[80px] text-right text-xs font-mono">{fmtVal(c.v)} <span className="text-ink-faint">{pct}%</span></div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-right text-sm font-mono font-medium mt-2">Total: {fmtVal(imp.t)}</div>
                  </div>
                )}
                {!imp && <div className="text-xs text-ink-faint">No import data available for this code.</div>}

                {/* Risk assessment */}
                {risk && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Risk assessment</h3>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={clsx('text-sm font-mono font-medium px-2.5 py-1 rounded', RISK_CLS[risk.level].bg, RISK_CLS[risk.level].text)}>
                        {risk.score}/100 — {RISK_CLS[risk.level].label}
                      </div>
                      <div className="text-xs text-ink-muted">HHI: {risk.hhi} ({risk.hhiLevel})</div>
                    </div>
                    {risk.factors.length > 0 && (
                      <div className="space-y-1">
                        {risk.factors.map((f, i) => (
                          <div key={i} className="text-xs text-ink-muted flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-warn shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-ink-muted">
                      <span>{risk.isAllied ? <span className="text-positive">Allied origin</span> : <span className="text-negative">Non-allied</span>}</span>
                      <span>{risk.hasFTA ? <span className="text-positive">FTA available ({risk.ftaSaving}% saving)</span> : 'No FTA advantage'}</span>
                    </div>
                  </div>
                )}

                {/* Rules of Origin */}
                {roo && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Rules of origin</h3>
                    <div className="p-3 bg-surface-1 border border-border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded',
                          roo.difficulty === 'easy' ? 'bg-positive/10 text-positive' :
                          roo.difficulty === 'hard' ? 'bg-negative/10 text-negative' : 'bg-warn/10 text-warn')}>
                          {roo.difficulty === 'easy' ? 'Likely qualifies' : roo.difficulty === 'hard' ? 'Complex rule' : 'Needs verification'}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">{roo.type.toUpperCase()}</span>
                      </div>
                      <div className="text-xs text-ink-muted mt-1">CUSMA: {roo.cusma}</div>
                      <div className="text-xs text-ink-muted">CETA: {roo.ceta}</div>
                      <div className="text-[11px] text-ink-faint mt-2">{roo.note}</div>
                    </div>
                  </div>
                )}

                {/* Gazette alerts for this chapter */}
                {relatedAlerts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Regulatory alerts (Ch {item.c})</h3>
                    {relatedAlerts.map(g => (
                      <div key={g.id} className="px-3 py-2 mb-1.5 bg-surface-1 border-l-2 border-l-negative border border-border rounded-r text-xs">
                        <div className="flex gap-2 items-center mb-0.5">
                          <Badge t={g.sev} s={g.sev} />
                          <span className="text-ink-faint">{g.date}</span>
                        </div>
                        <div className="text-ink">{g.title}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => { setSel(item.h); setTab('compare'); setDetailHS(null); }}
                    className="text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded hover:bg-accent/20 transition-colors">
                    Open in Compare tab
                  </button>
                  <button onClick={() => toggle(item.h)}
                    className="text-xs bg-surface-2 border border-border text-ink-muted px-4 py-2 rounded hover:text-ink transition-colors">
                    {inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-border text-[10px] text-ink-faint flex flex-wrap justify-between gap-2">
        <span>CBSA T2026 · StatsCan CIMT 2025 · {stats.total.toLocaleString()} codes</span>
        <span>UST · MXT · CEUT · CPTPT · UKT · JT · KRT</span>
      </div>
    </div>
  );
}
