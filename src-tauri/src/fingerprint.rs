use rand::seq::SliceRandom;
use rand::Rng;

pub struct Fingerprint {
    pub user_agent: String,
    pub timezone: String,
    pub locale: String,
    pub viewport_width: i64,
    pub viewport_height: i64,
}

const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

const TIMEZONES: &[&str] = &[
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Dhaka",
    "Asia/Singapore",
    "Australia/Sydney",
];

const LOCALES: &[&str] = &["en-US", "en-GB", "en-CA", "en-AU"];

const VIEWPORTS: &[(i64, i64)] = &[
    (1366, 768),
    (1440, 900),
    (1536, 864),
    (1920, 1080),
    (1280, 800),
];

pub fn generate() -> Fingerprint {
    let mut rng = rand::thread_rng();
    let user_agent = USER_AGENTS.choose(&mut rng).unwrap().to_string();
    let timezone = TIMEZONES.choose(&mut rng).unwrap().to_string();
    let locale = LOCALES.choose(&mut rng).unwrap().to_string();
    let (viewport_width, viewport_height) = *VIEWPORTS.choose(&mut rng).unwrap();
    // small jitter so identical viewport picks aren't pixel-identical across profiles
    let jitter: i64 = rng.gen_range(-4..4);

    Fingerprint {
        user_agent,
        timezone,
        locale,
        viewport_width: viewport_width + jitter,
        viewport_height: viewport_height + jitter,
    }
}
