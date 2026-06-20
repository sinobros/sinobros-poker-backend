// Heads-up No-Limit Texas Hold'em state machine

import { compareHands, bestHand, HAND_RANK_NAMES } from './evaluator.js';

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const STARTING_STACK = 1500;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function createMatch(matchId, player1Id, player1Handle) {
  return {
    matchId,
    phase: 'waiting',      // waiting | playing | complete
    players: [
      { id: player1Id, handle: player1Handle, stack: STARTING_STACK, seat: 0 },
    ],
    winner: null,
    handsPlayed: 0,
    events: [{ t: Date.now(), msg: `${player1Handle} created the match` }],
    hand: null,
  };
}

export function joinMatch(match, player2Id, player2Handle) {
  if (match.phase !== 'waiting') throw new Error('Match not open');
  if (match.players.length >= 2) throw new Error('Match full');
  match.players.push({ id: player2Id, handle: player2Handle, stack: STARTING_STACK, seat: 1 });
  match.events.push({ t: Date.now(), msg: `${player2Handle} joined` });
  match.phase = 'playing';
  startHand(match);
}

function startHand(match) {
  const [p0, p1] = match.players;
  // Button alternates each hand; first hand: player 0 is button (small blind)
  const buttonSeat = match.handsPlayed % 2 === 0 ? 0 : 1;
  const bbSeat = 1 - buttonSeat;

  const deck = shuffle(makeDeck());

  // deal 2 hole cards to each player — button first
  const buttonHoles = [deck.shift(), deck.shift()];
  const bbHoles = [deck.shift(), deck.shift()];

  const holes = { [match.players[buttonSeat].id]: buttonHoles, [match.players[bbSeat].id]: bbHoles };

  // post blinds — deduct from stacks
  const sbAmount = Math.min(SMALL_BLIND, match.players[buttonSeat].stack);
  const bbAmount = Math.min(BIG_BLIND, match.players[bbSeat].stack);

  match.players[buttonSeat].stack -= sbAmount;
  match.players[bbSeat].stack -= bbAmount;

  const pot = sbAmount + bbAmount;

  // preflop: button (SB) acts first in heads-up
  const actorSeat = buttonSeat;

  match.hand = {
    deck,
    community: [],
    holes,
    pot,
    street: 'preflop',
    buttonSeat,
    bbSeat,
    bets: {
      [match.players[buttonSeat].id]: sbAmount,
      [match.players[bbSeat].id]: bbAmount,
    },
    toCall: bbAmount - sbAmount,   // SB owes this much more to call
    lastRaiseSize: BIG_BLIND,
    actorSeat,
    streetActCount: 0,
    lastAggressor: match.players[bbSeat].id,  // BB is last aggressor preflop
    status: 'active',   // active | showdown | folded | allin
    result: null,
  };

  match.events.push({
    t: Date.now(),
    msg: `Hand #${match.handsPlayed + 1} started. ${match.players[buttonSeat].handle} posts SB ${sbAmount}, ${match.players[bbSeat].handle} posts BB ${bbAmount}`,
  });
}

export function applyAction(match, playerId, action, amount) {
  const hand = match.hand;
  if (!hand || hand.status !== 'active') throw new Error('No active hand');

  const actor = match.players[hand.actorSeat];
  if (actor.id !== playerId) throw new Error('Not your turn');

  const opponent = match.players[1 - hand.actorSeat];
  const myBet = hand.bets[actor.id] || 0;
  const oppBet = hand.bets[opponent.id] || 0;
  const outstanding = oppBet - myBet;  // how much actor still owes

  switch (action) {
    case 'fold': {
      const wonPot = hand.pot;
      hand.status = 'folded';
      hand.result = { winner: opponent.id, reason: 'fold' };
      awardPot(match, opponent.id);
      match.events.push({ t: Date.now(), msg: `${actor.handle} folds. ${opponent.handle} wins pot ${wonPot}` });
      checkMatchOver(match);
      return;
    }

    case 'check':
      if (outstanding > 0) throw new Error('Cannot check — must call, raise, or fold');
      match.events.push({ t: Date.now(), msg: `${actor.handle} checks` });
      hand.streetActCount++;
      break;

    case 'call': {
      if (outstanding <= 0) throw new Error('Nothing to call');
      const callAmt = Math.min(outstanding, actor.stack);
      actor.stack -= callAmt;
      hand.bets[actor.id] = myBet + callAmt;
      hand.pot += callAmt;
      match.events.push({ t: Date.now(), msg: `${actor.handle} calls ${callAmt}` });
      hand.streetActCount++;
      break;
    }

    case 'bet':
    case 'raise': {
      if (!amount || amount <= 0) throw new Error('Amount required');
      if (action === 'bet' && outstanding > 0) throw new Error('Cannot bet — use raise');
      if (action === 'raise' && outstanding <= 0) throw new Error('Cannot raise — use bet');

      // `amount` is the number of chips the acting player commits now.
      // For a raise it includes the call plus the raise increment.
      const minCommit = outstanding + hand.lastRaiseSize;
      if (amount < minCommit && amount < actor.stack) {
        throw new Error(`Min ${action} commit is ${minCommit} (or all-in)`);
      }

      const contribution = Math.min(amount, actor.stack);
      actor.stack -= contribution;
      hand.bets[actor.id] = myBet + contribution;
      hand.pot += contribution;
      hand.lastRaiseSize = Math.max(hand.lastRaiseSize, contribution - outstanding);
      hand.lastAggressor = actor.id;
      match.events.push({ t: Date.now(), msg: `${actor.handle} ${action}s to ${hand.bets[actor.id]}` });
      hand.streetActCount++;
      break;
    }

    case 'all-in': {
      const allInAmt = actor.stack;
      actor.stack = 0;
      hand.bets[actor.id] = myBet + allInAmt;
      hand.pot += allInAmt;
      if (allInAmt > outstanding) hand.lastRaiseSize = allInAmt - outstanding;
      hand.lastAggressor = actor.id;
      match.events.push({ t: Date.now(), msg: `${actor.handle} is all-in for ${allInAmt}` });
      hand.streetActCount++;
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }

  // In heads-up, once either player is all-in and bets are matched, no more betting
  // is possible; deal the remaining board cards and go straight to showdown.
  const betsNow = match.players.map(p => hand.bets[p.id] || 0);
  if ((match.players[0].stack === 0 || match.players[1].stack === 0) && betsNow[0] === betsNow[1]) {
    runOutBoard(match);
    doShowdown(match);
    return;
  }

  // check if both players all-in — skip to showdown
  if (match.players[0].stack === 0 && match.players[1].stack === 0) {
    runOutBoard(match);
    doShowdown(match);
    return;
  }

  // check if actor is all-in and street is done
  if (actor.stack === 0) {
    const newOutstanding = hand.bets[opponent.id] - hand.bets[actor.id];
    if (newOutstanding <= 0) {
      // opponent covered or equal — deal remaining streets and showdown
      runOutBoard(match);
      doShowdown(match);
      return;
    }
    // opponent still has to respond — swap actor
    hand.actorSeat = 1 - hand.actorSeat;
    return;
  }

  // advance street or swap actor
  if (bettingClosed(match)) {
    advanceStreet(match);
  } else {
    hand.actorSeat = 1 - hand.actorSeat;
  }
}

function bettingClosed(match) {
  const hand = match.hand;
  const [p0, p1] = match.players;
  const bet0 = hand.bets[p0.id] || 0;
  const bet1 = hand.bets[p1.id] || 0;

  if (bet0 !== bet1) return false;

  // On preflop, BB has option — betting isn't closed until BB acts too
  // streetActCount tracks how many actions have occurred this street
  if (hand.street === 'preflop') {
    // Need at least 2 actions (SB + BB at minimum) and bets equal
    return hand.streetActCount >= 2;
  }
  // Postflop: both have acted at least once and bets are equal
  return hand.streetActCount >= 2;
}

function advanceStreet(match) {
  const hand = match.hand;
  hand.bets = { [match.players[0].id]: 0, [match.players[1].id]: 0 };
  hand.streetActCount = 0;
  hand.lastRaiseSize = BIG_BLIND;

  switch (hand.street) {
    case 'preflop':
      hand.community.push(hand.deck.shift(), hand.deck.shift(), hand.deck.shift());
      hand.street = 'flop';
      match.events.push({ t: Date.now(), msg: `Flop: ${hand.community.join(' ')}` });
      break;
    case 'flop':
      hand.community.push(hand.deck.shift());
      hand.street = 'turn';
      match.events.push({ t: Date.now(), msg: `Turn: ${hand.community[3]}` });
      break;
    case 'turn':
      hand.community.push(hand.deck.shift());
      hand.street = 'river';
      match.events.push({ t: Date.now(), msg: `River: ${hand.community[4]}` });
      break;
    case 'river':
      doShowdown(match);
      return;
  }

  // postflop: BB acts first (non-button acts first)
  hand.actorSeat = hand.bbSeat;
}

function runOutBoard(match) {
  const hand = match.hand;
  while (hand.community.length < 5) {
    hand.community.push(hand.deck.shift());
  }
  match.events.push({ t: Date.now(), msg: `Board run out: ${hand.community.join(' ')}` });
}

function doShowdown(match) {
  const hand = match.hand;
  const [p0, p1] = match.players;

  const cards0 = [...hand.holes[p0.id], ...hand.community];
  const cards1 = [...hand.holes[p1.id], ...hand.community];

  const cmp = compareHands(cards0, cards1);
  let winnerId, reason;

  if (cmp > 0) {
    winnerId = p0.id;
    reason = `${p0.handle} wins with ${describeHand(cards0)}`;
  } else if (cmp < 0) {
    winnerId = p1.id;
    reason = `${p1.handle} wins with ${describeHand(cards1)}`;
  } else {
    // split pot
    const half = Math.floor(hand.pot / 2);
    p0.stack += half;
    p1.stack += hand.pot - half;
    hand.status = 'showdown';
    hand.result = { winner: null, reason: 'Tie — pot split', holes: hand.holes };
    match.events.push({ t: Date.now(), msg: `Showdown — Tie! Pot split. ${describeHand(cards0)} vs ${describeHand(cards1)}` });
    match.handsPlayed++;
    return;
  }

  awardPot(match, winnerId);
  hand.status = 'showdown';
  hand.result = { winner: winnerId, reason, holes: hand.holes };
  match.events.push({ t: Date.now(), msg: `Showdown — ${reason}` });
  checkMatchOver(match);
}

function describeHand(sevenCards) {
  const ev = bestHand(sevenCards);
  return HAND_RANK_NAMES[ev.rank].replace(/_/g, ' ').toLowerCase();
}

function awardPot(match, winnerId) {
  const winner = match.players.find(p => p.id === winnerId);
  winner.stack += match.hand.pot;
  match.hand.pot = 0;
  match.handsPlayed++;
}

function checkMatchOver(match) {
  for (const p of match.players) {
    if (p.stack === 0) {
      const winner = match.players.find(q => q.id !== p.id);
      match.phase = 'complete';
      match.winner = winner.id;
      match.events.push({ t: Date.now(), msg: `Match over — ${winner.handle} wins!` });
    }
  }
}

export function applyNextHand(match, playerId) {
  if (match.phase !== 'playing') throw new Error('Match not in playing state');
  const hand = match.hand;
  if (!hand || hand.status === 'active') throw new Error('Hand still in progress');
  if (!match.players.find(p => p.id === playerId)) throw new Error('Not a player');
  startHand(match);
}

export function publicState(match, viewerPlayerId) {
  const hand = match.hand;
  const showHoles = hand && (hand.status === 'showdown' || hand.status === 'folded' || hand.status === 'allin');

  const players = match.players.map(p => {
    let holes = null;
    if (hand) {
      if (p.id === viewerPlayerId) {
        holes = hand.holes[p.id];
      } else if (showHoles && hand.result?.holes) {
        holes = hand.result.holes[p.id];
      }
    }
    return { id: p.id, handle: p.handle, stack: p.stack, seat: p.seat, holes };
  });

  const actorId = hand ? match.players[hand.actorSeat]?.id : null;
  const legalActions = hand && hand.status === 'active' && actorId === viewerPlayerId
    ? getLegalActions(match, viewerPlayerId) : [];

  return {
    matchId: match.matchId,
    phase: match.phase,
    winner: match.winner,
    handsPlayed: match.handsPlayed,
    players,
    hand: hand ? {
      street: hand.street,
      community: hand.community,
      pot: hand.pot,
      status: hand.status,
      buttonSeat: hand.buttonSeat,
      actorId,
      result: hand.result,
      bets: hand.bets,
    } : null,
    legalActions,
    events: match.events.slice(-40),
  };
}

function getLegalActions(match, playerId) {
  const hand = match.hand;
  const actor = match.players.find(p => p.id === playerId);
  const opponent = match.players.find(p => p.id !== playerId);
  const myBet = hand.bets[actor.id] || 0;
  const oppBet = hand.bets[opponent.id] || 0;
  const outstanding = oppBet - myBet;
  const actions = [];

  if (outstanding === 0) {
    actions.push({ action: 'check' });
    if (actor.stack > 0) {
      actions.push({ action: 'bet', min: Math.min(hand.lastRaiseSize, actor.stack) });
    }
  } else {
    actions.push({ action: 'fold' });
    actions.push({ action: 'call', amount: Math.min(outstanding, actor.stack) });
    const minRaise = outstanding + hand.lastRaiseSize;
    if (actor.stack > outstanding) {
      actions.push({ action: 'raise', min: Math.min(minRaise, actor.stack) });
    }
  }

  if (actor.stack > 0) {
    actions.push({ action: 'all-in', amount: actor.stack });
  }

  return actions;
}
