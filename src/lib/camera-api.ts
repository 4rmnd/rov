const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

export type CameraId = "front" | "bottom";
export type CameraAction = "screenshot" | "record_start" | "record_stop" | "vision_activate" | "vision_deactivate" | "qr_activate" | "qr_deactivate";

export async function sendCameraCommand(camera: CameraId, action: CameraAction) {
  let subPath = "";
  if (action === "screenshot") {
    subPath = "screenshot";
  } else if (action === "record_start") {
    subPath = "record/start";
  } else if (action === "record_stop") {
    subPath = "record/stop";
  } else if (action === "vision_activate") {
    subPath = "vision/activate";
  } else if (action === "vision_deactivate") {
    subPath = "vision/deactivate";
  } else if (action === "qr_activate") {
    subPath = "qr/activate";
  } else if (action === "qr_deactivate") {
    subPath = "qr/deactivate";
  }

  const res = await fetch(`${ROV_URL}/api/camera/${camera}/${subPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Camera command failed (${res.status}): ${JSON.stringify(err)}`);
  }

  return res.json();
}
