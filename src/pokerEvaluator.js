const RANK_ORDER = '23456789TJQKA';
const HAND_RANKS = {
  STRAIGHT_FLUSH: 8,
  FOUR_OF_A_KIND: 7,
  FULL_HOUSE: 6,
  FLUSH: 5,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  ONE_PAIR: 1,
  HIGH_CARD: 0,
};

function rankIndex(rank) {
  return RANK_ORDER.indexOf(rank);
}

function evaluate5(cards) {
  const ranks = cards.map(card => rankIndex(card[0])).sort((a, b) => b - a);
  const suits = cards.map(card => card[1]);
  const isFlush = suits.every(suit => suit === suits[0]);
  const rankSet = [...new Set(ranks)];

  let isStraight = false;
  let straightHigh = 0;
  if (rankSet.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHigh = 3;
    }
  }

  const freq = {};
  for (const rank of ranks) {
    freq[rank] = (freq[rank] || 0) + 1;
  }

  const counts = Object.entries(freq)
    .map(([rank, count]) => ({ r: Number(rank), c: count }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  if (isFlush && isStraight) return { rank: HAND_RANKS.STRAIGHT_FLUSH, tiebreak: [straightHigh] };
  if (counts[0].c === 4) return { rank: HAND_RANKS.FOUR_OF_A_KIND, tiebreak: [counts[0].r, counts[1].r] };
  if (counts[0].c === 3 && counts[1].c === 2) return { rank: HAND_RANKS.FULL_HOUSE, tiebreak: [counts[0].r, counts[1].r] };
  if (isFlush) return { rank: HAND_RANKS.FLUSH, tiebreak: ranks };
  if (isStraight) return { rank: HAND_RANKS.STRAIGHT, tiebreak: [straightHigh] };
  if (counts[0].c === 3) return { rank: HAND_RANKS.THREE_OF_A_KIND, tiebreak: [counts[0].r, ...counts.slice(1).map(x => x.r)] };
  if (counts[0].c === 2 && counts[1].c === 2) return { rank: HAND_RANKS.TWO_PAIR, tiebreak: [counts[0].r, counts[1].r, counts[2].r] };
  if (counts[0].c === 2) return { rank: HAND_RANKS.ONE_PAIR, tiebreak: [counts[0].r, ...counts.slice(1).map(x => x.r)] };
  return { rank: HAND_RANKS.HIGH_CARD, tiebreak: ranks };
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === k) return [arr];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(combo => [first, ...combo]),
    ...combinations(rest, k),
  ];
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreak.length, b.tiebreak.length); i++) {
    if (a.tiebreak[i] !== b.tiebreak[i]) return a.tiebreak[i] - b.tiebreak[i];
  }
  return 0;
}

function bestHand(sevenCards) {
  const combos = combinations(sevenCards, 5);
  let best = null;
  for (const five of combos) {
    const ev = evaluate5(five);
    if (!best || compareEval(ev, best) > 0) best = ev;
  }
  return best;
}

function compareHands(sevenA, sevenB) {
  return compareEval(bestHand(sevenA), bestHand(sevenB));
}

function bestOmahaHand(holeCards, boardCards) {
  if (!Array.isArray(holeCards) || holeCards.length !== 4) {
    throw new Error('Omaha requires exactly 4 hole cards');
  }
  if (!Array.isArray(boardCards) || boardCards.length < 3) {
    throw new Error('Omaha requires at least 3 board cards');
  }

  let best = null;
  for (const holes of combinations(holeCards, 2)) {
    for (const board of combinations(boardCards, 3)) {
      const ev = evaluate5([...holes, ...board]);
      if (!best || compareEval(ev, best) > 0) best = ev;
    }
  }
  return best;
}

function compareOmahaHands(holeA, holeB, boardCards) {
  return compareEval(bestOmahaHand(holeA, boardCards), bestOmahaHand(holeB, boardCards));
}

const HAND_RANK_NAMES = Object.fromEntries(
  Object.entries(HAND_RANKS).map(([name, rank]) => [rank, name])
);

module.exports = { bestHand, compareHands, bestOmahaHand, compareOmahaHands, HAND_RANK_NAMES };
