import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass, Info, RefreshCw } from "lucide-react";

import { useROVSocket } from "../hooks/useROVSocket";

export const Route = createFileRoute("/navigation")({
  head: () => ({
    meta: [
      { title: "ROV Navigation Center — Ocean Explorer" },
      { name: "description", content: "Radar trajectory track plotting and aviation-grade depth tape HUD." },
    ],
  }),
  component: NavigationPath,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NavigationPath() {
  const now = useClock();
  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour12: false });

  const socket = useROVSocket();

  const depthVal = socket.telemetry?.depth ?? 0;
  const poolDepth = 2.0; // standard pool depth in meters
  const altitudeVal = Math.max(0, poolDepth - depthVal);

  const points = socket.trajectory?.path ?? [];
  const currentX = socket.trajectory?.current_pos?.x ?? 0;
  const currentY = socket.trajectory?.current_pos?.y ?? 0;
  const currentZ = socket.trajectory?.current_pos?.depth ?? 0;

  const handleReset = async () => {
    try {
      const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";
      await fetch(`${ROV_URL}/api/trajectory/reset`, { method: "POST" });
    } catch (e) {
      console.error("Gagal reset trajectory:", e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 flex items-center justify-between bg-[color:var(--color-sidebar)] gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="label-caps">Team</span>
          <span className="font-mono font-semibold">Ocean Explorer</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="label-caps">University</span>
          <span className="text-foreground">Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs leading-none">{timeStr}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{dayName}, {dateStr}</div>
        </div>
      </header>

      {/* Responsive Navigation Layout */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Left Card: High-precision Depth Tape */}
        <div className="panel flex flex-col w-full lg:w-[270px] shrink-0 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0 flex items-center justify-between">
            <span className="label-caps">High-Precision Altitude</span>
            <span className="text-[9px] font-mono text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">SONAR HUD</span>
          </div>

          <div className="flex-1 flex flex-col justify-between py-2 min-h-0 gap-2">
            {/* Value Display */}
            <div className="bg-gradient-to-r from-panel/60 to-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 shadow-inner">
              <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-wide mb-1 flex items-center justify-between">
                <span>Altitude from Floor</span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <div className="font-mono text-3xl font-extrabold text-[color:var(--color-data)] leading-none drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                {altitudeVal.toFixed(2)}
                <span className="text-sm text-muted-foreground font-normal ml-1">m</span>
              </div>
            </div>

            {/* Depth visual indicator / tape */}
            <div className="flex-1 flex justify-center py-2 min-h-[220px]">
              <div className="w-48 bg-gradient-to-b from-[oklch(0.12_0.03_250)] via-[oklch(0.15_0.035_250)] to-[oklch(0.10_0.025_250)] border border-cyan-500/40 rounded-xl p-3 relative flex flex-col justify-between items-center shadow-[inset_0_0_25px_rgba(6,182,212,0.12)] overflow-hidden">
                
                {/* Top Surface HUD Badge */}
                <div className="text-[9px] font-mono text-cyan-400 font-bold z-20 tracking-wider bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                  SURFACE (0.0m)
                </div>

                {/* Vertical Ruler Track */}
                <div className="relative w-full flex-1 my-2.5 min-h-[160px] flex items-center justify-between px-1">
                  
                  {/* Ruler Ticks & Labels (Crisp Native Typography - Never Squished!) */}
                  <div className="absolute inset-y-0 left-2 right-2 flex flex-col justify-between pointer-events-none">
                    {[2.0, 1.5, 1.0, 0.5, 0.0].map((t) => (
                      <div key={t} className="flex items-center gap-2">
                        <div className="w-3.5 h-0.5 bg-cyan-400/50 rounded-full" />
                        <span className="font-mono text-xs font-bold text-slate-200 drop-shadow">
                          {t.toFixed(1)}m
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Center Reference Line */}
                  <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-cyan-400/30 border-b border-cyan-400/40 pointer-events-none" />

                  {/* Live Pointer Marker (Positioned dynamically via CSS percentage) */}
                  {(() => {
                    const topPct = Math.max(6, Math.min(94, (1 - altitudeVal / poolDepth) * 100));
                    return (
                      <div
                        className="absolute left-1 flex items-center gap-1.5 z-30 transition-all duration-150 ease-out"
                        style={{ top: `${topPct}%`, transform: "translateY(-50%)" }}
                      >
                        {/* Triangle Arrow */}
                        <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                        {/* Live Altitude Pill Badge */}
                        <div className="bg-cyan-400 text-slate-950 px-2.5 py-1 rounded-md font-mono font-black text-xs shadow-lg flex items-center gap-1 tracking-tight">
                          <span>{altitudeVal.toFixed(2)}m</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom Floor HUD Badge */}
                <div className="text-[9px] font-mono text-emerald-400 font-bold z-20 tracking-wider bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  FLOOR (2.0m)
                </div>
              </div>
            </div>

            {/* Readouts */}
            <div className="space-y-1.5 text-xs border-t border-panel-border/30 pt-2">
              <div className="flex justify-between items-center bg-panel/50 px-2 py-1 rounded border border-panel-border/40">
                <span className="label-caps">Surface Distance</span>
                <span className="text-cyan-300 font-bold font-mono">{depthVal.toFixed(2)}m</span>
              </div>
              <div className="flex justify-between items-center bg-panel/50 px-2 py-1 rounded border border-panel-border/40">
                <span className="label-caps">Floor Baseline</span>
                <span className="text-foreground font-bold font-mono">{poolDepth.toFixed(1)}m</span>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0 flex items-center justify-center gap-1.5 text-[10px] text-cyan-400">
            <Info size={11} />
            <span className="font-semibold font-mono">Acoustic Sonar Active</span>
          </div>
        </div>

        {/* Right Card: Trajectory Map */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="flex items-center justify-between border-b border-panel-border/60 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Compass className="text-cyan-400 animate-spin-slow" size={16} />
              <span className="label-caps font-bold">Tactical Path Plotter</span>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[11px] font-mono border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-2.5 py-1 rounded-lg hover:bg-cyan-500/20 transition-all cursor-pointer"
            >
              <RefreshCw size={11} />
              <span>RESET ORIGIN</span>
            </button>
          </div>

          {/* Tactical Path Plotter Canvas */}
          <div className="flex-1 min-h-0 my-2.5 bg-gradient-to-b from-[oklch(0.12_0.03_250)] via-[oklch(0.14_0.032_250)] to-[oklch(0.10_0.025_250)] rounded-xl border border-cyan-500/30 relative overflow-hidden shadow-[inset_0_0_30px_rgba(6,182,212,0.08)]">
            
            {/* Tactical Grid Background */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id="nav-grid" width="40" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 25" fill="none" stroke="rgba(6, 182, 212, 0.12)" strokeWidth="0.5" />
                </pattern>
                <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#nav-grid)" />
            </svg>

            {/* Tactical Overlay Info Badge (Top-Right) */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-cyan-500/30 rounded-lg px-2.5 py-1.5 font-mono text-[9.5px]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-cyan-300 font-bold">TACTICAL RADAR</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-slate-300">ORIGIN (0.0, 0.0)</span>
            </div>

            {/* Main SVG Tactical Plotter */}
            <svg viewBox="0 0 400 240" className="absolute inset-0 w-full h-full p-2 z-10" preserveAspectRatio="xMidYMid meet">
              {(() => {
                const scale = 32; // scaled 1m = 32px
                const originX = 200;
                const originY = 120;

                // Radar Concentric Range Rings (1m, 2m, 3m)
                const rings = [32, 64, 96];

                const pathPoints = points.map((p: any) => ({
                  x: originX + p.x * scale,
                  y: originY - p.y * scale,
                }));

                let pathD = "";
                if (pathPoints.length > 0) {
                  pathD = pathPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                }

                const startPt = pathPoints[0];
                const endPt = pathPoints.length > 0 ? pathPoints[pathPoints.length - 1] : { x: originX, y: originY };

                return (
                  <>
                    {/* Concentric Radar Rings */}
                    {rings.map((r, idx) => (
                      <g key={r}>
                        <circle
                          cx={originX}
                          cy={originY}
                          r={r}
                          fill="none"
                          stroke="rgba(6, 182, 212, 0.18)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={originX + r + 3}
                          y={originY - 3}
                          fill="rgba(6, 182, 212, 0.5)"
                          fontSize="7"
                          fontFamily="monospace"
                        >
                          {(idx + 1)}m
                        </text>
                      </g>
                    ))}

                    {/* Crosshair Center Lines */}
                    <line x1={originX} y1="10" x2={originX} y2="230" stroke="rgba(6, 182, 212, 0.25)" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="20" y1={originY} x2="380" y2={originY} stroke="rgba(6, 182, 212, 0.25)" strokeWidth="1" strokeDasharray="2 2" />

                    {/* Cardinal Markers */}
                    <text x={originX} y="20" fill="rgba(6, 182, 212, 0.8)" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">N (+Y)</text>
                    <text x={originX} y="232" fill="rgba(6, 182, 212, 0.8)" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">S (-Y)</text>
                    <text x="370" y={originY + 3} fill="rgba(6, 182, 212, 0.8)" fontSize="9" fontWeight="bold" textAnchor="start" fontFamily="monospace">E (+X)</text>
                    <text x="10" y={originY + 3} fill="rgba(6, 182, 212, 0.8)" fontSize="9" fontWeight="bold" textAnchor="start" fontFamily="monospace">W (-X)</text>

                    {/* Center Origin Reticle */}
                    <circle cx={originX} cy={originY} r="4" fill="#06b6d4" opacity="0.8" />
                    <circle cx={originX} cy={originY} r="8" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />

                    {/* Trajectory Path Line */}
                    {pathD && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="url(#path-gradient)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                      />
                    )}

                    {/* Waypoint Dots */}
                    {pathPoints.slice(1, -1).map((pt, idx) => (
                      <circle key={idx} cx={pt.x} cy={pt.y} r="2.5" fill="#38bdf8" opacity="0.7" />
                    ))}

                    {/* Start 'S' Marker */}
                    {startPt && (
                      <g>
                        <circle cx={startPt.x} cy={startPt.y} r="10" fill="#020617" stroke="#06b6d4" strokeWidth="2.5" className="shadow-lg" />
                        <text
                          x={startPt.x}
                          y={startPt.y + 3.5}
                          fill="#06b6d4"
                          fontSize="9.5"
                          fontWeight="900"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          S
                        </text>
                      </g>
                    )}

                    {/* Current ROV Position Marker (E / Active Icon) */}
                    <g>
                      <circle cx={endPt.x} cy={endPt.y} r="14" fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="2" className="animate-ping" />
                      <circle cx={endPt.x} cy={endPt.y} r="11" fill="#020617" stroke="#10b981" strokeWidth="2.5" />
                      <text
                        x={endPt.x}
                        y={endPt.y + 3.5}
                        fill="#10b981"
                        fontSize="10"
                        fontWeight="900"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        ROV
                      </text>
                    </g>
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Coordinate Readout Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs shrink-0">
            <div className="bg-panel border border-panel-border rounded-md px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground tracking-wide">X POS</div>
              <div className="text-[color:var(--color-data)] font-bold font-mono">{currentX.toFixed(3)} m</div>
            </div>
            <div className="bg-panel border border-panel-border rounded-md px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground tracking-wide">Y POS</div>
              <div className="text-[color:var(--color-data)] font-bold font-mono">{currentY.toFixed(3)} m</div>
            </div>
            <div className="bg-panel border border-panel-border rounded-md px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground tracking-wide">Z DEPTH</div>
              <div className="text-[color:var(--color-data)] font-bold font-mono">{currentZ.toFixed(3)} m</div>
            </div>
            <div className="bg-panel border border-panel-border rounded-md px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground tracking-wide">LOGGED NODES</div>
              <div className="text-[color:var(--color-data)] font-bold font-mono">{points.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-10 shrink-0 border-t border-panel-border px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="label-caps">Mode</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-3.5 w-px bg-panel-border/60" />
          <div className="flex items-center gap-1.5">
            <span className="label-caps">Navigation Source</span>
            <span className="font-mono font-bold text-[color:var(--color-success)]">Dual IMU + MAVLink</span>
          </div>
        </div>

        <div className="font-mono text-[11px] text-muted-foreground">
          Sonar State: ONLINE
        </div>
      </footer>
    </div>
  );
}
