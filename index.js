const mineflayer = require('mineflayer');
const minecraftData = require('minecraft-data');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const config = require('./config');
const { Memory } = require('./ai/memory');
const { CommandRegistry } = require('./ai/command-registry');
const { Planner } = require('./ai/planner');
const { Brain } = require('./ai/brain');
const { TaskManager } = require('./ai/tasks');
const { Combat } = require('./combat/combat');
const { NavigationRecovery } = require('./ai/navigation-recovery');
const { SMPProgression } = require('./ai/progression');
const { builder, Build } = require('mineflayer-schem');
const { Schematic } = require('prismarine-schematic');
const { KryptVoice } = require('./voice/voice');
let voice;

const memory = new Memory(config.memoryFile);
const registry = new CommandRegistry(config.commandRegistryFile);
let bot;
let brain;
let combat;
let tasks;
let navigationRecovery;
let progression;
let loopTimer;
let loopBusy = false;
let lastSlashCommand = null;

function tellOwner(message) {
  if (!bot || !bot.entity) return;
  const clean = String(message).slice(0, 240);
  try { bot.whisper(config.owner, clean); }
  catch (e) { console.log('[KRYPT] Could not message owner:', e.message); }
  // Speak owner-directed replies and important status messages over Simple Voice Chat when available.
  try { voice?.speak(clean); } catch (e) { console.log('[VOICE] Could not queue speech:', e.message); }
}
function inventorySummary() {
  if (!bot) return 'I am not connected.';
  return tasks.inventoryText();
}
function setupBot() {
  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    version: config.version
  });
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(builder);
  voice = new KryptVoice(config);
  voice.init(bot);
  combat = new Combat(bot, config, memory);
  brain = new Brain(bot, config, memory, combat);
  const planner = new Planner(config);
  tasks = new TaskManager(bot, config, brain, combat, memory, registry, planner, tellOwner);
  tasks.schematicApi = { Schematic, Build };
  progression = new SMPProgression(bot, config, memory, tellOwner);
  navigationRecovery = new NavigationRecovery(bot);
  navigationRecovery.start();
  bot.on('builder_progress', p => { if (p && p.total) console.log(`[KRYPT] Build progress: ${Math.floor(p.completed / p.total * 100)}% (${p.completed}/${p.total}).`); });
  bot.on('builder_error', e => { console.error('[KRYPT] Schematic builder:', e.message || e); tellOwner(`Schematic build issue: ${String(e.message || e).slice(0, 150)}`); });

  bot.on('spawn', () => {
    try {
      const data = minecraftData(bot.version);
      const movements = new Movements(bot, data);
      movements.canDig = true;
      bot.pathfinder.setMovements(movements);
    } catch (e) { console.error('[KRYPT] Pathfinder setup failed:', e.message); }
    memory.increment('sessions');
    memory.event('Connected/spawned');
    brain.start();
    if (memory.data.needsDeathRecovery && tasks) tasks.beginDeathRecovery();
    console.log(`[KRYPT] Connected to ${config.host}:${config.port} as ${bot.username} (${bot.version}).`);
    console.log(`[KRYPT] Owner-only private messages: ${config.owner}. No startup command required.`);
    tellOwner('KRYPT is online and autonomous. Message me naturally or send an exact server command beginning with /.');
  });

  bot.on('respawn', () => {
    // Respawn event can arrive before entity/inventory are fully ready; spawn also re-enables autonomy.
    setTimeout(() => {
      if (bot?.entity && brain) {
        brain.start();
        combat.cancel();
        tellOwner('I respawned and automatically resumed autonomous SMP behavior.');
      }
    }, 1200);
  });

  bot.on('whisper', async (username, message) => {
    if (!username || username.toLowerCase() !== config.owner.toLowerCase()) return;
    try {
      await tasks.handlePrivateMessage(message);
    } catch (e) {
      console.error('[KRYPT] Private request failed:', e.message);
      tellOwner(`I couldn't finish that request: ${e.message}`);
    }
  });

  bot.on('message', (jsonMessage) => {
    const text = typeof jsonMessage?.toString === 'function' ? jsonMessage.toString() : String(jsonMessage || '');
    if (!text) return;
    console.log('[MC]', text.slice(0, 300));
    if (!lastSlashCommand) return;
    const lower = text.toLowerCase();
    const failure = /unknown command|incorrect argument|usage:|you do not have permission|no permission|not enough money|cannot afford|not found|invalid syntax|too many arguments|not allowed/.test(lower);
    const success = /teleport|teleported|accepted|sold|purchased|listed|home set|welcome|balance|team|auction|success|you have been sent|warped/.test(lower);
    if (failure || success) {
      registry.record(bot, lastSlashCommand, failure ? 'failure' : 'success', text);
      if (failure) tellOwner(`Server response to ${lastSlashCommand}: ${text.slice(0, 150)}`);
      // Avoid noisy speculative success DMs; only notify when the server reports a failure.
      lastSlashCommand = null;
    }
  });

  // Capture exact slash commands sent by the owner so server responses can be associated with them.
  const originalExecute = tasks.executeServerCommand.bind(tasks);
  tasks.executeServerCommand = (command) => {
    lastSlashCommand = command;
    originalExecute(command);
  };

  bot.on('playerCollect', (collector) => {
    if (collector && collector.username === bot.username) memory.increment('itemsCollected');
  });
  bot.on('death', () => {
    try {
      const pos = bot.entity?.position;
      if (pos) {
        memory.data.lastDeathPosition = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
        memory.data.needsDeathRecovery = true;
        memory.save();
        memory.event(`Death location saved at ${memory.data.lastDeathPosition.x}, ${memory.data.lastDeathPosition.y}, ${memory.data.lastDeathPosition.z}`);
      }
    } catch {}
    memory.increment('deaths');
    memory.event('Died; autonomy will resume after respawn');
    combat.cancel();
    // Intentionally do not stop brain/autonomy. Respawn handler re-enables it.
    console.log('[KRYPT] Died. Waiting for server respawn; AI has not been emergency-stopped.');
  });
  bot.on('health', () => {
    if (bot.health != null && bot.health <= 5) {
      // No emergency pause. Survival step handles food and conservative movement.
      if (Date.now() - (bot._kryptLowHealthNotice || 0) > 15000) {
        bot._kryptLowHealthNotice = Date.now();
        console.log('[KRYPT] Low health detected; autonomy remains enabled.');
      }
    }
  });
  bot.on('kicked', reason => console.log('[KRYPT] Kicked:', reason?.toString?.() || reason));
  bot.on('error', error => console.error('[KRYPT] Bot error:', error.message));
  bot.on('end', () => {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    navigationRecovery?.stop();
    console.log('[KRYPT] Disconnected. This build resumes after death/respawn, but does not auto-reconnect after a kick/disconnect.');
  });

  if (loopTimer) clearInterval(loopTimer);
  loopTimer = setInterval(async () => {
    if (loopBusy || !bot?.entity || !brain?.autonomous) return;
    loopBusy = true;
    try {
      // Keep survival maintenance running while combat is active, but never let normal tasks override combat movement.
      await brain.survivalStep();
      const engaged = await combat.step();
      if (!engaged) await brain.step(tasks, progression, combat);
    } catch (e) { console.error('[KRYPT] Decision loop error:', e.message); }
    finally { loopBusy = false; }
  }, config.decisionIntervalMs);
}

setupBot();
