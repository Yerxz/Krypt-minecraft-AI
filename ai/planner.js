// Optional local-only planner. If Ollama is unavailable, the built-in parser remains usable.
class Planner {
  constructor(config) { this.config = config; }
  async interpret(text, context = {}) {
    if (!this.config.localPlannerEnabled || typeof fetch !== 'function') return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.plannerTimeoutMs || 12000);
    try {
      const prompt = `You classify instructions for a Minecraft Mineflayer SMP bot. Return ONLY valid JSON with keys intent, target, amount, details. Allowed intents: follow, come, stop_following, gather_wood, explore, defend, attack_player, stop_task, status, inventory, help, unknown. Never invent server commands. If the message is an explicit slash command, do not classify it (return unknown). User message: ${JSON.stringify(text)}. Context: ${JSON.stringify(context)}`;
      const response = await fetch(this.config.ollamaUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.config.ollamaModel, prompt, stream: false, format: 'json', options: { temperature: 0 } }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const body = await response.json();
      const parsed = JSON.parse(body.response || '{}');
      const allowed = new Set(['follow','come','stop_following','gather_wood','explore','defend','attack_player','stop_task','status','inventory','help','unknown']);
      if (!allowed.has(parsed.intent)) return null;
      return parsed;
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }
  async answer(text, context = {}) {
    if (!this.config.localPlannerEnabled || typeof fetch !== 'function') return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(this.config.plannerTimeoutMs || 12000, 12000));
    try {
      const prompt = `You are KRYPT, a concise Minecraft SMP companion talking privately to your owner. Answer naturally and honestly in 1-3 sentences. You can discuss Minecraft and your current task, but do not claim you performed an action unless the provided context confirms it. If asked to perform an action, explain that the bot controller must execute it. Do not invent server state. Current context: ${JSON.stringify(context)}\nOwner message: ${JSON.stringify(text)}\nReply:`;
      const response = await fetch(this.config.ollamaUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.config.ollamaModel, prompt, stream: false, options: { temperature: 0.35 } }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const body = await response.json();
      const answer = String(body.response || '').trim();
      return answer ? answer.slice(0, 220) : null;
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }

}
module.exports = { Planner };
