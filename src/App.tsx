import { useState } from "react";
import "./App.css";
import { OverviewPage } from "./pages/OverviewPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { ProxiesPage } from "./pages/ProxiesPage";
import { MonitorPage } from "./pages/MonitorPage";
import { LogsPage } from "./pages/LogsPage";
import { BlacklistPage } from "./pages/BlacklistPage";
import { LockScreen } from "./pages/LockScreen";

type Tab = "overview" | "profiles" | "campaigns" | "proxies" | "monitor" | "blacklist" | "logs";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◆" },
  { id: "profiles", label: "Profiles", icon: "▣" },
  { id: "campaigns", label: "Campaigns", icon: "▶" },
  { id: "proxies", label: "Proxies", icon: "◈" },
  { id: "monitor", label: "Monitor", icon: "◉" },
  { id: "blacklist", label: "Blacklist", icon: "⊘" },
  { id: "logs", label: "Logs", icon: "≡" },
];

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

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
        {tab === "campaigns" && <CampaignsPage />}
        {tab === "proxies" && <ProxiesPage />}
        {tab === "monitor" && <MonitorPage />}
        {tab === "blacklist" && <BlacklistPage />}
        {tab === "logs" && <LogsPage />}
      </main>
    </div>
  );
}

export default App;
