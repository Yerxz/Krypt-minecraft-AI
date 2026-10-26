// Experimental Anchor PvP helper. Disabled by default in config.js.
// Respawn anchors explode when activated outside the Nether; never test near a base.
class AnchorCombat {
  constructor(bot, config) { this.bot = bot; this.config = config; this.lastUse = 0; }
  item(name) { return this.bot.inventory.items().find(i => i.name === name); }
  async attack(target) {
    if (!this.config.allowAnchorPvP || !this.config.enableAnchorExplosives || !target?.position) return false;
    if (Date.now() - this.lastUse < 2200 || this.bot.health < 18) return false;
    const anchorItem = this.item('respawn_anchor');
    const glowstone = this.item('glowstone');
    if (!anchorItem || !glowstone) return false;
    const p = target.position.floored();
    const candidates = [p.offset(1,0,0), p.offset(-1,0,0), p.offset(0,0,1), p.offset(0,0,-1)];
    for (const pos of candidates) {
      if (this.bot.entity.position.distanceTo(pos) < 6) continue;
      const support = this.bot.blockAt(pos.offset(0,-1,0));
      const space = this.bot.blockAt(pos);
      if (!support || !space || space.name !== 'air') continue;
      try {
        await this.bot.equip(anchorItem, 'hand');
        await this.bot.placeBlock(support, new (require('vec3').Vec3)(0,1,0));
        const placed = this.bot.blockAt(pos);
        if (!placed || !placed.name.includes('respawn_anchor')) return false;
        await this.bot.equip(glowstone, 'hand');
        await this.bot.activateBlock(placed);
        // One charge/activation attempt only; the routine intentionally does not spam use packets.
        this.lastUse = Date.now();
        return true;
      } catch (e) { console.log('[Anchor PvP] Attempt failed:', e.message); return false; }
    }
    return false;
  }
}
module.exports = { AnchorCombat };
