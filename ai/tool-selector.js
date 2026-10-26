const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];
const TOOL_SUFFIX = {
  axe: '_axe',
  shovel: '_shovel',
  pickaxe: '_pickaxe'
};

const AXE_BLOCKS = /(?:^|_)(?:log|wood|stem|hyphae|planks|bamboo_block|stripped_.*|bookshelf|chest|barrel|crafting_table|ladder|sign|door|trapdoor|fence|fence_gate|button|pressure_plate|hanging_sign|shelf)(?:$|_)/;
const SHOVEL_BLOCKS = new Set([
  'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium',
  'mud', 'packed_mud', 'muddy_mangrove_roots', 'clay', 'sand', 'red_sand',
  'gravel', 'soul_sand', 'soul_soil', 'snow', 'snow_block', 'powder_snow',
  'farmland', 'dirt_path', 'moss_block', 'moss_carpet', 'mangrove_roots',
  'mushroom_stem'
]);
const PICKAXE_BLOCKS = /(?:stone|cobblestone|deepslate|ore|ancient_debris|obsidian|netherrack|blackstone|basalt|end_stone|prismarine|purpur|bricks|terracotta|concrete|copper|iron|gold|diamond|emerald|lapis|redstone|quartz|amethyst|calcite|tuff|dripstone|bedrock|reinforced_deepslate|crying_obsidian|glowstone|sea_lantern|furnace|anvil|rail|dispenser|dropper|piston|hopper|spawner|command_block|stonecutter|grindstone|brewing_stand|beacon|enchanting_table|ender_chest)/;

function toolTypeForBlock(block) {
  const name = typeof block === 'string' ? block : block?.name || '';
  if (!name) return null;
  if (SHOVEL_BLOCKS.has(name) || /(?:^|_)(?:dirt|sand|gravel|snow|clay)(?:$|_)/.test(name)) return 'shovel';
  if (PICKAXE_BLOCKS.test(name)) return 'pickaxe';
  if (AXE_BLOCKS.test(name) || /(?:^|_)(?:log|wood|stem|hyphae|planks)$/.test(name)) return 'axe';
  return null;
}

async function equipBestTool(bot, block) {
  const type = toolTypeForBlock(block);
  if (!type) return { type: null, item: null, handFallback: false };
  const suffix = TOOL_SUFFIX[type];
  const items = bot.inventory.items();
  let selected = null;
  for (const tier of TOOL_TIERS) {
    selected = items.find(item => item.name === `${tier}${suffix}`);
    if (selected) break;
  }
  if (selected) {
    if (bot.heldItem?.name !== selected.name) await bot.equip(selected, 'hand');
    return { type, item: selected, handFallback: false };
  }
  // No matching tool in inventory: deliberately use an empty hand rather than
  // wasting durability on an unrelated held tool. Minecraft may yield no drop
  // when a block requires a tool or a higher tool tier.
  if (bot.heldItem) {
    try { await bot.unequip('hand'); } catch { /* continue with the current hand if server rejects unequip */ }
  }
  return { type, item: null, handFallback: true };
}

module.exports = { toolTypeForBlock, equipBestTool };
