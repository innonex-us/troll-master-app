import type { Locator, Page } from "playwright";

// Lightweight anti-detection behavior: makes automated sessions look less
// mechanical by adding jittered pauses, idle scrolling, mouse drift, and
// per-character typing. All best-effort and wrapped so they never throw into
// the caller — humanization must never break the underlying action.

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

/** A randomized "think time" pause. */
export async function humanPause(page: Page, min = 600, max = 2200): Promise<void> {
  await page.waitForTimeout(rand(min, max)).catch(() => {});
}

/** A couple of small mouse moves so pointer position isn't static. */
export async function humanMouse(page: Page): Promise<void> {
  try {
    const size = page.viewportSize() ?? { width: 1280, height: 800 };
    for (let i = 0; i < rand(1, 3); i++) {
      await page.mouse.move(rand(40, size.width - 40), rand(60, size.height - 60), { steps: rand(4, 12) });
      await page.waitForTimeout(rand(120, 400));
    }
  } catch {
    /* ignore */
  }
}

/** A short idle scroll down and partway back, like a human skimming. */
export async function humanScroll(page: Page): Promise<void> {
  try {
    for (let i = 0; i < rand(1, 3); i++) {
      await page.mouse.wheel(0, rand(200, 700));
      await page.waitForTimeout(rand(300, 900));
    }
    await page.mouse.wheel(0, -rand(100, 300));
    await page.waitForTimeout(rand(200, 500));
  } catch {
    /* ignore */
  }
}

/** Pre-action idle: a bit of scroll + mouse drift + a think pause. Call after the
 * page has loaded, before performing the real action. */
export async function preActionIdle(page: Page): Promise<void> {
  await humanScroll(page);
  await humanMouse(page);
  await humanPause(page);
}

/** Types text word-by-word with per-character delay and occasional longer pauses
 * (between words), instead of pasting it all at once via fill(). Focuses the
 * target first. Falls back to fill() if sequential typing throws. */
export async function humanType(locator: Locator, text: string): Promise<void> {
  try {
    await locator.click();
    const words = text.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunk = i < words.length - 1 ? `${words[i]} ` : words[i];
      await locator.pressSequentially(chunk, { delay: rand(45, 150) });
      if (Math.random() < 0.15) {
        await locator.page().waitForTimeout(rand(250, 800));
      }
    }
  } catch {
    await locator.fill(text).catch(() => {});
  }
}
