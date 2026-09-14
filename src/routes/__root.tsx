import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import faviconIco from "../assets/icon/favicon.ico?url";
import favicon32 from "../assets/icon/favicon-32x32.png?url";
import favicon16 from "../assets/icon/favicon-16x16.png?url";
import appleTouchIcon from "../assets/icon/apple-touch-icon.png?url";
import manifestUrl from "../assets/icon/site.webmanifest?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Sidebar } from "../components/Sidebar";
import { GlobalGamepadController } from "../components/GlobalGamepadController";
import { TopBar } from "../components/TopBar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-4 text-muted-foreground">Page not found</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-accent-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-accent px-4 py-2 text-accent-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ROV Dashboard — POLIWANGI HYDROMODELLING CLUB 4" },
      {
        name: "description",
        content:
          "ROV monitoring & control dashboard — POLIWANGI HYDROMODELLING CLUB 4, Politeknik Negeri Banyuwangi (KKI 2026).",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: faviconIco },
      { rel: "icon", type: "image/png", sizes: "32x32", href: favicon32 },
      { rel: "icon", type: "image/png", sizes: "16x16", href: favicon16 },
      { rel: "apple-touch-icon", sizes: "180x180", href: appleTouchIcon },
      { rel: "manifest", href: manifestUrl },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalGamepadController />
      <div className="h-screen w-screen overflow-hidden bg-background">
        {/* Kepadatan tampilan yang disetujui (setara browser zoom 75%), dipermanenkan
            via transform:scale (bukan properti `zoom` non-standar yang sempat bikin
            status bar meluber) — width/height 133.33% mengompensasi scale 0.75 supaya
            tetap mengisi penuh layar. */}
        <div
          className="origin-top-left"
          style={{ transform: "scale(0.75)", width: "133.3333%", height: "133.3333%" }}
        >
          <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
              <TopBar />
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
