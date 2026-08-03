/**
 * Test manual (no framework) para validar que los bots se retiran de la mesa
 * en cuanto entra un jugador humano, y que no se vuelve a agregar bots
 * mientras haya al menos un humano sentado.
 *
 * Correr con: node dynamic_bots_test.js
 */
'use strict';

const { Room } = require('./src/app/room.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('✅ PASS: ' + message);
  } else {
    failed++;
    console.log('❌ FAIL: ' + message);
  }
}

function makePlayer(playerId, isBot, connected) {
  return {
    isBot: isBot,
    connection: connected ? {} : null,
    socketKey: 'key-' + playerId,
    playerId: playerId,
    playerMoney: 1000,
    totalBet: 0,
    isFold: false,
    isAllIn: false,
    roundPlayed: false,
    playerState: 0,
    setStateFold: function () { this.playerState = 1; this.isFold = true; },
    setStateCheck: function () { this.playerState = 2; },
    setStateRaise: function () { this.playerState = 3; },
  };
}

// --- Test 1: getRoomHumanCount ---
(function () {
  const room = Object.create(Room.prototype);
  room.players = [makePlayer(1, true, true), makePlayer(2, true, true)];
  room.playersToAppend = [];
  assert(room.getRoomHumanCount() === 0, 'getRoomHumanCount() es 0 con solo bots');

  room.players.push(makePlayer(3, false, true));
  assert(room.getRoomHumanCount() === 1, 'getRoomHumanCount() detecta 1 humano sentado');

  room.playersToAppend.push(makePlayer(4, false, true));
  assert(room.getRoomHumanCount() === 2, 'getRoomHumanCount() cuenta humanos en playersToAppend también');
})();

// --- Test 2: evictBotsForHumans no hace nada si no hay humanos ---
(function () {
  const room = Object.create(Room.prototype);
  room.players = [makePlayer(1, true, true), makePlayer(2, true, true)];
  room.playersToAppend = [];
  room.gameStarted = false;
  room.evictBotsForHumans();
  assert(room.players.every(p => p.connection !== null), 'evictBotsForHumans no toca bots si la mesa está vacía de humanos');
})();

// --- Test 3: evictBotsForHumans saca bots apenas hay un humano (mesa sin mano en curso) ---
(function () {
  const room = Object.create(Room.prototype);
  const bot1 = makePlayer(1, true, true);
  const bot2 = makePlayer(2, true, true);
  const human = makePlayer(3, false, true);
  room.players = [bot1, bot2, human];
  room.playersToAppend = [];
  room.gameStarted = false;
  room.evictBotsForHumans();
  assert(bot1.connection === null && bot2.connection === null, 'evictBotsForHumans marca a los bots para salir cuando entra un humano');
  assert(human.connection !== null, 'evictBotsForHumans no toca al jugador humano');
})();

// --- Test 4: evictBotsForHumans fold-ea a los bots si hay una mano en curso ---
(function () {
  const room = Object.create(Room.prototype);
  const bot1 = makePlayer(1, true, true);
  const human = makePlayer(2, false, true);
  room.players = [bot1, human];
  room.playersToAppend = [];
  room.gameStarted = true;
  let foldedIndexes = [];
  room.playerFold = function (i) { foldedIndexes.push(i); };
  room.evictBotsForHumans();
  assert(foldedIndexes.length === 1 && foldedIndexes[0] === 0, 'evictBotsForHumans hace fold al bot antes de sacarlo si hay mano en curso');
  assert(bot1.connection === null, 'evictBotsForHumans desconecta al bot foldeado');
})();

// --- Test 5: evictBotsForHumans limpia bots en cola (playersToAppend) ---
(function () {
  const room = Object.create(Room.prototype);
  const human = makePlayer(1, false, true);
  const queuedBot = makePlayer(2, true, true);
  const queuedHuman = makePlayer(3, false, true);
  room.players = [human];
  room.playersToAppend = [queuedBot, queuedHuman];
  room.gameStarted = false;
  room.evictBotsForHumans();
  assert(room.playersToAppend.length === 1 && room.playersToAppend[0] === queuedHuman, 'evictBotsForHumans saca bots en cola sin tocar humanos en cola');
})();

console.log('\n' + (failed === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ HAY TESTS FALLANDO') + ' (' + passed + '/' + (passed + failed) + ')');
process.exit(failed === 0 ? 0 : 1);
