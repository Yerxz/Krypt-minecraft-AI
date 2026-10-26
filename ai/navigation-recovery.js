class NavigationRecovery {
  constructor(bot) {
    this.bot = bot;
    this.timer = null;
    this.lastPos = null;
    this.lastProgressAt = Date.now();
    this.recovering = false;
    this.lastRecoveryAt = 0;
    this.side = false;
    this.lastJumpAt = 0;
  }
  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), 2500);
    this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  check() {
    const bot = this.bot;
    if (!bot?.entity || !bot.pathfinder || this.recovering) return;
    const goal = bot.pathfinder.goal;
    // Use ordinary sprint-jumping while travelling. Pathfinder still owns steering; this only
    // adds sprint and occasional grounded jumps, and is disabled when no goal is active.
    if (goal) {
      try {
        const canSprintJump = Number.isFinite(bot.food) && bot.food > 6;
        bot.setControlState('sprint', canSprintJump);
        const nowJump = Date.now();
        const grounded = bot.entity.onGround === true;
        const horizontalSpeed = Math.hypot(bot.entity.velocity?.x || 0, bot.entity.velocity?.z || 0);
        if (canSprintJump && grounded && horizontalSpeed > 0.04 && nowJump - this.lastJumpAt > 1050) {
          this.lastJumpAt = nowJump;
          bot.setControlState('jump', true);
          setTimeout(() => { try { bot?.setControlState('jump', false); } catch {} }, 180);
        }
      } catch {}
    } else {
      try { bot.setControlState('sprint', false); } catch {}
    }
    if (!goal) { this.lastPos = bot.entity.position.clone(); this.lastProgressAt = Date.now(); return; }
    const pos = bot.entity.position;
    const now = Date.now();
    if (!this.lastPos || pos.distanceTo(this.lastPos) > 0.65) {
      this.lastPos = pos.clone(); this.lastProgressAt = now; return;
    }
    if (now - this.lastProgressAt < 9000 || now - this.lastRecoveryAt < 5000) return;
    this.recovering = true;
    this.lastRecoveryAt = now;
    this.lastProgressAt = now;
    const savedGoal = goal;
    console.log('[KRYPT AI] Navigation appears stuck; trying a recovery maneuver and replanning.');
    try {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      bot.setControlState('jump', true);
      bot.setControlState(this.side ? 'left' : 'right', true);
      this.side = !this.side;
      setTimeout(() => {
        if (!bot?.entity) { this.recovering = false; return; }
        bot.setControlState('jump', false);
        bot.setControlState('left', false);
        bot.setControlState('right', false);
        // Re-submit the original goal to force a fresh path calculation.
        if (savedGoal && bot.pathfinder) bot.pathfinder.setGoal(savedGoal, true);
        this.lastPos = bot.entity.position.clone();
        this.lastProgressAt = Date.now();
        this.recovering = false;
      }, 650);
    } catch (e) {
      console.log('[KRYPT AI] Navigation recovery failed:', e.message);
      this.recovering = false;
    }
  }
}
module.exports = { NavigationRecovery };
