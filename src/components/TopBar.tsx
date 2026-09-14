import React, { useState, useEffect } from "react";
import { Power, ToggleLeft, Wifi, Activity, Radio } from "lucide-react";
import { useROVSocket } from "../hooks/useROVSocket";

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function StatusRow({
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

export function TopBar() {
  const socket = useROVSocket();
  const now = useClock();
  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour12: false });

  const failsafe = socket.failsafeStatus;
  const isEmergency = failsafe?.emergency_active;

  return (
    <>
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

      {/* Header + Status Bar */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 bg-[color:var(--color-sidebar)] flex items-center justify-between gap-3">
        <div className="flex items-center divide-x divide-panel-border shrink-0 overflow-x-auto no-scrollbar py-2">
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
            <span className="font-mono font-semibold">POLIWANGI HYDROMODELLING CLUB 4</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-right">
            <span className="text-muted-foreground text-[11px]">{dayName}, {date}</span>
            <span className="text-muted-foreground/40">•</span>
            <span className="font-bold text-foreground">{time}</span>
          </div>
        </div>

        <button
          onClick={socket.sendEmergencyStop}
          className="flex items-center gap-1.5 shrink-0 whitespace-nowrap bg-[color:var(--color-danger)] text-white font-bold px-3.5 py-1.5 rounded-lg text-[11px] tracking-wider hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Power size={12} className="shrink-0" /> EMERGENCY STOP
        </button>
      </header>
    </>
  );
}
