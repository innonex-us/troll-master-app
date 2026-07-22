import { useState } from "react";
import "./App.css";
import { OverviewPage } from "./pages/OverviewPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { ProxiesPage } from "./pages/ProxiesPage";
import { LogsPage } from "./pages/LogsPage";

type Tab = "overview" | "profiles" | "proxies" | "logs";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◆" },
  { id: "profiles", label: "Profiles", icon: "▣" },
  { id: "proxies", label: "Proxies", icon: "◈" },
  { id: "logs", label: "Logs", icon: "≡" },
];

function App() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          JARVEE//AUTO
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">v0.1.0 · local engine</div>
      </aside>

      <main className="content">
        {tab === "overview" && <OverviewPage />}
        {tab === "profiles" && <ProfilesPage />}
        {tab === "proxies" && <ProxiesPage />}
        {tab === "logs" && <LogsPage />}
      </main>
    </div>
  );
}

export default App;
