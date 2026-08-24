import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  BarChart3,
  FileClock,
  FlaskConical,
  LayoutDashboard,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Failed payments", icon: Wallet },
  { to: "/agent", label: "What the agent did", icon: Activity },
  { to: "/analytics", label: "Does it work?", icon: BarChart3 },
  { to: "/audit", label: "Paper trail", icon: FileClock },
  { to: "/simulation", label: "Playground", icon: FlaskConical },
];

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[228px] flex-col border-r bg-card">
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <ShieldAlert className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[13.5px] font-semibold leading-none tracking-tight">RecoveryOS</p>
            <p className="mt-0.5 text-[10.5px] leading-none text-muted-foreground">Revenue Recovery</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t px-4 py-3">
          <Badge tone="warning" className="w-full justify-center">
            Synthetic Simulation — Demo Data
          </Badge>
        </div>
      </aside>

      <main className="ml-[228px] flex-1">
        <Outlet />
      </main>
    </div>
  );
}
