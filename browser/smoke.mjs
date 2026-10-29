import {Connection, declineInducements, playerData} from './protocol.mjs';
import assert from 'node:assert/strict';
const url = process.env.FFB_URL || 'ws://127.0.0.1:22227/command';
const match = `browser-smoke-${Date.now()}`;
const messages = [[], []];
const connections = [0,1].map(i => new Connection(i, () => {}, (_, message) => {
  messages[i].push(message);
  if (message.error || message.netCommandId === 'serverStatus') console.log(i, JSON.stringify(message));
}));
const waitFor = async (predicate, description) => {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};
try {
  connections[0].connect(match, url);
  await waitFor(() => messages[0].some(m => m.netCommandId === 'serverJoin'), 'home join');
  connections[1].connect(match, url);
  await waitFor(() => connections.every(c => c.game), 'both game snapshots');
  for (const c of connections) assert.ok(c.game.gameOptions.gameOptionArray.some(option => option.gameOptionId === 'rulesVersion' && option.gameOptionValue === 'BB2025'));
  for (const c of connections) c.send({netCommandId:'clientStartGame'});
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const game = connections[0].game;
    if (game.turnMode === 'setup') break;
    const prompt = game.dialogParameter;
    console.log('PREGAME', game.turnMode, JSON.stringify(prompt));
    const client = connections.find(c => c.game.teamHome.teamId === (prompt?.teamId || prompt?.choosingTeamId)) || connections[0];
    if (prompt?.dialogId === 'buyPrayersAndInducements') client.send(declineInducements(prompt));
    else if (prompt?.dialogId?.toLowerCase().includes('coin')) client.send({netCommandId:'clientCoinChoice',choiceHeads:true});
    else if (prompt?.dialogId?.toLowerCase().includes('receive')) client.send({netCommandId:'clientReceiveChoice',choiceReceive:true});
    else if (prompt) client.send({netCommandId:'clientConfirm'});
  }
  const game = connections[0].game;
  console.log('FINAL PHASE', game.turnMode, JSON.stringify(game.dialogParameter));
  assert.equal(game.turnMode,'setup');
  const client = connections.find(c => c.game.homePlaying);
  const player = client.game.teamHome.playerArray[0];
  client.send({netCommandId:'clientSetupPlayer',playerId:player.playerId,coordinate:[12,7]});
  await waitFor(() => JSON.stringify(playerData(client.game,player.playerId)?.playerCoordinate) === '[12,7]', 'server-authorized setup placement');
  const opponent = connections.find(c => c !== client);
  await waitFor(() => JSON.stringify(playerData(opponent.game,player.playerId)?.playerCoordinate) === '[13,7]', 'opponent received mirrored placement');
  assert.equal(messages.flat().filter(m => m.error).length,0);
  console.log('PASS: two coaches joined, BB2025 pregame completed, and server confirmed player placement.');
} finally { connections.forEach(c => c.close()); }
