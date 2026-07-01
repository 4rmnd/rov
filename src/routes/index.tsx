import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Maximize2, Video, ImageIcon, Power,
  Play, RotateCcw, ToggleLeft, Bell, AlertTriangle, Wifi, Activity, Radio,
} from "lucide-react";
import rovImage from "../assets/rov.png";

import poliwangiLogo from "../assets/Logo Poliwangi HD.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ROV Dashboard — Ocean Explorer" },
      { name: "description", content: "Live ROV telemetry, camera, trajectory & control dashboard for Ocean Explorer KKI 2026." },
    ],
  }),
  component: Dashboard,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Dashboard() {
  const now = useClock();
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour12: false });

  return (
    <div className="h-screen flex overflow-hidden bg-background text-foreground">
      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <header className="h-13 shrink-0 border-b border-panel-border px-6 flex items-center justify-between bg-[color:var(--color-sidebar)]">
          <div className="flex items-center gap-4">
            <img src={poliwangiLogo} alt="Poliwangi Logo" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-lg font-bold tracking-wider">ROV DASHBOARD</h1>
              <div className="text-[10px] text-muted-foreground tracking-wider">POLITEKNIK NEGERI BANYUWANGI</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="hidden lg:flex items-center gap-2">
              <span className="label-caps">Team</span>
              <span className="font-mono font-semibold">Ocean Explorer</span>
            </div>
            <div className="hidden xl:flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-panel border border-panel-border grid place-items-center text-[9px] text-muted-foreground">KKI</div>
              <div className="w-8 h-8 rounded bg-panel border border-panel-border grid place-items-center text-[9px] text-muted-foreground">DS</div>
              <div className="w-8 h-8 rounded bg-panel border border-panel-border grid place-items-center text-[9px] text-muted-foreground">BM</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm">{time}</div>
              <div className="text-[10px] text-muted-foreground">{date}</div>
            </div>
          </div>
        </header>

        {/* Status Bar */}
        <div className="shrink-0 border-b border-panel-border px-6 py-2 bg-[color:var(--color-sidebar)] flex items-center justify-between">
          <div className="flex items-center divide-x divide-panel-border">
            <div className="pr-5"><StatusRow icon={<ToggleLeft size={13} />} label="Mode" value="Autonomous" tone="accent" /></div>
            <div className="px-5"><StatusRow icon={<Wifi size={13} />} label="Connection" value="Connected" tone="success" /></div>
            <div className="px-5"><StatusRow icon={<Activity size={13} />} label="Sensors" value="OK" tone="success" /></div>
            <div className="pl-5"><StatusRow icon={<Radio size={13} />} label="Logging" value="Recording" tone="danger" pulse /></div>
          </div>
          <button className="flex items-center gap-2 bg-[color:var(--color-danger)] text-white font-bold px-4 py-1.5 rounded-md text-xs tracking-wider hover:opacity-90 transition-opacity">
            <Power size={13} /> EMERGENCY STOP
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 min-h-0 p-3 grid gap-3 grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] overflow-hidden">
          {/* Left column */}
          <div className="min-h-0 overflow-hidden flex flex-col gap-3">
            {/* Cameras — fixed height agar tidak collapse */}
            <div className="h-48 grid grid-cols-1 md:grid-cols-2 gap-3">
              <CameraCard title="Camera 1" subtitle="Front Cam" />
              <CameraCard title="Camera 2" subtitle="Bottom Cam" />
            </div>

            {/* Altitude + Trajectory — grows to fill remaining space */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
              <AltitudeCard />
              <TrajectoryCard />
            </div>

            {/* Quick controls */}
            <QuickControls />
          </div>

          {/* Right column */}
          <div className="min-h-0 overflow-hidden flex flex-col gap-3">
            <QRPanel />
            <ROVDesignPanel />
            <InformationPanel />
          </div>
        </main>

        <footer className="shrink-0 border-t border-panel-border px-6 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>© 2026 Ocean Explorer · Politeknik Negeri Banyuwangi</span>
          <span className="font-mono">v1.0.0</span>
        </footer>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, value, tone, pulse }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "danger" | "accent"; pulse?: boolean }) {
  const toneClass = tone === "success" ? "text-[color:var(--color-success)]" : tone === "danger" ? "text-[color:var(--color-danger)]" : "text-accent";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon}<span>{label}</span></span>
      <span className="text-panel-border">·</span>
      <span className={`font-mono font-semibold flex items-center gap-1.5 ${toneClass}`}>
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current" style={{ animation: "pulse-live 1.4s infinite" }} />}
        {value}
      </span>
    </div>
  );
}

function CameraCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground tracking-wider">{subtitle.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[color:var(--color-success)]">
          <span className="w-2 h-2 rounded-full bg-[color:var(--color-success)]" style={{ animation: "pulse-live 1.4s infinite" }} />
          LIVE
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-gradient-to-br from-[oklch(0.14_0.04_240)] to-[oklch(0.22_0.05_220)] grid place-items-center">
        <div className="text-muted-foreground/40 text-xs tracking-widest">CAMERA FEED</div>
        <div className="absolute top-2 left-2 font-mono text-[10px] text-accent/80">REC · 00:12:34</div>
        <div className="absolute bottom-2 right-2 flex gap-1">
          <IconBtn><ImageIcon size={11} /></IconBtn>
          <IconBtn><Video size={11} /></IconBtn>
          <IconBtn><Maximize2 size={11} /></IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return <button className="w-7 h-7 grid place-items-center rounded bg-black/50 hover:bg-accent hover:text-accent-foreground text-white/80 transition-colors">{children}</button>;
}

function AltitudeCard() {
  const value = 0.45;
  const max = 2.0;
  
  // Hitung y-position untuk pointer (skala 10px ke 110px, total tinggi 100px)
  const pointerY = 110 - ((value / max) * 100);

  return (
    <div className="panel p-3 flex flex-col h-full">
      <div className="label-caps mb-1.5 shrink-0">Altitude</div>
      <div className="flex gap-2 flex-1 items-center justify-between">
        <div className="flex-1">
          <div className="font-mono text-4xl font-bold text-accent leading-none">{value.toFixed(2)}<span className="text-lg text-muted-foreground ml-1">m</span></div>
          <div className="label-caps mt-1.5">Height from Pool Floor</div>
        </div>
        {/* Vertical Ruler Gauge */}
        <div className="w-20 self-stretch">
          <svg viewBox="0 0 75 120" className="w-full h-full">
            {/* Vertical Scale Line */}
            <line x1="18" y1="10" x2="18" y2="110" stroke="var(--color-panel-border)" strokeWidth="1.5" />

            {/* Major Ticks & Labels */}
            {/* 2.00 */}
            <line x1="10" y1="10" x2="18" y2="10" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="14" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">2.00</text>

            {/* 1.50 */}
            <line x1="10" y1="35" x2="18" y2="35" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="39" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">1.50</text>

            {/* 1.00 */}
            <line x1="10" y1="60" x2="18" y2="60" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="64" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">1.00</text>

            {/* 0.50 */}
            <line x1="10" y1="85" x2="18" y2="85" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="89" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">0.50</text>

            {/* 0.00 */}
            <line x1="10" y1="110" x2="18" y2="110" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="114" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">0.00</text>

            {/* Minor Ticks */}
            <line x1="13" y1="22.5" x2="18" y2="22.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="47.5" x2="18" y2="47.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="72.5" x2="18" y2="72.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="97.5" x2="18" y2="97.5" stroke="var(--color-panel-border)" strokeWidth="1" />

            {/* Dynamic Pointer (Golden Triangle pointing right) */}
            <polygon 
              points={`1,${pointerY - 4.5} 10,${pointerY} 1,${pointerY + 4.5}`} 
              fill="var(--color-accent)" 
            />
            <line x1="10" y1={pointerY} x2="14" y2={pointerY} stroke="var(--color-accent)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function TrajectoryCard() {
  return (
    <div className="panel p-3 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="label-caps">Trajectory Map</div>
        <div className="text-[10px] font-mono text-muted-foreground">SESSION 01</div>
      </div>
      <div className="relative flex-1 min-h-0 bg-[oklch(0.15_0.03_250)] rounded border border-panel-border overflow-hidden">
        {/* Background Grid - fills 100% space without warping */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="oklch(0.28 0.03 250)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Path Overlay - remains perfectly centered without stretching */}
        <svg viewBox="0 0 400 180" className="relative w-full h-full z-10 p-2">
          <path
            d="M 40 140 Q 100 60, 180 90 T 320 50 L 360 40"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeDasharray="6 4"
            style={{
              strokeDasharray: "600",
              strokeDashoffset: "600",
              animation: "draw-path 3s ease-out forwards",
            }}
          />
          <circle cx="40" cy="140" r="8" fill="var(--color-success)" />
          <text x="40" y="144" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0a0a0a">S</text>
          <circle cx="360" cy="40" r="8" fill="var(--color-danger)" />
          <text x="360" y="44" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff">E</text>
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
        <MiniStat label="Mode" value="AUTO" />
        <MiniStat label="Conn" value="OK" tone="success" />
        <MiniStat label="Sensor" value="OK" tone="success" />
        <MiniStat label="Log" value="REC" tone="danger" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-[color:var(--color-success)]" : tone === "danger" ? "text-[color:var(--color-danger)]" : "text-accent";
  return (
    <div className="bg-panel border border-panel-border rounded px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground tracking-wider">{label.toUpperCase()}</div>
      <div className={`font-mono font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function QuickControls() {
  const items = [
    { icon: ImageIcon, label: "Screenshot" },
    { icon: Play, label: "Replay Cam" },
    { icon: RotateCcw, label: "Replay Path" },
    { icon: ToggleLeft, label: "Toggle Mode" },
    { icon: Bell, label: "Alarm" },
    { icon: AlertTriangle, label: "System Alert" },
  ];
  return (
    <div className="panel p-2 grid grid-cols-3 md:grid-cols-6 gap-2">
      {items.map(({ icon: Icon, label }) => (
        <button key={label} className="flex flex-col items-center gap-1 py-2 rounded-md bg-panel hover:bg-accent hover:text-accent-foreground border border-panel-border transition-colors">
          <Icon size={16} />
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        </button>
      ))}
    </div>
  );
}

function QRPanel() {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="label-caps">QR Detection</div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]">VALID</span>
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
        <div className="aspect-square bg-white p-1.5 rounded">
          <svg viewBox="0 0 21 21" className="w-full h-full">
            {Array.from({ length: 21 }).map((_, y) =>
              Array.from({ length: 21 }).map((_, x) => {
                const filled = (x * 7 + y * 3 + (x % 3) * (y % 2)) % 3 === 0 ||
                  (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                const isCorner = ((x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)) &&
                  !(x > 0 && x < 6 && y > 0 && y < 6 && !(x > 1 && x < 5 && y > 1 && y < 5)) &&
                  !(x > 14 && x < 20 && y > 0 && y < 6 && !(x > 15 && x < 19 && y > 1 && y < 5)) &&
                  !(x > 0 && x < 6 && y > 14 && y < 20 && !(x > 1 && x < 5 && y > 15 && y < 19));
                return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={filled || isCorner ? "#000" : "transparent"} />;
              })
            )}
          </svg>
        </div>
        <div className="space-y-1.5 text-xs">
          <Field label="Code" value="A23C-045" />
          <Field label="Timestamp" value="12:34:56" />
          <Field label="Session" value="#01" />
        </div>
      </div>
    </div>
  );
}

function ROVDesignPanel() {
  return (
    <div className="panel p-3 flex-1 flex flex-col min-h-0">
      <div className="label-caps mb-2 shrink-0">ROV Design</div>
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">

        {/* Left: ROV Image */}
        <div className="flex flex-col gap-1 min-h-0">
          <div className="text-[8px] tracking-widest text-muted-foreground font-semibold uppercase">2D/3D ROV Image</div>
          <div className="flex-1 min-h-0 bg-[oklch(0.10_0.02_245)] rounded border border-panel-border overflow-hidden grid place-items-center">
            <img
              src={rovImage}
              alt="ROV 3D Model"
              className="w-full h-full object-contain p-2"
            />
          </div>
        </div>

        {/* Right: Axis Indicator */}
        <div className="flex flex-col gap-1 min-h-0">
          <div className="text-[8px] tracking-widest text-muted-foreground font-semibold uppercase">Axis Indicator</div>
          <div className="flex-1 min-h-0 bg-[oklch(0.10_0.02_245)] rounded border border-panel-border overflow-hidden grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full p-2">
              {/* Origin Point */}
              <circle cx="25" cy="75" r="2.5" fill="white" />

              {/* X Axis — Red, Right */}
              <g stroke="var(--color-danger)" fill="var(--color-danger)">
                <line x1="25" y1="75" x2="72" y2="75" strokeWidth="2" strokeLinecap="round" />
                <polygon points="72,71.5 82,75 72,78.5" />
                <text x="85" y="78" fontSize="9" stroke="none" fontFamily="monospace" fontWeight="bold">X</text>
              </g>

              {/* Z Axis — Blue, Up */}
              <g stroke="#38bdf8" fill="#38bdf8">
                <line x1="25" y1="75" x2="25" y2="28" strokeWidth="2" strokeLinecap="round" />
                <polygon points="21.5,28 25,18 28.5,28" />
                <text x="21" y="12" stroke="none" fontFamily="monospace" fontWeight="bold" fontSize="9">Z</text>
              </g>

              {/* Y Axis — Green, Diagonal */}
              <g stroke="var(--color-success)" fill="var(--color-success)">
                <line x1="25" y1="75" x2="60" y2="47" strokeWidth="2" strokeLinecap="round" />
                <polygon points="56.5,44.5 67,41.5 62,51.5" />
                <text x="69" y="37" stroke="none" fontFamily="monospace" fontWeight="bold" fontSize="9">Y</text>
              </g>
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
}

function InformationPanel() {
  return (
    <div className="panel p-3">
      <div className="label-caps mb-2">Information</div>
      <div className="space-y-1.5 text-xs">
        <Field label="Depth" value="1.25 m" mono accent />
        <Field label="Timer" value="00:12:34" mono accent />
        <Field label="Team" value="Ocean Explorer" />
        <Field label="Pilot" value="Andi Wijaya" />
        <Field label="Location" value="Test Pool – Session 1" />
      </div>
    </div>
  );
}

function Field({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/50 pb-1.5 last:border-0">
      <span className="label-caps">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${accent ? "text-accent font-bold" : "text-foreground"} text-xs`}>{value}</span>
    </div>
  );
}
