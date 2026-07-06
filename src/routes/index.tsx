import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Video, ImageIcon, Power,
  Play, RotateCcw, ToggleLeft, Wifi, Activity, Radio,
  Maximize2, Minimize2,
} from "lucide-react";
import poliwangiLogo from "../assets/Logo Poliwangi HD.png";
import qrCodeImage from "../assets/qr.jpeg";
import rovImage from "../assets/rov.png";

import { useROVSocket } from "../hooks/useROVSocket";
import { useCameraStream } from "../hooks/useCameraStream";
import { sendCameraCommand } from "../lib/camera-api";

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

  // Hook koneksi WebSocket dan Stream URL
  const socket = useROVSocket();
  const streams = useCameraStream();

  // State local untuk history QR
  const [qrHistory, setQrHistory] = useState<any[]>([]);

  const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

  const fetchQrHistory = () => {
    fetch(`${ROV_URL}/api/qr/history`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.history) {
          setQrHistory(d.history);
        }
      })
      .catch((e) => console.error("Error fetching QR history:", e));
  };

  useEffect(() => {
    fetchQrHistory();
  }, []);

  // Sync ulang history jika ada QR baru terdeteksi
  useEffect(() => {
    if (socket.qrStatus) {
      fetchQrHistory();
    }
  }, [socket.qrStatus]);

  const handleClearQrHistory = async () => {
    try {
      await fetch(`${ROV_URL}/api/qr/history`, { method: "DELETE" });
      setQrHistory([]);
    } catch (e) {
      console.error("Error clearing QR history:", e);
    }
  };

  const depthVal = socket.telemetry?.depth ?? 0;

  return (
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
            <div className="pr-5">
              <StatusRow
                icon={<ToggleLeft size={13} />}
                label="Mode"
                value={socket.telemetry?.mode ?? "MANUAL"}
                tone="accent"
              />
            </div>
            <div className="px-5">
              <StatusRow
                icon={<Wifi size={13} />}
                label="Connection"
                value={socket.connected ? `Connected (${socket.latencyMs ?? 0}ms)` : "Disconnected"}
                tone={socket.connected ? "success" : "danger"}
              />
            </div>
            <div className="px-5">
              <StatusRow
                icon={<Activity size={13} />}
                label="MAVLink"
                value={socket.mavlinkConnected ? "Connected" : "Disconnected"}
                tone={socket.mavlinkConnected ? "success" : "danger"}
              />
            </div>
            <div className="pl-5">
              <StatusRow
                icon={<Radio size={13} />}
                label="Thrusters"
                value={socket.telemetry?.armed ? "ARMED" : "DISARMED"}
                tone={socket.telemetry?.armed ? "success" : "danger"}
                pulse={socket.telemetry?.armed}
              />
            </div>
          </div>
          <button
            onClick={socket.sendEmergencyStop}
            className="flex items-center gap-2 bg-[color:var(--color-danger)] text-white font-bold px-4 py-1.5 rounded-md text-xs tracking-wider hover:opacity-90 transition-opacity"
          >
            <Power size={13} /> EMERGENCY STOP
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 min-h-0 p-3 grid gap-3 grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] overflow-hidden">
          {/* Left column */}
          <div className="min-h-0 overflow-hidden flex flex-col gap-3">
            {/* Cameras */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
              <CameraCard
                title="Camera 1"
                subtitle="Front Cam"
                streamUrl={streams?.front?.stream_url}
                cameraKey="front"
                lastResult={socket.lastCameraResult}
              />
              <CameraCard
                title="Camera 2"
                subtitle="Bottom Cam"
                streamUrl={streams?.bottom?.stream_url}
                cameraKey="bottom"
                lastResult={socket.lastCameraResult}
              />
            </div>

            {/* Altitude + Trajectory */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
              <AltitudeCard depth={depthVal} />
              <TrajectoryCard trajectory={socket.trajectory} />
            </div>

            {/* Quick controls */}
            <QuickControls
              armed={!!socket.telemetry?.armed}
              mode={socket.telemetry?.mode ?? "MANUAL"}
              sendArm={socket.sendArm}
              sendDisarm={socket.sendDisarm}
              sendSetMode={socket.sendSetMode}
              sendGripper={socket.sendGripper}
              sendLight={socket.sendLight}
            />
          </div>

          {/* Right column */}
          <div className="min-h-0 overflow-hidden flex flex-col gap-3">
            <QRPanel
              qrStatus={socket.qrStatus}
              dockAligned={socket.dockAligned}
              qrHistory={qrHistory}
              onClearHistory={handleClearQrHistory}
            />
            <ROVDesignPanel orientation={socket.trajectory?.orientation} />
            <InformationPanel
              telemetry={socket.telemetry}
              mavlinkConnected={socket.mavlinkConnected}
            />
          </div>
        </main>

        <footer className="shrink-0 border-t border-panel-border px-6 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>© 2026 Ocean Explorer · Politeknik Negeri Banyuwangi</span>
          <span className="font-mono">v1.0.0</span>
        </footer>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "danger" | "accent";
  pulse?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "text-[color:var(--color-success)]"
      : tone === "danger"
      ? "text-[color:var(--color-danger)]"
      : "text-accent";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </span>
      <span className="text-panel-border">·</span>
      <span className={`font-mono font-semibold flex items-center gap-1.5 ${toneClass}`}>
        {pulse && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-current"
            style={{ animation: "pulse-live 1.4s infinite" }}
          />
        )}
        {value}
      </span>
    </div>
  );
}

function CameraCard({
  title,
  subtitle,
  streamUrl,
  cameraKey,
  lastResult,
}: {
  title: string;
  subtitle: string;
  streamUrl?: string;
  cameraKey: "front" | "bottom";
  lastResult: any;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sinkronisasi status fullscreen (jika ditekan ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Gagal masuk fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Gagal keluar fullscreen:", err);
      });
    }
  };

  // Sinkronisasi status rekaman & notifikasi screenshot
  useEffect(() => {
    if (lastResult && lastResult.camera === cameraKey) {
      if (lastResult.action === "record_start" && lastResult.status === "ok") {
        setIsRecording(true);
        setStatusMessage("Recording started");
      } else if (lastResult.action === "record_stop" && lastResult.status === "ok") {
        setIsRecording(false);
        setStatusMessage("Recording stopped");
      } else if (lastResult.action === "screenshot" && lastResult.status === "ok") {
        setStatusMessage("Screenshot saved!");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    }
  }, [lastResult, cameraKey]);

  const handleScreenshot = async () => {
    try {
      setStatusMessage("Taking screenshot...");
      await sendCameraCommand(cameraKey, "screenshot");
    } catch (e: any) {
      setStatusMessage("Screenshot failed");
      console.error(e);
    }
  };

  const handleToggleRecord = async () => {
    try {
      if (isRecording) {
        setStatusMessage("Stopping recording...");
        await sendCameraCommand(cameraKey, "record_stop");
      } else {
        setStatusMessage("Starting recording...");
        await sendCameraCommand(cameraKey, "record_start");
      }
    } catch (e: any) {
      setStatusMessage("Record failed");
      console.error(e);
    }
  };

  return (
    <div className="panel overflow-hidden flex flex-col aspect-video">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border shrink-0">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground tracking-wider">{subtitle.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[color:var(--color-success)]">
          <span className="w-2 h-2 rounded-full bg-[color:var(--color-success)]" style={{ animation: "pulse-live 1.4s infinite" }} />
          LIVE
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0 bg-black grid place-items-center">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt={title}
            className="w-full h-full"
            style={{ objectFit: "contain" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <div className="text-muted-foreground/40 text-xs tracking-widest">NO CAMERA FEED</div>
        )}
        
        {isRecording && (
          <div className="absolute top-2 left-2 font-mono text-[10px] text-red-500 bg-black/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            REC
          </div>
        )}

        {statusMessage && (
          <div className="absolute top-2 right-2 font-mono text-[9px] text-accent bg-black/80 px-2 py-0.5 rounded z-20">
            {statusMessage}
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex gap-1 z-25">
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="w-7 h-7 grid place-items-center rounded bg-black/50 hover:bg-accent hover:text-accent-foreground text-white/80 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          <button
            onClick={handleScreenshot}
            title="Take Screenshot"
            className="w-7 h-7 grid place-items-center rounded bg-black/50 hover:bg-accent hover:text-accent-foreground text-white/80 transition-colors"
          >
            <ImageIcon size={11} />
          </button>
          <button
            onClick={handleToggleRecord}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            className={`w-7 h-7 grid place-items-center rounded bg-black/50 hover:bg-accent hover:text-accent-foreground text-white/80 transition-colors ${isRecording ? "text-red-500" : ""}`}
          >
            <Video size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AltitudeCard({ depth }: { depth: number }) {
  const max = 2.0;
  const clampedDepth = Math.max(0, Math.min(max, depth));
  const pointerY = 110 - (clampedDepth / max) * 100;

  return (
    <div className="panel p-3 flex flex-col h-full">
      <div className="label-caps mb-1.5 shrink-0">Altitude / Depth</div>
      <div className="flex gap-2 flex-1 items-center justify-between">
        <div className="flex-1">
          <div className="font-mono text-4xl font-bold text-accent leading-none">
            {depth.toFixed(2)}
            <span className="text-lg text-muted-foreground ml-1">m</span>
          </div>
          <div className="label-caps mt-1.5">Depth from surface</div>
        </div>
        
        {/* Vertical Ruler Gauge */}
        <div className="w-20 self-stretch">
          <svg viewBox="0 0 75 120" className="w-full h-full">
            <line x1="18" y1="10" x2="18" y2="110" stroke="var(--color-panel-border)" strokeWidth="1.5" />

            {/* Major Ticks */}
            <line x1="10" y1="10" x2="18" y2="10" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="14" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">2.00</text>

            <line x1="10" y1="35" x2="18" y2="35" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="39" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">1.50</text>

            <line x1="10" y1="60" x2="18" y2="60" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="64" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">1.00</text>

            <line x1="10" y1="85" x2="18" y2="85" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="89" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">0.50</text>

            <line x1="10" y1="110" x2="18" y2="110" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
            <text x="24" y="114" fill="var(--color-muted-foreground)" fontSize="11" fontFamily="monospace" fontWeight="bold">0.00</text>

            {/* Minor Ticks */}
            <line x1="13" y1="22.5" x2="18" y2="22.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="47.5" x2="18" y2="47.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="72.5" x2="18" y2="72.5" stroke="var(--color-panel-border)" strokeWidth="1" />
            <line x1="13" y1="97.5" x2="18" y2="97.5" stroke="var(--color-panel-border)" strokeWidth="1" />

            {/* Dynamic Pointer */}
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

function TrajectoryCard({ trajectory }: { trajectory: any }) {
  const points = trajectory?.path ?? [];
  const scale = 25; // 1m = 25px
  const originX = 150;
  const originY = 80;

  let pathD = "";
  if (points.length > 0) {
    pathD = points
      .map((p: any, idx: number) => {
        const sx = originX + p.x * scale;
        const sy = originY - p.y * scale;
        return `${idx === 0 ? "M" : "L"} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      })
      .join(" ");
  }

  const handleReset = async () => {
    try {
      const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";
      await fetch(`${ROV_URL}/api/trajectory/reset`, { method: "POST" });
    } catch (e) {
      console.error("Gagal reset trajectory:", e);
    }
  };

  const currentX = trajectory?.current_pos?.x ?? 0;
  const currentY = trajectory?.current_pos?.y ?? 0;
  const currentZ = trajectory?.current_pos?.depth ?? 0;

  return (
    <div className="panel p-3 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="label-caps">Trajectory Map</div>
        <button
          onClick={handleReset}
          className="text-[9px] font-mono border border-panel-border px-2 py-0.5 rounded hover:bg-accent hover:text-black transition-colors"
        >
          RESET ORIGIN
        </button>
      </div>
      <div className="relative flex-1 min-h-0 bg-[oklch(0.15_0.03_250)] rounded border border-panel-border overflow-hidden">
        {/* Background Grid */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="oklch(0.28 0.03 250)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Path Overlay */}
        <svg viewBox="0 0 300 160" className="relative w-full h-full z-10 p-2">
          {/* Origin Marker */}
          <circle cx={originX} cy={originY} r="3.5" fill="#fff" opacity="0.4" />
          
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Current ROV Position Dot */}
          {points.length > 0 && (
            <circle
              cx={originX + currentX * scale}
              cy={originY - currentY * scale}
              r="5.5"
              fill="var(--color-success)"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
        <MiniStat label="X Pos" value={`${currentX.toFixed(2)}m`} />
        <MiniStat label="Y Pos" value={`${currentY.toFixed(2)}m`} />
        <MiniStat label="Z Pos" value={`${currentZ.toFixed(2)}m`} />
        <MiniStat label="Points" value={points.length.toString()} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "text-[color:var(--color-success)]"
      : tone === "danger"
      ? "text-[color:var(--color-danger)]"
      : "text-accent";
  return (
    <div className="bg-panel border border-panel-border rounded px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground tracking-wider">{label.toUpperCase()}</div>
      <div className={`font-mono font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function QuickControls({
  armed,
  mode,
  sendArm,
  sendDisarm,
  sendSetMode,
  sendGripper,
  sendLight,
}: {
  armed: boolean;
  mode: string;
  sendArm: () => void;
  sendDisarm: () => void;
  sendSetMode: (mode: string) => void;
  sendGripper: (action: "open" | "close") => void;
  sendLight: (state: boolean) => void;
}) {
  const [lightState, setLightState] = useState(false);
  const [gripperState, setGripperState] = useState(false);

  const handleToggleArm = () => {
    if (armed) {
      sendDisarm();
    } else {
      sendArm();
    }
  };

  const handleToggleMode = () => {
    if (mode === "DEPTH_HOLD") {
      sendSetMode("MANUAL");
    } else {
      sendSetMode("DEPTH_HOLD");
    }
  };

  const handleToggleLight = () => {
    const nextState = !lightState;
    setLightState(nextState);
    sendLight(nextState);
  };

  const handleToggleGripper = () => {
    const nextState = !gripperState;
    setGripperState(nextState);
    sendGripper(nextState ? "open" : "close");
  };

  return (
    <div className="panel p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
      <button
        onClick={handleToggleArm}
        className={`flex items-center justify-center gap-2 py-2 rounded border border-panel-border transition-colors font-semibold text-xs cursor-pointer ${
          armed
            ? "bg-red-500/20 text-red-500 border-red-500/30"
            : "bg-panel hover:bg-accent hover:text-black"
        }`}
      >
        <Power size={13} />
        <span>{armed ? "DISARM MOTOR" : "ARM MOTOR"}</span>
      </button>

      <button
        onClick={handleToggleMode}
        className={`flex items-center justify-center gap-2 py-2 rounded border border-panel-border transition-colors font-semibold text-xs cursor-pointer ${
          mode === "DEPTH_HOLD"
            ? "bg-accent/20 text-accent border-accent/30"
            : "bg-panel hover:bg-accent hover:text-black"
        }`}
      >
        <ToggleLeft size={13} />
        <span>{mode === "DEPTH_HOLD" ? "MODE: DEPTH HOLD" : "MODE: MANUAL"}</span>
      </button>

      <button
        onClick={handleToggleLight}
        className={`flex items-center justify-center gap-2 py-2 rounded border border-panel-border transition-colors font-semibold text-xs cursor-pointer ${
          lightState
            ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
            : "bg-panel hover:bg-accent hover:text-black"
        }`}
      >
        <Play size={13} />
        <span>{lightState ? "LIGHT: ON" : "LIGHT: OFF"}</span>
      </button>

      <button
        onClick={handleToggleGripper}
        className={`flex items-center justify-center gap-2 py-2 rounded border border-panel-border transition-colors font-semibold text-xs cursor-pointer ${
          gripperState
            ? "bg-green-500/20 text-green-500 border-green-500/30"
            : "bg-panel hover:bg-accent hover:text-black"
        }`}
      >
        <RotateCcw size={13} />
        <span>{gripperState ? "GRIPPER: OPEN" : "GRIPPER: CLOSE"}</span>
      </button>
    </div>
  );
}

function QRPanel({
  qrStatus,
  dockAligned,
  qrHistory,
  onClearHistory,
}: {
  qrStatus: any;
  dockAligned: boolean;
  qrHistory: any[];
  onClearHistory: () => void;
}) {
  return (
    <div className="panel p-3 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="label-caps">QR Detection & Docking</div>
        <div className="flex gap-2">
          {qrHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[9px] font-mono border border-panel-border px-2 py-0.5 rounded hover:bg-red-500/20 hover:text-red-500 transition-colors cursor-pointer"
            >
              CLEAR
            </button>
          )}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              dockAligned
                ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]"
                : qrStatus?.data
                ? "bg-yellow-500/20 text-yellow-500"
                : "bg-panel-border/30 text-muted-foreground"
            }`}
          >
            {dockAligned ? "ALIGNED" : qrStatus?.data ? "DETECTED" : "NO TARGET"}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-[80px_1fr] gap-3 items-center shrink-0 border-b border-panel-border/50 pb-3">
        <div className="aspect-square bg-white p-1 rounded overflow-hidden grid place-items-center">
          <img
            src={qrCodeImage}
            alt="Detected QR Code"
            className="w-full h-full object-cover opacity-85"
          />
        </div>
        <div className="space-y-1 text-xs">
          <Field label="Code" value={qrStatus?.data || "-"} />
          <Field
            label="Alignment"
            value={dockAligned ? "READY (Aligned)" : qrStatus?.data ? "Centering..." : "Not Aligned"}
            accent={dockAligned}
          />
          <Field
            label="Status"
            value={dockAligned ? "READY TO DOCK" : "ALIGNING..."}
            mono
            accent={dockAligned}
          />
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 min-h-0 mt-2 flex flex-col">
        <div className="text-[10px] text-muted-foreground tracking-wider font-semibold mb-1.5">DETECTION HISTORY</div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
          {qrHistory.length === 0 ? (
            <div className="text-muted-foreground/50 italic text-center py-4">No history data</div>
          ) : (
            qrHistory.slice().reverse().map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1 border-b border-panel-border/30 last:border-0"
              >
                <span className="truncate max-w-[120px] font-semibold text-accent">{item.data}</span>
                <div className="flex items-center gap-2">
                  <span className={item.aligned ? "text-green-500" : "text-yellow-500"}>
                    {item.aligned ? "Aligned" : "Detect"}
                  </span>
                  <span className="text-muted-foreground">
                    {item.received_at ? new Date(item.received_at).toLocaleTimeString("en-GB") : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ROVDesignPanel({ orientation }: { orientation: any }) {
  const yaw = orientation?.yaw ?? 0;
  const pitch = orientation?.pitch ?? 0;
  const roll = orientation?.roll ?? 0;

  return (
    <div className="panel p-3 flex-1 flex flex-col min-h-0">
      <div className="label-caps mb-2 shrink-0">ROV Orientation & Axis</div>
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">

        {/* Left: ROV Image */}
        <div className="flex flex-col gap-1 min-h-0">
          <div className="text-[8px] tracking-widest text-muted-foreground font-semibold uppercase">Attitude Indicator</div>
          <div className="flex-1 min-h-0 bg-[oklch(0.10_0.02_245)] rounded border border-panel-border overflow-hidden grid place-items-center relative">
            <img
              src={rovImage}
              alt="ROV 3D Model"
              className="w-full h-full object-contain p-2"
              style={{
                transform: `rotate(${roll}deg) scale(${Math.max(0.6, 1 - Math.abs(pitch) / 180)})`,
                transition: "transform 0.1s ease-out",
              }}
            />
            <div className="absolute bottom-1 left-2 text-[8px] font-mono text-muted-foreground">
              R: {roll.toFixed(1)}° P: {pitch.toFixed(1)}°
            </div>
          </div>
        </div>

        {/* Right: Axis Indicator */}
        <div className="flex flex-col gap-1 min-h-0">
          <div className="text-[8px] tracking-widest text-muted-foreground font-semibold uppercase">Compass (Yaw)</div>
          <div className="flex-1 min-h-0 bg-[oklch(0.10_0.02_245)] rounded border border-panel-border overflow-hidden grid place-items-center relative">
            <svg viewBox="0 0 100 100" className="w-full h-full p-2">
              <g transform={`rotate(${yaw}, 50, 50)`} style={{ transition: "transform 0.1s ease-out" }}>
                {/* Compass Circle */}
                <circle cx="50" cy="50" r="30" fill="none" stroke="var(--color-panel-border)" strokeWidth="1.5" />
                
                {/* Pointer / North Indicator */}
                <polygon points="50,15 45,25 55,25" fill="var(--color-accent)" />
                <text x="50" y="35" fontSize="8" stroke="none" fill="var(--color-accent)" textAnchor="middle" fontFamily="monospace" fontWeight="bold">N</text>
                
                {/* Axis lines */}
                <line x1="50" y1="25" x2="50" y2="75" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="25" y1="50" x2="75" y2="50" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
              </g>
              {/* Center point */}
              <circle cx="50" cy="50" r="3" fill="#fff" />
            </svg>
            <div className="absolute bottom-1 right-2 text-[8px] font-mono text-muted-foreground">
              HDG: {yaw.toFixed(1)}°
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function InformationPanel({
  telemetry,
  mavlinkConnected,
}: {
  telemetry: any;
  mavlinkConnected: boolean;
}) {
  const depth = telemetry?.depth ?? 0;
  const batteryVoltage = telemetry?.battery_voltage ?? 0;
  const batteryRemaining = telemetry?.battery_remaining ?? 0;
  const mode = telemetry?.mode ?? "MANUAL";
  const armed = telemetry?.armed ?? false;

  return (
    <div className="panel p-3">
      <div className="label-caps mb-2">System Telemetry</div>
      <div className="space-y-1.5 text-xs">
        <Field label="Depth" value={`${depth.toFixed(2)} m`} mono accent />
        <Field label="Battery" value={`${batteryVoltage.toFixed(1)} V (${batteryRemaining}%)`} mono accent />
        <Field label="Flight Mode" value={mode} />
        <Field label="Thrusters" value={armed ? "ARMED" : "DISARMED"} accent={armed} />
        <Field label="MAVLink State" value={mavlinkConnected ? "CONNECTED" : "DISCONNECTED"} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/50 pb-1.5 last:border-0">
      <span className="label-caps">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${accent ? "text-accent font-bold" : "text-foreground"} text-xs`}>
        {value}
      </span>
    </div>
  );
}
