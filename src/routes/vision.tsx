import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Video, ImageIcon, Maximize2, Minimize2, Activity, Wifi, Radio, Power } from "lucide-react";
import qrCodeImage from "../assets/qr.jpeg";

import { useROVSocket } from "../hooks/useROVSocket";
import { useCameraStream } from "../hooks/useCameraStream";
import { sendCameraCommand } from "../lib/camera-api";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "ROV Vision Center — Ocean Explorer" },
      { name: "description", content: "Cockpit HUD dual camera feed and high-fidelity QR docking analyzer." },
    ],
  }),
  component: VisionCenter,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function VisionCenter() {
  const now = useClock();
  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour12: false });

  const socket = useROVSocket();
  const streams = useCameraStream();

  // QR Processing
  const qrRaw = socket.qrStatus?.data || "";
  let qrSide = "-";
  if (qrRaw) {
    if (qrRaw.toLowerCase().includes("side_a") || qrRaw.toLowerCase() === "a") qrSide = "Side A";
    else if (qrRaw.toLowerCase().includes("side_b") || qrRaw.toLowerCase() === "b") qrSide = "Side B";
    else if (qrRaw.toLowerCase().includes("side_c") || qrRaw.toLowerCase() === "c") qrSide = "Side C";
    else if (qrRaw.toLowerCase().includes("side_d") || qrRaw.toLowerCase() === "d") qrSide = "Side D";
    else qrSide = qrRaw;
  }

  const qrValid = socket.dockAligned;

  // Local state for QR detection history logs
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

  useEffect(() => {
    if (socket.qrStatus) {
      fetchQrHistory();
    }
  }, [socket.qrStatus]);

  const handleClearHistory = async () => {
    try {
      await fetch(`${ROV_URL}/api/qr/history`, { method: "DELETE" });
      setQrHistory([]);
    } catch (e) {
      console.error(e);
    }
  };

  const failsafe = socket.failsafeStatus;
  const isEmergency = failsafe?.emergency_active;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden relative">
      {/* Emergency Stop Lockout Overlay */}
      {isEmergency && (
        <div className="absolute inset-0 bg-red-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center mb-6 animate-pulse">
            <Power size={40} className="text-red-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-wider text-red-500 uppercase mb-2">
            Emergency Stop Active
          </h1>
          <p className="text-muted-foreground text-xs max-w-sm mb-6">
            The ROV thrusters have been disarmed due to a critical safety event. Verify hardware and telemetry before clearing.
          </p>
          <div className="bg-black/40 border border-red-500/30 rounded-lg px-5 py-3.5 mb-6 font-mono text-left max-w-md w-full">
            <div className="text-[9px] text-red-400 uppercase tracking-widest mb-1 font-bold">Watchdog Event Reason</div>
            <div className="text-xs text-foreground">{failsafe?.emergency_reason || "Operator Triggered E-Stop"}</div>
          </div>
          <button
            onClick={socket.sendClearEmergency}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold rounded-md text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer uppercase"
          >
            Clear Emergency State
          </button>
        </div>
      )}
      {/* Top Information Bar */}
      <header className="h-13 shrink-0 border-b border-panel-border px-6 flex items-center justify-between bg-[color:var(--color-sidebar)] text-xs font-semibold tracking-wider uppercase backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-2 text-accent">
          <span className="text-muted-foreground font-medium">Team:</span>
          <span className="font-mono">{socket.connected ? "Ocean Explorer" : "Offline Mode"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">University:</span>
          <span className="text-foreground tracking-wide font-sans">Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="flex items-center gap-2 text-right font-mono">
          <span className="text-muted-foreground font-medium">{dayName},</span>
          <span className="text-accent">{dateStr}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-foreground font-bold">{timeStr}</span>
        </div>
      </header>

      {/* Main Layout: cameras side-by-side on left, QR panel on right */}
      <div className="flex-1 min-h-0 p-4 flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">

        {/* Left: Camera 1 & Camera 2 side by side, full height */}
        <div className="flex-1 min-h-0 flex flex-row gap-4">
          {/* Camera 1 (Front Cam) */}
          <div className="flex-1 min-h-0 h-full">
            <CameraCard
              title="Camera 1"
              subtitle="Front Cam Stream"
              streamUrl={streams?.front?.stream_url}
              cameraKey="front"
              lastResult={socket.lastCameraResult}
              telemetry={socket.trajectory?.orientation}
            />
          </div>

          {/* Camera 2 (Bottom / Side Cam) */}
          <div className="flex-1 min-h-0 h-full">
            <CameraCard
              title="Camera 2"
              subtitle="Bottom / Side Cam Stream"
              streamUrl={streams?.bottom?.stream_url}
              cameraKey="bottom"
              lastResult={socket.lastCameraResult}
              telemetry={socket.trajectory?.orientation}
            />
          </div>
        </div>

        {/* Right: QR Code Detection Panel */}
        <div className="panel flex flex-col w-full lg:w-[340px] shrink-0 min-h-[400px] lg:h-full p-5 justify-between bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg backdrop-blur-sm shadow-xl">
          <div className="flex flex-col gap-4 min-h-0 flex-1">
            {/* Title block */}
            <div className="flex items-center justify-between border-b border-panel-border/60 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-accent animate-pulse" />
                <span className="label-caps">QR Target Analyzer</span>
              </div>
              <span
                className={`text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  socket.qrStatus?.data
                    ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 animate-pulse"
                    : "bg-panel-border/20 text-muted-foreground border-panel-border/40"
                }`}
              >
                {socket.qrStatus?.data ? "TARGET LOCKED" : "NO TARGET"}
              </span>
            </div>

            {/* Target visual scan block */}
            <div className="flex flex-col items-center gap-4 bg-[oklch(0.12_0.02_245)] p-4 rounded-lg border border-panel-border/50 relative overflow-hidden shrink-0">
              {/* Animated Scan Line */}
              {socket.qrStatus?.data && (
                <div className="absolute left-0 right-0 h-0.5 bg-accent/40 shadow-[0_0_8px_var(--color-accent)] animate-[bounce_2.5s_infinite] pointer-events-none" />
              )}
              
              <div className="w-24 h-24 bg-white/5 p-1 rounded-lg border-2 border-dashed border-panel-border flex items-center justify-center relative group overflow-hidden bg-black/40">
                <img
                  src={qrCodeImage}
                  alt="Target QR"
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-accent/5 border border-accent/25 rounded-md pointer-events-none" />
              </div>

              <div className="w-full space-y-2.5 text-xs font-mono">
                <div className="flex justify-between border-b border-panel-border/10 pb-1.5">
                  <span className="text-muted-foreground uppercase text-[9px] tracking-wider">Target Side</span>
                  <span className="text-accent font-bold text-sm tracking-wide">{qrSide}</span>
                </div>
                <div className="flex justify-between border-b border-panel-border/10 pb-1.5">
                  <span className="text-muted-foreground uppercase text-[9px] tracking-wider">Dock Alignment</span>
                  <span
                    className={`font-bold flex items-center gap-1.5 ${
                      qrValid ? "text-[color:var(--color-success)]" : "text-yellow-500"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${qrValid ? "bg-[color:var(--color-success)]" : "bg-yellow-500"} animate-pulse`} />
                    {qrValid ? "VALID (Ready to Dock)" : socket.qrStatus?.data ? "INVALID (Centering)" : "NOT DETECTED"}
                  </span>
                </div>
              </div>
            </div>

            {/* Detection History logs */}
            <div className="flex-1 flex flex-col min-h-0 mt-2 overflow-hidden">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                  Realtime Detections
                </span>
                {qrHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[8px] font-mono border border-panel-border/80 px-2 py-0.5 rounded hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40 transition-colors hover:cursor-pointer uppercase tracking-wider"
                  >
                    Clear Logs
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 font-mono text-[10px] scrollbar-thin">
                {qrHistory.length === 0 ? (
                  <div className="text-muted-foreground/30 italic text-center py-8">
                    No scanning data logged
                  </div>
                ) : (
                  qrHistory
                    .slice()
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-panel/30 border border-panel-border/40 rounded p-2 hover:bg-accent/5 hover:border-accent/20 transition-all"
                      >
                        <span className="text-accent font-semibold truncate max-w-[130px]">{item.data}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] ${item.aligned ? "text-green-400 bg-green-500/10" : "text-yellow-400 bg-yellow-500/10"}`}>
                            {item.aligned ? "Aligned" : "Detect"}
                          </span>
                          <span className="text-muted-foreground/50">
                            {item.received_at ? new Date(item.received_at).toLocaleTimeString("en-GB") : ""}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-3 mt-4 shrink-0 font-mono text-[9px] text-muted-foreground flex justify-between">
            <span>Scan Protocol:</span>
            <span>CV-HOUGH-QR</span>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-11 shrink-0 border-t border-panel-border px-6 py-2 bg-[color:var(--color-sidebar)] flex items-center justify-between text-[11px] backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <Radio size={12} className="text-accent animate-pulse" />
            <span className="text-muted-foreground font-semibold uppercase">Mode:</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-4 w-px bg-panel-border/60" />
          <div className="flex items-center gap-1.5">
            <Wifi size={12} className={socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"} />
            <span className="text-muted-foreground font-semibold uppercase">Connection:</span>
            <span
              className={`font-mono font-bold flex items-center gap-1.5 ${
                socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"
              }`}
            >
              {socket.connected ? `CONNECTED (${socket.latencyMs ?? 0}ms)` : "DISCONNECTED"}
            </span>
          </div>
        </div>

        <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-4">
          <span>Cam Service: Port 8001/8002</span>
          <span>Ocean Explorer v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

function CameraCard({
  title,
  subtitle,
  streamUrl,
  cameraKey,
  lastResult,
  telemetry,
}: {
  title: string;
  subtitle: string;
  streamUrl?: string;
  cameraKey: "front" | "bottom";
  lastResult: any;
  telemetry: any;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const roll = telemetry?.roll ?? 0;
  const pitch = telemetry?.pitch ?? 0;

  return (
    <div className="panel overflow-hidden flex flex-col h-full bg-card/45 border border-panel-border/80 rounded-lg shadow-lg relative min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border/60 bg-panel/30 shrink-0">
        <div>
          <div className="text-sm font-semibold tracking-wide text-foreground">{title}</div>
          <div className="text-[10px] text-muted-foreground tracking-wider uppercase font-mono">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-[color:var(--color-success)] bg-[color:var(--color-success)]/10 border border-[color:var(--color-success)]/20 px-2 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-success)] animate-pulse" />
          LIVE FEED
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0 bg-black grid place-items-center overflow-hidden group">
        
        {/* HUD Grid Overlay Scanline */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%] pointer-events-none z-10 opacity-45" />

        {/* HUD Crosshair lines */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* HUD corners */}
          <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-accent/40" />
          <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-accent/40" />
          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-accent/40" />
          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-accent/40" />
          
          {/* Centering crosshairs */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="w-8 h-px bg-accent/30" />
            <div className="h-8 w-px bg-accent/30 absolute" />
            <div className="absolute w-6 h-6 rounded-full border border-accent/25 pointer-events-none" />
          </div>

          {/* Subsea pitch visual bars */}
          <div className="absolute right-6 top-1/4 bottom-1/4 w-4 flex flex-col justify-between font-mono text-[8px] text-accent/50 text-right">
            <div style={{ transform: `translateY(${-pitch * 0.5}px)` }} className="transition-transform duration-100 flex flex-col gap-8 items-end">
              <span className="flex items-center gap-1">+30 <span className="w-1.5 h-px bg-accent/40" /></span>
              <span className="flex items-center gap-1">+15 <span className="w-1.5 h-px bg-accent/40" /></span>
              <span className="flex items-center gap-1">00 <span className="w-3 h-px bg-accent/60" /></span>
              <span className="flex items-center gap-1">-15 <span className="w-1.5 h-px bg-accent/40" /></span>
              <span className="flex items-center gap-1">-30 <span className="w-1.5 h-px bg-accent/40" /></span>
            </div>
          </div>
        </div>

        {/* Actual Image Stream */}
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
          <div className="text-muted-foreground/30 text-xs tracking-widest font-mono uppercase z-10 flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-dashed border-muted-foreground/30 border-t-transparent rounded-full animate-spin" />
            WAITING FOR SIGNAL
          </div>
        )}

        {/* HUD pitch indicator text */}
        <div className="absolute bottom-4 left-4 font-mono text-[9px] text-accent/80 bg-black/60 px-2 py-0.5 border border-accent/20 rounded z-10 flex flex-col gap-0.5">
          <span>PITCH: {pitch.toFixed(1)}°</span>
          <span>ROLL: {roll.toFixed(1)}°</span>
        </div>

        {isRecording && (
          <div className="absolute top-4 left-4 font-mono text-[9px] text-red-500 bg-black/75 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1.5 z-10 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            REC ACTIVE
          </div>
        )}

        {statusMessage && (
          <div className="absolute top-4 right-4 font-mono text-[9px] text-accent bg-black/85 border border-accent/30 px-2 py-0.5 rounded z-20 shadow-lg animate-bounce">
            {statusMessage}
          </div>
        )}

        {/* Control Buttons Overlay */}
        <div className="absolute bottom-4 right-4 flex gap-1.5 z-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="w-8 h-8 grid place-items-center rounded bg-black/70 border border-panel-border/80 hover:border-accent hover:bg-accent hover:text-black hover:cursor-pointer text-white/80 transition-all shadow-md active:scale-95"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={handleScreenshot}
            title="Take Screenshot"
            className="w-8 h-8 grid place-items-center rounded bg-black/70 border border-panel-border/80 hover:border-accent hover:bg-accent hover:text-black hover:cursor-pointer text-white/80 transition-all shadow-md active:scale-95"
          >
            <ImageIcon size={12} />
          </button>
          <button
            onClick={handleToggleRecord}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            className={`w-8 h-8 grid place-items-center rounded bg-black/70 border hover:border-accent hover:bg-accent hover:text-black hover:cursor-pointer text-white/80 transition-all shadow-md active:scale-95 ${
              isRecording ? "border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white" : "border-panel-border/80"
            }`}
          >
            <Video size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
