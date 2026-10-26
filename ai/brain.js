const { goals } = require('mineflayer-pathfinder');

const FOOD = [
  'golden_carrot','cooked_beef','cooked_porkchop','cooked_mutton',
  'cooked_chicken','cooked_cod','cooked_salmon','baked_potato',
  'bread','apple','carrot','potato','beetroot','raw_beef','raw_porkchop','raw_mutton','raw_chicken','raw_cod','raw_salmon','sweet_berries'
];
const ARMOR = [
  { slot: 'head', index: 5, names: ['netherite_helmet','diamond_helmet','iron_helmet','chainmail_helmet','golden_helmet','leather_helmet'] },
  { slot: 'torso', index: 6, names: ['netherite_chestplate','diamond_chestplate','iron_chestplate','chainmail_chestplate','golden_chestplate','leather_chestplate'] },
  { slot: 'legs', index: 7, names: ['netherite_leggings','diamond_leggings','iron_leggings','chainmail_leggings','golden_leggings','leather_leggings'] },
  { slot: 'feet', index: 8, names: ['netherite_boots','diamond_boots','iron_boots','chainmail_boots','golden_boots','leather_boots'] }
];

class Brain {
  constructor(bot, config, memory, combat) {
    this.bot = bot; this.config = config; this.memory = memory; this.combat = combat;
    this.autonomous = false; this.task = 'starting'; this.busy = false;
    this.lastFoodCheck = 0; this.lastEquipmentCheck = 0; this.lastStatusAt = 0;
  }
  start() {
    this.autonomous = true;
    this.task = 'autonomous SMP';
    if (this.combat) this.combat.enabled = true;
    this.memory.event('Autonomous SMP enabled');
    console.log('[KRYPT] Autonomous SMP mode enabled.');
  }
  stop() {
    // This is only for deliberate owner requests; never called automatically for low health/death.
    this.autonomous = false; this.task = 'paused';
    this.bot.pathfinder?.setGoal(null); this.bot.clearControlStates?.();
    this.memory.setTask(this.task);
    console.log('[KRYPT] Paused by explicit request.');
  }
  emergencyPause() {
    // Kept for compatibility with older modules; intentionally does not pause anything.
    return false;
  }
  setTask(task) { this.task = task; this.memory.setTask(task); }
  async maintainEquipment() {
    const bot = this.bot;
    for (const a of ARMOR) {
      const current = bot.inventory.slots[a.index];
      const best = bot.inventory.items().filter(i => a.names.includes(i.name))
        .sort((x,y) => a.names.indexOf(x.name) - a.names.indexOf(y.name))[0];
      if (!best) continue;
      if (current && a.names.includes(current.name) && a.names.indexOf(current.name) <= a.names.indexOf(best.name)) continue;
      try { await bot.equip(best, a.slot); } catch (e) { console.log(`[KRYPT] Equip ${a.slot}: ${e.message}`); }
    }
    if (this.config.autoEquipTotem) {
      const offhand = bot.inventory.slots[45];
      if (!offhand || offhand.name !== 'totem_of_undying') {
        const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying');
        if (totem) { try { await bot.equip(totem, 'off-hand'); } catch (e) { console.log('[KRYPT] Totem equip:', e.message); } }
      }
    }
  }
  async eatIfNeeded() {
    if (!this.config.autoEat || this.bot.food == null || this.bot.food >= this.config.safeFood) return;
    const food = this.bot.inventory.items().find(i => FOOD.includes(i.name));
    if (!food) return;
    try { await this.bot.equip(food, 'hand'); await this.bot.consume(); }
    catch (e) { console.log('[KRYPT] Eating:', e.message); }
  }
  async survivalStep() {
    const now = Date.now();
    if (now - this.lastFoodCheck > 1800) { this.lastFoodCheck = now; await this.eatIfNeeded(); }
    if (this.config.autoEquipArmor && now - this.lastEquipmentCheck > 6000) {
      this.lastEquipmentCheck = now; await this.maintainEquipment();
    }
    // Low health is not an emergency stop. Cancel risky navigation and let combat decide whether to disengage.
    if (this.bot.health != null && this.bot.health <= 5 && this.task === 'autonomous SMP') {
      this.bot.pathfinder?.setGoal(null);
      this.setTask('recovering at low health');
    } else if (this.task === 'recovering at low health' && (this.bot.health >= 10 || this.bot.food >= 18)) {
      this.setTask('autonomous SMP');
    }
  }
  async step(taskManager, progression, combat) {
    if (!this.autonomous || !this.bot.entity || this.busy) return;
    this.busy = true;
    try {
      await this.survivalStep();
      if (taskManager && await taskManager.step()) return;
      if (this.task === 'recovering at low health') return;
      const nearbyPlayer = Object.values(this.bot.players).some(p => p.username && p.username !== this.bot.username && p.entity && this.bot.entity.position.distanceTo(p.entity.position) < 5);
      if (nearbyPlayer) return;
      if (progression) await progression.step(taskManager, combat);
      else this.setTask('autonomous SMP');
    } catch (e) { console.error('[KRYPT] Brain error:', e.message); this.memory.event(`Brain error: ${e.message}`); }
    finally { this.busy = false; }
  }
}
module.exports = { Brain };
