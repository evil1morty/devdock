# DevDock

A lightweight desktop app to manage all your dev servers in one place. Stop juggling terminal tabs.

## Why I Built This

I was working on 4 Node.js projects simultaneously using Claude Code. Each project needed its own `npm run dev`, which meant 4 extra terminal windows just for dev servers — on top of the 4 terminals I was already using for actual work. That's 8 terminal tabs open at once, and switching between them was a nightmare.

All I wanted was a simple way to start and stop dev servers without drowning in tabs. So I built DevDock — a compact desktop app where I can see all my projects at a glance, start/stop them with one click, and check their logs when needed.

## Features

- **One-click start/stop** — Play/stop button on each project row, runs `dev`/`start` by default
- **Auto-scan `package.json`** — Add a project folder and DevDock reads the name, scripts, and detects the framework automatically
- **Live log viewer** — Click a project to see real-time stdout/stderr output
- **Auto-detect URLs** — When your dev server prints `localhost:3000`, DevDock picks it up and shows a clickable link
- **Framework detection** — Badges for Next.js, Vite, Svelte, React, Vue, Angular, Express, and more
- **Quick actions via context menu** — Right-click or use the 3-dot menu to:
  - Run any script from `package.json`
  - Restart / Stop
  - Open in Browser
  - Open in VS Code
  - Show in Explorer
  - Edit / Remove
- **Persistent config** — Projects and their commands are saved to a local JSON file
- **Compact UI** — Dark theme, small footprint, stays out of your way

## Tech Stack

- **[Tauri v2](https://tauri.app/)** — Lightweight desktop framework (~5MB vs Electron's ~150MB)
- **Rust** — Backend for process management, config persistence, and OS integration
- **Vanilla HTML/CSS/JS** — No build step, no framework overhead. ES modules for clean code organization

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Linux: `build-essential`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev` (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Getting Started

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/devdock.git
cd devdock

# Install Tauri CLI
npm install

# Run in development mode
npx tauri dev

# Build for production
npx tauri build
```

The production binary will be in `src-tauri/target/release/`.

## Project Structure

```
devdock/
├── public/                  # Frontend (served as static files)
│   ├── index.html           # App shell
│   ├── style.css            # Dark theme styles
│   ├── app.js               # Entry point (init + event listeners)
│   └── js/
│       ├── api.js           # Tauri invoke wrappers
│       ├── state.js         # Shared application state
│       ├── dashboard.js     # Project table rendering
│       ├── context-menu.js  # 3-dot dropdown + confirm dialog
│       ├── dialog.js        # Add/edit project form
│       └── logs.js          # Log panel + streaming
├── src-tauri/               # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri window + app config
│   └── src/
│       ├── lib.rs           # App entry + plugin/command wiring
│       ├── types.rs         # Structs (state, config, payloads)
│       ├── process.rs       # Process spawn/stop/kill + log streaming
│       ├── commands.rs      # All Tauri command handlers
│       └── util.rs          # ANSI stripping, URL detection, framework detection
└── package.json
```

## How It Works

1. **Process management** — Rust spawns child processes via `cmd /C` (Windows) or `sh -c` (Unix), pipes stdout/stderr through reader threads, and emits log lines as Tauri events to the frontend in real-time.

2. **URL detection** — As log lines stream in, a pattern matcher looks for `localhost:XXXX` and similar patterns. When found, the URL is displayed as a clickable link in the project table.

3. **Package scanning** — When you add a project, DevDock reads `package.json` to extract the project name, all scripts (sorted by relevance: dev > start > build > test), and detects the framework from dependencies.

4. **Process tree killing** — On Windows, `taskkill /T /F` kills the entire process tree (not just the shell). On Unix, `kill -9` is used. All processes are cleaned up when the app closes.

5. **Config persistence** — Project configs are stored in the OS app data directory:
   - Windows: `%APPDATA%/com.devdock.app/projects.json`
   - macOS: `~/Library/Application Support/com.devdock.app/projects.json`
   - Linux: `~/.config/com.devdock.app/projects.json`

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT
