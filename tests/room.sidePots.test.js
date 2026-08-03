'use strict';

/**
 * Tests para el cálculo de side pots (src/app/room.js:
 * Room.prototype.calculateSidePots) — antes de este fix, roundResultsEnd
 * repartía TODO el totalPot al ganador de mejor mano, sin importar que un
 * jugador short-stack all-in hubiera puesto mucho menos dinero que el resto.
 * Eso le permitía ganar plata que nunca puso en juego, o perder plata que
 * un jugador con stack más grande no debería poder arrebatarle más allá de
 * lo que igualó.
 *
 * Mismo enfoque que los otros archivos de tests: node:test nativo, Room
 * real instanciada en aislamiento, sin mocks de red/DB.
 *
 * Ejecutar con:
 *   node --test tests/room.sidePots.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Room } = require('../src/app/room');
const { Player } = require('../src/app/player');

function buildRoomWithPlayers(playerDefs) {
  const room = new Room(0, 1, null, null);
  room.players = playerDefs.map((def, i) => {
    const p = new Player(null, 'socket' + i, 'conn' + i, 10000, false);
    p.playerName = def.name;
    p.handTotalBet = def.handTotalBet;
    p.isFold = !!def.isFold;
    return p;
  });
  return room;
}

test('calculateSidePots: mesa pareja sin all-in genera un solo pot con todos elegibles', () => {
  const room = buildRoomWithPlayers([
    { name: 'A', handTotalBet: 200 },
    { name: 'B', handTotalBet: 200 },
    { name: 'C', handTotalBet: 200 },
  ]);

  const pots = room.calculateSidePots();

  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 600);
  assert.deepEqual(pots[0].eligible.sort(), [0, 1, 2]);
});

test('calculateSidePots: 3-way all-in con stacks desparejos genera main pot + 2 side pots, sin perder ni un chip', () => {
  // A entra all-in corto con 100, B all-in medio con 300, C cubre con 500.
  const room = buildRoomWithPlayers([
    { name: 'A (short)', handTotalBet: 100 },
    { name: 'B (mid)', handTotalBet: 300 },
    { name: 'C (covers)', handTotalBet: 500 },
  ]);

  const pots = room.calculateSidePots();

  // Main pot: 100 * 3 jugadores = 300, todos elegibles
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), [0, 1, 2]);

  // Side pot 1: (300-100) * 2 jugadores restantes (B, C) = 400
  assert.equal(pots[1].amount, 400);
  assert.deepEqual(pots[1].eligible.sort(), [1, 2]);

  // Side pot 2: (500-300) * 1 jugador restante (C) = 200
  assert.equal(pots[2].amount, 200);
  assert.deepEqual(pots[2].eligible.sort(), [2]);

  // Conservación de dinero: la suma de todos los pots == suma de todas las apuestas
  const total = pots.reduce((sum, p) => sum + p.amount, 0);
  assert.equal(total, 100 + 300 + 500);
});

test('calculateSidePots: dinero de un jugador que se retiró (fold) queda en el pot pero no lo puede ganar', () => {
  const room = buildRoomWithPlayers([
    { name: 'Folded', handTotalBet: 200, isFold: true },
    { name: 'B', handTotalBet: 200 },
    { name: 'C', handTotalBet: 200 },
  ]);

  const pots = room.calculateSidePots();

  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 600); // La plata del que se retiró sigue contando para el tamaño del pot...
  assert.deepEqual(pots[0].eligible.sort(), [1, 2]); // ...pero no es elegible para ganarlo
});

test('calculateSidePots: jugador short-stack que se retira igual no le regala su capa a nadie de más', () => {
  // A (fold) puso 100, B all-in con 300, C cubre con 500.
  // La capa 0-100 la pagaron los 3 => elegibles B y C (A folded).
  // La capa 100-300 la pagaron B y C => elegible solo C, ya que B topeó ahí... en este caso
  // B es el único elegible en su propia capa junto con C.
  const room = buildRoomWithPlayers([
    { name: 'A (fold)', handTotalBet: 100, isFold: true },
    { name: 'B (all-in)', handTotalBet: 300 },
    { name: 'C (covers)', handTotalBet: 500 },
  ]);

  const pots = room.calculateSidePots();

  assert.equal(pots[0].amount, 300); // 100 * 3
  assert.deepEqual(pots[0].eligible.sort(), [1, 2]);

  assert.equal(pots[1].amount, 400); // (300-100) * 2
  assert.deepEqual(pots[1].eligible.sort(), [1, 2]);

  assert.equal(pots[2].amount, 200); // (500-300) * 1
  assert.deepEqual(pots[2].eligible, [2]);

  const total = pots.reduce((sum, p) => sum + p.amount, 0);
  assert.equal(total, 100 + 300 + 500);
});

test('calculateSidePots: sin contribuciones (mano recién empezada) devuelve lista vacía', () => {
  const room = buildRoomWithPlayers([
    { name: 'A', handTotalBet: 0 },
    { name: 'B', handTotalBet: 0 },
  ]);

  const pots = room.calculateSidePots();

  assert.deepEqual(pots, []);
});
