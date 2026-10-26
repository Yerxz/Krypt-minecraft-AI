const { goals } = require('mineflayer-pathfinder');
const { equipBestTool } = require('./tool-selector');

const LOGS = ['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log','pale_oak_log'];
const PICKAXES = ['netherite_pickaxe','diamond_pickaxe','iron_pickaxe','stone_pickaxe','wooden_pickaxe'];
const AXES = ['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe'];
const SWORDS = ['netherite_sword','diamond_sword','iron_sword','stone_sword','wooden_sword'];
const FOOD = ['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_cod','cooked_salmon','baked_potato','bread','apple','carrot','potato','raw_beef','raw_porkchop','raw_mutton','raw_chicken','raw_cod','raw_salmon','sweet_berries'];
const ANIMALS = new Set(['cow','pig','sheep','chicken','rabbit']);

class SMPProgression {
  constructor(bot, config, memory, reply) {
    this.bot = bot; this.config = config; this.memory = memory; this.reply = reply;
    this.lastActionAt = 0; this.busy = false; this.lastReportAt = 0; this.baseStarted = false;
    this.lastDropAt = 0; this.lastDropId = null;
  }
  count(name) { return this.bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0); }
  countAny(names) { return this.bot.inventory.items().filter(i => names.includes(i.name)).reduce((n, i) => n + i.count, 0); }
  hasAny(names) { return this.countAny(names) > 0; }
  best(names) { return this.bot.inventory.items().find(i => names.includes(i.name)); }
  async equipBest(names) { const item = this.best(names); if (item && this.bot.heldItem?.name !== item.name) { try { await this.bot.equip(item, 'hand'); } catch {} } return item; }
  async craftItem(name, desired = 1) {
    const data = require('minecraft-data')(this.bot.version); const def = data.itemsByName[name];
    if (!def) return false;
    const table = this.bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 5 });
    let recipes = [];
    try { recipes = this.bot.recipesFor(def.id, null, 1, table || null); } catch {}
    if (!recipes.length) return false;
    const per = Math.max(1, recipes[0].result?.count || 1);
    const times = Math.max(1, Math.min(64, Math.ceil(desired / per)));
    try { await this.bot.craft(recipes[0], times, table || null); return true; } catch { return false; }
  }
  async gatherBlock(names, maxDistance = 28) {
    const match = new Set(names);
    const block = this.bot.findBlock({ matching: b => b && match.has(b.name), maxDistance, count: 1 });
    if (!block) return false;
    try {
      if (this.bot.entity.position.distanceTo(block.position) > 4) await this.bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
      const current = this.bot.blockAt(block.position);
      if (!current || !this.bot.canDigBlock(current)) return false;
      await equipBestTool(this.bot, current);
      await this.bot.dig(current); return true;
    } catch (e) { console.log('[SMP] Gathering failed:', e.message); return false; }
  }
  async collectNearbyDrop() {
    if (Date.now() - this.lastDropAt < 7000) return false;
    let best = null, bestD = 9;
    for (const e of Object.values(this.bot.entities || {})) {
      if (!e || e.name !== 'item' || !e.position || e.id === this.lastDropId) continue;
      const d = this.bot.entity.position.distanceTo(e.position);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (!best) return false;
    this.lastDropAt = Date.now(); this.lastDropId = best.id;
    try { await this.bot.pathfinder.goto(new goals.GoalNear(best.position.x, best.position.y, best.position.z, 1)); await new Promise(r => setTimeout(r, 350)); return true; }
    catch { this.lastDropId = null; return false; }
  }
  async step(taskManager, combat) {
    if (this.busy || !this.bot.entity || taskManager?.active || taskManager?.building) return;
    if (Date.now() - this.lastActionAt < 9000) return;
    this.busy = true; this.lastActionAt = Date.now();
    try {
      // Loot recovery and basic equipment progression come before optional exploration.
      if (await this.collectNearbyDrop()) return;
      if (this.bot.food < 12 && this.hasAny(FOOD)) return;
      if (this.bot.inventory.emptySlotCount() <= 1) return;
      if (this.bot.food < 8 && !this.hasAny(FOOD) && combat) {
        const animal = Object.values(this.bot.entities || {}).filter(e => e?.position && ANIMALS.has(e.name) && this.bot.entity.position.distanceTo(e.position) < 14)
          .sort((a,b) => this.bot.entity.position.distanceTo(a.position) - this.bot.entity.position.distanceTo(b.position))[0];
        if (animal) { await combat.fight(animal, 'mob'); return; }
      }

      const logCount = this.countAny(LOGS);
      if (logCount < 8) { await this.gatherBlock(LOGS, 32); return; }

      // Craft the core workbench and material chain using available recipes.
      if (!this.count('crafting_table')) {
        if (!this.countAny(['oak_planks','spruce_planks','birch_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks','pale_oak_planks'])) {
          const log = this.bot.inventory.items().find(i => LOGS.includes(i.name));
          if (log) { try { await this.bot.craft(this.bot.recipesFor(require('minecraft-data')(this.bot.version).itemsByName[log.name.replace('_log','_planks')].id, null, 1, null)[0], 1, null); } catch { /* fallback below */ } }
        }
        await this.craftItem('crafting_table', 1); return;
      }
      const planks = this.countAny(['oak_planks','spruce_planks','birch_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks','pale_oak_planks']);
      if (planks < 12 && logCount > 0) {
        const log = this.bot.inventory.items().find(i => LOGS.includes(i.name));
        if (log) { const target = log.name.replace('_log','_planks'); await this.craftItem(target, 12 - planks); return; }
      }
      if (this.count('stick') < 8 && planks >= 2) { await this.craftItem('stick', 8); return; }
      if (!this.hasAny(PICKAXES)) { if (this.count('cobblestone') >= 3) await this.craftItem('stone_pickaxe'); else if (planks >= 3) await this.craftItem('wooden_pickaxe'); return; }

      // Stone tools, then iron gear when resources are available.
      if (this.count('cobblestone') < 16 && this.hasAny(PICKAXES)) {
        await this.equipBest(PICKAXES);
        const found = await this.gatherBlock(['stone','cobblestone'], 30); if (found) return;
      }
      if (this.count('stone_pickaxe') === 0 && this.count('cobblestone') >= 3) { await this.craftItem('stone_pickaxe'); return; }
      if (!this.hasAny(SWORDS) && this.count('cobblestone') >= 2) { await this.craftItem('stone_sword'); return; }
      if (!this.hasAny(AXES) && this.count('cobblestone') >= 3) { await this.craftItem('stone_axe'); return; }

      // Gather iron only once a stone pickaxe is available. Ore may be underground; report limitations.
      if (this.hasAny(['stone_pickaxe','iron_pickaxe','diamond_pickaxe','netherite_pickaxe']) && this.count('raw_iron') + this.count('iron_ingot') < 12) {
        const iron = this.bot.findBlock({ matching: b => b && ['iron_ore','deepslate_iron_ore'].includes(b.name), maxDistance: 32 });
        if (iron) { await this.equipBest(PICKAXES); await this.gatherBlock(['iron_ore','deepslate_iron_ore'], 32); return; }
      }
      if (this.count('iron_ingot') >= 3 && !this.hasAny(['iron_pickaxe','diamond_pickaxe','netherite_pickaxe'])) { await this.craftItem('iron_pickaxe'); return; }
      if (this.count('iron_ingot') >= 24 && !this.hasAny(['iron_chestplate'])) { await this.craftItem('iron_chestplate'); return; }

      // Once basic gear exists, establish a small underground shelter if safe and not already recorded.
      // The location is persisted, so KRYPT does not repeatedly excavate random holes.
      if (!this.memory.data.basePosition && this.hasAny(['stone_pickaxe','iron_pickaxe','diamond_pickaxe']) && this.countAny(FOOD) >= 6 && this.bot.health >= 14 && !combat?.currentTargetId) {
        const p = this.bot.entity.position.floored();
        this.memory.data.basePosition = { x: p.x, y: p.y, z: p.z }; this.memory.save();
        this.memory.event(`Initial shelter site recorded at ${p.x}, ${p.y}, ${p.z}`);
        if (Date.now() - this.lastReportAt > 60000) { this.lastReportAt = Date.now(); this.reply(`I have enough basic gear to start planning a secure base. I marked a possible shelter site at ${p.x}, ${p.y}, ${p.z}; a fully sealed underground base needs a dedicated construction pass.`); }
      }
      // No periodic owner spam: report only meaningful milestones, death, or blockers.
    } catch (e) { console.error('[SMP] Progression error:', e.message); }
    finally { this.busy = false; }
  }
}
module.exports = { SMPProgression };
