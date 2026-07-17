import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

export interface TelemetryState {
  roll: number;
  pitch: number;
  yaw: number;
  depth: number;
  battery_voltage: number;
  battery_current: number;
  battery_remaining: number;
  armed: boolean;
  mode: string;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  last_update: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  depth: number;
  yaw: number;
  timestamp: number;
}

export interface TrajectoryState {
  current_pos: {
    x: number;
    y: number;
    depth: number;
  };
  orientation: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  path: TrajectoryPoint[];
  timestamp: number;
}

export interface QRStatus {
  data: string;
  aligned: boolean;
  timestamp?: number;
}

export interface CameraResult {
  camera: "front" | "bottom";
  action: "screenshot" | "record_start" | "record_stop";
  status: "ok" | "error";
  filename?: string;
  filepath?: string;
}

export interface AutonomousStatus {
  state: string;
  target_id: string;
  elapsed_s: number;
  is_active: boolean;
  waypoint_index?: number;
  waypoint_total?: number;
}

export interface FailsafeSubsystem {
  ok: boolean;
  severity: string;
  message: string;
  recovery_attempts: number;
  fault_since: number | null;
}

export interface FailsafeStatus {
  emergency_active: boolean;
  emergency_reason: string;
  subsystems: Record<string, FailsafeSubsystem>;
  event_count: number;
  timestamp: string;
}

export interface ROVSocketState {
  connected: boolean;
  mavlinkConnected: boolean;
  latencyMs: number | null;
  telemetry: TelemetryState | null;
  trajectory: TrajectoryState | null;
  qrStatus: QRStatus | null;
  dockAligned: boolean;
  lastCameraResult: CameraResult | null;
  autonomousStatus: AutonomousStatus | null;
  failsafeStatus: FailsafeStatus | null;
}

export function useROVSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ROVSocketState>({
    connected: false,
    mavlinkConnected: false,
    latencyMs: null,
    telemetry: null,
    trajectory: null,
    qrStatus: null,
    dockAligned: false,
    lastCameraResult: null,
    autonomousStatus: null,
    failsafeStatus: null,
  });

  useEffect(() => {
    const socket = io(ROV_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState(s => ({ ...s, connected: true }));
    });

    socket.on("disconnect", () => {
      setState(s => ({
        ...s,
        connected: false,
        dockAligned: false,
        autonomousStatus: null,
        failsafeStatus: null,
      }));
    });

    socket.on("mavlink_status", (data: { connected: boolean }) => {
      setState(s => ({ ...s, mavlinkConnected: data.connected }));
    });

    socket.on("telemetry_update", (data: TelemetryState) => {
      setState(s => ({ ...s, telemetry: data }));
    });

    socket.on("trajectory_update", (data: TrajectoryState) => {
      setState(s => ({ ...s, trajectory: data }));
    });

    socket.on("qr_detected", (data: QRStatus) => {
      setState(s => ({ ...s, qrStatus: data }));
    });

    socket.on("dock_aligned", () => {
      setState(s => ({ ...s, dockAligned: true }));
    });

    socket.on("dock_lost", () => {
      setState(s => ({ ...s, dockAligned: false }));
    });

    socket.on("camera_result", (data: CameraResult) => {
      setState(s => ({ ...s, lastCameraResult: data }));
    });

    socket.on("autonomous_status", (data: AutonomousStatus) => {
      setState(s => ({ ...s, autonomousStatus: data }));
    });

    socket.on("failsafe_status", (data: FailsafeStatus) => {
      setState(s => ({ ...s, failsafeStatus: data }));
    });

    socket.on("emergency_stop", (data: { message: string }) => {
      setState(s => ({
        ...s,
        failsafeStatus: s.failsafeStatus
          ? {
              ...s.failsafeStatus,
              emergency_active: true,
              emergency_reason: data.message || "Emergency Stop",
            }
          : {
              emergency_active: true,
              emergency_reason: data.message || "Emergency Stop",
              subsystems: {},
              event_count: 0,
              timestamp: new Date().toISOString(),
            },
      }));
    });

    // Latency Ping-Pong
    const pingInterval = setInterval(() => {
      socket.emit("ping_rov", { sent_at: Date.now() });
    }, 2000);

    socket.on("pong_rov", (data: { echo: { sent_at: number } }) => {
      if (data?.echo?.sent_at) {
        setState(s => ({ ...s, latencyMs: Date.now() - data.echo.sent_at }));
      }
    });

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
    };
  }, []);

  const sendEmergencyStop = () => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_emergency_stop", { reason: "Operator E-Stop" });
    }
  };

  const sendClearEmergency = () => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_clear_emergency");
    }
  };

  const sendArm = () => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_arm");
    }
  };

  const sendDisarm = () => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_disarm");
    }
  };

  const sendSetMode = (mode: string) => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_set_mode", { mode });
    }
  };

  const sendGripper = (action: "open" | "close") => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_gripper", { action });
    }
  };

  const sendLight = (state: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_light", { state });
    }
  };

  const sendAutonomousStart = (targetId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_autonomous_start", { target_id: targetId });
    }
  };

  const sendAutonomousStop = () => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_autonomous_stop", { reason: "operator_abort" });
    }
  };

  const sendRCOverride = (channels: Record<number, number>) => {
    if (socketRef.current) {
      socketRef.current.emit("cmd_rc_override", { channels });
    }
  };

  return {
    ...state,
    sendEmergencyStop,
    sendClearEmergency,
    sendArm,
    sendDisarm,
    sendSetMode,
    sendGripper,
    sendLight,
    sendAutonomousStart,
    sendAutonomousStop,
    sendRCOverride,
  };
}
