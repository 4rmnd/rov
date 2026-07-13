import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Video, ImageIcon, Maximize2, Minimize2, Wifi, Radio, Power, ScanLine } from "lucide-react";
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
            <div className="text-[10px] text-red-400 uppercase tracking-widest mb-1 font-bold">Watchdog Event Reason</div>
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
      {/* Top Bar */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 flex items-center justify-between bg-[color:var(--color-sidebar)] gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="label-caps">Team</span>
          <span className="font-mono font-semibold">{socket.connected ? "Ocean Explorer" : "Offline Mode"}</span>
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

      {/* Main Layout: cameras side-by-side on left, QR panel on right */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Left: Camera 1 & Camera 2 stacked on mobile, side-by-side on large screens */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2.5">
          {/* Camera 1 (Front Cam) */}
          <div className="flex-1 min-h-[260px] lg:min-h-0 h-full">
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
          <div className="flex-1 min-h-[260px] lg:min-h-0 h-full">
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
        <div className="panel flex flex-col w-full lg:w-[300px] shrink-0 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="flex flex-col gap-2.5 min-h-0 flex-1">
            {/* Title block */}
            <div className="flex items-center justify-between border-b border-panel-border/60 pb-2 shrink-0">
              <span className="label-caps">QR Target Analyzer</span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                  socket.qrStatus?.data
                    ? "bg-yellow-500/15 text-yellow-400"
                    : "bg-panel-border/30 text-muted-foreground"
                }`}
              >
                {socket.qrStatus?.data ? "TARGET LOCKED" : "NO TARGET"}
              </span>
            </div>

            {/* Target visual scan block */}
            <div className="flex flex-col items-center gap-2.5 bg-[oklch(0.15_0.028_250)] p-2.5 rounded-lg border border-panel-border/60 shrink-0">
              <div className="w-20 h-20 bg-white p-1 rounded-lg overflow-hidden">
                <img
                  src={qrCodeImage}
                  alt="Target QR"
                  className="w-full h-full object-cover opacity-85"
                />
              </div>

              <div className="w-full space-y-1.5 text-xs">
                <div className="flex justify-between items-center border-b border-panel-border/20 pb-1.5">
                  <span className="label-caps">Target Side</span>
                  <span className="text-[color:var(--color-data)] font-bold font-mono">{qrSide}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="label-caps">Dock Alignment</span>
                  <span
                    className={`font-bold flex items-center gap-1.5 ${
                      qrValid ? "text-[color:var(--color-success)]" : "text-yellow-500"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${qrValid ? "bg-[color:var(--color-success)]" : "bg-yellow-500"}`} />
                    {qrValid ? "Valid" : socket.qrStatus?.data ? "Centering" : "Not detected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Detection History logs */}
            <div className="flex-1 flex flex-col min-h-0 mt-1 overflow-hidden">
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                  Realtime Detections
                </span>
                {qrHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[10px] font-mono border border-panel-border px-2 py-0.5 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                {qrHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
                    <ScanLine size={22} className="text-muted-foreground/30" />
                    <div className="text-muted-foreground/50 italic">No scanning data logged</div>
                    <div className="text-muted-foreground/30 text-[10px] not-italic">
                      Detections will appear here once a QR code is scanned
                    </div>
                  </div>
                ) : (
                  qrHistory
                    .slice()
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-panel/40 border border-panel-border/40 rounded-md px-2 py-1.5"
                      >
                        <span className="text-accent font-semibold truncate max-w-[110px]">{item.data}</span>
                        <div className="flex items-center gap-2">
                          <span className={item.aligned ? "text-green-400" : "text-yellow-400"}>
                            {item.aligned ? "Aligned" : "Detect"}
                          </span>
                          <span className="text-muted-foreground/60">
                            {item.received_at ? new Date(item.received_at).toLocaleTimeString("en-GB") : ""}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-10 shrink-0 border-t border-panel-border px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <Radio size={12} className="text-accent" />
            <span className="label-caps">Mode</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-3.5 w-px bg-panel-border/60" />
          <div className="flex items-center gap-1.5">
            <Wifi size={12} className={socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"} />
            <span className="label-caps">Connection</span>
            <span
              className={`font-mono font-bold ${
                socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"
              }`}
            >
              {socket.connected ? `CONNECTED (${socket.latencyMs ?? 0}ms)` : "DISCONNECTED"}
            </span>
          </div>
        </div>

        <div className="font-mono text-[11px] text-muted-foreground hidden md:flex items-center gap-4">
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
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    setStreamError(false);
  }, [streamUrl]);

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
    <div className="panel overflow-hidden flex flex-col h-full min-w-0 min-h-[260px] lg:min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border shrink-0">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground tracking-wide">{subtitle.toUpperCase()}</div>
        </div>
        {streamUrl && !streamError ? (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--color-success)]">
            <span className="w-2 h-2 rounded-full bg-[color:var(--color-success)]" style={{ animation: "pulse-live 1.4s infinite" }} />
            LIVE
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            NO SIGNAL
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0 bg-black grid place-items-center group">
        {streamUrl && !streamError ? (
          <img
            src={streamUrl}
            alt={title}
            className="w-full h-full"
            style={{ objectFit: "contain" }}
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="text-muted-foreground/40 text-xs tracking-widest">NO CAMERA FEED</div>
        )}

        {/* Attitude readout — real telemetry, not decorative */}
        <div className="absolute bottom-2.5 left-2.5 font-mono text-[10px] text-muted-foreground bg-black/60 px-2 py-1 rounded flex items-center gap-2">
          <span>PITCH {pitch.toFixed(1)}°</span>
          <span>ROLL {roll.toFixed(1)}°</span>
        </div>

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

        <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 z-30">
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="w-8 h-8 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={handleScreenshot}
            title="Take Screenshot"
            className="w-8 h-8 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors cursor-pointer"
          >
            <ImageIcon size={14} />
          </button>
          <button
            onClick={handleToggleRecord}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            className={`w-8 h-8 grid place-items-center rounded-md bg-black/50 hover:bg-accent hover:text-[color:var(--color-accent-foreground)] text-white/80 transition-colors cursor-pointer ${isRecording ? "text-red-500" : ""}`}
          >
            <Video size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
