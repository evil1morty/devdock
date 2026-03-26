<p align="center">
  <img src="images/icon.png" width="64" />
</p>
<h1 align="center">OneRun</h1>
<p align="center">One app to run them all.</p>

<p align="center">
  <img src="images/screenshot.png" width="680" />
</p>

## Why

I was working on multiple projects simultaneously with [Claude Code](https://claude.ai/claude-code). Each project needed its own dev server running, so for every project that's another terminal tab, plus the terminals for Claude Code itself. It started getting frustrating real quick, constantly switching between tabs just to start or stop a server.

I just wanted a simple app where I could see all my projects, hit play, and check logs when needed. So I built this with Claude Code.

## Features

- **Auto-scan projects** — reads `package.json`, `Cargo.toml`, `go.mod`, `composer.json`, `Makefile`, `docker-compose.yml`
- **One-click play/stop** on the dashboard
- **Live logs** with copy and click-outside-to-close
- **Auto-detect URLs** — clickable `localhost` links from server output
- **Per-project env vars** — isolated credentials and config per project
- **System tray** — close minimizes to tray, restore on click
- **Start on boot** — launches minimized to tray
- **Open in Claude Code** — terminal with your configured command
- **Open in editor** — VS Code, Cursor, or any editor
- **Pin projects** to the top
- **Context menu** — run scripts, open in browser/explorer, edit, remove
- **Settings** — claude command, editor, theme, window size
- **Framework badges** — Next.js, Vite, Svelte, React, Vue, Angular, Express, Laravel, Django, and more
- **Package manager detection** — bun, pnpm, yarn, or npm from lockfile
- **Cross-platform** — Windows, macOS, Linux

## Download

Grab the latest release for your platform from [Releases](https://github.com/evil1morty/onerun/releases).

| Platform | File |
|----------|------|
| Windows | `.exe` or `.msi` |
| macOS | `.dmg` |
| Linux | `.deb` |

## Build from Source

Requires [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/), and on Windows [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload.

```bash
git clone https://github.com/evil1morty/onerun.git
cd onerun
npm install
npx tauri build
```

## License

MIT
