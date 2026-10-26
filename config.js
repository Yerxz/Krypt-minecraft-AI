module.exports = {
  host: 'prismsmp.net',
  port: 25565,
  username: '_yerxzglazercpvp',
  auth: 'microsoft',
  version: '1.21.11',
  owner: ['_yerxz', 'vpkz'],
  friends: ['_yerxz'],

  // KRYPT always resumes after spawn/respawn. Low health never disables the brain.
  autonomousOnSpawn: true,
  decisionIntervalMs: 1200,
  maxResourceDistance: 24,
  maxThreatDistance: 16,
  safeHealth: 8,
  safeFood: 15,
  maxLogsPerTrip: 12,
  autoEat: true,
  autoEquipArmor: true,
  autoEquipTotem: true,

  // Mob defense is automatic. Player PvP is opt-in per explicit owner request/target.
  attackHostileMobs: true,
  playerPvPEnabled: true,
  engageRange: 12,
  meleeRange: 3.2,
  allowMeleePvP: true,
  allowMacePvP: true,
  allowCrystalPvP: true,
  allowAnchorPvP: true,
  enableCrystalExplosives: true,
  enableAnchorExplosives: true,

  // Optional free local Ollama planner. Leave enabled; if Ollama is not installed/running,
  // KRYPT uses the built-in intent parser. No paid API or cloud key is required.
  localPlannerEnabled: true,
  ollamaUrl: 'http://127.0.0.1:11434/api/generate',
  ollamaModel: 'qwen2.5:3b',
  plannerTimeoutMs: 20000,

  // Optional Simple Voice Chat speech output. Install the bridge with scripts/setup-voice.ps1.
  voiceEnabled: true,
  voicePluginPath: './voice/mineflayer-simple-voice-chat',
  voiceTempDir: './data/voice',
  voiceMaxCharacters: 320,
  // For a more cinematic local voice, set both paths to Piper executable and an English voice model.
  // Blank values use the built-in Windows offline SAPI voice as a fallback.
  piperExecutable: '',
  piperModel: '',

  memoryFile: './data/memory.json',
  commandRegistryFile: './data/server-commands.json'
};
