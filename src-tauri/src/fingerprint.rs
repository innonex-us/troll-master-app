use rand::seq::SliceRandom;
use rand::Rng;

pub struct Fingerprint {
    pub user_agent: String,
    pub os_platform: String,
    pub timezone: String,
    pub locale: String,
    pub nav_languages: String,
    pub viewport_width: i64,
    pub viewport_height: i64,
    pub hardware_concurrency: i64,
    pub device_memory: i64,
    pub webgl_vendor: String,
    pub webgl_renderer: String,
    pub canvas_seed: String,
}

/// A UA paired with the `navigator.platform` and WebGL vendor/renderer strings a
/// real machine running that OS would report. These must stay correlated —
/// serving a Windows UA next to a "Google Inc. (Apple)" WebGL vendor, or any
/// non-Chrome UA at all (this app only ever launches Chromium), is itself a
/// mismatch that fingerprinting scripts check for.
struct DeviceProfile {
    user_agent: &'static str,
    os_platform: &'static str,
    webgl_vendor: &'static str,
    webgl_renderer: &'static str,
}

const DEVICE_PROFILES: &[DeviceProfile] = &[
    DeviceProfile {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        os_platform: "Win32",
        webgl_vendor: "Google Inc. (Intel)",
        webgl_renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    DeviceProfile {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        os_platform: "Win32",
        webgl_vendor: "Google Inc. (NVIDIA)",
        webgl_renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    DeviceProfile {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        os_platform: "Win32",
        webgl_vendor: "Google Inc. (AMD)",
        webgl_renderer: "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    DeviceProfile {
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        os_platform: "MacIntel",
        webgl_vendor: "Google Inc. (Apple)",
        webgl_renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)",
    },
    DeviceProfile {
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        os_platform: "MacIntel",
        webgl_vendor: "Google Inc. (Apple)",
        webgl_renderer: "ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)",
    },
    DeviceProfile {
        user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        os_platform: "Linux x86_64",
        webgl_vendor: "Google Inc. (Mesa)",
        webgl_renderer: "Mesa Intel(R) UHD Graphics (CML GT2)",
    },
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

// Chrome buckets `navigator.deviceMemory` to a power of two and caps it at 8
// regardless of real RAM — reporting anything else is itself a tell.
const DEVICE_MEMORY: &[i64] = &[4, 8];
const HARDWARE_CONCURRENCY: &[i64] = &[4, 6, 8, 12, 16];

pub fn languages_json(locale: &str) -> String {
    match locale {
        "en-GB" => r#"["en-GB","en"]"#,
        "en-CA" => r#"["en-CA","en"]"#,
        "en-AU" => r#"["en-AU","en"]"#,
        _ => r#"["en-US","en"]"#,
    }
    .to_string()
}

fn generate_canvas_seed(rng: &mut impl Rng) -> String {
    (0..16).map(|_| format!("{:x}", rng.gen_range(0..16))).collect()
}

pub fn random_canvas_seed() -> String {
    generate_canvas_seed(&mut rand::thread_rng())
}

pub fn random_hardware() -> (i64, i64) {
    let mut rng = rand::thread_rng();
    (
        *HARDWARE_CONCURRENCY.choose(&mut rng).unwrap(),
        *DEVICE_MEMORY.choose(&mut rng).unwrap(),
    )
}

/// Derives `navigator.platform` and a matching WebGL vendor/renderer pair from an
/// *existing* stored user agent, for backfilling profiles created before these
/// fields existed — so a pre-existing Mac/Linux profile doesn't suddenly start
/// reporting `Win32`.
pub fn infer_os_and_gpu(user_agent: &str) -> (String, String, String) {
    if user_agent.contains("Macintosh") {
        (
            "MacIntel".to_string(),
            "Google Inc. (Apple)".to_string(),
            "ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)".to_string(),
        )
    } else if user_agent.contains("X11; Linux") {
        (
            "Linux x86_64".to_string(),
            "Google Inc. (Mesa)".to_string(),
            "Mesa Intel(R) UHD Graphics (CML GT2)".to_string(),
        )
    } else {
        (
            "Win32".to_string(),
            "Google Inc. (Intel)".to_string(),
            "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)".to_string(),
        )
    }
}

/// A synthetic per-profile device identifier, IMEI-shaped (15 digits) for
/// familiarity. This is browser automation, not a mobile app — there's no real
/// device behind it — so this exists purely so profiles can be organized/labeled
/// as distinct "devices" in the UI, the same way Jarvee lets you tag accounts by device.
pub fn generate_device_id() -> String {
    let mut rng = rand::thread_rng();
    (0..15).map(|_| rng.gen_range(0..10).to_string()).collect()
}

const DEVICE_NAMES: &[&str] = &[
    "Pixel 8", "Pixel 7 Pro", "Galaxy S23", "Galaxy S22 Ultra", "iPhone 14 Pro",
    "iPhone 13", "OnePlus 11", "Xiaomi 13", "MacBook Pro", "MacBook Air",
    "Windows Desktop", "Surface Laptop",
];

/// A cosmetic device label auto-assigned when a profile is created without one —
/// same "not a real device" caveat as `generate_device_id`.
pub fn generate_device_name() -> String {
    let mut rng = rand::thread_rng();
    DEVICE_NAMES.choose(&mut rng).unwrap().to_string()
}

pub fn generate() -> Fingerprint {
    let mut rng = rand::thread_rng();
    let device = DEVICE_PROFILES.choose(&mut rng).unwrap();
    let timezone = TIMEZONES.choose(&mut rng).unwrap().to_string();
    let locale = LOCALES.choose(&mut rng).unwrap().to_string();
    let nav_languages = languages_json(&locale);
    let (viewport_width, viewport_height) = *VIEWPORTS.choose(&mut rng).unwrap();
    // small jitter so identical viewport picks aren't pixel-identical across profiles
    let jitter: i64 = rng.gen_range(-4..4);
    let hardware_concurrency = *HARDWARE_CONCURRENCY.choose(&mut rng).unwrap();
    let device_memory = *DEVICE_MEMORY.choose(&mut rng).unwrap();
    let canvas_seed = generate_canvas_seed(&mut rng);

    Fingerprint {
        user_agent: device.user_agent.to_string(),
        os_platform: device.os_platform.to_string(),
        timezone,
        locale,
        nav_languages,
        viewport_width: viewport_width + jitter,
        viewport_height: viewport_height + jitter,
        hardware_concurrency,
        device_memory,
        webgl_vendor: device.webgl_vendor.to_string(),
        webgl_renderer: device.webgl_renderer.to_string(),
        canvas_seed,
    }
}
