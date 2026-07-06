import { useEffect, useState } from "react";

const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

export interface StreamConfig {
  stream_url: string;
  webrtc_url: string;
  health_url: string;
}

export interface CameraStreams {
  front: StreamConfig;
  bottom: StreamConfig;
}

export function useCameraStream() {
  const [streams, setStreams] = useState<CameraStreams | null>(null);

  useEffect(() => {
    let host = "localhost";
    try {
      host = new URL(ROV_URL).hostname;
    } catch (e) {
      console.error("Invalid VITE_ROV_URL:", e);
    }

    fetch(`${ROV_URL}/api/streams`)
      .then((r) => {
        if (!r.ok) throw new Error("Gagal mengambil stream config");
        return r.json();
      })
      .then((d: CameraStreams) => {
        const fixUrl = (url: string) => {
          try {
            const u = new URL(url);
            if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
              u.hostname = host;
            }
            return u.toString();
          } catch {
            return url;
          }
        };

        setStreams({
          front: {
            stream_url: fixUrl(d.front.stream_url),
            webrtc_url: fixUrl(d.front.webrtc_url),
            health_url: fixUrl(d.front.health_url),
          },
          bottom: {
            stream_url: fixUrl(d.bottom.stream_url),
            webrtc_url: fixUrl(d.bottom.webrtc_url),
            health_url: fixUrl(d.bottom.health_url),
          },
        });
      })
      .catch(() => {
        // Fallback jika API gagal
        const frontBase = ROV_URL.replace(":8000", ":8001");
        const bottomBase = ROV_URL.replace(":8000", ":8002");
        setStreams({
          front: {
            stream_url: `${frontBase}/stream`,
            webrtc_url: `${frontBase}/offer`,
            health_url: `${frontBase}/health`,
          },
          bottom: {
            stream_url: `${bottomBase}/stream`,
            webrtc_url: `${bottomBase}/offer`,
            health_url: `${bottomBase}/health`,
          },
        });
      });
  }, []);

  return streams;
}
