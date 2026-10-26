const fs = require('fs');
const path = require('path');

class CommandRegistry {
  constructor(file) {
    this.file = path.resolve(file);
    this.data = this.load();
  }
  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { return { servers: {} }; }
  }
  serverKey(bot) { return `${bot._client?.socket?.remoteAddress || 'server'}:${bot._client?.socket?.remotePort || 'unknown'}|${bot.version || 'unknown'}`; }
  current(bot) {
    const key = this.serverKey(bot);
    this.data.servers[key] ||= { commands: {}, notes: [] };
    return this.data.servers[key];
  }
  record(bot, command, outcome = 'sent', response = '') {
    const store = this.current(bot);
    const normalized = String(command).trim();
    if (!normalized.startsWith('/')) return;
    const prior = store.commands[normalized] || { attempts: 0, successes: 0, failures: 0, lastResponse: '' };
    prior.attempts++;
    if (outcome === 'success') prior.successes++;
    if (outcome === 'failure') prior.failures++;
    if (response) prior.lastResponse = String(response).slice(0, 240);
    prior.lastUsedAt = new Date().toISOString();
    store.commands[normalized] = prior;
    this.save();
  }
  note(bot, text) {
    const store = this.current(bot);
    store.notes.push({ at: new Date().toISOString(), text: String(text).slice(0, 240) });
    store.notes = store.notes.slice(-50); this.save();
  }
  save() {
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); }
    catch (e) { console.error('[Commands] Save failed:', e.message); }
  }
}
module.exports = { CommandRegistry };
