import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Video, ImageIcon, Power,
  Play, RotateCcw, ToggleLeft, Wifi, Activity, Radio,
  Maximize2, Minimize2,
} from "lucide-react";
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
  const failsafe = socket.failsafeStatus;
  const isEmergency = failsafe?.emergency_active;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {/* Emergency Stop Lockout Overlay */}
        {isEmergency && (
          <div className="absolute inset-0 bg-red-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center mb-6 animate-pulse">
              <Power size={40} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-wider text-red-500 uppercase mb-2">
              Emergency Stop Active
            </h1>
            <p className="text-muted-foreground text-sm max-w-sm mb-6">
              The ROV thrusters have been disarmed due to a critical safety event. Verify hardware and telemetry before clearing.
            </p>
            <div className="bg-black/40 border border-red-500/30 rounded-lg px-5 py-3.5 mb-6 font-mono text-left max-w-md w-full">
              <div className="text-[10px] text-red-400 uppercase tracking-widest mb-1 font-bold">Watchdog Event Reason</div>
              <div className="text-sm text-foreground">{failsafe?.emergency_reason || "Operator Triggered E-Stop"}</div>
            </div>
            <button
              onClick={socket.sendClearEmergency}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold rounded-md text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer uppercase"
            >
              Clear Emergency State
            </button>
          </div>
        )}

        {/* Header + Status Bar (combined into one row to save vertical space) */}
        <div className="h-12 shrink-0 border-b border-panel-border px-4 bg-[color:var(--color-sidebar)] flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center divide-x divide-panel-border shrink-0">
            <div className="pr-3">
              <StatusRow
                icon={<ToggleLeft size={13} />}
                label="Mode"
                value={socket.telemetry?.mode ?? "MANUAL"}
                tone="accent"
              />
            </div>
            <div className="px-3">
              <StatusRow
                icon={<Wifi size={13} />}
                label="Connection"
                value={socket.connected ? `Connected (${socket.latencyMs ?? 0}ms)` : "Disconnected"}
                tone={socket.connected ? "success" : "danger"}
              />
            </div>
            <div className="px-3">
              <StatusRow
                icon={<Activity size={13} />}
                label="MAVLink"
                value={socket.mavlinkConnected ? "Connected" : "Disconnected"}
                tone={socket.mavlinkConnected ? "success" : "danger"}
              />
            </div>
            <div className="pl-3">
              <StatusRow
                icon={<Radio size={13} />}
                label="Thrusters"
                value={socket.telemetry?.armed ? "ARMED" : "DISARMED"}
                tone={socket.telemetry?.armed ? "success" : "danger"}
                pulse={socket.telemetry?.armed}
              />
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-3 text-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="label-caps">Team</span>
              <span className="font-mono font-semibold">Ocean Explorer</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs leading-none">{time}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{date}</div>
            </div>
          </div>

          <button
            onClick={socket.sendEmergencyStop}
            className="flex items-center gap-1.5 shrink-0 whitespace-nowrap bg-[color:var(--color-danger)] text-white font-bold px-3.5 py-1.5 rounded-lg text-[11px] tracking-wider hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Power size={12} className="shrink-0" /> EMERGENCY STOP
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 min-h-0 p-2.5 grid gap-2.5 grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_340px] overflow-hidden">
          {/* Left column */}
          <div className="min-h-0 flex flex-col gap-2.5">
            {/* Scrollable: cameras + telemetry (only scrolls if the window is genuinely too short) */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-1">
              {/* Cameras */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-[3] min-h-[140px]">
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
              <div className="flex-[2] min-h-[150px] grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2.5">
                <AltitudeCard depth={depthVal} />
                <TrajectoryCard trajectory={socket.trajectory} />
              </div>
            </div>

            {/* Quick controls — always pinned & visible, never scrolled out of view */}
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
          <div className="min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5 scrollbar-thin">
            <QRPanel
              qrStatus={socket.qrStatus}
              dockAligned={socket.dockAligned}
              qrHistory={qrHistory}
              onClearHistory={handleClearQrHistory}
            />
            <AutonomousPanel
              status={socket.autonomousStatus}
              onStart={socket.sendAutonomousStart}
              onStop={socket.sendAutonomousStop}
            />
            <FailsafePanel status={failsafe} />
            <ROVDesignPanel orientation={socket.trajectory?.orientation} />
            <InformationPanel
              telemetry={socket.telemetry}
              mavlinkConnected={socket.mavlinkConnected}
            />
          </div>
        </main>

        <footer className="shrink-0 border-t border-panel-border px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
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
    <div className="panel overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border shrink-0">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground tracking-wide">{subtitle.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--color-success)]">
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
          <div className="absolute top-2.5 left-2.5 font-mono text-[11px] text-red-500 bg-black/60 px-2 py-1 rounded flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            REC
          </div>
        )}

        {statusMessage && (
          <div className="absolute top-2.5 right-2.5 font-mono text-[10px] text-accent bg-black/80 px-2.5 py-1 rounded z-20">
            {statusMessage}
          </div>
        )}

        <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 z-25">
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="w-7 h-7 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={handleScreenshot}
            title="Take Screenshot"
            className="w-7 h-7 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors"
          >
            <ImageIcon size={12} />
          </button>
          <button
            onClick={handleToggleRecord}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            className={`w-7 h-7 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors ${isRecording ? "text-red-500" : ""}`}
          >
            <Video size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AltitudeCard({ depth }: { depth: number }) {
  const max = 2.0;
  const clampedDepth = Math.max(0, Math.min(max, depth));
  const waterTopY = 12 + (1 - clampedDepth / max) * 96;

  return (
    <div className="panel p-2.5 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="label-caps mb-1.5 shrink-0">Depth Sounder</div>
      <div className="flex-1 flex flex-col items-center justify-between min-h-0 gap-2">
        <div className="text-center">
          <div className="font-mono text-3xl font-bold text-[color:var(--color-data)] leading-none">
            {depth.toFixed(2)}
            <span className="text-sm text-muted-foreground ml-1">m</span>
          </div>
          <div className="label-caps mt-1.5">Below surface</div>
        </div>

        {/* Analog depth sounder tube */}
        <div className="w-14 flex-1 min-h-0">
          <svg viewBox="0 0 60 120" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Instrument tube */}
            <rect x="14" y="10" width="20" height="100" rx="10" fill="oklch(0.14 0.028 250)" stroke="var(--color-panel-border)" strokeWidth="1.5" />

            {/* Water column fill */}
            <rect
              x="15.5"
              y={waterTopY}
              width="17"
              height={110 - waterTopY}
              rx="8.5"
              fill="var(--color-data)"
              opacity="0.35"
            />
            <line x1="15.5" y1={waterTopY} x2="32.5" y2={waterTopY} stroke="var(--color-data)" strokeWidth="2" />

            {/* Scale ticks + labels */}
            {[0, 0.5, 1.0, 1.5, 2.0].map((t) => {
              const y = 12 + (1 - t / max) * 96;
              return (
                <g key={t}>
                  <line x1="36" y1={y} x2="41" y2={y} stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
                  <text x="45" y={y + 3.5} fill="var(--color-muted-foreground)" fontSize="9" fontFamily="monospace" fontWeight="bold">
                    {t.toFixed(1)}
                  </text>
                </g>
              );
            })}
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
    <div className="panel p-2.5 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="label-caps">Trajectory Map</div>
        <button
          onClick={handleReset}
          className="text-xs font-mono border border-panel-border px-2.5 py-1 rounded-md hover:bg-accent hover:text-[color:var(--color-accent-foreground)] transition-colors"
        >
          RESET ORIGIN
        </button>
      </div>
      <div className="relative flex-1 min-h-0 bg-[oklch(0.15_0.03_250)] rounded-lg border border-panel-border overflow-hidden">
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
              stroke="var(--color-data)"
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
      <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
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
      : "text-[color:var(--color-data)]";
  return (
    <div className="bg-panel border border-panel-border rounded-md px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground tracking-wide">{label.toUpperCase()}</div>
      <div className={`font-mono font-bold text-xs ${toneClass}`}>{value}</div>
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
    <div className="panel p-2.5 shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <button
        onClick={handleToggleArm}
        className={`flex items-center justify-center gap-2 py-2 px-2 rounded-lg border border-panel-border transition-colors font-semibold text-xs whitespace-nowrap cursor-pointer ${
          armed
            ? "bg-red-500/20 text-red-500 border-red-500/30"
            : "bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)]"
        }`}
      >
        <Power size={15} className="shrink-0" />
        <span>{armed ? "DISARM MOTOR" : "ARM MOTOR"}</span>
      </button>

      <button
        onClick={handleToggleMode}
        className={`flex items-center justify-center gap-2 py-2 px-2 rounded-lg border border-panel-border transition-colors font-semibold text-xs whitespace-nowrap cursor-pointer ${
          mode === "DEPTH_HOLD"
            ? "bg-accent/20 text-accent border-accent/30"
            : "bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)]"
        }`}
      >
        <ToggleLeft size={15} className="shrink-0" />
        <span>{mode === "DEPTH_HOLD" ? "MODE: DEPTH HOLD" : "MODE: MANUAL"}</span>
      </button>

      <button
        onClick={handleToggleLight}
        className={`flex items-center justify-center gap-2 py-2 px-2 rounded-lg border border-panel-border transition-colors font-semibold text-xs whitespace-nowrap cursor-pointer ${
          lightState
            ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
            : "bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)]"
        }`}
      >
        <Play size={15} className="shrink-0" />
        <span>{lightState ? "LIGHT: ON" : "LIGHT: OFF"}</span>
      </button>

      <button
        onClick={handleToggleGripper}
        className={`flex items-center justify-center gap-2 py-2 px-2 rounded-lg border border-panel-border transition-colors font-semibold text-xs whitespace-nowrap cursor-pointer ${
          gripperState
            ? "bg-green-500/20 text-green-500 border-green-500/30"
            : "bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)]"
        }`}
      >
        <RotateCcw size={15} className="shrink-0" />
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
    <div className="panel p-2.5 flex flex-col shrink-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="label-caps">QR Detection & Docking</div>
        <div className="flex gap-1.5">
          {qrHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[10px] font-mono border border-panel-border px-2 py-0.5 rounded-md hover:bg-red-500/20 hover:text-red-500 transition-colors cursor-pointer"
            >
              CLEAR
            </button>
          )}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
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

      <div className="grid grid-cols-[70px_1fr] gap-2.5 items-center shrink-0 border-b border-panel-border/50 pb-2.5">
        <div className="aspect-square bg-white p-1 rounded-md overflow-hidden grid place-items-center">
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
      <div className="mt-2 flex flex-col">
        <div className="text-[11px] text-muted-foreground tracking-wide font-semibold mb-1.5">DETECTION HISTORY</div>
        <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
          {qrHistory.length === 0 ? (
            <div className="text-muted-foreground/50 italic text-center py-4">No history data</div>
          ) : (
            qrHistory.slice().reverse().map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 border-b border-panel-border/30 last:border-0"
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
    <div className="panel p-2.5 flex flex-col shrink-0">
      <div className="label-caps mb-2 shrink-0">ROV Orientation & Axis</div>
      <div className="grid grid-cols-2 gap-2.5">

        {/* Left: ROV Image */}
        <div className="flex flex-col gap-1">
          <div className="text-[9px] tracking-wide text-muted-foreground font-semibold uppercase">Attitude Indicator</div>
          <div className="aspect-square bg-[oklch(0.14_0.028_250)] rounded-lg border border-panel-border overflow-hidden grid place-items-center relative">
            <img
              src={rovImage}
              alt="ROV 3D Model"
              className="w-full h-full object-contain p-2"
              style={{
                transform: `rotate(${roll}deg) scale(${Math.max(0.6, 1 - Math.abs(pitch) / 180)})`,
                transition: "transform 0.1s ease-out",
              }}
            />
            <div className="absolute bottom-1.5 left-2 text-[10px] font-mono text-muted-foreground">
              R: {roll.toFixed(1)}° P: {pitch.toFixed(1)}°
            </div>
          </div>
        </div>

        {/* Right: Axis Indicator */}
        <div className="flex flex-col gap-1">
          <div className="text-[9px] tracking-wide text-muted-foreground font-semibold uppercase">Compass (Yaw)</div>
          <div className="aspect-square bg-[oklch(0.14_0.028_250)] rounded-lg border border-panel-border overflow-hidden grid place-items-center relative">
            <svg viewBox="0 0 100 100" className="w-full h-full p-2">
              <g transform={`rotate(${yaw}, 50, 50)`} style={{ transition: "transform 0.1s ease-out" }}>
                {/* Compass Circle */}
                <circle cx="50" cy="50" r="30" fill="none" stroke="var(--color-panel-border)" strokeWidth="1.5" />

                {/* Pointer / North Indicator */}
                <polygon points="50,15 45,25 55,25" fill="var(--color-data)" />
                <text x="50" y="35" fontSize="8" stroke="none" fill="var(--color-data)" textAnchor="middle" fontFamily="monospace" fontWeight="bold">N</text>

                {/* Axis lines */}
                <line x1="50" y1="25" x2="50" y2="75" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="25" y1="50" x2="75" y2="50" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
              </g>
              {/* Center point */}
              <circle cx="50" cy="50" r="3" fill="#fff" />
            </svg>
            <div className="absolute bottom-1.5 right-2 text-[10px] font-mono text-muted-foreground">
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
    <div className="panel p-2.5">
      <div className="label-caps mb-2">System Telemetry</div>
      <div className="space-y-1.5 text-xs">
        <Field label="Depth" value={`${depth.toFixed(2)} m`} mono data />
        <Field label="Battery" value={`${batteryVoltage.toFixed(1)} V (${batteryRemaining}%)`} mono data />
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
  data,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  data?: boolean;
}) {
  const toneClass = data
    ? "text-[color:var(--color-data)] font-bold"
    : accent
    ? "text-accent font-bold"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-panel-border/50 pb-1.5 last:border-0">
      <span className="label-caps">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${toneClass} text-xs`}>
        {value}
      </span>
    </div>
  );
}

function AutonomousPanel({
  status,
  onStart,
  onStop,
}: {
  status: any;
  onStart: (targetId: string) => void;
  onStop: () => void;
}) {
  const [targetId, setTargetId] = useState("DOCK_STATION_A");
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const isActive = status?.is_active ?? false;
  const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

  const handleSetTarget = async () => {
    if (!targetId.trim()) return;
    setIsSavingTarget(true);
    setSaveMessage("");
    try {
      const res = await fetch(`${ROV_URL}/api/trajectory/set_target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage(`Saved ${data.waypoints} waypoints!`);
        setTimeout(() => setSaveMessage(""), 4000);
      } else {
        setSaveMessage(`Failed: ${data.error || "Unknown"}`);
      }
    } catch (e: any) {
      setSaveMessage("Failed connecting to API");
    } finally {
      setIsSavingTarget(false);
    }
  };

  return (
    <div className="panel p-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between border-b border-panel-border/50 pb-2">
        <span className="label-caps">Semi-Autonomous Mission</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
            isActive
              ? "bg-accent/20 text-accent"
              : "bg-panel-border/30 text-muted-foreground"
          }`}
        >
          {isActive ? status?.state || "ACTIVE" : "STANDBY"}
        </span>
      </div>

      <div className="space-y-2.5 text-xs">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Target Station ID</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={isActive}
              placeholder="e.g. DOCK_A"
              className="flex-1 bg-panel border border-panel-border rounded-md px-2.5 py-1 font-mono text-xs text-foreground focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={handleSetTarget}
              disabled={isActive || isSavingTarget}
              className="px-2.5 py-1 bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)] border border-panel-border rounded-md text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-50"
            >
              {isSavingTarget ? "Saving..." : "Set Target"}
            </button>
          </div>
          {saveMessage && (
            <span className="text-[11px] font-mono text-accent mt-0.5">{saveMessage}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            onClick={() => onStart(targetId)}
            disabled={isActive}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-[color:var(--color-accent-foreground)] font-bold text-[11px] tracking-wider cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={12} fill="currentColor" /> START MISSION
          </button>
          <button
            onClick={onStop}
            disabled={!isActive}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 hover:text-white border border-red-500/30 text-red-400 font-bold text-[11px] tracking-wider cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Power size={12} /> ABORT MISSION
          </button>
        </div>

        {isActive && (
          <div className="bg-[oklch(0.15_0.028_250)] border border-panel-border/60 rounded-lg p-2.5 space-y-1.5 font-mono text-[10px] mt-1">
            <div className="flex justify-between border-b border-panel-border/10 pb-1.5">
              <span className="text-muted-foreground uppercase text-[10px]">Mission Stage</span>
              <span className="text-accent font-bold">{status?.state}</span>
            </div>
            <div className="flex justify-between border-b border-panel-border/10 pb-1.5">
              <span className="text-muted-foreground uppercase text-[10px]">Elapsed Time</span>
              <span className="text-foreground">{status?.elapsed_s} s</span>
            </div>
            {(status?.waypoint_index !== undefined) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground uppercase text-[10px]">Waypoint Progress</span>
                <span className="text-foreground">
                  {status?.waypoint_index} / {status?.waypoint_total || "?"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FailsafePanel({ status }: { status: any }) {
  if (!status) {
    return (
      <div className="panel p-2.5">
        <div className="label-caps mb-2">Failsafe System Health</div>
        <div className="text-muted-foreground/30 text-sm italic text-center py-4 font-mono">
          Waiting for security heartbeat...
        </div>
      </div>
    );
  }

  const subsystems = status.subsystems || {};

  return (
    <div className="panel p-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between border-b border-panel-border/50 pb-2">
        <span className="label-caps">Security Watchdog L1</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
            status.emergency_active
              ? "bg-red-500/20 text-red-500 animate-pulse"
              : "bg-green-500/10 text-green-400"
          }`}
        >
          {status.emergency_active ? "EMERGENCY" : "SECURE"}
        </span>
      </div>

      <div className="space-y-1.5 font-mono text-[10px]">
        {Object.entries(subsystems).map(([name, h]: [string, any]) => {
          let displayName = name.toUpperCase();
          if (name === "mavlink") displayName = "MAVLINK LINK";
          else if (name === "dashboard") displayName = "GCS LINK";
          else if (name === "telemetry") displayName = "TELEMETRY FRESHNESS";
          else if (name === "camera_front") displayName = "FRONT CAMERA";
          else if (name === "camera_bottom") displayName = "BOTTOM CAMERA";
          else if (name === "system") displayName = "HOST PI RESOURCE";

          let toneClass = "text-green-400 bg-green-500/10 border-green-500/25";
          if (h.severity === "WARNING") {
            toneClass = "text-yellow-400 bg-yellow-500/10 border-yellow-500/25";
          } else if (h.severity === "CRITICAL" || h.severity === "EMERGENCY") {
            toneClass = "text-red-400 bg-red-500/10 border-red-500/25";
          }

          return (
            <div
              key={name}
              className="flex items-center justify-between border-b border-panel-border/20 pb-1.5 last:border-0"
            >
              <div className="flex flex-col">
                <span className="text-[10px] text-foreground font-semibold">{displayName}</span>
                <span className="text-[9px] text-muted-foreground truncate max-w-[200px]" title={h.message}>
                  {h.message}
                </span>
              </div>
              <span className={`px-1.5 py-0.5 rounded-md border font-bold text-[9px] tracking-wide uppercase ${toneClass}`}>
                {h.severity === "INFO" ? "OK" : h.severity}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
