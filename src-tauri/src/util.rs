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

/// Try to extract a localhost URL from a log line.
pub fn detect_url(line: &str) -> Option<String> {
    const PATTERNS: &[&str] = &[
        "http://localhost:",
        "http://127.0.0.1:",
        "http://0.0.0.0:",
        "https://localhost:",
    ];
    for pat in PATTERNS {
        if let Some(pos) = line.find(pat) {
            let rest = &line[pos..];
            let end = rest
                .find(|c: char| c.is_whitespace() || c == ',' || c == ')' || c == ']')
                .unwrap_or(rest.len());
            return Some(rest[..end].trim_end_matches('/').to_string());
        }
    }
    None
}

/// Detect the JS framework from package.json dependencies.
pub fn detect_framework(pkg: &serde_json::Value) -> Option<String> {
    let deps = pkg.get("dependencies").and_then(|v| v.as_object());
    let dev_deps = pkg.get("devDependencies").and_then(|v| v.as_object());

    let has = |name: &str| -> bool {
        deps.map_or(false, |d| d.contains_key(name))
            || dev_deps.map_or(false, |d| d.contains_key(name))
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
