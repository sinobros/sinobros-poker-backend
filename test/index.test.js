import test from 'node:test';
import assert from 'node:assert/strict';

import { bestHand, compareHands, HAND_RANK_NAMES } from '../evaluator.js';
import { createMatch, joinMatch, applyAction, publicState } from '../engine.js';

function rankName(cards) {
  return HAND_RANK_NAMES[bestHand(cards).rank];
}

test('hand evaluator detects wheel straight', () => {
  assert.equal(rankName(['As', '2d', '3h', '4c', '5s', '9d', 'Kh']), 'STRAIGHT');
  assert.equal(bestHand(['As', '2d', '3h', '4c', '5s', '9d', 'Kh']).tiebreak[0], 3);
});

test('flush beats straight', () => {
  const flush = ['As', '9s', '7s', '5s', '2s', 'Kd', 'Qh'];
  const straight = ['9c', '8d', '7h', '6s', '5c', 'Ad', 'Kh'];
  assert.equal(compareHands(flush, straight), 1);
});

test('full house beats flush', () => {
  const fullHouse = ['Ah', 'Ad', 'Ac', 'Ks', 'Kd', '2s', '3d'];
  const flush = ['Qs', 'Ts', '8s', '6s', '3s', 'Ad', 'Kc'];
  assert.equal(compareHands(fullHouse, flush), 1);
});

test('pair kicker comparison breaks ties', () => {
  const aceKicker = ['Ah', 'Ad', 'Ks', '7c', '4d', '2s', '3h'];
  const queenKicker = ['As', 'Ac', 'Qs', '7d', '4c', '2h', '3d'];
  assert.equal(compareHands(aceKicker, queenKicker), 1);
});

test('heads-up blind posting and action order are correct', () => {
  const match = createMatch('m1', 'p1', 'Nate');
  joinMatch(match, 'p2', 'Tom');
  assert.equal(match.phase, 'playing');
  assert.equal(match.hand.buttonSeat, 0);
  assert.equal(match.players[0].stack, 1490);
  assert.equal(match.players[1].stack, 1480);
  assert.equal(match.hand.pot, 30);
  assert.equal(match.hand.street, 'preflop');
  assert.equal(match.hand.actorSeat, 0, 'button/small blind acts first preflop');
});

test('fold awards the pot to the opponent and completes the hand', () => {
  const match = createMatch('m2', 'p1', 'Nate');
  joinMatch(match, 'p2', 'Tom');
  applyAction(match, 'p1', 'fold');
  assert.equal(match.hand.status, 'folded');
  assert.equal(match.hand.pot, 0);
  assert.equal(match.players[1].stack, 1510);
  assert.equal(match.handsPlayed, 1);
});

test('showdown awards pot after board reaches river', () => {
  const match = createMatch('m3', 'p1', 'Nate');
  joinMatch(match, 'p2', 'Tom');

  match.hand.holes = { p1: ['As', 'Ah'], p2: ['Ks', 'Kh'] };
  match.hand.deck = ['2c', '7d', '9h', '3s', '4c', '5d', '6h'];

  applyAction(match, 'p1', 'call');
  applyAction(match, 'p2', 'check');
  assert.equal(match.hand.street, 'flop');
  applyAction(match, 'p2', 'check');
  applyAction(match, 'p1', 'check');
  assert.equal(match.hand.street, 'turn');
  applyAction(match, 'p2', 'check');
  applyAction(match, 'p1', 'check');
  assert.equal(match.hand.street, 'river');
  applyAction(match, 'p2', 'check');
  applyAction(match, 'p1', 'check');

  assert.equal(match.hand.status, 'showdown');
  assert.equal(match.hand.result.winner, 'p1');
  assert.equal(match.players[0].stack, 1520);
  assert.equal(match.players[1].stack, 1480);
});

test('public state hides opponent hole cards until showdown', () => {
  const match = createMatch('m4', 'p1', 'Nate');
  joinMatch(match, 'p2', 'Tom');
  const state = publicState(match, 'p1');
  assert.ok(state.players.find(p => p.id === 'p1').holes.length === 2);
  assert.equal(state.players.find(p => p.id === 'p2').holes, null);
});
