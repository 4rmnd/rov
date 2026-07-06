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

export interface ROVSocketState {
  connected: boolean;
  mavlinkConnected: boolean;
  latencyMs: number | null;
  telemetry: TelemetryState | null;
  trajectory: TrajectoryState | null;
  qrStatus: QRStatus | null;
  dockAligned: boolean;
  lastCameraResult: CameraResult | null;
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
  });

  useEffect(() => {
    const socket = io(ROV_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState(s => ({ ...s, connected: true }));
    });

    socket.on("disconnect", () => {
      setState(s => ({ ...s, connected: false, dockAligned: false }));
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

  return {
    ...state,
    sendEmergencyStop,
    sendClearEmergency,
    sendArm,
    sendDisarm,
    sendSetMode,
    sendGripper,
    sendLight,
  };
}
