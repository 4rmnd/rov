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
      {/* Top Information Bar */}
      <header className="h-13 shrink-0 border-b border-panel-border px-6 flex items-center justify-between bg-[color:var(--color-sidebar)] text-xs font-semibold tracking-wider uppercase backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-2 text-accent">
          <span className="text-muted-foreground font-medium">Team:</span>
          <span>Ocean Explorer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">University:</span>
          <span className="text-foreground">Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="flex items-center gap-2 text-right font-mono">
          <span className="text-muted-foreground font-medium">{dayName},</span>
          <span className="text-accent">{dateStr}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-foreground font-bold">{timeStr}</span>
        </div>
      </header>

      {/* Spacious Responsive Navigation Layout */}
      <div className="flex-1 min-h-0 p-4 flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
        
        {/* Left Card: High-precision Depth Tape */}
        <div className="panel flex flex-col w-full lg:w-[300px] shrink-0 min-h-[420px] lg:h-full p-5 bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg shadow-xl justify-between">
          <div className="border-b border-panel-border/60 pb-3 shrink-0">
            <span className="label-caps">High-Precision Altitude</span>
          </div>

          <div className="flex-1 flex flex-col justify-around py-4 min-h-0 gap-4">
            {/* Value Display */}
            <div className="bg-panel/40 border border-panel-border/50 rounded-lg p-3.5 relative overflow-hidden">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
                Altitude from Floor
              </div>
              <div className="font-mono text-5xl font-extrabold text-accent leading-none drop-shadow-[0_0_8px_rgba(251,191,36,0.2)]">
                {altitudeVal.toFixed(2)}
                <span className="text-lg text-muted-foreground font-normal ml-1">m</span>
              </div>
              <div className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </div>
            </div>

            {/* Depth visual indicator / tape */}
            <div className="flex-1 flex justify-center py-2 min-h-[160px]">
              <div className="w-20 bg-[oklch(0.12_0.02_245)] border border-panel-border rounded-md px-1 py-2 relative flex justify-center overflow-hidden">
                <div className="absolute inset-x-0 h-4 bg-gradient-to-b from-black/80 to-transparent top-0 z-10" />
                <div className="absolute inset-x-0 h-4 bg-gradient-to-t from-black/80 to-transparent bottom-0 z-10" />
                
                {/* Horizontal scale marker line at vertical center */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-accent/60 z-20 pointer-events-none" />

                <svg viewBox="0 0 70 120" className="h-full w-full z-10" preserveAspectRatio="none">
                  {/* ruler scale ticks */}
                  {[0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((t) => {
                    const y = 110 - (t / poolDepth) * 100;
                    return (
                      <g key={t} className="transition-all duration-100">
                        <line x1="8" y1={y} x2="16" y2={y} stroke="var(--color-panel-border)" strokeWidth="1.5" />
                        <text
                          x="22"
                          y={y + 3}
                          fill="var(--color-muted-foreground)"
                          fontSize="9.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {t.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  {/* pointer marker based on altitude value */}
                  {(() => {
                    const pointerY = 110 - (altitudeVal / poolDepth) * 100;
                    return (
                      <g className="transition-all duration-100">
                        {/* Glow rectangle */}
                        <rect x="0" y={pointerY - 4.5} width="6" height="9" fill="var(--color-accent)" opacity="0.3" className="blur-[1px]" />
                        <polygon
                          points={`0,${pointerY - 4.5} 8,${pointerY} 0,${pointerY + 4.5}`}
                          fill="var(--color-accent)"
                        />
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Readouts */}
            <div className="space-y-2 font-mono text-[11px] border-t border-panel-border/30 pt-3">
              <div className="flex justify-between items-center bg-panel/20 p-1.5 rounded border border-panel-border/30">
                <span className="text-muted-foreground uppercase text-[9px] tracking-wide">Surface Distance</span>
                <span className="text-foreground font-bold">{depthVal.toFixed(2)}m</span>
              </div>
              <div className="flex justify-between items-center bg-panel/20 p-1.5 rounded border border-panel-border/30">
                <span className="text-muted-foreground uppercase text-[9px] tracking-wide">Floor Baseline</span>
                <span className="text-foreground font-bold">{poolDepth.toFixed(1)}m</span>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-3 shrink-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60">
            <Info size={11} />
            <span className="uppercase font-bold tracking-wider">Acoustic Sonar Active</span>
          </div>
        </div>

        {/* Right Card: Massive Radar Trajectory Map */}
        <div className="panel flex flex-col flex-1 min-h-[460px] lg:h-full p-5 bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg shadow-xl justify-between">
          <div className="flex items-center justify-between border-b border-panel-border/60 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Compass className="text-accent animate-pulse" size={16} />
              <span className="label-caps">Tactical Path Plotter</span>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[9px] font-mono border border-panel-border/80 hover:border-accent px-3 py-1 rounded bg-panel/30 hover:bg-accent hover:text-black hover:cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw size={10} />
              <span>RESET ORIGIN</span>
            </button>
          </div>

          {/* Large scale grid SVG */}
          <div className="flex-1 min-h-0 my-4 bg-[oklch(0.12_0.02_245)] rounded-lg border border-panel-border/80 relative overflow-hidden group shadow-inner">
            {/* radar design grid overlays */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-panel-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-panel-border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-35" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-panel-border/60" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-panel-border/60" />
            
            {/* Sonar circles */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-panel-border/30 rounded-full pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-panel-border/20 rounded-full pointer-events-none" />

            <svg viewBox="0 0 400 240" className="absolute inset-0 w-full h-full p-4 z-10" preserveAspectRatio="xMidYMid meet">
              {(() => {
                const scale = 32; // scaled 1m = 32px
                const originX = 200;
                const originY = 120;

                const pathPoints = points.map((p: any) => ({
                  x: originX + p.x * scale,
                  y: originY - p.y * scale,
                }));

                let pathD = "";
                if (pathPoints.length > 0) {
                  pathD = pathPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                }

                const startPt = pathPoints[0];
                const endPt = pathPoints[pathPoints.length - 1];

                return (
                  <>
                    {/* Origin Marker */}
                    <circle cx={originX} cy={originY} r="5" fill="#fff" opacity="0.3" stroke="var(--color-panel-border)" strokeWidth="1" />

                    {/* Path line */}
                    {pathD && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                      />
                    )}

                    {/* Start 'S' marker */}
                    {startPt && (
                      <g>
                        <circle cx={startPt.x} cy={startPt.y} r="10" fill="var(--color-panel)" stroke="var(--color-accent)" strokeWidth="2" />
                        <text
                          x={startPt.x}
                          y={startPt.y + 3.5}
                          fill="var(--color-accent)"
                          fontSize="10"
                          fontWeight="extrabold"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          S
                        </text>
                      </g>
                    )}

                    {/* End 'E' / Current Position marker */}
                    {endPt && (
                      <g>
                        <circle cx={endPt.x} cy={endPt.y} r="12" fill="var(--color-panel)" stroke="var(--color-success)" strokeWidth="2.5" className="animate-pulse" />
                        <text
                          x={endPt.x}
                          y={endPt.y + 3.5}
                          fill="var(--color-success)"
                          fontSize="10"
                          fontWeight="extrabold"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          E
                        </text>
                      </g>
                    )}
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Coordinate Readout Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] shrink-0 font-mono">
            <div className="bg-panel/40 border border-panel-border/60 hover:border-accent/40 rounded p-2.5 transition-colors">
              <div className="text-muted-foreground uppercase text-[8px] tracking-wider mb-0.5 font-bold">X Coordinates</div>
              <div className="text-accent font-extrabold text-sm">{currentX.toFixed(3)} m</div>
            </div>
            <div className="bg-panel/40 border border-panel-border/60 hover:border-accent/40 rounded p-2.5 transition-colors">
              <div className="text-muted-foreground uppercase text-[8px] tracking-wider mb-0.5 font-bold">Y Coordinates</div>
              <div className="text-accent font-extrabold text-sm">{currentY.toFixed(3)} m</div>
            </div>
            <div className="bg-panel/40 border border-panel-border/60 hover:border-accent/40 rounded p-2.5 transition-colors">
              <div className="text-muted-foreground uppercase text-[8px] tracking-wider mb-0.5 font-bold">Z Depth</div>
              <div className="text-accent font-extrabold text-sm">{currentZ.toFixed(3)} m</div>
            </div>
            <div className="bg-panel/40 border border-panel-border/60 hover:border-accent/40 rounded p-2.5 transition-colors">
              <div className="text-muted-foreground uppercase text-[8px] tracking-wider mb-0.5 font-bold">Logged Nodes</div>
              <div className="text-accent font-extrabold text-sm">{points.length} nodes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-11 shrink-0 border-t border-panel-border px-6 py-2 bg-[color:var(--color-sidebar)] flex items-center justify-between text-[11px] backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-semibold uppercase">Mode:</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-4 w-px bg-panel-border/60" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-semibold uppercase">Navigation Source:</span>
            <span className="font-mono font-bold text-[color:var(--color-success)] uppercase">Dual IMU + MAVLink</span>
          </div>
        </div>

        <div className="font-mono text-[10px] text-muted-foreground">
          Sonar State: ONLINE
        </div>
      </footer>
    </div>
  );
}
