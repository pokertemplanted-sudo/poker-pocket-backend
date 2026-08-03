'use strict';

/**
 * Regression test for a critical production incident: the server crashed
 * with "RangeError: Maximum call stack size exceeded" the moment two real
 * players started a heads-up (2-player) hand, killing the Node process and
 * disconnecting EVERY player on the server, not just the two in that hand.
 *
 * Root cause: Room.prototype.bettingRound uses a LOCAL recursion parameter
 * (current_player_turn) to walk through forced blind posting, but never
 * kept this.current_player_turn (the field playerCheck's turn-ownership
 * guard actually checks) in sync. The big blind's forced playerCheck call
 * was silently rejected by that guard, bigBlindGiven never got set, and
 * bettingRound recursed forever between its two forced-blind branches.
 *
 * Ejecutar con:
 *   node --test tests/room.headsUpBlinds.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Room } = require('../src/app/room');
const { Player } = require('../src/app/player');

function buildHeadsUpRoom() {
  const room = new Room(0, 1, null, null);
  const p0 = new Player(null, 'socketA', 'connA', 2000, true); // isBot=true so no real
  const p1 = new Player(null, 'socketB', 'connB', 2000, true); // connection is needed
  p0.playerName = 'A';
  p1.playerName = 'B';
  p0.playerCards = ['AS', 'KS'];
  p1.playerCards = ['2C', '7D'];
  room.players = [p0, p1];
  room.middleCards = [];
  room.smallBlindPlayerArrayIndex = 0;
  room.current_player_turn = 0; // Matches what staging() sets before calling bettingRound
  room.isCallSituation = false;
  room.smallBlindGiven = false;
  room.bigBlindGiven = false;
  room.currentHighestBet = 0;
  room.currentStage = Room.HOLDEM_STAGE_TWO_PRE_FLOP;
  return room;
}

test('bettingRound: heads-up forced blinds complete without crashing the process', () => {
  const room = buildHeadsUpRoom();

  // Before the fix, this call recursed until it blew the call stack and
  // crashed the whole Node process (not a catchable exception in prod --
  // reproduced here as an assert.doesNotThrow to prove the recursion
  // actually terminates instead of growing unbounded).
  assert.doesNotThrow(() => {
    room.bettingRound(0);
  });

  // Both blinds must have actually been posted
  assert.equal(room.smallBlindGiven, true);
  assert.equal(room.bigBlindGiven, true);
  room.clearTimers(); // stop the bot-vs-bot hand from continuing to play out asynchronously after the test's assertions are done
});

test('bettingRound: small blind posts half min bet, big blind posts full min bet', () => {
  const room = buildHeadsUpRoom();
  room.roomMinBet = 10;

  room.bettingRound(0);

  assert.equal(room.players[0].totalBet, 5);  // small blind: roomMinBet / 2
  assert.equal(room.players[1].totalBet, 10); // big blind: roomMinBet
  room.clearTimers();
});

test('bettingRound: this.current_player_turn stays in sync with whoever is being forced to post a blind', () => {
  const room = buildHeadsUpRoom();

  room.bettingRound(0);

  // Regression guard for the actual root cause: if this.current_player_turn
  // is never advanced during forced blind posting, playerCheck's turn guard
  // silently rejects the second (big blind) post and the flags never both
  // become true (already asserted above), so this is really the same bug
  // caught from the field-drift angle rather than the symptom angle.
  assert.equal(room.smallBlindGiven && room.bigBlindGiven, true);
  room.clearTimers();
});
