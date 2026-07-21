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
      className={`shrink-0 border-r border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] transition-all duration-300 flex flex-col justify-between relative ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div className="flex flex-col min-h-0">
        {/* Sidebar Header */}
        <div className="min-h-12 border-b border-[color:var(--hairline)] flex items-center px-4 py-2.5 gap-2.5 shrink-0">
          <div className="relative w-8 h-8 rounded-lg bg-[color:var(--surface)] border border-[color:var(--hairline)] flex items-center justify-center shrink-0">
            <img src={poliwangiLogo} alt="Poliwangi" className="w-6 h-6 object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 animate-fade-in">
              <span className="font-bold text-xs tracking-wide uppercase text-[color:var(--ink)] leading-none truncate">
                ROV Dashboard
              </span>
              <span className="text-[10px] text-[color:var(--mute)] tracking-wide mt-1 leading-snug">
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
                    ? "bg-[color:var(--surface-card)] text-white border border-[color:var(--hairline-strong)]"
                    : "text-[color:var(--body)] hover:bg-[color:var(--surface-card)]/60 hover:text-white border border-transparent"
                }`}
              >
                <Icon size={16} className={`shrink-0 transition-transform group-hover:scale-105 ${isActive ? "text-[color:var(--accent-blue)]" : ""}`} />
                {!collapsed && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold leading-none">{item.label}</span>
                    <span className="text-[10px] text-[color:var(--mute)] mt-1 truncate leading-none">
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
      <div className="p-2.5 border-t border-[color:var(--hairline)] flex flex-col gap-2 bg-[color:var(--surface)]">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[11px] text-[color:var(--mute)] px-1 py-0.5">
            <Anchor size={11} className="text-[color:var(--accent-blue)]" />
            <span className="truncate leading-none">Vessel Online</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full h-8 flex items-center justify-center rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-card)] hover:bg-white hover:text-black hover:border-white text-[color:var(--mute)] hover:cursor-pointer transition-colors"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
