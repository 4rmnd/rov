import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutDashboard, Video, Compass, Sliders, ChevronLeft, ChevronRight } from "lucide-react";
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
        {/* Sidebar Header & Integrated Toggle */}
        <div
          onClick={() => setCollapsed(!collapsed)}
          className={`h-12 border-b border-[color:var(--hairline)] flex items-center shrink-0 cursor-pointer group/header hover:bg-[color:var(--surface-card)]/50 transition-colors select-none ${
            collapsed ? "justify-center px-0" : "px-3.5 justify-between"
          }`}
          title={collapsed ? "Klik untuk Expand Sidebar" : "Klik untuk Collapse Sidebar"}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Logo Box with Hover Icon Morph */}
            <div className="relative w-8 h-8 rounded-lg bg-[color:var(--surface)] border border-[color:var(--hairline)] flex items-center justify-center shrink-0 overflow-hidden group-hover/header:border-[color:var(--hairline-strong)] transition-all shadow-sm">
              {/* Poliwangi Logo */}
              <img
                src={poliwangiLogo}
                alt="Poliwangi"
                className="w-6 h-6 object-contain transition-all duration-200 group-hover/header:opacity-0 group-hover/header:scale-75"
              />

              {/* Hover Morph Toggle Icon */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/header:opacity-100 transition-all duration-200 text-cyan-400 bg-slate-900/90 font-bold">
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </div>
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
        </div>

        {/* Menu Navigation */}
        <nav className={`py-2.5 flex-1 overflow-y-auto ${collapsed ? "px-1.5 space-y-1.5" : "px-2.5 space-y-1"}`}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-lg transition-all group ${
                  collapsed ? "justify-center h-10 w-full px-0" : "gap-2.5 px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-[color:var(--surface-card)] text-white border border-[color:var(--hairline-strong)]"
                    : "text-[color:var(--body)] hover:bg-[color:var(--surface-card)]/60 hover:text-white border border-transparent"
                }`}
              >
                <Icon
                  size={18}
                  className={`shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? "text-[color:var(--accent-blue)]" : ""
                  }`}
                />
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
    </aside>
  );
}
