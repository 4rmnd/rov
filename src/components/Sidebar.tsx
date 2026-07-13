import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutDashboard, Video, Compass, Sliders, ChevronLeft, ChevronRight, Anchor } from "lucide-react";
import poliwangiLogo from "../assets/Logo Poliwangi HD.png";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const menuItems = [
    {
      to: "/",
      label: "Standard Dashboard",
      icon: LayoutDashboard,
      description: "Full telemetry & controls",
    },
    {
      to: "/vision",
      label: "Vision Center",
      icon: Video,
      description: "Dual feeds & QR status",
    },
    {
      to: "/navigation",
      label: "Navigation & Path",
      icon: Compass,
      description: "Map & Altitude ruler",
    },
    {
      to: "/control",
      label: "Attitude & Pilot",
      icon: Sliders,
      description: "Controls & 3D model",
    },
  ];

  return (
    <aside
      className={`shrink-0 border-r border-panel-border bg-[color:var(--color-sidebar)] transition-all duration-300 flex flex-col justify-between relative ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div className="flex flex-col min-h-0">
        {/* Sidebar Header */}
        <div className="min-h-12 border-b border-panel-border flex items-center px-4 py-2.5 gap-2.5 shrink-0">
          <div className="relative w-8 h-8 rounded-lg bg-panel border border-panel-border flex items-center justify-center shrink-0">
            <img src={poliwangiLogo} alt="Poliwangi" className="w-6 h-6 object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 animate-fade-in">
              <span className="font-bold text-xs tracking-wide uppercase text-foreground leading-none truncate">
                ROV Dashboard
              </span>
              <span className="text-[10px] text-muted-foreground tracking-wide mt-1 leading-snug">
                Politeknik Negeri Banyuwangi
              </span>
            </div>
          )}
        </div>

        {/* Menu Navigation */}
        <nav className="p-2.5 space-y-1 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all group ${
                  isActive
                    ? "bg-accent/15 text-accent border border-accent/25"
                    : "text-muted-foreground hover:bg-panel/40 hover:text-foreground border border-transparent"
                }`}
              >
                <Icon size={16} className={`shrink-0 transition-transform group-hover:scale-105 ${isActive ? "text-accent" : ""}`} />
                {!collapsed && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold leading-none">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-1 truncate leading-none">
                      {item.description}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Collapse Toggle */}
      <div className="p-2.5 border-t border-panel-border flex flex-col gap-2 bg-[oklch(0.11_0.025_250)]">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 px-1 py-0.5">
            <Anchor size={11} className="text-accent" />
            <span className="truncate leading-none">Vessel Online</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full h-8 flex items-center justify-center rounded-lg border border-panel-border bg-panel hover:bg-accent hover:text-[color:var(--color-accent-foreground)] hover:border-accent text-muted-foreground hover:cursor-pointer transition-colors"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
