/**
 * Test manual (no framework) para el freno de recursion de bettingRound.
 * Simula el escenario real que crasheo produccion: bettingRound se llama a
 * si mismo sin converger. Antes del fix esto tiraba abajo TODO el proceso
 * con "RangeError: Maximum call stack size exceeded".
 *
 * Correr con: node betting_round_guard_test.js
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

// Room amañado para que SIEMPRE tome la rama que se re-llama a si misma
// (isCallSituation && verifyBets !== -1), como pasaba en produccion.
const room = Object.create(Room.prototype);
room.roomName = 'Test Room';
room.isCallSituation = true;
room.smallBlindGiven = true;
room.bigBlindGiven = true;
room.bigBlindPlayerHadTurn = true;
room.getActivePlayers = function () { return true; };
room.verifyPlayersBets = function () { return 0; }; // siempre "alguien debe igualar" (nunca -1)
room.getNotRoundPlayedPlayer = function () { return -1; };
room.players = [undefined]; // fuerza a caer en la rama recursiva pura, sin tocar logica de turno

let threw = false;
try {
  room.bettingRound(0); // sin el guard, esto recursiona sin fin y explota la pila
} catch (e) {
  threw = true;
  console.log('Excepcion: ' + e.message);
}

assert(threw === false, 'bettingRound con recursion infinita NO tira RangeError (guard activo)');

// Dar tiempo a que corra el setImmediate de reintento y confirmar que el proceso sigue vivo
setTimeout(function () {
  assert(true, 'El proceso sigue vivo despues del guard (no crasheo)');
  console.log('\n' + (failed === 0 ? '✅ TODOS LOS TESTS PASARON' : '❌ HAY TESTS FALLANDO') + ' (' + passed + '/' + (passed + failed) + ')');
  process.exit(failed === 0 ? 0 : 1);
}, 100);
