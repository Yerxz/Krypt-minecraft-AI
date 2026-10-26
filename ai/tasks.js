const fs = require('fs');
const path = require('path');
const { goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');
const { equipBestTool } = require('./tool-selector');

const ITEM_ALIASES = new Map([
  ['spruce logs', 'spruce_log'], ['spruce log', 'spruce_log'], ['spruce wood', 'spruce_log'],
  ['oak logs', 'oak_log'], ['oak log', 'oak_log'], ['birch logs', 'birch_log'], ['birch log', 'birch_log'],
  ['jungle logs', 'jungle_log'], ['jungle log', 'jungle_log'], ['dark oak logs', 'dark_oak_log'], ['dark oak log', 'dark_oak_log'],
  ['cherry logs', 'cherry_log'], ['cherry log', 'cherry_log'], ['mangrove logs', 'mangrove_log'], ['mangrove log', 'mangrove_log'],
  ['cobble', 'cobblestone'], ['stone', 'cobblestone'], ['logs', 'oak_log'], ['wood', 'oak_log'],
  ['iron', 'raw_iron'], ['diamonds', 'diamond'], ['emeralds', 'emerald'], ['food', 'cooked_beef']
]);
const SAFE_DEPOSIT_KEEP = new Set([
  'wooden_pickaxe','stone_pickaxe','iron_pickaxe','diamond_pickaxe','netherite_pickaxe',
  'wooden_axe','stone_axe','iron_axe','diamond_axe','netherite_axe',
  'wooden_sword','stone_sword','iron_sword','diamond_sword','netherite_sword','shield','bow','crossbow',
  'torch','crafting_table','furnace','water_bucket','bucket','bread','cooked_beef','cooked_porkchop',
  'cooked_mutton','cooked_chicken','cooked_cod','cooked_salmon','baked_potato','golden_carrot',
  'totem_of_undying','elytra','ender_pearl'
]);
const LOG_TYPES = ['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log','pale_oak_log'];
const ITEM_SOURCE_BLOCKS = {
  spruce_log: ['spruce_log'], oak_log: ['oak_log'],
  birch_log: ['birch_log'], jungle_log: ['jungle_log'],
  dark_oak_log: ['dark_oak_log'], acacia_log: ['acacia_log'],
  cherry_log: ['cherry_log'], mangrove_log: ['mangrove_log'],
  cobblestone: ['stone','cobblestone'], coal: ['coal_ore','deepslate_coal_ore'],
  raw_iron: ['iron_ore','deepslate_iron_ore'], raw_copper: ['copper_ore','deepslate_copper_ore'],
  raw_gold: ['gold_ore','deepslate_gold_ore','nether_gold_ore'], diamond: ['diamond_ore','deepslate_diamond_ore'],
  emerald: ['emerald_ore','deepslate_emerald_ore'], redstone: ['redstone_ore','deepslate_redstone_ore'],
  lapis_lazuli: ['lapis_ore','deepslate_lapis_ore'], sand: ['sand'], gravel: ['gravel'], dirt: ['dirt','grass_block','coarse_dirt'],
  clay_ball: ['clay'], obsidian: ['obsidian'], netherrack: ['netherrack'], quartz: ['nether_quartz_ore']
};

class TaskManager {
  constructor(bot, config, brain, combat, memory, registry, planner, reply) {
    Object.assign(this, { bot, config, brain, combat, memory, registry, planner, reply });
    this.active = null; this.taskToken = 0; this.building = false;
  }
  cancel(reason = 'Task cancelled') {
    this.taskToken++; this.active = null; this.bot.pathfinder?.setGoal(null); this.bot.clearControlStates?.();
    this.brain.setTask('autonomous SMP'); this.memory.event(reason);
  }
  normalizeItem(raw) {
    let s = String(raw || '').toLowerCase().trim().replace(/[.!?,]+$/g, '').replace(/\b(a stack of|stack of|some|the|a|an)\b/g, '').trim();
    s = s.replace(/\b(planks)\b/g, 'planks').replace(/\s+/g, ' ');
    if (ITEM_ALIASES.has(s)) return ITEM_ALIASES.get(s);
    s = s.replace(/\s+(logs?)$/, '_log').replace(/\s+/g, '_');
    if (s.endsWith('_logs')) s = s.slice(0, -1);
    if (s === 'spruce_wood') s = 'spruce_log';
    return s;
  }
  parseItemRequest(text) {
    const m = text.match(/\b(?:get|gather|collect|find|fetch|bring me|obtain|mine|chop|go get|please get)\s+(?:(\d+)\s+)?(.+?)(?:\s+for me)?[.!?]*$/i);
    if (!m) return null;
    let quantity = Number(m[1] || 1);
    let raw = m[2].trim();
    if (/\bstacks?\b/i.test(raw)) { quantity *= 64; raw = raw.replace(/\b(?:\d+\s+)?stacks? of?\b/ig, '').trim(); }
    raw = raw.replace(/\b(?:please|for me|from nearby|as soon as possible)\b/ig, '').trim();
    if (!raw || raw.length > 60) return null;
    const itemName = this.normalizeItem(raw);
    if (!/^[a-z0-9_]+$/.test(itemName)) return null;
    return { itemName, quantity: Math.max(1, Math.min(quantity, 4096)), raw };
  }
  async handlePrivateMessage(message) {
    const text = String(message || '').trim(); if (!text) return;
    if (text.startsWith('/')) return this.executeServerCommand(text);
    const lower = text.toLowerCase();
    if (/^(hi|hey|hello|yo|sup|hiya|good morning|good evening|good afternoon)[!. ]*$/.test(lower)) return this.reply('Hey! I am here. I am working on my survival progression, and you can give me a task whenever you want.');
    if (/^(?:!help|help|what can you do\??)$/.test(lower)) return this.reply('I can gather requested items, follow/come to you, collect nearby drops, deposit items into a nearby chest, build from local schematic files, explore, defend myself, and execute exact server commands starting with /. I keep working on survival progression between requests.');
    if (/^(?:!status|status|how are you|what are you doing\??)$/.test(lower)) return this.reply(`Task: ${this.brain.task}; health ${Math.round(this.bot.health || 0)}/20; food ${Math.round(this.bot.food || 0)}/20; task: ${this.active?.type || 'autonomous SMP'}.`);
    if (/^(?:!inv|inventory|what(?:'s| is) in your inventory\??)$/.test(lower)) return this.reply(this.inventoryText());
    if (/^(?:stop following me|stop following|cancel that|stop your task|stop task|cancel task|stop building|stop gathering)$/.test(lower)) { this.cancel('Owner cancelled current task'); this.brain.autonomous = true; return this.reply('Cancelled the active task. I am returning to autonomous SMP behavior.'); }

    const dropMatch = text.match(/\b(?:drop|give|throw)\s+(?:me\s+)?(?:(\d+)\s+)?(.+?)(?:\s+(?:to|for)\s+me)?[.!?]*$/i);
    if (dropMatch && /\b(?:drop|give|throw)\b/i.test(lower) && !/\b(?:drop rates|drop chance|drop table)\b/i.test(lower)) {
      let amount = Math.max(1, Math.min(4096, Number(dropMatch[1] || 64)));
      let raw = dropMatch[2].replace(/\s+(?:to|for)\s+me$/i, '').trim();
      if (/^(?:everything|all items|all my items|all inventory)$/i.test(raw)) raw = '*';
      const itemName = raw === '*' ? '*' : this.normalizeItem(raw);
      this.cancel('Owner requested item drop');
      this.active = { type: 'drop_items', itemName, amount, startedAt: Date.now() };
      this.brain.setTask('dropping items for owner');
      this.reply(itemName === '*' ? 'I will drop the items I can safely spare.' : `I will try to drop ${amount} ${itemName.replaceAll('_',' ')} for you.`);
      return;
    }
    const craftMatch = text.match(/\bcraft\s+(?:(\d+)\s+)?(.+?)[.!?]*$/i);
    if (craftMatch) {
      const quantity = Math.max(1, Math.min(4096, Number(craftMatch[1] || 1)));
      const itemName = this.normalizeItem(craftMatch[2]);
      this.cancel('Owner requested crafting');
      this.active = { type: 'craft_item', itemName, quantity, startedAt: Date.now(), lastProgressAt: Date.now(), attempts: 0 };
      this.brain.setTask(`crafting ${quantity} ${itemName}`);
      this.reply(`I will check my inventory and nearby crafting table, then try to craft ${quantity} ${itemName.replaceAll('_',' ')}. If materials or a required station are missing, I will tell you what is blocking it.`);
      return;
    }

    const buildMatch = text.match(/\b(?:build|construct|load)\s+(?:the\s+)?(?:schematic\s+)?([\w .-]+\.(?:schem|schematic|litematic))\b/i);
    if (buildMatch) return this.startSchematicBuild(buildMatch[1].trim());
    if (/\b(?:put|deposit|store|move)\b/i.test(lower) && /\b(?:items?|everything|loot|inventory|blocks?|logs?)\b/i.test(lower) && /\b(?:chest|barrel|storage)\b/i.test(lower)) {
      const itemMatch = text.match(/\b(?:put|deposit|store|move)\s+(?:all\s+)?(.+?)\s+(?:into|in|inside)\s+(?:this|the|a|nearby)?\s*(?:chest|barrel|storage)\b/i);
      const rawItem = itemMatch && !/^(all items|everything|my items|items|loot|inventory)$/i.test(itemMatch[1].trim()) ? itemMatch[1].trim() : null;
      this.cancel('Owner requested chest storage'); this.active = { type: 'deposit', itemName: rawItem ? this.normalizeItem(rawItem) : null, startedAt: Date.now() };
      this.brain.setTask('storing items in chest'); this.reply(rawItem ? `I will look for a nearby chest and store ${rawItem}.` : 'I will look for a nearby chest and store the items I can spare while keeping useful gear, tools, food, and emergency supplies.'); return;
    }
    if (/\b(build|make|construct)\b/i.test(lower)) {
      return this.reply('I can load a local .schem, .schematic, or .litematic blueprint when you give me its filename. For a custom build, I need a blueprint or a supported build plan; I will not pretend a structure was built when it was not.');
    }
    const itemRequest = this.parseItemRequest(text);
    if (itemRequest && !/\b(?:what|why|how|can you|could you|do you know)\b/i.test(lower)) {
      this.cancel(`Owner requested ${itemRequest.quantity} ${itemRequest.itemName}`);
      this.active = { type: 'get_item', ...itemRequest, startedAt: Date.now(), lastProgressAt: Date.now(), noSourceCount: 0, attempts: 0 };
      this.brain.setTask(`getting ${itemRequest.quantity} ${itemRequest.itemName}`);
      this.reply(`Understood. I will try to collect ${itemRequest.quantity} ${itemRequest.itemName.replaceAll('_',' ')}. I will check my inventory and nearby drops first, then gather it if I can. I will report any blocker instead of silently giving up.`); return;
    }

    let intent = this.parseIntent(text);
    if (intent.intent === 'unknown') {
      try { const learned = await this.planner.interpret(text, { task: this.brain.task, health: this.bot.health, food: this.bot.food }); if (learned && learned.intent !== 'unknown') intent = learned; } catch {}
    }
    if (intent.intent !== 'unknown') return this.executeIntent(intent, text);
    // Optional local Ollama model can answer general chat/questions without a paid API.
    try {
      const answer = await this.planner.answer(text, { task: this.brain.task, health: this.bot.health, food: this.bot.food, inventory: this.inventoryText() });
      if (answer) return this.reply(answer);
    } catch {}
    // Always acknowledge owner messages, including casual conversation and unsupported questions.
    if (/\?$/.test(text) || /\b(what|why|when|where|who|how|can you|could you|are you|do you)\b/i.test(lower)) {
      return this.reply(`I understood your question: “${text.slice(0, 100)}”. I cannot answer that accurately without the optional local Ollama model, and I will not make up an answer.`);
    }
    return this.reply(`I heard you: “${text.slice(0, 120)}”. I do not have a safe action mapped for that message yet, but I will not ignore you. Try an item request, follow/come instruction, chest-storage task, schematic filename, or exact server command.`);
  }
  parseIntent(text) {
    const s = text.toLowerCase();
    if (/\b(follow me|follow me around|stick with me|stay with me)\b/.test(s)) return { intent: 'follow' };
    if (/\b(come (?:here|to me)|come to me|come over|meet me|come back to me)\b/.test(s)) return { intent: 'come' };
    if (/\b(stop following|stop tailing)\b/.test(s)) return { intent: 'stop_following' };
    if (/\b(explore|look around|scout|explore the area)\b/.test(s)) return { intent: 'explore' };
    if (/\b(protect me|defend me|guard me|help me fight)\b/.test(s)) return { intent: 'defend' };
    if (/\b(attack|kill|fight)\b/.test(s)) { const m = text.match(/(?:attack|kill|fight)(?:\s+player)?\s+([A-Za-z0-9_]{3,16})/i); if (m) return { intent: 'attack_player', target: m[1] }; }
    if (/\b(stop|pause|cancel)\b/.test(s)) return { intent: 'stop_task' };
    return { intent: 'unknown', details: text };
  }
  async executeIntent(intent, original) {
    switch (intent.intent) {
      case 'follow': this.cancel('Owner requested follow'); this.active = { type: 'follow' }; this.brain.setTask('following owner'); return this.reply('I will follow you. Tell me “stop following me” to end this task.');
      case 'come': {
        const owner = this.bot.players[this.config.owner]; if (!owner?.entity) return this.reply('I cannot currently see your player. Come within view and ask me again.');
        this.cancel('Owner requested come here'); this.brain.setTask('coming to owner');
        try { await this.bot.pathfinder.goto(new goals.GoalNear(owner.entity.position.x, owner.entity.position.y, owner.entity.position.z, 2)); this.brain.setTask('autonomous SMP'); return this.reply('I reached your location.'); }
        catch (e) { this.brain.setTask('autonomous SMP'); return this.reply(`I could not reach you: ${e.message}`); }
      }
      case 'stop_following': this.cancel('Owner stopped follow'); return this.reply('Stopped following. Returning to autonomous SMP behavior.');
      case 'explore': this.cancel('Owner requested exploration'); this.active = { type: 'explore', remaining: 4 }; this.brain.setTask('exploring on owner request'); return this.reply('I will scout the nearby area.');
      case 'defend': this.combat.defendOwner = true; this.brain.setTask('protecting owner'); return this.reply('I will prioritize hostile mobs near you. Player PvP remains disabled unless you explicitly request it.');
      case 'attack_player': this.combat.playerPvPEnabled = true; this.combat.setTarget(intent.target); this.brain.setTask(`engaging requested player ${intent.target}`); return this.reply(`I will attempt to engage ${intent.target}.`);
      case 'stop_task': this.cancel('Owner requested stop task'); return this.reply('Task cancelled. I am returning to autonomous SMP behavior.');
      case 'status': return this.reply(`Task: ${this.brain.task}; HP ${Math.round(this.bot.health || 0)}/20; food ${Math.round(this.bot.food || 0)}/20.`);
      case 'inventory': return this.reply(this.inventoryText());
      case 'help': return this.reply('I can gather items, follow/come, deposit items, build local schematics, explore, defend, and execute exact slash commands.');
      default: return this.reply(`I heard “${original}”, but I cannot carry it out yet.`);
    }
  }
  async startSchematicBuild(filename) {
    if (!this.bot.builder || !this.schematicApi) return this.reply('Schematic building is not available because its plugin did not load. Run npm install and check the startup log.');
    const safe = path.basename(filename);
    const full = path.resolve(__dirname, '..', 'schematics', safe);
    if (!full.startsWith(path.resolve(__dirname, '..', 'schematics') + path.sep) || !fs.existsSync(full)) return this.reply(`I cannot find ${safe}. Put the schematic file in the project’s schematics folder first.`);
    this.cancel('Owner requested schematic construction'); this.building = true; this.brain.setTask(`building ${safe}`);
    try {
      const bytes = await fs.promises.readFile(full);
      const schematic = await this.schematicApi.Schematic.read(bytes, this.bot.version);
      const build = new this.schematicApi.Build(schematic, this.bot.world, this.bot.entity.position.floored());
      this.reply(`I loaded ${safe}. Starting construction at my current position. I will report progress and any material or placement problems.`);
      this.bot.builder.build(build, { buildSpeed: 1, onError: 'retry', retryCount: 3, useNearestChest: true, bots: [this.bot] })
        .then(() => { this.building = false; this.brain.setTask('autonomous SMP'); this.memory.increment('tasksCompleted'); this.reply(`Construction attempt for ${safe} finished. Check the build and my console for any skipped or failed blocks.`); })
        .catch(e => { this.building = false; this.brain.setTask('autonomous SMP'); this.reply(`I could not finish ${safe}: ${e.message}`); });
    } catch (e) { this.building = false; this.brain.setTask('autonomous SMP'); this.reply(`Could not load ${safe}: ${e.message}`); }
  }
  executeServerCommand(command) {
    const clean = command.trim();
    if (!/^\/[A-Za-z0-9_:-]+(?:\s+[^\r\n]*)?$/.test(clean) || clean.length > 240) return this.reply('That command contains unsupported characters or is too long; I did not send it.');
    this.registry.record(this.bot, clean, 'sent'); this.bot.chat(clean); this.reply(`Sent exactly: ${clean}. I will watch for a server response, though some servers hide command confirmations.`);
  }
  inventoryText() {
    const items = this.bot.inventory.items(); if (!items.length) return 'My inventory is empty.';
    const counts = {}; for (const item of items) counts[item.name] = (counts[item.name] || 0) + item.count;
    return Object.entries(counts).slice(0, 24).map(([n,c]) => `${n.replaceAll('_',' ')} ×${c}`).join(', ');
  }
  countItem(name) { return this.bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0); }
  findDroppedItem(name = null) {
    let best = null, distance = 18;
    for (const e of Object.values(this.bot.entities || {})) {
      if (!e || e.name !== 'item' || !e.position) continue;
      let stack; try { stack = e.getDroppedItem?.(); } catch {}
      if (name && stack?.name !== name) continue;
      const d = this.bot.entity.position.distanceTo(e.position);
      if (d < distance) { best = e; distance = d; }
    }
    return best;
  }
  async collectDrop(entity) {
    const p = entity.position;
    await this.bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 1));
    await new Promise(r => setTimeout(r, 500));
  }
  async getItemStep(task) {
    const have = this.countItem(task.itemName);
    if (have >= task.quantity) { this.active = null; this.brain.setTask('autonomous SMP'); this.memory.increment('tasksCompleted'); this.reply(`Done: I have ${have} ${task.itemName.replaceAll('_',' ')} in my inventory.`); return true; }
    if (this.bot.inventory.emptySlotCount() === 0 && !this.bot.inventory.items().some(i => i.name === task.itemName && i.count < i.stackSize)) { this.reply(`I have ${have}/${task.quantity} ${task.itemName.replaceAll('_',' ')}, but my inventory is full. Store or remove some items and I can continue.`); this.active = null; this.brain.setTask('autonomous SMP'); return true; }
    const drop = this.findDroppedItem(task.itemName);
    if (drop) { try { await this.collectDrop(drop); task.lastProgressAt = Date.now(); return true; } catch (e) { console.log('[Task] Drop pickup path failed:', e.message); } }
    const blockNames = ITEM_SOURCE_BLOCKS[task.itemName] || (LOG_TYPES.includes(task.itemName) ? [task.itemName] : []);
    if (blockNames.length) {
      const blocks = new Set(blockNames);
      const block = this.bot.findBlock({ matching: b => b && blocks.has(b.name), maxDistance: 48, count: 1 });
      if (block) {
        try {
          if (this.bot.entity.position.distanceTo(block.position) > 4) await this.bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
          const current = this.bot.blockAt(block.position);
          if (current && this.bot.canDigBlock(current)) {
            await equipBestTool(this.bot, current);
            await this.bot.dig(current);
            task.attempts++; task.lastProgressAt = Date.now(); return true;
          }
        } catch (e) { console.log(`[Task] Gathering ${task.itemName}:`, e.message); task.noSourceCount++; }
      } else task.noSourceCount++;
    } else {
      // Try to craft the requested item from currently available materials before declaring a blocker.
      try {
        const mcData = require('minecraft-data')(this.bot.version);
        const item = mcData.itemsByName[task.itemName];
        if (item) {
          const table = this.bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6 });
          const recipes = this.bot.recipesFor(item.id, null, 1, table || null);
          if (recipes?.length) { await this.bot.craft(recipes[0], Math.max(1, Math.ceil((task.quantity - have) / Math.max(1, recipes[0].result?.count || 1))), table || null); task.lastProgressAt = Date.now(); return true; }
        }
      } catch (e) { console.log('[Task] Craft attempt:', e.message); }
      task.noSourceCount++;
    }
    if (task.noSourceCount >= 3 && Date.now() - task.lastProgressAt > 20000) {
      this.active = null; this.brain.setTask('autonomous SMP');
      this.reply(`I could only find ${this.countItem(task.itemName)}/${task.quantity} ${task.itemName.replaceAll('_',' ')}. I could not find a usable source nearby, and I will not keep retrying forever. Try moving me to the right biome or near the required resource, then ask again.`);
      return true;
    }
    if (Date.now() - task.lastProgressAt > 60000) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`I am stuck trying to get ${task.itemName.replaceAll('_',' ')}. I stopped after repeated failures. I have ${this.countItem(task.itemName)}/${task.quantity}.`); return true; }
    return true;
  }
  async craftItemStep(task) {
    try {
      const data = require('minecraft-data')(this.bot.version);
      const def = data.itemsByName[task.itemName];
      if (!def) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`I don't recognize ${task.itemName.replaceAll('_',' ')} as an item in this Minecraft version.`); return true; }
      const current = this.countItem(task.itemName);
      if (current >= task.quantity) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`Done: I have ${current} ${task.itemName.replaceAll('_',' ')}.`); return true; }
      const table = this.bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6 });
      const recipes = this.bot.recipesFor(def.id, null, 1, table || null);
      if (recipes.length) {
        const per = Math.max(1, recipes[0].result?.count || 1);
        const times = Math.max(1, Math.min(64, Math.ceil((task.quantity-current)/per)));
        await this.bot.craft(recipes[0], times, table || null);
        task.lastProgressAt = Date.now(); task.attempts++;
        const after = this.countItem(task.itemName);
        if (after >= task.quantity) { this.active = null; this.brain.setTask('autonomous SMP'); this.memory.increment('tasksCompleted'); this.reply(`Crafted ${after} ${task.itemName.replaceAll('_',' ')}.`); }
        return true;
      }
      task.attempts++;
      if (task.attempts >= 3 || Date.now()-task.lastProgressAt > 30000) {
        this.active = null; this.brain.setTask('autonomous SMP');
        this.reply(`I couldn't craft ${task.itemName.replaceAll('_',' ')} yet. I need the recipe's materials and, for 3×3 recipes, a crafting table within reach. I haven't claimed it was crafted.`);
      }
    } catch (e) {
      task.attempts++;
      if (task.attempts >= 3 || Date.now()-task.lastProgressAt > 30000) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`Crafting ${task.itemName.replaceAll('_',' ')} failed: ${e.message}`); }
      else console.log('[Task] Crafting attempt:', e.message);
    }
    return true;
  }
  async dropItemsStep(task) {
    try {
      const owner = this.bot.players[this.config.owner];
      if (owner?.entity && this.bot.entity.position.distanceTo(owner.entity.position) > 4) {
        await this.bot.pathfinder.goto(new goals.GoalNear(owner.entity.position.x, owner.entity.position.y, owner.entity.position.z, 3));
      }
      const keep = SAFE_DEPOSIT_KEEP;
      const candidates = this.bot.inventory.items().filter(i => task.itemName === '*' ? !keep.has(i.name) : i.name === task.itemName);
      if (!candidates.length) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(task.itemName === '*' ? 'I have no non-essential items to drop.' : `I don't have ${task.itemName.replaceAll('_',' ')} to drop.`); return true; }
      let remaining = task.amount, dropped = 0;
      for (const item of candidates) {
        if (remaining <= 0) break;
        const n = Math.min(item.count, remaining);
        try { await this.bot.toss(item.type, item.metadata, n); dropped += n; remaining -= n; }
        catch (e) { console.log(`[Task] Could not drop ${item.name}:`, e.message); }
      }
      this.active = null; this.brain.setTask('autonomous SMP');
      this.reply(dropped ? `Dropped ${dropped} item(s) near you. Pick them up before they despawn.` : 'I could not drop those items; the server may have rejected the action.');
    } catch (e) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`I couldn't drop the items: ${e.message}`); }
    return true;
  }
  async depositStep(task) {
    const chest = this.bot.findBlock({ matching: b => b && ['chest','trapped_chest','barrel'].includes(b.name), maxDistance: 24 });
    if (!chest) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply('I could not find a chest or barrel within 24 blocks. Move me near the storage you mean and ask again.'); return true; }
    try {
      if (this.bot.entity.position.distanceTo(chest.position) > 3.5) await this.bot.pathfinder.goto(new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2));
      const current = this.bot.blockAt(chest.position);
      const container = await this.bot.openContainer(current);
      let moved = 0;
      for (const item of [...this.bot.inventory.items()]) {
        if (task.itemName && item.name !== task.itemName) continue;
        if (!task.itemName && SAFE_DEPOSIT_KEEP.has(item.name)) continue;
        if (!task.itemName && (item.name.endsWith('_helmet') || item.name.endsWith('_chestplate') || item.name.endsWith('_leggings') || item.name.endsWith('_boots'))) continue;
        try { await container.deposit(item.type, item.metadata, item.count); moved += item.count; } catch (e) { console.log(`[Task] Could not deposit ${item.name}:`, e.message); }
      }
      container.close(); this.active = null; this.brain.setTask('autonomous SMP'); this.memory.increment('tasksCompleted');
      this.reply(moved ? `Stored ${moved} item(s) in the nearby container.` : 'I did not move anything. The chest may be full, or I had no matching items I could safely store.');
    } catch (e) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`I could not store the items: ${e.message}`); }
    return true;
  }
  async beginDeathRecovery() {
    const death = this.memory.data.lastDeathPosition;
    if (!death || !this.memory.data.needsDeathRecovery || !this.bot.entity) return false;
    this.active = { type: 'death_recovery', position: death, startedAt: Date.now() };
    this.brain.setTask('returning to last death location'); this.reply(`I am trying to return to my last death location (${death.x}, ${death.y}, ${death.z}) and recover dropped items if they remain.`); return true;
  }
  async deathRecoveryStep(task) {
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(task.position.x, task.position.y, task.position.z, 3));
      await new Promise(r => setTimeout(r, 1500));
      for (let i = 0; i < 12; i++) { const drop = this.findDroppedItem(); if (!drop) break; await this.collectDrop(drop); await new Promise(r => setTimeout(r, 350)); }
      this.memory.data.needsDeathRecovery = false; this.memory.save(); this.active = null; this.brain.setTask('autonomous SMP');
      this.reply('I reached the saved death area and checked for nearby drops. I will resume survival progression now.');
    } catch (e) {
      this.active = null; this.brain.setTask('autonomous SMP'); this.reply(`I could not reach my last death location (${task.position.x}, ${task.position.y}, ${task.position.z}): ${e.message}. The saved location is retained for another attempt.`);
    }
    return true;
  }
  async step() {
    if (!this.brain.autonomous || !this.bot.entity || !this.active || this.building) return false;
    const task = this.active;
    if (task.type === 'get_item') return this.getItemStep(task);
    if (task.type === 'craft_item') return this.craftItemStep(task);
    if (task.type === 'drop_items') return this.dropItemsStep(task);
    if (task.type === 'deposit') return this.depositStep(task);
    if (task.type === 'death_recovery') return this.deathRecoveryStep(task);
    if (task.type === 'follow') {
      const owner = this.bot.players[this.config.owner]; if (!owner?.entity) return true;
      const d = this.bot.entity.position.distanceTo(owner.entity.position);
      if (d > 3) this.bot.pathfinder.setGoal(new goals.GoalFollow(owner.entity, 2), true); else this.bot.pathfinder.setGoal(null);
      this.brain.setTask('following owner'); return true;
    }
    if (task.type === 'explore') {
      if (task.remaining <= 0) { this.active = null; this.brain.setTask('autonomous SMP'); this.reply('Exploration finished. Returning to autonomous SMP behavior.'); return true; }
      task.remaining--; const pos = this.bot.entity.position;
      try { await this.bot.pathfinder.goto(new goals.GoalNear(Math.floor(pos.x + Math.random()*17-8), Math.floor(pos.y), Math.floor(pos.z + Math.random()*17-8), 3)); } catch {}
      return true;
    }
    return false;
  }
}
module.exports = { TaskManager };
