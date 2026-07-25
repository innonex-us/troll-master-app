import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import { OverviewPage } from "./pages/OverviewPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { PodsPage } from "./pages/PodsPage";
import { ProxiesPage } from "./pages/ProxiesPage";
import { MonitorPage } from "./pages/MonitorPage";
import { ToolsPage } from "./pages/ToolsPage";
import { PublisherPage } from "./pages/PublisherPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { LogsPage } from "./pages/LogsPage";
import { BlacklistPage } from "./pages/BlacklistPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { LockScreen } from "./pages/LockScreen";
import { UpdateChecker } from "./components/UpdateChecker";
import { getTheme, setTheme, type Theme } from "./theme";

type Tab =
  | "overview"
  | "profiles"
  | "campaigns"
  | "pods"
  | "proxies"
  | "monitor"
  | "tools"
  | "publisher"
  | "analytics"
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
  { id: "tools", label: "Tools", icon: "⚒" },
  { id: "publisher", label: "Publisher", icon: "◲" },
  { id: "analytics", label: "Analytics", icon: "▤" },
  { id: "blacklist", label: "Blacklist", icon: "⊘" },
  { id: "logs", label: "Logs", icon: "≡" },
  { id: "changelog", label: "Changelog", icon: "↻" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unlocked, setUnlocked] = useState(false);
  const [version, setVersion] = useState("");
  const [theme, setThemeState] = useState<Theme>(getTheme());

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function chooseTheme(t: Theme) {
    setTheme(t);
    setThemeState(t);
  }

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="shell">
      <UpdateChecker />
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          TROLL MASTER
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
        <div className="sidebar-footer">
          <div className="theme-toggle">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? "active" : ""}
                onClick={() => chooseTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {version ? `v${version}` : ""} · local engine
        </div>
      </aside>

      <main className="content">
        {tab === "overview" && <OverviewPage />}
        {tab === "profiles" && <ProfilesPage />}
        {tab === "campaigns" && <CampaignsPage />}
        {tab === "pods" && <PodsPage />}
        {tab === "proxies" && <ProxiesPage />}
        {tab === "monitor" && <MonitorPage />}
        {tab === "tools" && <ToolsPage />}
        {tab === "publisher" && <PublisherPage />}
        {tab === "analytics" && <AnalyticsPage />}
        {tab === "blacklist" && <BlacklistPage />}
        {tab === "logs" && <LogsPage />}
        {tab === "changelog" && <ChangelogPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
