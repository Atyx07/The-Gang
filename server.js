const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Hand = require('pokersolver').Hand;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const ALL_EFFRACTION_CARDS = [
  { id: 'eff_1', title: 'Ouverture facile', type: 'malus', desc: 'Le 1er tour (jetons blancs) n\'est pas joué. On commence directement au 2e tour (Flop).' },
  { id: 'eff_2', title: 'Capteurs de bruit', type: 'malus', desc: 'Aux 3 1ers tours, le jeton 1 étoile est sombre et ne peut pas être échangé une fois pris.' },
  { id: 'eff_3', title: 'Détecteurs de mouvement', type: 'malus', desc: 'Au Flop, si une tête (J, Q, K) apparaît, celui qui a pris le jeton blanc 1 étoile repioche 2 nouvelles cartes.' },
  { id: 'eff_4', title: 'Scan rétinien', type: 'malus', desc: 'À l\'abattage, l\'équipe doit deviner le rang d\'une des cartes du joueur le plus fort avant de le révéler.' },
  { id: 'eff_5', title: 'Fuite précipitée', type: 'malus', desc: 'Le 3e tour (Turn) est passé : on passe de 3 cartes communes à 5 (jetons jaunes à rouges).' },
  { id: 'eff_6', title: 'Grille d\'aération', type: 'malus', desc: 'Les jetons ne peuvent pas quitter leur propriétaire : aucun échange n\'est possible.' },
  { id: 'eff_7', title: 'Barrières photoélectriques', type: 'malus', desc: 'Au Flop, si AUCUNE tête n\'apparaît, celui qui a pris le jeton blanc 1 étoile repioche 2 nouvelles cartes.' },
  { id: 'eff_8', title: 'Panne d\'électricité', type: 'malus', desc: 'L\'historique des jetons passés est masqué : seuls les jetons actuels sont visibles.' },
  { id: 'eff_9', title: 'Lecteur d\'empreintes digitales', type: 'malus', desc: 'À l\'abattage, l\'équipe doit deviner la combinaison exacte du joueur au jeton le plus fort.' },
  { id: 'eff_10', title: 'Caméras de surveillance', type: 'malus', desc: 'Chaque gangster joue avec 3 cartes personnelles au lieu de 2.' }
];

const ALL_COMPLICE_CARDS = [
  { id: 'comp_1', title: 'Informateur', type: 'bonus', desc: 'Un joueur volontaire montre secrètement 1 carte à un complice désigné.' },
  { id: 'comp_2', title: 'Conductrice', type: 'bonus', desc: 'Un joueur volontaire annonce son type de main (ex: "J\'ai une paire").' },
  { id: 'comp_3', title: 'Actionnaire', type: 'bonus', isAuto: true, desc: 'Au 1er tour, chacun annonce automatiquement son nombre de têtes.' },
  { id: 'comp_4', title: 'Cerveau de la bande', type: 'bonus', desc: 'Un joueur demande publiquement à un complice combien de cartes d\'un rang X il possède.' },
  { id: 'comp_5', title: 'Hackeuse', type: 'bonus', desc: 'On élit une Hackeuse qui pioche 1 carte supplémentaire et en défausse une.' },
  { id: 'comp_6', title: 'Coordinateur', type: 'bonus', isAuto: true, desc: 'Avant le 1er tour, chacun donne 1 carte à son voisin de gauche.' },
  { id: 'comp_7', title: 'Valet', type: 'bonus', desc: 'On élit un gangster qui remplace une de ses cartes par le Valet incolore (sans couleur).' },
  { id: 'comp_8', title: 'Génie des chiffres', type: 'bonus', isAuto: true, desc: 'Au 1er tour, chacun annonce automatiquement la somme de ses cartes.' },
  { id: 'comp_9', title: 'Arnaqueuse', type: 'bonus', isAuto: true, desc: 'Après avoir vu ses cartes, elles sont toutes remélangées et redistribuées avant le 1er tour.' },
  { id: 'comp_10', title: 'Gros bras', type: 'bonus', desc: 'On élit le Gros Bras qui l\'emporte sur toute main de même classement.' }
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const val of VALUES) {
      deck.push({ suit, value: val });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function toSolverCard(card) {
  if (card.isColorlessJack) {
    return 'Jc';
  }
  const suitMap = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  let val = card.value;
  if (val === '10') val = 'T';
  return val + suitMap[card.suit];
}

function translateHandDescr(descr) {
  if (!descr) return 'Carte haute';
  let d = descr.toLowerCase();
  if (d.includes('royal flush')) return 'Quinte flush royale';
  if (d.includes('straight flush')) return 'Quinte flush';
  if (d.includes('four of a kind')) return d.replace('four of a kind,', 'Carré de').replace('four of a kind', 'Carré');
  if (d.includes('full house')) return d.replace('full house,', 'Full').replace('full house', 'Full');
  if (d.includes('flush')) return 'Couleur (Flush)';
  if (d.includes('straight')) return 'Quinte (Suite)';
  if (d.includes('three of a kind')) return d.replace('three of a kind,', 'Brelan de').replace('three of a kind', 'Brelan');
  if (d.includes('two pair')) return d.replace('two pair,', 'Double paire').replace('two pair', 'Double paire');
  if (d.includes('pair')) return d.replace('pair,', 'Paire de').replace('pair', 'Paire');
  if (d.includes('high card')) return d.replace('high card,', 'Carte haute').replace('high card', 'Carte haute');
  return descr;
}

function getExactHandCategory(hand, communityCards) {
  if (!hand || hand.length === 0) return 'Carte haute';
  const available = [...hand, ...communityCards].map(toSolverCard);
  try {
    const solved = Hand.solve(available);
    const n = solved.name;
    if (n === 'Straight Flush') {
      const isRoyal = solved.descr.toLowerCase().includes('royal flush');
      return isRoyal ? 'Quinte flush royale' : 'Quinte flush';
    }
    if (n === 'Four of a Kind') return 'Carré';
    if (n === 'Full House') return 'Full';
    if (n === 'Flush') return 'Couleur';
    if (n === 'Straight') return 'Quinte';
    if (n === 'Three of a Kind') return 'Brelan';
    if (n === 'Two Pair') return 'Double paire';
    if (n === 'Pair') return 'Paire';
    return 'Carte haute';
  } catch (e) {
    return 'Carte haute';
  }
}

function getGenericHandTypeSentence(hand, communityCards) {
  const cat = getExactHandCategory(hand, communityCards);
  if (cat === 'Quinte flush royale') return "J'ai une quinte flush royale";
  if (cat === 'Quinte flush') return "J'ai une quinte flush";
  if (cat === 'Carré') return "J'ai un carré";
  if (cat === 'Full') return "J'ai un full";
  if (cat === 'Couleur') return "J'ai une couleur";
  if (cat === 'Quinte') return "J'ai une quinte";
  if (cat === 'Brelan') return "J'ai un brelan";
  if (cat === 'Double paire') return "J'ai une double paire";
  if (cat === 'Paire') return "J'ai une paire";
  return "J'ai carte haute";
}

const rooms = {};

function drawNextCard(room, type) {
  if (type === 'malus') {
    if (room.unusedEffractions.length === 0) {
      room.unusedEffractions = [...ALL_EFFRACTION_CARDS];
    }
    const idx = Math.floor(Math.random() * room.unusedEffractions.length);
    return room.unusedEffractions.splice(idx, 1)[0];
  } else {
    if (room.unusedComplices.length === 0) {
      room.unusedComplices = [...ALL_COMPLICE_CARDS];
    }
    const idx = Math.floor(Math.random() * room.unusedComplices.length);
    return room.unusedComplices.splice(idx, 1)[0];
  }
}

function startNewBraquage(room) {
  room.deck = createDeck();
  room.communityCards = [];
  room.roundNumber = (room.roundNumber || 0) + 1;
  room.swapRequests = [];
  room.showdownData = null;
  room.bonusActivationVotes = [];
  room.bonusActionState = null;
  room.bonusActivatedThisRound = false;
  room.generalNotification = null;

  if (!room.unusedEffractions) room.unusedEffractions = [...ALL_EFFRACTION_CARDS];
  if (!room.unusedComplices) room.unusedComplices = [...ALL_COMPLICE_CARDS];

  if (room.gameMode === 'PRO' && !room.proPermanentCard) {
    const eligible = ALL_EFFRACTION_CARDS.filter(c => c.id !== 'eff_1');
    room.proPermanentCard = eligible[Math.floor(Math.random() * eligible.length)];
  }

  const hasCamera = (room.activeCard && room.activeCard.id === 'eff_10') || (room.proPermanentCard && room.proPermanentCard.id === 'eff_10');
  const cardsPerPlayer = hasCamera ? 3 : 2;

  const playerCount = room.players.length;
  room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);

  room.players.forEach(p => {
    p.hand = [];
    for (let c = 0; c < cardsPerPlayer; c++) {
      p.hand.push(room.deck.pop());
    }
    p.token = null;
    p.tokenHistory = { PRE_FLOP: null, FLOP: null, TURN: null, RIVER: null };
    p.ready = false;
    p.hasGrosBras = false;
    p.publicAnnouncement = null;
    p.privateSecret = null;
    p.coordinateurCardIndex = null;
    p.arnaqueuseValidated = false;
  });

  const cardId = room.activeCard ? room.activeCard.id : null;

  if (cardId === 'comp_6') {
    room.phase = 'COORDINATEUR_PHASE';
    room.generalNotification = 'Coordinateur actif : Choisissez 1 carte à donner à votre voisin de gauche.';
  } else if (cardId === 'comp_9') {
    room.phase = 'ARNAQUEUSE_PHASE';
    room.generalNotification = 'Arnaqueuse active : Regardez vos cartes puis validez pour les remélanger.';
  } else if (cardId === 'eff_1') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    checkFlopMalus(room);
  } else {
    room.phase = 'PRE_FLOP';
    applyPreFlopAutoCards(room);
  }
}

function applyPreFlopAutoCards(room) {
  const cardId = room.activeCard ? room.activeCard.id : null;
  if (cardId === 'comp_3') {
    room.players.forEach(p => {
      const faces = p.hand.filter(c => ['J', 'Q', 'K'].includes(c.value)).length;
      p.publicAnnouncement = `Actionnaire : ${faces} tête(s)`;
    });
  } else if (cardId === 'comp_8') {
    room.players.forEach(p => {
      let sum = 0;
      p.hand.forEach(c => {
        if (['J', 'Q', 'K'].includes(c.value)) sum += 10;
        else if (c.value === 'A') sum += 11;
        else sum += parseInt(c.value, 10);
      });
      p.publicAnnouncement = `Génie des chiffres : Somme = ${sum}`;
    });
  }
}

function checkFlopMalus(room) {
  const cardId = room.activeCard ? room.activeCard.id : null;
  const hasFace = room.communityCards.some(c => ['J', 'Q', 'K'].includes(c.value));
  const p1 = room.players.find(p => p.tokenHistory.PRE_FLOP === 1);

  if (cardId === 'eff_3' && hasFace && p1) {
    p1.hand = [room.deck.pop(), room.deck.pop()];
    room.generalNotification = `Détecteurs de mouvement : ${p1.name} a défaussé son jeu et repioché 2 nouvelles cartes !`;
  } else if (cardId === 'eff_7' && !hasFace && p1) {
    p1.hand = [room.deck.pop(), room.deck.pop()];
    room.generalNotification = `Barrières photoélectriques : Aucune tête ! ${p1.name} a défaussé son jeu et repioché 2 nouvelles cartes !`;
  }
}

function advancePhase(room) {
  room.players.forEach(p => {
    p.tokenHistory[room.phase] = p.token;
  });

  if (room.phase === 'PRE_FLOP') {
    const cardId = room.activeCard ? room.activeCard.id : null;
    if (cardId === 'comp_3' || cardId === 'comp_8') {
      room.players.forEach(p => { p.publicAnnouncement = null; });
    }
  }

  const playerCount = room.players.length;
  const hasFuite = (room.activeCard && room.activeCard.id === 'eff_5');

  if (room.phase === 'PRE_FLOP') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    checkFlopMalus(room);
    room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);
    room.players.forEach(p => { p.token = null; p.ready = false; });
  } else if (room.phase === 'FLOP') {
    if (hasFuite) {
      room.phase = 'RIVER';
      room.communityCards.push(room.deck.pop(), room.deck.pop());
    } else {
      room.phase = 'TURN';
      room.communityCards.push(room.deck.pop());
    }
    room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);
    room.players.forEach(p => { p.token = null; p.ready = false; });
  } else if (room.phase === 'TURN') {
    room.phase = 'RIVER';
    room.communityCards.push(room.deck.pop());
    room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);
    room.players.forEach(p => { p.token = null; p.ready = false; });
  } else if (room.phase === 'RIVER') {
    room.phase = 'SHOWDOWN';
    prepareShowdownData(room);
  }
}

function prepareShowdownData(room) {
  const communitySolver = room.communityCards.map(toSolverCard);

  const evaluatedPlayers = room.players.map(p => {
    const fullHandStrings = [...p.hand.map(toSolverCard), ...communitySolver];
    const solved = Hand.solve(fullHandStrings);
    return {
      player: p,
      solvedHand: solved,
      finalToken: p.token,
      cards: p.hand,
      descr: translateHandDescr(solved.descr),
      hasGrosBras: p.hasGrosBras
    };
  });

  evaluatedPlayers.sort((a, b) => {
    const win = Hand.winners([a.solvedHand, b.solvedHand]);
    if (win.length === 2) {
      if (a.hasGrosBras) return 1;
      if (b.hasGrosBras) return -1;
      return 0;
    }
    if (a.solvedHand.rank === b.solvedHand.rank) {
      if (a.hasGrosBras) return 1;
      if (b.hasGrosBras) return -1;
    }
    return win[0] === a.solvedHand ? 1 : -1;
  });

  let currentRank = 1;
  for (let i = 0; i < evaluatedPlayers.length; i++) {
    if (i > 0) {
      const prev = evaluatedPlayers[i - 1];
      const curr = evaluatedPlayers[i];
      const win = Hand.winners([prev.solvedHand, curr.solvedHand]);
      if (win.length === 2 && !prev.hasGrosBras && !curr.hasGrosBras) {
        curr.theoreticalRank = prev.theoreticalRank;
      } else {
        currentRank = i + 1;
        curr.theoreticalRank = currentRank;
      }
    } else {
      evaluatedPlayers[i].theoreticalRank = 1;
    }
  }

  const revealOrder = [...evaluatedPlayers].sort((a, b) => b.finalToken - a.finalToken);

  let hasError = false;
  const anomalies = [];
  for (let i = 1; i < revealOrder.length; i++) {
    const prev = revealOrder[i - 1];
    const curr = revealOrder[i];
    if (curr.finalToken < prev.finalToken && curr.theoreticalRank > prev.theoreticalRank) {
      hasError = true;
      anomalies.push({
        player1: prev.player.name,
        token1: prev.finalToken,
        player2: curr.player.name,
        token2: curr.finalToken
      });
    }
  }

  const cardId = room.activeCard ? room.activeCard.id : null;

  room.showdownData = {
    revealOrder: revealOrder.map(ep => ({
      playerId: ep.player.id,
      playerName: ep.player.name,
      hand: ep.cards,
      combination: ep.descr,
      finalToken: ep.finalToken,
      theoreticalRank: ep.theoreticalRank,
      hasGrosBras: ep.hasGrosBras
    })),
    currentIndex: -1,
    hasError,
    anomalies,
    revealedItems: [],
    currentAnomalyFound: false,
    verdictApplied: false,
    requiresScanRetinien: (cardId === 'eff_4'),
    scanResolved: false,
    scanVotes: {},
    requiresLecteurEmpreintes: (cardId === 'eff_9'),
    empreinteResolved: false,
    empreinteVotes: {}
  };
}

function computeCurrentHandName(hand, communityCards) {
  if (!hand || hand.length === 0) return '';
  const available = [...hand, ...communityCards].map(toSolverCard);
  try {
    const solved = Hand.solve(available);
    return translateHandDescr(solved.descr);
  } catch (e) {
    return '';
  }
}

function sanitizeRoomState(room, playerId) {
  const me = room.players.find(p => p.id === playerId);
  const myHandName = me ? computeCurrentHandName(me.hand, room.communityCards) : '';

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    gameMode: room.gameMode,
    maxAlarms: room.maxAlarms,
    roundNumber: room.roundNumber || 1,
    vaultCardsTurned: room.vaultCardsTurned || 0,
    alarmCardsTurned: room.alarmCardsTurned || 0,
    activeCard: room.activeCard || null,
    nextCard: room.nextCard || null,
    proPermanentCard: room.proPermanentCard || null,
    bonusActivationVotes: room.bonusActivationVotes || [],
    bonusActionState: room.bonusActionState || null,
    bonusActivatedThisRound: room.bonusActivatedThisRound || false,
    generalNotification: room.generalNotification || null,
    availableTokens: room.availableTokens || [],
    communityCards: room.communityCards || [],
    myHandName,
    swapRequests: (room.swapRequests || []).filter(s => s.targetId === playerId || s.fromId === playerId),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      token: p.token,
      tokenHistory: p.tokenHistory,
      ready: p.ready,
      isSelf: p.id === playerId,
      hasGrosBras: p.hasGrosBras,
      publicAnnouncement: p.publicAnnouncement,
      privateSecret: p.id === playerId ? p.privateSecret : null,
      coordinateurDone: p.coordinateurCardIndex !== null,
      arnaqueuseValidated: p.arnaqueuseValidated,
      hand: (room.phase === 'SHOWDOWN' && room.showdownData && room.showdownData.revealedItems.some(item => item.playerId === p.id)) || p.id === playerId ? p.hand : p.hand.map(() => null)
    })),
    showdownData: room.phase === 'SHOWDOWN' ? room.showdownData : null
  };
}

function broadcastRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.forEach(p => {
    io.to(p.socketId).emit('room_update', sanitizeRoomState(room, p.id));
  });
}

io.on('connection', (socket) => {
  let userSession = null;

  socket.on('create_room', ({ playerName, gameMode }) => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const playerId = socket.id;
    const mode = ['CLASSIC', 'PRO', 'GANGSTER'].includes(gameMode) ? gameMode : 'CLASSIC';
    const maxAlarms = mode === 'GANGSTER' ? 2 : 3;

    rooms[code] = {
      code,
      hostId: playerId,
      phase: 'LOBBY',
      gameMode: mode,
      maxAlarms: maxAlarms,
      roundNumber: 0,
      vaultCardsTurned: 0,
      alarmCardsTurned: 0,
      activeCard: null,
      proPermanentCard: null,
      nextCard: null,
      unusedEffractions: [...ALL_EFFRACTION_CARDS],
      unusedComplices: [...ALL_COMPLICE_CARDS],
      bonusActivationVotes: [],
      bonusActionState: null,
      bonusActivatedThisRound: false,
      players: [{
        id: playerId,
        name: playerName || 'Chef du Gang',
        socketId: socket.id,
        hand: [],
        token: null,
        tokenHistory: { PRE_FLOP: null, FLOP: null, TURN: null, RIVER: null },
        ready: false,
        hasGrosBras: false,
        publicAnnouncement: null,
        privateSecret: null,
        coordinateurCardIndex: null,
        arnaqueuseValidated: false
      }],
      deck: [],
      communityCards: [],
      availableTokens: [],
      swapRequests: []
    };
    userSession = { roomCode: code, playerId };
    socket.join(code);
    broadcastRoom(code);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('error_message', 'Planque introuvable.');
    if (room.phase !== 'LOBBY') return socket.emit('error_message', 'Partie déjà en cours.');
    if (room.players.length >= 6) return socket.emit('error_message', 'Gang au complet (6 braqueurs max).');

    const playerId = socket.id;
    room.players.push({
      id: playerId,
      name: playerName || `Braqueur ${room.players.length + 1}`,
      socketId: socket.id,
      hand: [],
      token: null,
      tokenHistory: { PRE_FLOP: null, FLOP: null, TURN: null, RIVER: null },
      ready: false,
      hasGrosBras: false,
      publicAnnouncement: null,
      privateSecret: null,
      coordinateurCardIndex: null,
      arnaqueuseValidated: false
    });
    userSession = { roomCode: code, playerId };
    socket.join(code);
    broadcastRoom(code);
  });

  socket.on('start_game', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId) return;
    if (room.players.length < 2) return socket.emit('error_message', 'Au moins 2 braqueurs requis.');
    
    room.vaultCardsTurned = 0;
    room.alarmCardsTurned = 0;
    room.roundNumber = 0;
    room.activeCard = null;
    room.proPermanentCard = null;
    room.nextCard = null;
    startNewBraquage(room);
    broadcastRoom(room.code);
  });

  socket.on('select_token', ({ tokenValue }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase === 'LOBBY' || room.phase === 'SHOWDOWN') return;

    const player = room.players.find(p => p.id === userSession.playerId);
    if (!player) return;

    const isCapteur = (room.activeCard && room.activeCard.id === 'eff_2');
    if (isCapteur && ['PRE_FLOP', 'FLOP', 'TURN'].includes(room.phase) && player.token === 1) {
      return socket.emit('error_message', 'Capteurs de bruit : le jeton 1 étoile ne peut pas quitter son propriétaire !');
    }

    if (player.token !== null) {
      room.availableTokens.push(player.token);
      room.availableTokens.sort((a, b) => a - b);
      player.token = null;
    }

    const idx = room.availableTokens.indexOf(tokenValue);
    if (idx !== -1) {
      room.availableTokens.splice(idx, 1);
      player.token = tokenValue;
      player.ready = false;
    }
    broadcastRoom(room.code);
  });

  socket.on('request_swap', ({ targetPlayerId }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase === 'LOBBY' || room.phase === 'SHOWDOWN') return;

    if (room.activeCard && room.activeCard.id === 'eff_6') {
      return socket.emit('error_message', 'Grille d\'aération active : aucun échange de jeton n\'est permis !');
    }

    const me = room.players.find(p => p.id === userSession.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!me || !target || me.token === null || target.token === null) return;

    if (room.activeCard && room.activeCard.id === 'eff_2' && ['PRE_FLOP', 'FLOP', 'TURN'].includes(room.phase)) {
      if (me.token === 1 || target.token === 1) {
        return socket.emit('error_message', 'Capteurs de bruit : le jeton 1 étoile ne peut pas être échangé !');
      }
    }

    room.swapRequests = room.swapRequests.filter(s => !(s.fromId === me.id && s.targetId === target.id));
    room.swapRequests.push({
      fromId: me.id,
      fromName: me.name,
      targetId: target.id,
      fromToken: me.token,
      targetToken: target.token
    });
    broadcastRoom(room.code);
  });

  socket.on('respond_swap', ({ fromId, accept }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;

    const reqIdx = room.swapRequests.findIndex(s => s.fromId === fromId && s.targetId === userSession.playerId);
    if (reqIdx === -1) return;

    const req = room.swapRequests[reqIdx];
    room.swapRequests.splice(reqIdx, 1);

    if (accept) {
      const p1 = room.players.find(p => p.id === req.fromId);
      const p2 = room.players.find(p => p.id === req.targetId);
      if (p1 && p2) {
        const temp = p1.token;
        p1.token = p2.token;
        p2.token = temp;
        p1.ready = false;
        p2.ready = false;
      }
    }
    broadcastRoom(room.code);
  });

  socket.on('toggle_ready', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase === 'LOBBY' || room.phase === 'SHOWDOWN') return;

    const player = room.players.find(p => p.id === userSession.playerId);
    if (!player || player.token === null) {
      return socket.emit('error_message', 'Prenez un jeton avant de valider votre position.');
    }

    player.ready = !player.ready;
    const allReady = room.players.every(p => p.token !== null && p.ready);
    if (allReady) {
      advancePhase(room);
    }
    broadcastRoom(room.code);
  });

  socket.on('coordinateur_choose_card', ({ cardIndex }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase !== 'COORDINATEUR_PHASE') return;

    const p = room.players.find(pl => pl.id === userSession.playerId);
    if (p) p.coordinateurCardIndex = cardIndex;

    const allDone = room.players.every(pl => pl.coordinateurCardIndex !== null);
    if (allDone) {
      const n = room.players.length;
      const givenCards = room.players.map(pl => pl.hand.splice(pl.coordinateurCardIndex, 1)[0]);
      for (let i = 0; i < n; i++) {
        const nextIdx = (i + 1) % n;
        room.players[nextIdx].hand.push(givenCards[i]);
      }
      room.generalNotification = 'Cartes échangées avec succès ! Le 1er tour commence.';
      room.phase = 'PRE_FLOP';
      applyPreFlopAutoCards(room);
    }
    broadcastRoom(room.code);
  });

  socket.on('arnaqueuse_validate', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase !== 'ARNAQUEUSE_PHASE') return;

    const p = room.players.find(pl => pl.id === userSession.playerId);
    if (p) p.arnaqueuseValidated = true;

    const allDone = room.players.every(pl => pl.arnaqueuseValidated);
    if (allDone) {
      const pool = [];
      room.players.forEach(pl => {
        pool.push(...pl.hand);
        pl.hand = [];
      });
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const cardsEach = pool.length / room.players.length;
      room.players.forEach(pl => {
        for (let c = 0; c < cardsEach; c++) pl.hand.push(pool.pop());
      });
      room.generalNotification = 'Arnaqueuse : Les cartes personnelles ont été remélangées et redistribuées !';
      room.phase = 'PRE_FLOP';
      applyPreFlopAutoCards(room);
    }
    broadcastRoom(room.code);
  });

  socket.on('vote_bonus_activation', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.activeCard || room.activeCard.type !== 'bonus') return;
    if (room.bonusActivatedThisRound) return;

    if (!room.bonusActivationVotes.includes(userSession.playerId)) {
      room.bonusActivationVotes.push(userSession.playerId);
    }

    if (room.bonusActivationVotes.length === room.players.length) {
      room.bonusActivatedThisRound = true;
      const card = room.activeCard;

      if (card.id === 'comp_1') {
        room.bonusActionState = { type: 'INFORMATEUR_CHOOSE_SHOW' };
      } else if (card.id === 'comp_2') {
        room.bonusActionState = { type: 'CONDUCTRICE_READY' };
      } else if (card.id === 'comp_4') {
        room.bonusActionState = { type: 'CERVEAU_ASK' };
      } else if (card.id === 'comp_5') {
        room.bonusActionState = { type: 'VOTE_ROLE', role: 'Hackeuse', votes: {} };
      } else if (card.id === 'comp_7') {
        room.bonusActionState = { type: 'VOTE_ROLE', role: 'Valet', votes: {} };
      } else if (card.id === 'comp_10') {
        room.bonusActionState = { type: 'VOTE_ROLE', role: 'Gros bras', votes: {} };
      }
    }
    broadcastRoom(room.code);
  });

  socket.on('submit_role_vote', ({ targetPlayerId }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.bonusActionState || room.bonusActionState.type !== 'VOTE_ROLE') return;

    room.bonusActionState.votes[userSession.playerId] = targetPlayerId;

    if (Object.keys(room.bonusActionState.votes).length === room.players.length) {
      const score = {};
      room.players.forEach(p => score[p.id] = 0);
      for (const [voterId, chosenId] of Object.entries(room.bonusActionState.votes)) {
        score[chosenId] = (score[chosenId] || 0) + 1;
      }
      let maxVotes = -1;
      let winners = [];
      for (const [pId, cnt] of Object.entries(score)) {
        if (cnt > maxVotes) { maxVotes = cnt; winners = [pId]; }
        else if (cnt === maxVotes) winners.push(pId);
      }
      let winnerId = winners[0];
      if (winners.length > 1) {
        const hostVote = room.bonusActionState.votes[room.hostId];
        if (winners.includes(hostVote)) winnerId = hostVote;
      }

      const winner = room.players.find(p => p.id === winnerId);
      const role = room.bonusActionState.role;

      if (role === 'Gros bras') {
        winner.hasGrosBras = true;
        room.bonusActionState = { type: 'COMPLETED', message: `${winner.name} a été élu Gros Bras pour ce braquage !` };
      } else if (role === 'Hackeuse') {
        winner.hand.push(room.deck.pop());
        room.bonusActionState = { type: 'HACKEUSE_DISCARD', hackerId: winner.id };
      } else if (role === 'Valet') {
        room.bonusActionState = { type: 'VALET_DISCARD', valetPlayerId: winner.id };
      }
    }
    broadcastRoom(room.code);
  });

  socket.on('hackeuse_discard_card', ({ cardIndex }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.bonusActionState || room.bonusActionState.type !== 'HACKEUSE_DISCARD') return;
    if (room.bonusActionState.hackerId !== userSession.playerId) return;

    const p = room.players.find(pl => pl.id === userSession.playerId);
    p.hand.splice(cardIndex, 1);
    room.bonusActionState = { type: 'COMPLETED', message: `${p.name} a utilisé son pouvoir de Hackeuse.` };
    broadcastRoom(room.code);
  });

  socket.on('valet_discard_card', ({ cardIndex }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.bonusActionState || room.bonusActionState.type !== 'VALET_DISCARD') return;
    if (room.bonusActionState.valetPlayerId !== userSession.playerId) return;

    const p = room.players.find(pl => pl.id === userSession.playerId);
    p.hand.splice(cardIndex, 1);
    p.hand.push({ value: 'J', suit: '★', isColorlessJack: true });
    room.bonusActionState = { type: 'COMPLETED', message: `${p.name} a remplacé une carte par le Valet incolore !` };
    broadcastRoom(room.code);
  });

  socket.on('informateur_send', ({ cardIndex, targetPlayerId }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;

    const me = room.players.find(p => p.id === userSession.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!me || !target) return;

    const card = me.hand[cardIndex || 0];
    target.privateSecret = `${me.name} t'a montré secrètement sa carte : ${card.value} ${card.suit}`;
    me.publicAnnouncement = `A montré secrètement 1 carte à ${target.name}`;
    room.bonusActionState = { type: 'COMPLETED', message: `${me.name} a secrètement informé ${target.name}.` };
    broadcastRoom(room.code);
  });

  socket.on('conductrice_announce', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;
    const p = room.players.find(pl => pl.id === userSession.playerId);
    if (!p) return;

    const sentence = getGenericHandTypeSentence(p.hand, room.communityCards);
    p.publicAnnouncement = `Conductrice : "${sentence}"`;
    room.bonusActionState = { type: 'COMPLETED', message: `${p.name} a annoncé : « ${sentence} »` };
    broadcastRoom(room.code);
  });

  socket.on('cerveau_ask', ({ targetPlayerId, askedRank }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;

    const target = room.players.find(pl => pl.id === targetPlayerId);
    if (!target) return;

    const count = target.hand.filter(c => c.value === askedRank).length;
    let reply = `Je n'ai pas de ${askedRank}`;
    if (count === 1) reply = `J'ai un ${askedRank}`;
    else if (count >= 2) reply = `J'ai ${count} fois le ${askedRank}`;

    target.publicAnnouncement = `Cerveau de la bande : « ${reply} »`;
    room.bonusActionState = { type: 'COMPLETED', message: `${target.name} a répondu : « ${reply} »` };
    broadcastRoom(room.code);
  });

  // VOTE DU SCAN RÉTINIEN (eff_4)
  socket.on('submit_scan_vote', ({ guessedRank }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.showdownData) return;
    const sd = room.showdownData;
    const highestPlayer = sd.revealOrder[0];
    if (userSession.playerId === highestPlayer.playerId) return;

    sd.scanVotes[userSession.playerId] = guessedRank;
    const votersCount = room.players.length - 1;

    if (Object.keys(sd.scanVotes).length === votersCount) {
      const counts = {};
      Object.values(sd.scanVotes).forEach(v => counts[v] = (counts[v] || 0) + 1);
      let maxCnt = -1;
      let topRanks = [];
      for (const [r, cnt] of Object.entries(counts)) {
        if (cnt > maxCnt) { maxCnt = cnt; topRanks = [r]; }
        else if (cnt === maxCnt) topRanks.push(r);
      }

      if (topRanks.length > 1) {
        sd.scanVotes = {};
        room.generalNotification = 'Scan rétinien : Égalité dans les votes ! Vous devez revoter.';
      } else {
        const finalGuess = topRanks[0];
        const hasRank = highestPlayer.hand.some(c => c.value === finalGuess);
        sd.scanResolved = true;
        if (hasRank) {
          room.generalNotification = `Scan rétinien réussi ! Le rang ${finalGuess} est bien présent chez ${highestPlayer.playerName}. L'abattage continue.`;
        } else {
          sd.hasError = true;
          sd.currentAnomalyFound = true;
          room.generalNotification = `Scan rétinien échoué ! ${highestPlayer.playerName} n'avait pas de ${finalGuess}. Le braquage échoue !`;
        }
      }
      broadcastRoom(room.code);
    } else {
      broadcastRoom(room.code);
    }
  });

  // VOTE DU LECTEUR D'EMPREINTES DIGITALES (eff_9)
  socket.on('submit_empreinte_vote', ({ guessedCombo }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.showdownData) return;
    const sd = room.showdownData;
    const highestPlayer = sd.revealOrder[0];
    if (userSession.playerId === highestPlayer.playerId) return;

    sd.empreinteVotes[userSession.playerId] = guessedCombo;
    const votersCount = room.players.length - 1;

    if (Object.keys(sd.empreinteVotes).length === votersCount) {
      const counts = {};
      Object.values(sd.empreinteVotes).forEach(v => counts[v] = (counts[v] || 0) + 1);
      let maxCnt = -1;
      let topCombos = [];
      for (const [c, cnt] of Object.entries(counts)) {
        if (cnt > maxCnt) { maxCnt = cnt; topCombos = [c]; }
        else if (cnt === maxCnt) topCombos.push(c);
      }

      if (topCombos.length > 1) {
        sd.empreinteVotes = {};
        room.generalNotification = 'Lecteur d\'empreintes : Égalité dans les votes ! Vous devez revoter.';
      } else {
        const finalGuess = topCombos[0];
        const actualCat = getExactHandCategory(highestPlayer.hand, room.communityCards);
        sd.empreinteResolved = true;

        if (actualCat.toLowerCase().trim() === finalGuess.toLowerCase().trim()) {
          room.generalNotification = `Lecteur d\'empreintes validé ! La combinaison de ${highestPlayer.playerName} est bien « ${finalGuess} ». L'abattage continue.`;
        } else {
          sd.hasError = true;
          sd.currentAnomalyFound = true;
          room.generalNotification = `Lecteur d\'empreintes échoué ! ${highestPlayer.playerName} avait « ${actualCat} » et non « ${finalGuess} ». Le braquage échoue !`;
        }
      }
      broadcastRoom(room.code);
    } else {
      broadcastRoom(room.code);
    }
  });

  socket.on('host_reveal_next', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId || room.phase !== 'SHOWDOWN') return;

    const sd = room.showdownData;
    if (!sd || sd.currentIndex >= sd.revealOrder.length - 1) return;

    if (sd.currentIndex === -1) {
      if (sd.requiresScanRetinien && !sd.scanResolved) return;
      if (sd.requiresLecteurEmpreintes && !sd.empreinteResolved) return;
    }

    sd.currentIndex++;
    const nextItem = sd.revealOrder[sd.currentIndex];
    sd.revealedItems.push(nextItem);

    for (let i = 0; i < sd.currentIndex; i++) {
      const prev = sd.revealOrder[i];
      if (nextItem.finalToken < prev.finalToken && nextItem.theoreticalRank > prev.theoreticalRank) {
        sd.currentAnomalyFound = true;
      }
    }
    broadcastRoom(room.code);
  });

  socket.on('host_apply_verdict', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId || room.phase !== 'SHOWDOWN') return;

    const sd = room.showdownData;
    if (!sd || sd.verdictApplied) return;

    sd.verdictApplied = true;

    if (sd.hasError) {
      room.alarmCardsTurned = (room.alarmCardsTurned || 0) + 1;
      if (room.gameMode !== 'GANGSTER') {
        room.nextCard = drawNextCard(room, 'bonus');
      } else {
        room.nextCard = null;
      }
    } else {
      room.vaultCardsTurned = (room.vaultCardsTurned || 0) + 1;
      room.nextCard = drawNextCard(room, 'malus');
    }

    if (room.vaultCardsTurned >= 3) {
      sd.gameOverStatus = 'VICTORY';
      room.nextCard = null;
    } else if (room.alarmCardsTurned >= room.maxAlarms) {
      sd.gameOverStatus = 'DEFEAT';
      room.nextCard = null;
    }

    broadcastRoom(room.code);
  });

  socket.on('next_braquage', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId) return;

    if (room.vaultCardsTurned >= 3 || room.alarmCardsTurned >= room.maxAlarms) {
      room.vaultCardsTurned = 0;
      room.alarmCardsTurned = 0;
      room.roundNumber = 0;
      room.activeCard = null;
      room.nextCard = null;
      room.proPermanentCard = null;
      room.unusedEffractions = [...ALL_EFFRACTION_CARDS];
      room.unusedComplices = [...ALL_COMPLICE_CARDS];
    } else {
      room.activeCard = room.nextCard;
      room.nextCard = null;
    }

    startNewBraquage(room);
    broadcastRoom(room.code);
  });

  socket.on('disconnect', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;

    const pIdx = room.players.findIndex(p => p.id === userSession.playerId);
    if (pIdx !== -1) {
      const p = room.players[pIdx];
      if (p.token !== null && room.availableTokens) {
        room.availableTokens.push(p.token);
        room.availableTokens.sort((a, b) => a - b);
      }
      room.players.splice(pIdx, 1);
    }

    if (room.players.length === 0) {
      delete rooms[room.code];
    } else {
      if (room.hostId === userSession.playerId) {
        room.hostId = room.players[0].id;
      }
      broadcastRoom(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur The Gang Definitive v5.1 actif sur http://localhost:${PORT}`);
});
