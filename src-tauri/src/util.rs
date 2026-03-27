/// Strip ANSI escape sequences from a string.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_seq = false;
    for c in s.chars() {
        if in_seq {
            if c.is_ascii_alphabetic() {
                in_seq = false;
            }
        } else if c == '\x1b' {
            in_seq = true;
        } else {
            out.push(c);
        }
    }
    out
}

/// Try to extract the primary localhost URL from a dev-server log line.
///
/// Two-layer filtering based on how real dev servers print URLs:
///
///  Layer 1 – Line-level skip: reject entire lines that carry a non-primary
///  label (Vite "Debug:", Vite/Next "Network:", CRA "On Your Network:", etc.).
///
///  Layer 2 – Path-level skip: reject URLs whose path begins with `/__`
///  (Vite `/__debug`, Gatsby `/__graphql`, Vite `/__inspect`, etc.).
///
/// What passes through: the "Local:" line from Vite/Next/Nuxt/Astro/CRA,
/// bare URLs from Gatsby/Hugo, and "listening/running/available at" lines
/// from Express/Django/Flask/Rails/Laravel/Fastify/Elysia.
pub fn detect_url(line: &str) -> Option<String> {
    // ── Layer 1: skip lines that label a non-primary URL ──────────
    const SKIP_LINE: &[&str] = &[
        "Network:",        // Vite, Next.js, Nuxt, Astro, SvelteKit
        "On Your Network", // CRA / webpack-dev-server
        "Debug:",          // Vite debug panel
        "Inspect:",        // Vite inspect plugin
        "GraphiQL",        // Gatsby GraphiQL explorer
        "graphql",         // Gatsby ___graphql URL line
        "Debugger listening", // Node --inspect
        "Remote:",         // Some HMR/debug tools
    ];

    for skip in SKIP_LINE {
        if line.contains(skip) {
            return None;
        }
    }

    // ── Extract a localhost URL ───────────────────────────────────
    const HOST_PATTERNS: &[&str] = &[
        "http://localhost:",
        "http://127.0.0.1:",
        "http://0.0.0.0:",
        "https://localhost:",
    ];

    for pat in HOST_PATTERNS {
        if let Some(pos) = line.find(pat) {
            let rest = &line[pos..];
            let end = rest
                .find(|c: char| {
                    c.is_whitespace()
                        || c == ','
                        || c == ')'
                        || c == ']'
                        || c == '"'
                        || c == '\''
                        || c == ';'
                        || c == '>'
                })
                .unwrap_or(rest.len());
            let url = rest[..end].trim_end_matches('/');
            if url.len() <= pat.len() {
                continue;
            }

            // ── Layer 2: skip URLs with internal/debug paths ─────
            // Catches /__debug, /___graphql, /__inspect, etc.
            if let Some(slash) = url[pat.len()..].find('/') {
                let path = &url[pat.len() + slash..];
                if path.starts_with("/__") {
                    continue;
                }
            }

            return Some(url.to_string());
        }
    }
    None
}

/// Detect the JS framework from package.json dependencies.
pub fn detect_framework(pkg: &serde_json::Value) -> Option<String> {
    let deps = pkg.get("dependencies").and_then(|v| v.as_object());
    let dev_deps = pkg.get("devDependencies").and_then(|v| v.as_object());

    let has = |name: &str| -> bool {
        deps.is_some_and(|d| d.contains_key(name))
            || dev_deps.is_some_and(|d| d.contains_key(name))
    };

    // Order matters — more specific frameworks first
    let frameworks: &[(&dyn Fn() -> bool, &str)] = &[
        (&|| has("next"), "Next.js"),
        (&|| has("nuxt") || has("nuxt3"), "Nuxt"),
        (&|| has("@angular/core"), "Angular"),
        (&|| has("svelte") || has("@sveltejs/kit"), "Svelte"),
        (&|| has("gatsby"), "Gatsby"),
        (&|| has("remix") || has("@remix-run/react"), "Remix"),
        (&|| has("astro"), "Astro"),
        (&|| has("solid-js"), "Solid"),
        (&|| has("qwik") || has("@builder.io/qwik"), "Qwik"),
        (&|| has("eleventy") || has("@11ty/eleventy"), "11ty"),
        (&|| has("hono"), "Hono"),
        (&|| has("elysia"), "Elysia"),
        (&|| has("nest") || has("@nestjs/core"), "NestJS"),
        (&|| has("koa"), "Koa"),
        (&|| has("vite"), "Vite"),
        (&|| has("express"), "Express"),
        (&|| has("fastify"), "Fastify"),
        (&|| has("react-scripts"), "CRA"),
        (&|| has("react"), "React"),
        (&|| has("vue"), "Vue"),
    ];

    frameworks
        .iter()
        .find(|(check, _)| check())
        .map(|(_, name)| (*name).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Should detect (primary URLs) ─────────────────────────────

    #[test]
    fn vite_local() {
        let line = "  ➜  Local:   http://localhost:5173/";
        assert_eq!(detect_url(line), Some("http://localhost:5173".into()));
    }

    #[test]
    fn vinext_local() {
        let line = "  ➜  Local:   http://localhost:3000/";
        assert_eq!(detect_url(line), Some("http://localhost:3000".into()));
    }

    #[test]
    fn nextjs_local() {
        let line = "  - Local:        http://localhost:3000";
        assert_eq!(detect_url(line), Some("http://localhost:3000".into()));
    }

    #[test]
    fn cra_local() {
        let line = "  Local:            http://localhost:3000";
        assert_eq!(detect_url(line), Some("http://localhost:3000".into()));
    }

    #[test]
    fn angular_cli() {
        let line = "** Angular Live Development Server is listening on localhost:4200, open your browser on http://localhost:4200/ **";
        assert_eq!(detect_url(line), Some("http://localhost:4200".into()));
    }

    #[test]
    fn gatsby_main() {
        let line = "  http://localhost:8000/";
        assert_eq!(detect_url(line), Some("http://localhost:8000".into()));
    }

    #[test]
    fn django() {
        let line = "Starting development server at http://127.0.0.1:8000/";
        assert_eq!(detect_url(line), Some("http://127.0.0.1:8000".into()));
    }

    #[test]
    fn flask() {
        let line = " * Running on http://127.0.0.1:5000";
        assert_eq!(detect_url(line), Some("http://127.0.0.1:5000".into()));
    }

    #[test]
    fn rails() {
        let line = "* Listening on http://127.0.0.1:3000";
        assert_eq!(detect_url(line), Some("http://127.0.0.1:3000".into()));
    }

    #[test]
    fn laravel() {
        let line = "Starting Laravel development server: http://127.0.0.1:8000";
        assert_eq!(detect_url(line), Some("http://127.0.0.1:8000".into()));
    }

    #[test]
    fn hugo() {
        let line = "Web Server is available at http://localhost:1313/";
        assert_eq!(detect_url(line), Some("http://localhost:1313".into()));
    }

    #[test]
    fn elysia() {
        let line = "🦊 Elysia is running at http://localhost:3000";
        assert_eq!(detect_url(line), Some("http://localhost:3000".into()));
    }

    #[test]
    fn fastify() {
        let line = "Server listening at http://127.0.0.1:3000";
        assert_eq!(detect_url(line), Some("http://127.0.0.1:3000".into()));
    }

    #[test]
    fn express_0000() {
        let line = "Listening on http://0.0.0.0:4000";
        assert_eq!(detect_url(line), Some("http://0.0.0.0:4000".into()));
    }

    #[test]
    fn astro_local() {
        let line = "  ┃ Local    http://localhost:4321/";
        assert_eq!(detect_url(line), Some("http://localhost:4321".into()));
    }

    // ── Should reject (non-primary URLs) ─────────────────────────

    #[test]
    fn vite_debug() {
        let line = "  ➜  Debug:   http://localhost:5173/__debug";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn vinext_debug() {
        let line = "  ➜  Debug:   http://localhost:3000/__debug";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn vite_network() {
        let line = "  ➜  Network: http://192.168.1.5:5173/";
        assert_eq!(detect_url(line), None); // no localhost pattern match
    }

    #[test]
    fn nextjs_network() {
        let line = "  - Network:      http://192.168.1.5:3000";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn cra_network() {
        let line = "  On Your Network:  http://192.168.1.5:3000";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn gatsby_graphiql() {
        let line = "  http://localhost:8000/___graphql";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn vite_inspect() {
        let line = "  Inspect:  http://localhost:5173/__inspect";
        assert_eq!(detect_url(line), None);
    }

    #[test]
    fn node_debugger() {
        let line = "Debugger listening on ws://127.0.0.1:9229/abc-123";
        assert_eq!(detect_url(line), None); // ws:// not http://
    }

    #[test]
    fn generic_internal_path() {
        let line = "  http://localhost:3000/__hmr";
        assert_eq!(detect_url(line), None);
    }
}
