import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Camera, QrCode, Ruler, Box, Route as RouteIcon,
  FileText, Settings, Power, Maximize2, Video, ImageIcon, Circle,
  Play, RotateCcw, ToggleLeft, Bell, AlertTriangle, Wifi, Activity, Radio,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ROV Dashboard — Ocean Explorer" },
      { name: "description", content: "Live ROV telemetry, camera, trajectory & control dashboard for Ocean Explorer KKI 2026." },
    ],
  }),
  component: Dashboard,
});

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Camera, label: "Camera" },
  { icon: QrCode, label: "QR Scan" },
  { icon: Ruler, label: "Measurement" },
  { icon: Box, label: "ROV Design" },
  { icon: RouteIcon, label: "Trajectory" },
  { icon: FileText, label: "Logging" },
  { icon: Settings, label: "Settings" },
];

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
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-[color:var(--color-sidebar)] border-r border-panel-border flex flex-col hidden md:flex">
        <div className="px-5 py-5 border-b border-panel-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-accent grid place-items-center text-accent-foreground font-bold">OE</div>
          <div>
            <div className="text-sm font-bold leading-tight">OCEAN EXPLORER</div>
            <div className="text-[10px] text-muted-foreground tracking-wider">POLIWANGI · KKI 2026</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              disabled={!active}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-panel cursor-not-allowed opacity-60"
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-panel-border space-y-2">
          <StatusRow icon={<ToggleLeft size={14} />} label="Mode" value="Autonomous" tone="accent" />
          <StatusRow icon={<Wifi size={14} />} label="Connection" value="Connected" tone="success" />
          <StatusRow icon={<Activity size={14} />} label="Sensors" value="OK" tone="success" />
          <StatusRow icon={<Radio size={14} />} label="Logging" value="Recording" tone="danger" pulse />
          <button className="w-full mt-2 flex items-center justify-center gap-2 bg-[color:var(--color-danger)] text-white font-bold py-2.5 rounded-md text-sm tracking-wider hover:opacity-90 transition-opacity">
            <Power size={16} /> EMERGENCY STOP
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-panel-border px-6 flex items-center justify-between bg-[color:var(--color-sidebar)]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-panel border border-panel-border grid place-items-center text-[10px] text-muted-foreground">LOGO</div>
            <div>
              <h1 className="text-lg font-bold tracking-wider">ROV DASHBOARD</h1>
              <div className="text-[10px] text-muted-foreground tracking-wider">POLITEKNIK NEGERI BANYUWANGI</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="label-caps">Team</span>
              <span className="font-mono font-semibold">Ocean Explorer</span>
            </div>
            <div className="flex items-center gap-3">
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

        {/* Content */}
        <main className="flex-1 p-4 grid gap-4 grid-cols-1 xl:grid-cols-[1fr_320px] overflow-auto">
          {/* Left column */}
          <div className="space-y-4 min-w-0">
            {/* Cameras */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CameraCard title="Camera 1" subtitle="Front Cam" />
              <CameraCard title="Camera 2" subtitle="Bottom Cam" />
            </div>

            {/* Altitude + Trajectory */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
              <AltitudeCard />
              <TrajectoryCard />
            </div>

            {/* Quick controls */}
            <QuickControls />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <QRPanel />
            <ROVDesignPanel />
            <InformationPanel />
          </div>
        </main>

        <footer className="border-t border-panel-border px-6 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
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
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className={`font-mono font-semibold flex items-center gap-1.5 ${toneClass}`}>
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current" style={{ animation: "pulse-live 1.4s infinite" }} />}
        {value}
      </span>
    </div>
  );
}

function CameraCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-panel-border">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground tracking-wider">{subtitle.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[color:var(--color-success)]">
          <span className="w-2 h-2 rounded-full bg-[color:var(--color-success)]" style={{ animation: "pulse-live 1.4s infinite" }} />
          LIVE
        </div>
      </div>
      <div className="relative aspect-video bg-gradient-to-br from-[oklch(0.14_0.04_240)] to-[oklch(0.22_0.05_220)] grid place-items-center">
        <div className="text-muted-foreground/40 text-xs tracking-widest">CAMERA FEED</div>
        <div className="absolute top-3 left-3 font-mono text-[10px] text-accent/80">REC · 00:12:34</div>
        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <IconBtn><ImageIcon size={12} /></IconBtn>
          <IconBtn><Video size={12} /></IconBtn>
          <IconBtn><Maximize2 size={12} /></IconBtn>
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
  const pct = (value / max) * 100;
  return (
    <div className="panel p-4">
      <div className="label-caps mb-2">Altitude</div>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="font-mono text-5xl font-bold text-accent leading-none">{value.toFixed(2)}<span className="text-xl text-muted-foreground ml-1">m</span></div>
          <div className="label-caps mt-2">Height from Pool Floor</div>
        </div>
        <div className="w-8 relative rounded bg-panel border border-panel-border overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-accent to-[oklch(0.85_0.19_75)]" style={{ height: `${pct}%` }} />
          <div className="absolute inset-0 flex flex-col justify-between py-1 px-0.5 text-[8px] font-mono text-muted-foreground">
            <span>2.00</span><span>1.00</span><span>0.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrajectoryCard() {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps">Trajectory Map</div>
        <div className="text-[10px] font-mono text-muted-foreground">SESSION 01</div>
      </div>
      <div className="relative bg-[oklch(0.15_0.03_250)] rounded border border-panel-border p-2 h-52">
        <svg viewBox="0 0 400 180" className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="oklch(0.28 0.03 250)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="180" fill="url(#grid)" />
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
      <div className="grid grid-cols-4 gap-2 mt-3 text-[10px]">
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
    <div className="panel p-3 grid grid-cols-3 md:grid-cols-6 gap-2">
      {items.map(({ icon: Icon, label }) => (
        <button key={label} className="flex flex-col items-center gap-1.5 py-2.5 rounded-md bg-panel hover:bg-accent hover:text-accent-foreground border border-panel-border transition-colors">
          <Icon size={18} />
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        </button>
      ))}
    </div>
  );
}

function QRPanel() {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps">QR Detection</div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]">VALID</span>
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
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
    <div className="panel p-4">
      <div className="label-caps mb-3">ROV Design</div>
      <div className="aspect-video bg-[oklch(0.15_0.03_250)] rounded border border-panel-border grid place-items-center relative overflow-hidden">
        <svg viewBox="0 0 200 120" className="w-4/5">
          <ellipse cx="100" cy="60" rx="60" ry="22" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
          <rect x="55" y="48" width="90" height="24" rx="4" fill="var(--color-accent)" opacity="0.15" stroke="var(--color-accent)" strokeWidth="1.5" />
          <circle cx="70" cy="60" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
          <circle cx="130" cy="60" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
          <line x1="40" y1="60" x2="55" y2="60" stroke="var(--color-accent)" strokeWidth="2" />
          <line x1="145" y1="60" x2="160" y2="60" stroke="var(--color-accent)" strokeWidth="2" />
        </svg>
        <div className="absolute bottom-2 right-2">
          <svg viewBox="0 0 60 60" className="w-14 h-14">
            <line x1="30" y1="30" x2="55" y2="30" stroke="var(--color-danger)" strokeWidth="1.5" />
            <text x="56" y="33" fontSize="8" fill="var(--color-danger)" fontFamily="monospace">X</text>
            <line x1="30" y1="30" x2="30" y2="5" stroke="var(--color-success)" strokeWidth="1.5" />
            <text x="32" y="8" fontSize="8" fill="var(--color-success)" fontFamily="monospace">Z</text>
            <line x1="30" y1="30" x2="12" y2="48" stroke="var(--color-accent)" strokeWidth="1.5" />
            <text x="2" y="52" fontSize="8" fill="var(--color-accent)" fontFamily="monospace">Y</text>
            <circle cx="30" cy="30" r="2" fill="#fff" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function InformationPanel() {
  return (
    <div className="panel p-4">
      <div className="label-caps mb-3">Information</div>
      <div className="space-y-2 text-xs">
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
