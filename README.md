# KRYPT SMP Companion v6 — local AI + Simple Voice Chat

Windows 11 / Node.js Mineflayer project. It uses free local code and does not require a paid API key.

## Install

1. Stop the old process with `Ctrl+C`.
2. Back up your existing project and copy the contents of this folder into it.
3. Open PowerShell in the folder containing `package.json`.
4. Run:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd start
```

## Configuration

Edit `config.js` for server host, port, version, username and owner. Defaults are localhost:63089, KRYPT, offline authentication, Minecraft 1.21.11, owner `_yerxz`.

## Owner whisper examples

- `hi`
- `get 64 spruce logs`
- `get 32 cobblestone`
- `follow me` / `come here`
- `put items into this chest`
- `put spruce logs into this chest`
- `build house.schem` (put the file in `schematics/`)
- `/team accept VOID`
- `status` / `inventory` / `stop task`

Exact slash commands are sent unchanged. Server command behavior depends on the server's plugins and permissions.

## Features in this build

- Responds to owner whispers, including greetings and unsupported requests (unsupported requests are acknowledged honestly).
- Quantity-based item requests for mapped gatherable blocks; checks inventory, collects nearby matching drops, mines a matching source block, and reports blockers.
- Basic autonomous progression toward wood, crafting table, sticks, pickaxes, cobblestone, and available iron; equips armor and eats when food is available.
- Nearby dropped-item pickup, sprinting and occasional sprint-jumps while pathfinder has an active goal, stuck recovery, saved death coordinates and a return-to-death-area attempt after respawn.
- Basic combat with bare-hand fallback and critical-hit attempts.
- Chest/barrel deposit task that keeps a conservative set of tools, armor, food, and emergency items when asked to store everything.
- Schematic loader integration for local `.schem`, `.schematic`, and `.litematic` files via `mineflayer-schem` / `prismarine-schematic`.

## Important limits

This is an experimental Mineflayer agent, not a human-level autonomous player. The item gatherer currently has direct world-source mappings for common blocks and ores; it does not yet solve every recipe chain (for example, ores requiring smelting, villager trades, biome travel, or dimension changes). The progression planner is a first pass and does not yet reliably build and seal a complete secure underground base. Natural-language building currently loads a provided local schematic; it does not turn every arbitrary description into a fully designed structure. Schematic plugin compatibility with the exact server version and plugins must be tested in-game. Online downloads are not performed automatically: download schematics from a source you trust and place them in `schematics/`.

Player PvP is opt-in. Crystal and anchor explosives are disabled by default. Server protections may block bot actions.


## Local Ollama AI (free, no API key)

1. Install Ollama for Windows from https://ollama.com/download/windows.
2. Open PowerShell in the folder containing `package.json` and run:

```powershell
.\scripts\setup-local-ai.ps1
```

The script checks that Ollama is installed, pulls `qwen2.5:3b`, and checks the local API. KRYPT uses `http://127.0.0.1:11434/api/generate`; the model runs on your PC. If Ollama is not installed, the script tells you where to install it.

## Simple Voice Chat + JARVIS-style speech (experimental bridge)

The server already has Simple Voice Chat installed, as reported. KRYPT also needs a **client-compatible voice bridge** because a normal Mineflayer bot does not automatically join Simple Voice Chat. This project uses the community `forester302/mineflayer-simple-voice-chat` bridge; it is not official, has limited maintenance, and compatibility with your exact Minecraft/server/plugin versions is **not verified**.

1. Keep the Paper/Purpur/Spigot Simple Voice Chat plugin installed and confirm the server's voice UDP port is reachable (default is usually UDP `24454`, unless changed in the server config/hosting panel).
2. Install Git for Windows if needed: https://git-scm.com/download/win.
3. Run PowerShell in this project folder and execute:

```powershell
.\scripts\setup-voice.ps1
```

4. Configure a local Piper voice for the best JARVIS-like result: download Piper for Windows and an English voice model from the official Piper project/release source you trust, then set `piperExecutable` and `piperModel` in `config.js` to their full paths. Keep both blank to use the built-in offline Windows speech voice as a fallback; that fallback is functional but is not an exact JARVIS imitation.
5. Start KRYPT normally. When the bridge fires `audio_player_initialised`, KRYPT should log that the voice audio player initialized and queue a short startup line. Replies sent privately to the owner are also queued to voice chat.

### Troubleshooting

- If you see `Simple Voice Chat bridge is not installed`, run `scripts\setup-voice.ps1` from the project root.
- If KRYPT connects to Minecraft but never logs `audio_player_initialised`, the community bridge may not be compatible with the current server/plugin version, or the voice handshake/UDP port is not working. This is not fixable by Ollama settings alone.
- The voice bridge is experimental and must be tested in your server. I have syntax-checked this integration, but cannot claim live in-game audio transmission was tested here.
- Voice output is one-way speech synthesis. This does **not** give KRYPT microphone hearing or speech-to-text input. The owner still sends commands by Minecraft private message.
