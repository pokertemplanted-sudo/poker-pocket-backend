/**
 * Test manual (no framework) para validar el fix de turno.
 * Ejercita Room.prototype.playerFold/playerCheck/playerRaise directamente,
 * sin levantar WebSocket ni DB real.
 *
 * Correr con: node turn_validation_test.js
 */
'use strict';

// Cargamos el módulo real de room.js y usamos sus prototypes directamente,
// pero necesitamos evitar que 'require' explote por dependencias de config/DB
// que no usamos en este test (playerFold/Check/Raise no las tocan).
const { Room } = require('./src/app/room.js'); // room.js exporta `exports.Room = Room;`

function makeFakePlayer(playerId, money) {
  return {
    isBot: false,
    connection: {}, // "conectado"
    socketKey: 'valid-key-' + playerId,
    playerId: playerId,
    playerMoney: money,
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

function makeFakeRoom() {
  const p0 = makeFakePlayer(1001, 1000); // connection_id 1001, asiento 0
  const p1 = makeFakePlayer(2002, 1000); // connection_id 2002, asiento 1

  return {
    players: [p0, p1],
    current_player_turn: 0, // le toca al asiento 0 (p0 / connection_id 1001)
    smallBlindGiven: true,
    bigBlindGiven: true,
    isCallSituation: false,
    totalPot: 100,
    roomMinBet: 10,
    currentHighestBet: 0,
    // stubs no-op para evitar tocar WebSocket real:
    sendLastPlayerAction: function () {},
    sendAudioCommand: function () {},
    // métodos reales del prototype que playerFold/Check/Raise necesitan:
    getPlayerId: Room.prototype.getPlayerId,
    checkHighestBet: Room.prototype.checkHighestBet,
    someOneHasAllIn: Room.prototype.someOneHasAllIn,
  };
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('❌ FAIL: ' + msg);
  } else {
    console.log('✅ PASS: ' + msg);
  }
}

// --- Test 1: jugador fuera de turno NO puede hacer check ---
(function testOutOfTurnCheckRejected() {
  const room = makeFakeRoom();
  const outOfTurnPlayer = room.players[1]; // asiento 1, no es su turno (current_player_turn = 0)
  const moneyBefore = outOfTurnPlayer.playerMoney;
  const stateBefore = outOfTurnPlayer.playerState;

  Room.prototype.playerCheck.call(room, outOfTurnPlayer.playerId, outOfTurnPlayer.socketKey);

  assert(
    outOfTurnPlayer.playerMoney === moneyBefore && outOfTurnPlayer.playerState === stateBefore,
    'playerCheck fuera de turno no debe cambiar el estado del jugador'
  );
})();

// --- Test 2: jugador fuera de turno NO puede hacer raise ---
(function testOutOfTurnRaiseRejected() {
  const room = makeFakeRoom();
  const outOfTurnPlayer = room.players[1];
  const moneyBefore = outOfTurnPlayer.playerMoney;

  Room.prototype.playerRaise.call(room, outOfTurnPlayer.playerId, outOfTurnPlayer.socketKey, 50);

  assert(
    outOfTurnPlayer.playerMoney === moneyBefore,
    'playerRaise fuera de turno no debe descontar fichas'
  );
})();

// --- Test 3: jugador fuera de turno NO puede hacer fold ---
(function testOutOfTurnFoldRejected() {
  const room = makeFakeRoom();
  const outOfTurnPlayer = room.players[1];

  Room.prototype.playerFold.call(room, outOfTurnPlayer.playerId, outOfTurnPlayer.socketKey);

  assert(
    outOfTurnPlayer.isFold === false,
    'playerFold fuera de turno no debe marcar al jugador como foldeado'
  );
})();

// --- Test 4: el jugador CORRECTO (el del turno) SÍ puede actuar ---
(function testInTurnCheckAccepted() {
  const room = makeFakeRoom();
  const inTurnPlayer = room.players[0]; // asiento 0, es su turno

  Room.prototype.playerCheck.call(room, inTurnPlayer.playerId, inTurnPlayer.socketKey);

  assert(
    inTurnPlayer.playerState === 2, // PLAYER_STATE_CHECK
    'playerCheck del jugador correcto (en su turno) SÍ debe aplicarse'
  );
})();

// --- Test 5: el jugador correcto SÍ puede hacer fold ---
(function testInTurnFoldAccepted() {
  const room = makeFakeRoom();
  const inTurnPlayer = room.players[0];

  Room.prototype.playerFold.call(room, inTurnPlayer.playerId, inTurnPlayer.socketKey);

  assert(
    inTurnPlayer.isFold === true,
    'playerFold del jugador correcto (en su turno) SÍ debe aplicarse'
  );
})();

// --- Test 6: socketKey inválido sigue rechazado (no rompimos la validación existente) ---
(function testInvalidSocketKeyStillRejected() {
  const room = makeFakeRoom();
  const inTurnPlayer = room.players[0];

  Room.prototype.playerCheck.call(room, inTurnPlayer.playerId, 'socket-key-incorrecta');

  assert(
    inTurnPlayer.playerState === 0, // PLAYER_STATE_NON, sin cambios
    'playerCheck con socketKey inválida sigue rechazado'
  );
})();

console.log('\n' + (failures === 0 ? '✅ TODOS LOS TESTS PASARON (6/6)' : `❌ ${failures} TEST(S) FALLARON`));
process.exit(failures === 0 ? 0 : 1);
