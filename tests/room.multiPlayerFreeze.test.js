'use strict';

/**
 * Regression test for the production freeze: real games with 3+ players
 * (any player beyond the forced small/big blind) would hang forever after
 * that player's first action — the exact same 7 bots checking the exact
 * same cards on a loop, no error, no crash, just stuck.
 *
 * Root cause: Room.prototype.bettingRound recurses using a LOCAL
 * current_player_turn parameter, but this.current_player_turn (the field
 * playerCheck/playerFold/playerRaise's turn-ownership guard actually
 * checks) was previously only kept in sync during the forced-blind branch.
 * The moment a normal (non-forced) player's turn came up — i.e. almost
 * immediately in any hand — their action (a bot's deferred decision, or a
 * real player's click) was silently rejected by the guard. playerState
 * never changed, so the 1s poll in bettingRoundTimer waiting for that
 * change never had anything to detect, and the hand froze forever.
 *
 * Ejecutar con:
 *   node --test tests/room.multiPlayerFreeze.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Room } = require('../src/app/room');
const { Player } = require('../src/app/player');
const poker = require('../src/app/poker');

function buildRoom(playerCount) {
  const room = new Room(0, 1, null, null);
  room.roomMinBet = 10;
  room.maxSeats = playerCount;
  room.players = [];
  for (let i = 0; i < playerCount; i++) {
    const p = new Player(null, 'sock' + i, 'conn' + i, 2000, true); // isBot=true, no real network needed
    p.playerName = 'Bot' + i;
    p.playerCards = ['AS', 'KS'];
    room.players.push(p);
  }
  room.smallBlindPlayerArrayIndex = 0;
  room.middleCards = [];
  room.holeCardsGiven = true;
  room.gameStarted = true;
  room.deck = poker.visualize(poker.randomize(poker.newSet()));
  room.deckCard = playerCount * 2; // matches what holeCards() leaves it at (2 cards/player)
  return room;
}

test('bettingRound: this.current_player_turn matches the local parameter on every call, for any player count', () => {
  // This is the actual invariant that was broken. Instead of playing a full
  // hand (slow: real per-bot decision delays), assert the invariant directly
  // across a range of player counts and turn indices.
  for (const playerCount of [2, 3, 5, 7]) {
    const room = buildRoom(playerCount);
    room.smallBlindGiven = true; // skip forced-blind branch, we're testing the general path
    room.bigBlindGiven = true;
    room.bigBlindPlayerHadTurn = true;
    room.currentStage = Room.HOLDEM_STAGE_FOUR_POST_FLOP;

    for (let turn = 0; turn < playerCount; turn++) {
      room.bettingRound(turn);
      assert.equal(
        room.current_player_turn,
        turn,
        `players=${playerCount}, expected this.current_player_turn to be ${turn} right after bettingRound(${turn}) was called, got ${room.current_player_turn}`
      );
      room.clearTimers(); // don't let this player's real turn continue asynchronously mid-loop
    }
  }
});

test('bettingRound: a full 7-bot hand completes to showdown without freezing', (t, done) => {
  // Real end-to-end reproduction of the production freeze: an actual hand,
  // real bot decision timers, real turn progression through every street.
  const room = buildRoom(7);

  // Hand evaluation isn't what's under test here and needs precise card
  // encoding to run for real; stub it so the game logic can run standalone.
  const origEval = Room.prototype.evaluatePlayerCards;
  room.evaluatePlayerCards = function () {
    return {value: Math.floor(Math.random() * 1000), handName: 'test hand'};
  };

  const timeoutHandle = setTimeout(() => {
    assert.fail('Hand did not complete within 90s -- this is the freeze bug regressing. Stuck at stage: ' + room.currentStage);
  }, 90000);

  const origStaging = room.staging.bind(room);
  room.staging = function () {
    if (this.currentStage === Room.HOLDEM_STAGE_TEN_RESULTS) {
      clearTimeout(timeoutHandle);
      Room.prototype.evaluatePlayerCards = origEval;
      done();
      return;
    }
    return origStaging();
  };

  room.currentStage = Room.HOLDEM_STAGE_TWO_PRE_FLOP;
  room.staging();
});
