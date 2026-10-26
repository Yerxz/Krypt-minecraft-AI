
const bedrock = require('bedrock-protocol');
const readline = require('readline');
const { randomUUID } = require('crypto');

const client = bedrock.createClient({
  host: 'PrismSMP.net',
  port: 19132,
  username: 'KryptAI',
  offline: false
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'KRYPT> '
});

let connected = false;
let spawned = false;

client.on('join', () => {
  connected = true;
  console.log('[KRYPT] Joined PrismSMP.');
});

client.on('spawn', () => {
  spawned = true;
  console.log('[KRYPT] Bot spawned and ready.');
  rl.prompt();
});

client.on('text', (packet) => {
  const message = packet.message || '';
  const source = packet.source_name || 'SERVER';

  if (message.trim()) {
    console.log(`\n[${source}] ${message}`);
    rl.prompt();
  }
});

client.on('command_output', (packet) => {
  console.log('\n[KRYPT] Command output:', packet.output);
  if (packet.success_count !== undefined) {
    console.log('[KRYPT] Successful commands:', packet.success_count);
  }
  rl.prompt();
});

client.on('disconnect', (packet) => {
  console.log('\n[KRYPT] Disconnected:', packet);
});

client.on('close', () => {
  connected = false;
  spawned = false;
  console.log('\n[KRYPT] Connection closed.');
});

client.on('error', (error) => {
  console.error('\n[KRYPT] Error:', error.message);
});

function sendCommand(input) {
  const command = input.trim();
  if (!command) return;

  if (!connected || !spawned) {
    console.log('[KRYPT] Wait until the bot has spawned.');
    return;
  }

  if (!command.startsWith('/')) {
    console.log('[KRYPT] Enter a slash command, e.g. /tpa _yerxz');
    return;
  }

  const uuid = randomUUID();

  const onOutput = (packet) => {
    if (packet.origin?.uuid !== uuid) return;

    clearTimeout(timeout);
    client.off('command_output', onOutput);
    console.log('\n[KRYPT] Matching response:', packet.output);
    rl.prompt();
  };

  const timeout = setTimeout(() => {
    client.off('command_output', onOutput);
    console.log(`\n[KRYPT] No matching command response received for: ${command}`);
    console.log('[KRYPT] This does not confirm whether the server received it.');
    rl.prompt();
  }, 5000);

  client.on('command_output', onOutput);

  try {
    client.write('command_request', {
      command,
      origin: {
        type: 'player',
        uuid,
        request_id: '',
        player_entity_id: 0n
      },
      internal: false,
      version: 'latest'
    });

    console.log(`[KRYPT] Sent packet for: ${command}`);
  } catch (error) {
    clearTimeout(timeout);
    client.off('command_output', onOutput);
    console.error('[KRYPT] Failed to send command:', error.message);
  }
}

rl.on('line', (input) => {
  sendCommand(input);
  rl.prompt();
});

rl.on('close', () => {
  client.disconnect();
  process.exit(0);
});

client.on('connect', () => {
  console.log('[KRYPT] Connected to the Bedrock server.');
});

console.log('[KRYPT] Starting Bedrock client...');
rl.prompt();
