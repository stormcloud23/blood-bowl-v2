import {Connection, players, playerData, declineInducements} from './protocol.mjs';
const $ = id => document.getElementById(id);
let selected = null;
const logs = [];
function log(index, message) {
  logs.unshift(`${index === 0 ? 'HOME' : 'AWAY'} ${JSON.stringify(message)}`);
  $('log').textContent = logs.slice(0, 50).join('\n');
}
const connections = [0, 1].map(index => new Connection(index, render, log));
const current = () => connections[Number($('view').value)];
function send(command) {
  try { current().send(command); } catch (error) { $('hint').textContent = error.message; }
}
function action(label, command) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = () => send(command);
  button.disabled = current().socket?.readyState !== WebSocket.OPEN;
  $('controls').append(button);
}
function render() {
  const client = current(), game = client.game;
  $('connection').textContent = connections.map((c, i) => `${i ? 'Away' : 'Home'}: ${c.socket?.readyState === WebSocket.OPEN ? 'connected' : 'offline'}`).join(' · ');
  $('teams').textContent = game ? `${game.teamHome?.teamName || 'Home'} vs ${game.teamAway?.teamName || 'Away'}` : 'Waiting for the server';
  $('phase').textContent = game ? `Half ${game.half} · ${game.turnMode} · ${game.homePlaying ? 'Home' : 'Away'} active` : 'No match loaded';
  $('prompt').textContent = game?.dialogParameter ? JSON.stringify(game.dialogParameter, null, 2) : 'No prompt';
  const roster = players(game);
  $('roster').replaceChildren();
  for (const player of roster) {
    const button = document.createElement('button');
    button.textContent = `${player.side ? 'A' : 'H'} ${player.playerNr}. ${player.playerName}`;
    button.classList.toggle('selected', player.playerId === selected);
    button.onclick = () => select(player.playerId);
    $('roster').append(button);
  }
  $('pitch').replaceChildren();
  for (let y = 0; y < 15; y++) for (let x = 0; x < 26; x++) {
    const tile = document.createElement('button');
    tile.className = `tile${x === 0 || x === 25 ? ' endzone' : ''}${y === 3 || y === 10 ? ' wide' : ''}${x === 12 ? ' mid' : ''}`;
    const player = roster.find(p => { const c = playerData(game, p.playerId)?.playerCoordinate; return c?.[0] === x && c?.[1] === y; });
    tile.setAttribute('aria-label', `Square ${x}, ${y}${player ? `: ${player.playerName}` : ''}`);
    if (player) {
      const token = document.createElement('span');
      token.className = `token${player.side ? ' away' : ''}${selected === player.playerId ? ' selected' : ''}`;
      token.textContent = player.playerNr;
      tile.append(token);
    }
    if (game?.fieldModel?.ballCoordinate?.[0] === x && game.fieldModel.ballCoordinate[1] === y) tile.classList.add('ball');
    tile.onclick = () => clickSquare([x, y], player);
    $('pitch').append(tile);
  }
  $('controls').replaceChildren();
  const prompt = game?.dialogParameter;
  if (game?.turnMode === 'startGame' && !game.started) action('Ready / start', {netCommandId:'clientStartGame'});
  if (prompt?.dialogId === 'buyPrayersAndInducements' && prompt.teamId === game.teamHome.teamId) action('Buy no inducements', declineInducements(prompt));
  if (prompt?.dialogId === 'coinChoice') {
    action('Heads', {netCommandId:'clientCoinChoice', choiceHeads:true});
    action('Tails', {netCommandId:'clientCoinChoice', choiceHeads:false});
  }
  if (prompt?.dialogId === 'receiveChoice' && prompt.choosingTeamId === game.teamHome.teamId) {
    action('Receive', {netCommandId:'clientReceiveChoice', choiceReceive:true});
    action('Kick', {netCommandId:'clientReceiveChoice', choiceReceive:false});
  }
  if (game?.homePlaying && ['setup', 'regular'].includes(game.turnMode)) action('End turn / finish setup', {netCommandId:'clientEndTurn', turnMode:game.turnMode, playersAtCoordinates:{}});
  if (game) $('hint').textContent = selected ? `Selected ${roster.find(p => p.playerId === selected)?.playerName || selected}. Click a square to place during setup or move during a turn.` : 'Select a roster player or a player on the pitch. Use the other coach view for their decisions.';
}
function select(id) {
  selected = id;
  const game = current().game;
  if (game && !game.teamHome.playerArray.some(p => p.playerId === id)) {
    selected = null; $('hint').textContent = 'Switch coach view to control this team.'; return;
  }
  if (game?.turnMode === 'regular') send({netCommandId:'clientActingPlayer', playerId:id, playerAction:'move', jumping:false});
  render();
}
function clickSquare(coordinate, player) {
  const game = current().game;
  if (player) { select(player.playerId); return; }
  if (!selected || !game) return;
  if (game.turnMode?.toLowerCase().includes('setup')) send({netCommandId:'clientSetupPlayer', playerId:selected, coordinate});
  else if (game.turnMode === 'regular') {
    const from = playerData(game, selected)?.playerCoordinate;
    if (!from || Math.max(Math.abs(from[0]-coordinate[0]),Math.abs(from[1]-coordinate[1])) !== 1) {
      $('hint').textContent = 'This prototype supports one adjacent move at a time.'; return;
    }
    send({netCommandId:'clientMove', actingPlayerId:selected, coordinateFrom:from, coordinatesTo:[coordinate], ballAndChainReRollSetting:null});
  } else $('hint').textContent = `Pitch input is not implemented for ${game.turnMode}. The protocol inspector shows the pending prompt.`;
}
$('connect').onclick = () => {
  const name = $('match').value.trim();
  if (!name) { $('hint').textContent = 'Enter a match name first.'; return; }
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/command`;
  connections[0].connect(name, url);
  // Wait until the first team is joined before joining the second coach.
  const first = connections[0];
  const update = render;
  first.onUpdate = message => {
    update(message);
    if (message?.netCommandId === 'serverJoin') {
      first.onUpdate = update;
      connections[1].connect(name, url);
    }
  };
};
$('view').onchange = () => { selected = null; render(); };
$('send').onclick = () => { try { send(JSON.parse($('command').value)); } catch (error) { $('hint').textContent = error.message; } };
render();
