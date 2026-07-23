import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import { OverviewPage } from "./pages/OverviewPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { PodsPage } from "./pages/PodsPage";
import { ProxiesPage } from "./pages/ProxiesPage";
import { MonitorPage } from "./pages/MonitorPage";
import { LogsPage } from "./pages/LogsPage";
import { BlacklistPage } from "./pages/BlacklistPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { LockScreen } from "./pages/LockScreen";
import { UpdateChecker } from "./components/UpdateChecker";

type Tab =
  | "overview"
  | "profiles"
  | "campaigns"
  | "pods"
  | "proxies"
  | "monitor"
  | "blacklist"
  | "logs"
  | "settings"
  | "changelog";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◆" },
  { id: "profiles", label: "Profiles", icon: "▣" },
  { id: "campaigns", label: "Campaigns", icon: "▶" },
  { id: "pods", label: "Pods", icon: "⬡" },
  { id: "proxies", label: "Proxies", icon: "◈" },
  { id: "monitor", label: "Monitor", icon: "◉" },
  { id: "blacklist", label: "Blacklist", icon: "⊘" },
  { id: "logs", label: "Logs", icon: "≡" },
  { id: "changelog", label: "Changelog", icon: "↻" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unlocked, setUnlocked] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="shell">
      <UpdateChecker />
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
        <div className="sidebar-footer">{version ? `v${version}` : ""} · local engine</div>
      </aside>

      <main className="content">
        {tab === "overview" && <OverviewPage />}
        {tab === "profiles" && <ProfilesPage />}
        {tab === "campaigns" && <CampaignsPage />}
        {tab === "pods" && <PodsPage />}
        {tab === "proxies" && <ProxiesPage />}
        {tab === "monitor" && <MonitorPage />}
        {tab === "blacklist" && <BlacklistPage />}
        {tab === "logs" && <LogsPage />}
        {tab === "changelog" && <ChangelogPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
