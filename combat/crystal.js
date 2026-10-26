// Experimental Crystal PvP helper. Disabled by default in config.js.
// Use only in a disposable test world/server that permits explosive PvP.
class CrystalCombat {
  constructor(bot, config) { this.bot = bot; this.config = config; this.lastUse = 0; }
  item(name) { return this.bot.inventory.items().find(i => i.name === name); }
  async attack(target) {
    if (!this.config.allowCrystalPvP || !this.config.enableCrystalExplosives || !target?.position) return false;
    if (Date.now() - this.lastUse < 1800) return false;
    const crystal = this.item('end_crystal');
    const obsidian = this.item('obsidian');
    if (!crystal || !obsidian || this.bot.health < 16) return false;
    const p = target.position.floored();
    const candidates = [p.offset(1,0,0), p.offset(-1,0,0), p.offset(0,0,1), p.offset(0,0,-1)];
    for (const basePos of candidates) {
      const base = this.bot.blockAt(basePos);
      const above = this.bot.blockAt(basePos.offset(0,1,0));
      const above2 = this.bot.blockAt(basePos.offset(0,2,0));
      if (!base || !above || !above2 || !['obsidian','bedrock'].includes(base.name) || above.name !== 'air' || above2.name !== 'air') continue;
      // Do not attempt an attack if the crystal would be dangerously close to KRYPT.
      if (this.bot.entity.position.distanceTo(basePos) < 5) continue;
      try {
        await this.bot.equip(crystal, 'hand');
        await this.bot.activateBlock(base);
        this.lastUse = Date.now();
        return true;
      } catch (e) { console.log('[CPvP] Crystal placement failed:', e.message); return false; }
    }
    return false;
  }
}
module.exports = { CrystalCombat };
