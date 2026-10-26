const { goals } = require('mineflayer-pathfinder');
const { CrystalCombat } = require('./crystal');
const { AnchorCombat } = require('./anchor');
const { maceAttack } = require('./mace');

const HOSTILES = new Set([
  'zombie','husk','drowned','skeleton','stray','wither_skeleton','bogged',
  'creeper','spider','cave_spider','witch','pillager','vindicator','evoker',
  'ravager','phantom','blaze','ghast','magma_cube','slime','silverfish',
  'endermite','vex','guardian','elder_guardian','hoglin','zoglin',
  'piglin_brute','warden','breeze'
]);
const WEAPONS = [
  'netherite_sword','diamond_sword','iron_sword','stone_sword','wooden_sword',
  'netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe'
];

class Combat {
  constructor(bot, config, memory) {
    this.bot = bot; this.config = config; this.memory = memory;
    this.enabled = true; this.playerPvPEnabled = !!config.playerPvPEnabled;
    this.defendOwner = false; this.targetName = null; this.attacking = false;
    this.lastAttackAt = 0; this.currentTargetId = null; this.lastLogAt = 0; this.lastCritAt = 0;
    this.crystal = new CrystalCombat(bot, config); this.anchor = new AnchorCombat(bot, config);
  }
  setTarget(name) { this.targetName = name || null; }
  cancel() { this.currentTargetId = null; this.bot.pathfinder?.setGoal(null); this.bot.clearControlStates?.(); }
  item(names) { return this.bot.inventory.items().find(i => names.includes(i.name)); }
  async meleeAttack(entity) {
    // Critical hits require an airborne falling hit. If that is not possible, never skip the attack.
    const bot = this.bot;
    let critAttempted = false;
    try {
      if (bot.entity?.onGround && (bot.food == null || bot.food > 6) && Date.now() - this.lastCritAt > 850) {
        critAttempted = true;
        this.lastCritAt = Date.now();
        bot.setControlState('sprint', false);
        bot.setControlState('jump', true);
        await new Promise(resolve => setTimeout(resolve, 90));
        bot.setControlState('jump', false);
        const start = Date.now();
        while (Date.now() - start < 420 && bot.entity && bot.entity.position.distanceTo(entity.position) <= (this.config.meleeRange || 3.2) + 0.8) {
          // Attack on the downward part of the jump, not while rising.
          if (bot.entity.onGround === false && bot.entity.velocity && bot.entity.velocity.y < -0.02) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      await bot.lookAt(entity.position.offset(0, Math.min(entity.height || 1.5, 1.2), 0), true);
      // Attack normally and allow the server to apply all knockback/velocity updates.
      bot.attack(entity);
      this.lastAttackAt = Date.now();
      if (bot.food == null || bot.food > 6) {
        // Brief sprint reset after the hit (W-tap-style), then restore sprint for movement.
        bot.setControlState('sprint', false);
        setTimeout(() => { try { if (this.bot?.entity && (this.bot.food == null || this.bot.food > 6)) this.bot.setControlState('sprint', true); } catch {} }, 90);
      }
      return critAttempted;
    } finally {
      bot.setControlState('jump', false);
      if (bot.food != null && bot.food <= 6) bot.setControlState('sprint', false);
    }
  }
  distance(entity) { return this.bot.entity.position.distanceTo(entity.position); }
  nearestHostile() {
    if (!this.config.attackHostileMobs || !this.bot.entity) return null;
    let best = null; let bestD = this.config.engageRange || 12;
    for (const e of Object.values(this.bot.entities)) {
      if (!e || !e.position || !e.name || !HOSTILES.has(e.name.toLowerCase())) continue;
      const d = this.distance(e);
      // Creepers are still attacked if close, but KRYPT should not chase them into detonation range.
      if (e.name === 'creeper' && d < 3.5) continue;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }
  playerTarget() {
    if (!this.bot.entity) return null;
    const friends = (this.config.friends || []).map(x => x.toLowerCase());
    const players = Object.values(this.bot.players).filter(p => p?.username && p.entity && p.username !== this.bot.username && !friends.includes(p.username.toLowerCase()));
    if (this.targetName) return players.find(p => p.username.toLowerCase() === this.targetName.toLowerCase()) || null;
    if (!this.playerPvPEnabled) return null;
    const owner = this.bot.players[this.config.owner];
    return players.find(p => {
      const nearOwner = this.defendOwner && owner?.entity && p.entity.position.distanceTo(owner.entity.position) <= this.config.maxThreatDistance;
      const nearBot = this.bot.entity.position.distanceTo(p.entity.position) <= this.config.maxThreatDistance;
      return nearOwner || nearBot;
    }) || null;
  }
  async fight(entity, kind = 'mob', username = '') {
    if (this.attacking || !this.enabled || !entity?.position || !this.bot.entity) return false;
    if (kind === 'player' && !this.playerPvPEnabled && !this.targetName) return false;
    this.attacking = true;
    try {
      const d = this.distance(entity);
      if (this.currentTargetId !== entity.id) {
        this.currentTargetId = entity.id;
        console.log(`[KRYPT AI] Target acquired: ${entity.name || username} (${d.toFixed(1)} blocks)`);
        this.memory.event(`Target acquired: ${entity.name || username}`);
      }
      if (kind === 'player') {
        if (this.config.allowCrystalPvP && this.config.enableCrystalExplosives && await this.crystal.attack(entity)) return true;
        if (this.config.allowAnchorPvP && this.config.enableAnchorExplosives && await this.anchor.attack(entity)) return true;
        const mace = this.item(['mace']);
        if (this.config.allowMacePvP && mace && d <= 3.2 && await maceAttack(this.bot, entity, mace)) {
          this.lastAttackAt = Date.now();
          return true;
        }
      }
      const weapon = this.item(WEAPONS);
      if (weapon && this.bot.heldItem?.name !== weapon.name) await this.bot.equip(weapon, 'hand');
      if (!weapon && this.bot.heldItem) {
        // Empty the hand so KRYPT punches rather than holding food or a random item.
        try { await this.bot.unequip('hand'); } catch (_) { /* punching still works if the server rejects this */ }
      }
      if (d > (this.config.meleeRange || 3.2)) {
        // Follow goals update as the target moves; do not block the whole decision loop with goto().
        this.bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
        return true;
      }
      this.bot.pathfinder.setGoal(null);
      const now = Date.now();
      // No sword/axe is not a reason to freeze: Minecraft permits bare-handed attacks.
      if (now - this.lastAttackAt >= (weapon ? 720 : 500)) {
        await this.meleeAttack(entity);
        if (kind === 'player') this.memory.increment('fights');
      }
      return true;
    } catch (e) { console.error('[KRYPT AI] Combat error:', e.message); this.memory.event(`Combat error: ${e.message}`); return false; }
    finally { this.attacking = false; }
  }
  async step() {
    if (!this.enabled || !this.bot.entity || this.attacking) return false;
    const mob = this.nearestHostile();
    if (mob) return this.fight(mob, 'mob');
    const player = this.playerTarget();
    if (player) return this.fight(player.entity, 'player', player.username);
    this.currentTargetId = null;
    return false;
  }
}
module.exports = { Combat };
