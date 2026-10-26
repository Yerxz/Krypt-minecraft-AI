'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

class KryptVoice {
  constructor(config) {
    this.config = config;
    this.bot = null;
    this.ready = false;
    this.queue = Promise.resolve();
    this.lastText = '';
    this.lastAt = 0;
    this.tempDir = path.resolve(config.voiceTempDir || './data/voice');
    this.plugin = null;
  }

  init(bot) {
    this.bot = bot;
    if (!this.config.voiceEnabled) {
      console.log('[VOICE] Disabled in config.');
      return false;
    }
    const pluginPath = path.resolve(this.config.voicePluginPath || './voice/mineflayer-simple-voice-chat');
    const compiledPluginPath = path.join(pluginPath, 'mineflayer-simple-voice-chat');
    if (!fs.existsSync(compiledPluginPath)) {
      console.warn('[VOICE] Compiled Simple Voice Chat bridge is not installed. Run scripts\\setup-voice.ps1, then restart KRYPT.');
      return false;
    }
    try {
      const extension = require(compiledPluginPath);
      if (typeof extension.plugin !== 'function') throw new Error('Bridge did not export a plugin() function');
      bot.loadPlugin(extension.plugin);
      bot.on('audio_player_initialised', () => {
        this.ready = true;
        console.log('[VOICE] Simple Voice Chat audio player initialised.');
        this.speak('Systems online. KRYPT voice channel initialized.');
      });
      bot.on('end', () => { this.ready = false; });
      bot.on('error', err => console.warn('[VOICE] Mineflayer error:', err.message));
      this.plugin = extension;
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('[VOICE] Voice bridge loaded; waiting for Simple Voice Chat handshake.');
      return true;
    } catch (err) {
      console.error('[VOICE] Could not load Simple Voice Chat bridge:', err.message);
      return false;
    }
  }

  speak(text) {
    if (!this.config.voiceEnabled || !this.bot || !this.plugin) return;
    const clean = String(text || '').replace(/§[0-9a-fk-or]/gi, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const now = Date.now();
    if (clean === this.lastText && now - this.lastAt < 5000) return;
    this.lastText = clean; this.lastAt = now;
    this.queue = this.queue.then(() => this._speakOne(clean)).catch(err => {
      console.warn('[VOICE] Speech failed:', err.message || err);
    });
  }

  async _speakOne(text) {
    const maxChars = Number(this.config.voiceMaxCharacters || 320);
    const phrase = text.slice(0, maxChars);
    const file = path.join(this.tempDir, `krypt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.wav`);
    await this.makeWav(phrase, file);
    if (!this.ready || !this.bot?.simple_voice_chat?.AudioPlayer?.enQueue) {
      try { fs.unlinkSync(file); } catch {}
      console.warn('[VOICE] Speech generated, but the voice audio player is not ready. Check the Simple Voice Chat client/server handshake and UDP port.');
      return;
    }
    this.bot.simple_voice_chat.AudioPlayer.enQueue(file);
    // The bridge queues files; give its queue time to consume the file before cleanup.
    setTimeout(() => { try { fs.unlinkSync(file); } catch {} }, 120000);
  }

  makeWav(text, outputFile) {
    const piper = String(this.config.piperExecutable || '').trim();
    const model = String(this.config.piperModel || '').trim();
    if (piper && model && fs.existsSync(piper) && fs.existsSync(model)) {
      return new Promise((resolve, reject) => {
        const child = spawn(piper, ['--model', model, '--output_file', outputFile], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', code => code === 0 && fs.existsSync(outputFile) ? resolve() : reject(new Error(`Piper exited ${code}: ${stderr.slice(-500)}`)));
        child.stdin.end(text + '\n');
      });
    }
    // Free offline fallback built into Windows. Piper is recommended for a more cinematic JARVIS-like voice.
    const ps = path.resolve(__dirname, 'sapi-speak.ps1');
    const encoded = Buffer.from(text, 'utf16le').toString('base64');
    const outputEncoded = Buffer.from(outputFile, 'utf16le').toString('base64');
    const command = `$t=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));$o=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${outputEncoded}'));Add-Type -AssemblyName System.Speech;$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;try{$v=$s.GetInstalledVoices()|Where-Object {$_.VoiceInfo.Name -match 'David|Mark|Guy|Ryan|Male'}|Select-Object -First 1;if($v){$s.SelectVoice($v.VoiceInfo.Name)};$s.Rate=0;$s.Volume=100;$s.SetOutputToWaveFile($o);$s.Speak($t);$s.Dispose()}catch{exit 2}`;
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 && fs.existsSync(outputFile) ? resolve() : reject(new Error(`Windows offline speech failed (${code}): ${stderr.slice(-400)}`)));
    });
  }
}

module.exports = { KryptVoice };
