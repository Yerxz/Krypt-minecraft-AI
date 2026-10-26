const fs = require('fs');
const path = require('path');

class Memory {
  constructor(file = './data/memory.json') {
    this.file = path.resolve(file);
    this.data = this.load();
  }
  defaults() {
    return { sessions: 0, tasksCompleted: 0, logsCollected: 0, itemsCollected: 0,
      threatsSeen: 0, fights: 0, wins: 0, deaths: 0, lastTask: 'idle', recentEvents: [], lastDeathPosition: null, needsDeathRecovery: false };
  }
  load() {
    try { return { ...this.defaults(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; }
    catch { return this.defaults(); }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) { console.error('[Memory] Save failed:', e.message); }
  }
  increment(key, amount = 1) { this.data[key] = (Number(this.data[key]) || 0) + amount; this.save(); }
  event(message) {
    this.data.recentEvents.push({ at: new Date().toISOString(), message: String(message).slice(0, 240) });
    this.data.recentEvents = this.data.recentEvents.slice(-80); this.save();
  }
  setTask(task) { this.data.lastTask = task; this.save(); }
}
module.exports = { Memory };
