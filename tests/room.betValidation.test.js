'use strict';

/**
 * Tests para la guardia de validación de `amount` en playerRaise
 * (src/app/room.js) — vectores de ataque: negativo, string numérico,
 * string no numérico, NaN, null, decimal.
 *
 * Mismo enfoque que tests/room.turnValidation.test.js: node:test nativo,
 * sin dependencias nuevas, Room real instanciada en aislamiento.
 *
 * Ejecutar con:
 *   node --test tests/room.betValidation.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Room } = require('../src/app/room');
const { Player } = require('../src/app/player');

function buildTwoPlayerRoom() {
  const room = new Room(0, 1, null, null);

  const playerA = new Player(null, 'socketA', 'connA', 1000, true);
  const playerB = new Player(null, 'socketB', 'connB', 1000, true);
  playerA.playerName = 'A';
  playerB.playerName = 'B';

  room.players = [playerA, playerB];
  room.current_player_turn = 0; // le toca a A — así los casos de este archivo
  room.smallBlindGiven = true;  // prueban SOLO la validación de amount, no
  room.bigBlindGiven = true;    // la de turno (ya cubierta en el otro archivo)
  room.currentHighestBet = 20;

  return room;
}

function snapshotRelevant(room) {
  return JSON.stringify({
    current_player_turn: room.current_player_turn,
    totalPot: room.totalPot,
    currentHighestBet: room.currentHighestBet,
    players: room.players.map((p) => ({
      playerMoney: p.playerMoney,
      totalBet: p.totalBet,
      playerState: p.playerState,
      isAllIn: p.isAllIn,
    })),
  });
}

const attackVectors = [
  { label: 'monto negativo', amount: -500 },
  { label: 'string numérico ("100")', amount: '100' },
  { label: 'string no numérico ("hack")', amount: 'hack' },
  { label: 'NaN', amount: NaN },
  { label: 'null', amount: null },
  { label: 'decimal (50.5)', amount: 50.5 },
  { label: 'undefined', amount: undefined },
  { label: 'objeto ({})', amount: {} },
  { label: 'Infinity', amount: Infinity },
];

for (const vector of attackVectors) {
  test(`playerRaise rechaza amount inválido — ${vector.label}: estado sin cambios`, () => {
    const room = buildTwoPlayerRoom();
    const before = snapshotRelevant(room);

    room.playerRaise(room.players[0].playerId, room.players[0].socketKey, vector.amount);

    const after = snapshotRelevant(room);
    assert.strictEqual(
      after,
      before,
      `el estado NO debería cambiar con amount=${JSON.stringify(vector.amount)} — ` +
      `antes=${before} después=${after}`
    );
    // Específicamente: la plata nunca se toca (el bug real era ganar fichas de la nada)
    assert.strictEqual(room.players[0].playerMoney, 1000, 'playerMoney de A no debería tocarse');
    assert.strictEqual(typeof room.players[0].totalBet, 'number', 'totalBet debe seguir siendo number, nunca string');
  });
}

test('playerRaise ACEPTA amount === 0 (el cliente real lo usa como "solo igualar")', () => {
  const room = buildTwoPlayerRoom();
  const before = snapshotRelevant(room);

  room.playerRaise(room.players[0].playerId, room.players[0].socketKey, 0);

  const after = snapshotRelevant(room);
  assert.notStrictEqual(after, before, 'amount=0 debe seguir tratándose como "igualar", no rechazarse');
  assert.strictEqual(room.players[0].totalBet, 20, 'debería haber igualado currentHighestBet (20)');
});

test('playerRaise ACEPTA un amount entero positivo válido (control positivo)', () => {
  const room = buildTwoPlayerRoom();
  const before = snapshotRelevant(room);

  room.playerRaise(room.players[0].playerId, room.players[0].socketKey, 50);

  const after = snapshotRelevant(room);
  assert.notStrictEqual(after, before, 'un raise válido SÍ debe modificar el estado');
  assert.strictEqual(room.players[0].playerMoney, 950, 'playerMoney debería bajar exactamente el monto apostado');
  assert.strictEqual(typeof room.players[0].totalBet, 'number', 'totalBet debe seguir siendo number');
});
