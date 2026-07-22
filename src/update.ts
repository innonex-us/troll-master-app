import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type { Update };

export async function checkForUpdate(): Promise<Update | null> {
  const update = await check();
  return update?.available ? update : null;
}

/** Downloads and installs the update, then relaunches the app. `onProgress` gets
 * 0-100 as bytes arrive (falls back to indeterminate if the server omits content-length). */
export async function installUpdate(update: Update, onProgress: (percent: number) => void): Promise<void> {
  let downloaded = 0;
  let total = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress(total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : -1);
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });

  await relaunch();
}
