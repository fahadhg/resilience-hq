'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const CANADA_LAT = 56;
const CANADA_LNG = -96;

// NGen orange for exports, cyan for imports
const EXPORT_COLOR = '#F15A22';
const IMPORT_COLOR = '#3bbcd4';

const fmtUSD = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

type Partner = {
  partnerId: string;
  name: string;
  iso3: string;
  lat: number;
  lng: number;
  exportValue: number;
  importValue: number;
  totalTrade: number;
};

type Mode = 'both' | 'exports' | 'imports';

export default function TradeGlobe() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('both');
  const [hovered, setHovered] = useState<any>(null);
  const globeRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/atlas/trade-partners?year=2023');
      const json = await res.json();
      if (json.status === 'ok') setPartners(json.partners);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Point globe at Canada on mount
  useEffect(() => {
    if (globeRef.current && partners.length) {
      globeRef.current.pointOfView({ lat: CANADA_LAT, lng: CANADA_LNG, altitude: 2 }, 1000);
    }
  }, [partners]);

  const maxTrade = partners.reduce((m, p) => Math.max(m, p.totalTrade), 1);

  // Build arcs
  const arcs = partners.flatMap(p => {
    const result = [];
    if (mode !== 'imports' && p.exportValue > 0) {
      result.push({
        startLat: CANADA_LAT, startLng: CANADA_LNG,
        endLat: p.lat, endLng: p.lng,
        color: EXPORT_COLOR,
        value: p.exportValue,
        name: p.name,
        label: `Exports to ${p.name}: ${fmtUSD(p.exportValue)}`,
        stroke: Math.max(0.3, (p.exportValue / maxTrade) * 4),
        opacity: Math.max(0.2, (p.exportValue / maxTrade) * 0.8 + 0.2),
      });
    }
    if (mode !== 'exports' && p.importValue > 0) {
      result.push({
        startLat: p.lat, startLng: p.lng,
        endLat: CANADA_LAT, endLng: CANADA_LNG,
        color: IMPORT_COLOR,
        value: p.importValue,
        name: p.name,
        label: `Imports from ${p.name}: ${fmtUSD(p.importValue)}`,
        stroke: Math.max(0.3, (p.importValue / maxTrade) * 4),
        opacity: Math.max(0.2, (p.importValue / maxTrade) * 0.8 + 0.2),
      });
    }
    return result;
  });

  // Points — partner countries
  const points = partners.map(p => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    size: Math.max(0.3, (p.totalTrade / maxTrade) * 1.2),
    color: p.exportValue > p.importValue ? EXPORT_COLOR : IMPORT_COLOR,
    exportValue: p.exportValue,
    importValue: p.importValue,
    totalTrade: p.totalTrade,
  }));

  // Canada marker
  const canadaPoint = [{
    lat: CANADA_LAT, lng: CANADA_LNG,
    name: 'Canada', size: 1.5, color: '#ffffff',
    exportValue: partners.reduce((s, p) => s + p.exportValue, 0),
    importValue: partners.reduce((s, p) => s + p.importValue, 0),
    totalTrade: 0,
  }];

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold">Canada Trade Globe</h2>
          <p className="text-xs text-ink-faint mt-0.5">Bilateral trade flows · 2023 · Harvard Atlas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-ink-faint mr-2">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full bg-[#F15A22] inline-block" />
              Exports
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full bg-[#3bbcd4] inline-block" />
              Imports
            </span>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-lg border border-border">
            {(['both', 'exports', 'imports'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors capitalize ${
                  mode === m ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Globe */}
      <div className="relative bg-[#060a10]" style={{ height: 480 }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <div className="text-xs text-ink-faint">Loading trade data…</div>
          </div>
        ) : (
          <Globe
            ref={globeRef}
            width={undefined as any}
            height={480}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            // Arcs
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={(d: any) => d.color}
            arcStroke={(d: any) => d.stroke}
            arcDashLength={0.4}
            arcDashGap={0.2}
            arcDashAnimateTime={2000}
            arcAltitudeAutoScale={0.35}
            // Partner points
            pointsData={[...canadaPoint, ...points]}
            pointLat="lat"
            pointLng="lng"
            pointColor="color"
            pointRadius="size"
            pointAltitude={0.005}
            pointLabel={(d: any) =>
              d.name === 'Canada'
                ? `<div style="background:#111;border:1px solid #333;border-radius:8px;padding:8px 12px;font-size:11px;color:#fff">
                    <b>Canada</b><br/>
                    <span style="color:#F15A22">Exports: ${fmtUSD(d.exportValue)}</span><br/>
                    <span style="color:#3bbcd4">Imports: ${fmtUSD(d.importValue)}</span>
                  </div>`
                : `<div style="background:#111;border:1px solid #333;border-radius:8px;padding:8px 12px;font-size:11px;color:#fff">
                    <b>${d.name}</b><br/>
                    <span style="color:#F15A22">CA → ${fmtUSD(d.exportValue)}</span><br/>
                    <span style="color:#3bbcd4">CA ← ${fmtUSD(d.importValue)}</span>
                  </div>`
            }
            onPointHover={setHovered}
            atmosphereColor="#1a2744"
            atmosphereAltitude={0.15}
          />
        )}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[10px] text-ink-faint">
        <span>Drag to rotate · scroll to zoom · hover points for details</span>
        <span>{partners.length} trading partners</span>
      </div>
    </div>
  );
}
