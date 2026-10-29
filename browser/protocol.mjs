// FFB JSON wire format. State changes come only from the Java server.
export const coaches = [
  {coach: 'Kalimar', password: 'f14bcf4b9ce4dd76dcc324a034dcabb6', teamId: 'teamHumanKalimar'},
  {coach: 'BattleLore', password: '77acbde639f9676910987a94227d1192', teamId: 'teamHumanBattleLore'}
];
export function joinCommand(index, gameName) {
  return {netCommandId: 'clientJoin', clientMode: 'player', ...coaches[index], gameId: 0,
    gameName, teamName: '', protocolVersion: '', clientName: 'FFB Browser prototype', clientVersion: '0.1.0'};
}
export function players(game) {
  return ['teamHome', 'teamAway'].flatMap((key, side) => (game?.[key]?.playerArray || []).map(player => ({...player, side})));
}
export function playerData(game, id) {
  return game?.fieldModel?.playerDataArray?.find(player => player.playerId === id);
}
export function declineInducements(prompt) {
  return {netCommandId:'clientBuyInducements', teamId:prompt.teamId, availableGold:prompt.availableGold,
    starPlayerPositionIds:[], staffPositionIds:[], mercenaryPositionIds:[], mercenarySkills:[]};
}
const lowerFirst = text => text[0].toLowerCase() + text.slice(1);
export function applyChanges(game, message) {
  if (!game) return;
  for (const change of message.modelChangeList?.modelChangeArray || []) {
    const {modelChangeId: id, modelChangeKey: key, modelChangeValue: value} = change;
    if (id === 'fieldModelSetPlayerCoordinate' || id === 'fieldModelSetPlayerState') {
      const data = playerData(game, key);
      if (data) data[id.endsWith('Coordinate') ? 'playerCoordinate' : 'playerState'] = value;
    } else if (id === 'fieldModelRemovePlayer') {
      const data = playerData(game, key);
      if (data) data.playerCoordinate = null;
    } else {
      const groups = [['gameSet', game], ['fieldModelSet', game.fieldModel], ['actingPlayerSet', game.actingPlayer]];
      const group = groups.find(([prefix]) => id.startsWith(prefix));
      if (group && group[1]) group[1][lowerFirst(id.slice(group[0].length))] = value;
      else if (id.startsWith('turnDataSet')) {
        const turn = key === 'home' ? game.turnDataHome : key === 'away' ? game.turnDataAway : null;
        if (turn) turn[lowerFirst(id.slice(11))] = value;
      } else if (id === 'fieldModelAddMoveSquare') {
        (game.fieldModel.moveSquareArray ||= []).push(value);
      } else if (id === 'fieldModelRemoveMoveSquare') {
        game.fieldModel.moveSquareArray = (game.fieldModel.moveSquareArray || []).filter(square => JSON.stringify(square.coordinate) !== JSON.stringify(value.coordinate));
      }
    }
  }
}
export class Connection {
  constructor(index, onUpdate, onLog) {
    this.index = index;
    this.onUpdate = onUpdate;
    this.onLog = onLog;
  }
  connect(gameName, url) {
    this.close();
    this.game = null;
    const socket = this.socket = new WebSocket(url);
    socket.onopen = () => { this.send(joinCommand(this.index, gameName)); this.onUpdate(); };
    socket.onmessage = async event => {
      if (socket !== this.socket) return;
      try {
        const message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
        if (message.netCommandId === 'serverGameState') this.game = message.game;
        if (message.netCommandId === 'serverModelSync') applyChanges(this.game, message);
        if (message.netCommandId !== 'serverGameTime') this.onLog(this.index, message);
        this.onUpdate(message);
      } catch (error) { this.onLog(this.index, {error: error.message}); }
    };
    socket.onerror = () => this.onLog(this.index, {error: 'Connection failed. Start browser/start.ps1 and use its local URL.'});
    socket.onclose = () => this.onUpdate();
  }
  send(command) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Connect to the server first.');
    this.socket.send(JSON.stringify(command));
  }
  close() { if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null; } }
}
