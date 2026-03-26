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

- **Auto-scan projects** reads `package.json`, `Cargo.toml`, `go.mod`, `composer.json`, `Makefile`, `docker-compose.yml` and detects framework, scripts, and package manager
- **One-click play/stop** with live logs and auto-detected localhost URLs
- **Per-project environment variables** for isolated credentials and config
- **System tray** with start on boot support
- **Open in Claude Code** or your editor of choice
- **Cross-platform** Windows, macOS, Linux

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
