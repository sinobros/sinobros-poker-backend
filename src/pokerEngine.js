const { compareHands, compareOmahaHands, bestHand, bestOmahaHand, HAND_RANK_NAMES } = require('./pokerEvaluator');

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const STARTING_STACK = 1500;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const GAMES = {
  holdem: { holeCards: 2, betting: 'no-limit' },
  plo: { holeCards: 4, betting: 'pot-limit' },
};

function normalizeGame(game) {
  return game === 'plo' ? 'plo' : 'holdem';
}

function gameRules(match) {
  return GAMES[normalizeGame(match.game)];
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
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

function createMatch(matchId, player1Id, player1Handle, game = 'holdem') {
  return {
    matchId,
    game: normalizeGame(game),
    phase: 'waiting',
    players: [
      { id: player1Id, handle: player1Handle, stack: STARTING_STACK, seat: 0 },
    ],
    winner: null,
    handsPlayed: 0,
    events: [{ t: Date.now(), msg: `${player1Handle} created the match` }],
    hand: null,
  };
}

function joinMatch(match, player2Id, player2Handle, game = null) {
  if (match.phase !== 'waiting') throw new Error('Match not open');
  if (match.players.length >= 2) throw new Error('Match full');
  if (game && normalizeGame(game) !== normalizeGame(match.game)) throw new Error(`Match is for ${normalizeGame(match.game)}`);
  match.game = normalizeGame(match.game);
  match.players.push({ id: player2Id, handle: player2Handle, stack: STARTING_STACK, seat: 1 });
  match.events.push({ t: Date.now(), msg: `${player2Handle} joined` });
  match.phase = 'playing';
  startHand(match);
}

function startHand(match) {
  match.game = normalizeGame(match.game);
  const rules = gameRules(match);
  const buttonSeat = match.handsPlayed % 2 === 0 ? 0 : 1;
  const bbSeat = 1 - buttonSeat;
  const deck = shuffle(makeDeck());
  const buttonHoles = Array.from({ length: rules.holeCards }, () => deck.shift());
  const bbHoles = Array.from({ length: rules.holeCards }, () => deck.shift());
  const holes = {
    [match.players[buttonSeat].id]: buttonHoles,
    [match.players[bbSeat].id]: bbHoles,
  };

  const sbAmount = Math.min(SMALL_BLIND, match.players[buttonSeat].stack);
  const bbAmount = Math.min(BIG_BLIND, match.players[bbSeat].stack);
  match.players[buttonSeat].stack -= sbAmount;
  match.players[bbSeat].stack -= bbAmount;

  match.hand = {
    deck,
    community: [],
    holes,
    pot: sbAmount + bbAmount,
    street: 'preflop',
    buttonSeat,
    bbSeat,
    bets: {
      [match.players[buttonSeat].id]: sbAmount,
      [match.players[bbSeat].id]: bbAmount,
    },
    toCall: bbAmount - sbAmount,
    lastRaiseSize: BIG_BLIND,
    actorSeat: buttonSeat,
    streetActCount: 0,
    lastAggressor: match.players[bbSeat].id,
    status: 'active',
    result: null,
  };

  match.events.push({
    t: Date.now(),
    msg: `Hand #${match.handsPlayed + 1} started. ${match.players[buttonSeat].handle} posts SB ${sbAmount}, ${match.players[bbSeat].handle} posts BB ${bbAmount}`,
  });
}

function applyAction(match, playerId, action, amount) {
  const hand = match.hand;
  if (!hand || hand.status !== 'active') throw new Error('No active hand');

  const actor = match.players[hand.actorSeat];
  if (actor.id !== playerId) throw new Error('Not your turn');

  const opponent = match.players[1 - hand.actorSeat];
  const myBet = hand.bets[actor.id] || 0;
  const oppBet = hand.bets[opponent.id] || 0;
  const outstanding = oppBet - myBet;
  const legalAction = getLegalActions(match, playerId).find(option => option.action === action);

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
      if (outstanding > 0) throw new Error('Cannot check - must call, raise, or fold');
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
      const requestedAmount = Number(amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new Error('Amount required');
      if (action === 'bet' && outstanding > 0) throw new Error('Cannot bet - use raise');
      if (action === 'raise' && outstanding <= 0) throw new Error('Cannot raise - use bet');
      if (!legalAction) throw new Error(`${action} is not currently legal`);

      const minCommit = legalAction.min;
      const maxCommit = legalAction.max;
      if (requestedAmount < minCommit && requestedAmount < actor.stack) {
        throw new Error(`Min ${action} commit is ${minCommit} (or all-in)`);
      }
      if (requestedAmount > maxCommit) {
        throw new Error(`Max ${action} commit is ${maxCommit}`);
      }

      const contribution = requestedAmount;
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
      if (!legalAction) throw new Error('All-in is not currently legal');
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

  const betsNow = match.players.map(player => hand.bets[player.id] || 0);
  if ((match.players[0].stack === 0 || match.players[1].stack === 0) && betsNow[0] === betsNow[1]) {
    runOutBoard(match);
    doShowdown(match);
    return;
  }

  if (match.players[0].stack === 0 && match.players[1].stack === 0) {
    runOutBoard(match);
    doShowdown(match);
    return;
  }

  if (actor.stack === 0) {
    const newOutstanding = hand.bets[opponent.id] - hand.bets[actor.id];
    if (newOutstanding <= 0) {
      runOutBoard(match);
      doShowdown(match);
      return;
    }
    hand.actorSeat = 1 - hand.actorSeat;
    return;
  }

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
  const holes0 = hand.holes[p0.id];
  const holes1 = hand.holes[p1.id];
  const cmp = normalizeGame(match.game) === 'plo'
    ? compareOmahaHands(holes0, holes1, hand.community)
    : compareHands([...holes0, ...hand.community], [...holes1, ...hand.community]);
  let winnerId;
  let reason;

  if (cmp > 0) {
    winnerId = p0.id;
    reason = `${p0.handle} wins with ${describeHand(match, p0.id)}`;
  } else if (cmp < 0) {
    winnerId = p1.id;
    reason = `${p1.handle} wins with ${describeHand(match, p1.id)}`;
  } else {
    const half = Math.floor(hand.pot / 2);
    p0.stack += half;
    p1.stack += hand.pot - half;
    hand.status = 'showdown';
    hand.result = { winner: null, reason: 'Tie - pot split', holes: hand.holes };
    match.events.push({ t: Date.now(), msg: `Showdown - Tie! Pot split. ${describeHand(match, p0.id)} vs ${describeHand(match, p1.id)}` });
    match.handsPlayed++;
    return;
  }

  awardPot(match, winnerId);
  hand.status = 'showdown';
  hand.result = { winner: winnerId, reason, holes: hand.holes };
  match.events.push({ t: Date.now(), msg: `Showdown - ${reason}` });
  checkMatchOver(match);
}

function describeHand(match, playerId) {
  const hand = match.hand;
  const holes = hand.holes[playerId];
  const ev = normalizeGame(match.game) === 'plo'
    ? bestOmahaHand(holes, hand.community)
    : bestHand([...holes, ...hand.community]);
  return HAND_RANK_NAMES[ev.rank].replace(/_/g, ' ').toLowerCase();
}

function awardPot(match, winnerId) {
  const winner = match.players.find(player => player.id === winnerId);
  winner.stack += match.hand.pot;
  match.hand.pot = 0;
  match.handsPlayed++;
}

function checkMatchOver(match) {
  for (const player of match.players) {
    if (player.stack === 0) {
      const winner = match.players.find(other => other.id !== player.id);
      match.phase = 'complete';
      match.winner = winner.id;
      match.events.push({ t: Date.now(), msg: `Match over - ${winner.handle} wins!` });
    }
  }
}

function applyNextHand(match, playerId) {
  if (match.phase !== 'playing') throw new Error('Match not in playing state');
  const hand = match.hand;
  if (!hand || hand.status === 'active') throw new Error('Hand still in progress');
  if (!match.players.find(player => player.id === playerId)) throw new Error('Not a player');
  startHand(match);
}

function publicState(match, viewerPlayerId) {
  const hand = match.hand;
  const showHoles = hand && (hand.status === 'showdown' || hand.status === 'folded' || hand.status === 'allin');

  const players = match.players.map(player => {
    let holes = null;
    if (hand) {
      if (player.id === viewerPlayerId) {
        holes = hand.holes[player.id];
      } else if (showHoles && hand.result && hand.result.holes) {
        holes = hand.result.holes[player.id];
      }
    }
    return { id: player.id, handle: player.handle, stack: player.stack, seat: player.seat, holes };
  });

  const actorId = hand ? match.players[hand.actorSeat] && match.players[hand.actorSeat].id : null;
  const legalActions = hand && hand.status === 'active' && actorId === viewerPlayerId
    ? getLegalActions(match, viewerPlayerId)
    : [];

  return {
    matchId: match.matchId,
    game: normalizeGame(match.game),
    phase: match.phase,
    winner: match.winner,
    handsPlayed: match.handsPlayed,
    blinds: { small: SMALL_BLIND, big: BIG_BLIND },
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
  const actor = match.players.find(player => player.id === playerId);
  const opponent = match.players.find(player => player.id !== playerId);
  if (!hand || !actor || !opponent || hand.status !== 'active') return [];

  const myBet = hand.bets[actor.id] || 0;
  const oppBet = hand.bets[opponent.id] || 0;
  const outstanding = oppBet - myBet;
  const minBet = Math.min(hand.lastRaiseSize, actor.stack);
  const actions = [];

  if (outstanding === 0) {
    actions.push({ action: 'check' });
    if (actor.stack >= minBet && minBet > 0) {
      actions.push({ action: 'bet', min: minBet, max: maxCommit(match, actor, outstanding) });
    }
  } else {
    actions.push({ action: 'fold' });
    actions.push({ action: 'call', amount: Math.min(outstanding, actor.stack) });
    const minRaise = outstanding + hand.lastRaiseSize;
    if (actor.stack > outstanding) {
      actions.push({ action: 'raise', min: Math.min(minRaise, actor.stack), max: maxCommit(match, actor, outstanding) });
    }
  }

  if (actor.stack > 0 && actor.stack <= maxCommit(match, actor, outstanding)) {
    actions.push({ action: 'all-in', amount: actor.stack });
  }

  return actions;
}

function maxCommit(match, actor, outstanding) {
  if (actor.stack <= 0) return 0;
  if (gameRules(match).betting !== 'pot-limit') return actor.stack;
  return Math.min(actor.stack, match.hand.pot + (2 * Math.max(outstanding, 0)));
}

module.exports = { createMatch, joinMatch, applyAction, applyNextHand, publicState };
