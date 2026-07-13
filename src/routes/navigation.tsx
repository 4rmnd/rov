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
        <div className="panel flex flex-col w-full lg:w-[260px] shrink-0 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">High-Precision Altitude</span>
          </div>

          <div className="flex-1 flex flex-col justify-around py-2.5 min-h-0 gap-2.5">
            {/* Value Display */}
            <div className="bg-panel/40 border border-panel-border/50 rounded-lg p-2.5">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mb-1">
                Altitude from Floor
              </div>
              <div className="font-mono text-3xl font-extrabold text-[color:var(--color-data)] leading-none">
                {altitudeVal.toFixed(2)}
                <span className="text-sm text-muted-foreground font-normal ml-1">m</span>
              </div>
            </div>

            {/* Depth visual indicator / tape */}
            <div className="flex-1 flex justify-center py-1 min-h-[130px]">
              <div className="w-16 bg-[oklch(0.14_0.028_250)] border border-panel-border rounded-md px-1 py-2 relative flex justify-center overflow-hidden">
                {/* Horizontal scale marker line at vertical center */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-[color:var(--color-data)]/60 z-20 pointer-events-none" />

                <svg viewBox="0 0 70 120" className="h-full w-full z-10" preserveAspectRatio="none">
                  {/* ruler scale ticks */}
                  {[0.0, 0.5, 1.0, 1.5, 2.0].map((t) => {
                    const y = 110 - (t / poolDepth) * 100;
                    return (
                      <g key={t}>
                        <line x1="8" y1={y} x2="16" y2={y} stroke="var(--color-panel-border)" strokeWidth="1.5" />
                        <text
                          x="22"
                          y={y + 3}
                          fill="var(--color-muted-foreground)"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {t.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* pointer marker based on altitude value */}
                  {(() => {
                    const pointerY = 110 - (altitudeVal / poolDepth) * 100;
                    return (
                      <polygon
                        points={`0,${pointerY - 4.5} 8,${pointerY} 0,${pointerY + 4.5}`}
                        fill="var(--color-data)"
                      />
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Readouts */}
            <div className="space-y-1.5 text-xs border-t border-panel-border/30 pt-2.5">
              <div className="flex justify-between items-center">
                <span className="label-caps">Surface Distance</span>
                <span className="text-foreground font-bold font-mono">{depthVal.toFixed(2)}m</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="label-caps">Floor Baseline</span>
                <span className="text-foreground font-bold font-mono">{poolDepth.toFixed(1)}m</span>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <Info size={11} />
            <span className="font-semibold">Acoustic Sonar Active</span>
          </div>
        </div>

        {/* Right Card: Trajectory Map */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="flex items-center justify-between border-b border-panel-border/60 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Compass className="text-accent" size={15} />
              <span className="label-caps">Tactical Path Plotter</span>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[11px] font-mono border border-panel-border px-2.5 py-1 rounded-md hover:bg-accent hover:text-[color:var(--color-accent-foreground)] transition-colors cursor-pointer"
            >
              <RefreshCw size={11} />
              <span>RESET ORIGIN</span>
            </button>
          </div>

          {/* Large scale grid SVG */}
          <div className="flex-1 min-h-0 my-2.5 bg-[oklch(0.15_0.03_250)] rounded-lg border border-panel-border relative overflow-hidden">
            {/* Background Grid */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id="nav-grid" width="40" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 20" fill="none" stroke="oklch(0.28 0.03 250)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#nav-grid)" />
            </svg>

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
                        stroke="var(--color-data)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Start 'S' marker */}
                    {startPt && (
                      <g>
                        <circle cx={startPt.x} cy={startPt.y} r="9" fill="var(--color-panel)" stroke="var(--color-data)" strokeWidth="2" />
                        <text
                          x={startPt.x}
                          y={startPt.y + 3.5}
                          fill="var(--color-data)"
                          fontSize="10"
                          fontWeight="bold"
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
                        <circle cx={endPt.x} cy={endPt.y} r="11" fill="var(--color-panel)" stroke="var(--color-success)" strokeWidth="2.5" className="animate-pulse" />
                        <text
                          x={endPt.x}
                          y={endPt.y + 3.5}
                          fill="var(--color-success)"
                          fontSize="10"
                          fontWeight="bold"
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
