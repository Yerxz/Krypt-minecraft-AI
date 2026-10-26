// Basic experimental mace routine. A true smash requires actual fall-distance timing;
// this helper only performs a melee hit when the target is already in reach.
async function maceAttack(bot, target, mace) {
  if (!bot?.entity || !target?.position || !mace) return false;
  const distance = bot.entity.position.distanceTo(target.position);
  if (distance > 3.2) return false;
  try {
    if (bot.heldItem?.name !== 'mace') await bot.equip(mace, 'hand');
    await bot.lookAt(target.position.offset(0, Math.min(target.height || 1.5, 1.2), 0), true);
    bot.attack(target);
    return true;
  } catch (e) { console.log('[Mace] Attack failed:', e.message); return false; }
}
module.exports = { maceAttack };
