/**
 * Test manual (no framework) para la selección de asiento + buy-in.
 * Correr con: node seat_selection_test.js
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

function makePlayer(playerId) {
  return {
    isBot: false,
    connection: {},
    socketKey: 'key-' + playerId,
    playerId: playerId,
    playerMoney: 0,
    seatIndex: -1,
  };
}

function makeRoom() {
  const room = Object.create(Room.prototype);
  room.maxSeats = 7;
  room.buyInMin = 200;
  room.buyInMax = 2000;
  room.players = [];
  room.playersToAppend = [];
  room.triggerNewGame = function () {}; // no-op, isolate from game engine
  return room;
}

// --- Test 1: getFreeSeatIndexes con mesa vacía ---
(function () {
  const room = makeRoom();
  assert(room.getFreeSeatIndexes().length === 7, 'Mesa vacía tiene 7 asientos libres');
})();

// --- Test 2: elegir asiento válido con buy-in válido ---
(function () {
  const room = makeRoom();
  const p = makePlayer(1);
  const result = room.playerSelectSeat(p, 3, 500);
  assert(result.result === true, 'playerSelectSeat acepta asiento y buy-in válidos');
  assert(p.seatIndex === 3, 'Al jugador se le asigna el asiento pedido');
  assert(p.playerMoney === 500, 'Al jugador se le asigna el buy-in pedido como fichas');
  assert(room.playersToAppend.indexOf(p) !== -1, 'El jugador queda en cola para entrar a la mesa');
})();

// --- Test 3: no se puede tomar un asiento ya ocupado ---
(function () {
  const room = makeRoom();
  const p1 = makePlayer(1);
  room.playerSelectSeat(p1, 2, 500);
  room.players.push(p1); // simula que ya está sentado
  room.playersToAppend = [];

  const p2 = makePlayer(2);
  const result = room.playerSelectSeat(p2, 2, 500);
  assert(result.result === false, 'No se puede sentar dos jugadores en el mismo asiento');
})();

// --- Test 4: buy-in fuera de rango se rechaza ---
(function () {
  const room = makeRoom();
  const pLow = makePlayer(1);
  const resultLow = room.playerSelectSeat(pLow, 0, 50); // menor al mínimo (200)
  assert(resultLow.result === false, 'Buy-in por debajo del mínimo se rechaza');

  const pHigh = makePlayer(2);
  const resultHigh = room.playerSelectSeat(pHigh, 1, 999999); // mayor al máximo (2000)
  assert(resultHigh.result === false, 'Buy-in por encima del máximo se rechaza');
})();

// --- Test 5: número de asiento inválido se rechaza ---
(function () {
  const room = makeRoom();
  const p = makePlayer(1);
  assert(room.playerSelectSeat(p, 7, 500).result === false, 'Asiento fuera de rango (>= maxSeats) se rechaza');
  assert(room.playerSelectSeat(p, -1, 500).result === false, 'Asiento negativo se rechaza');
})();

console.log('\n' + (failed === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ HAY TESTS FALLANDO') + ' (' + passed + '/' + (passed + failed) + ')');
process.exit(failed === 0 ? 0 : 1);
