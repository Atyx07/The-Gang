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

// Cartes MALUS (Effraction - déclenchées après un coffre réussi)
const EFFRACTION_CARDS = [
  { id: 'eff_1', title: 'Ouverture facile', type: 'malus', desc: 'Pas de jetons blancs au 1er tour. Après la distribution, passez immédiatement au Flop (2e tour).' },
  { id: 'eff_5', title: 'Fuite précipitée', type: 'malus', desc: 'Pas de jetons orange au 3e tour. Révélez la 4e carte commune et passez directement à la Rivière (4e tour).' },
  { id: 'eff_10', title: 'Caméras de surveillance', type: 'malus', desc: 'Chaque gangster reçoit 3 cartes personnelles au lieu de 2 ! Analysez la meilleure main parmi 8 cartes.' }
];

// Cartes BONUS (Complice - déclenchées après une alarme déclenchée)
const COMPLICE_CARDS = [
  { id: 'comp_1', title: 'Informateur', type: 'bonus', desc: 'Un gangster peut secrètement révéler une de ses cartes personnelles à un complice.' },
  { id: 'comp_2', title: 'Conductrice', type: 'bonus', desc: 'Le joueur le plus hésitant peut révéler le type de sa main (ex: "J\'ai une paire") sans préciser les valeurs.' },
  { id: 'comp_3', title: 'Actionnaire', type: 'bonus', desc: 'Tous les gangsters annoncent publiquement combien de têtes (Valet, Dame, Roi) ils ont en main.' },
  { id: 'comp_8', title: 'Génie des chiffres', type: 'bonus', desc: 'Chaque joueur annonce la somme de ses cartes en main (2-10 = valeur, têtes = 10, As = 11).' }
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

const rooms = {};

function startNewBraquage(room) {
  room.deck = createDeck();
  room.communityCards = [];
  room.roundNumber = (room.roundNumber || 0) + 1;
  room.swapRequests = [];
  room.showdownData = null;

  // Gestion des cartes spéciales actives
  const activeEffraction = room.activeCard && room.activeCard.type === 'malus' ? room.activeCard.id : null;
  const cardsPerPlayer = (activeEffraction === 'eff_10') ? 3 : 2;

  // Distribution
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
  });

  // Si malus "Ouverture facile" (eff_1) : saute le tour 1 pré-flop
  if (activeEffraction === 'eff_1') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
  } else {
    room.phase = 'PRE_FLOP';
  }
}

function advancePhase(room) {
  // Sauvegarde dans l'historique
  room.players.forEach(p => {
    p.tokenHistory[room.phase] = p.token;
  });

  const playerCount = room.players.length;
  const activeEffraction = room.activeCard && room.activeCard.type === 'malus' ? room.activeCard.id : null;

  if (room.phase === 'PRE_FLOP') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);
    room.players.forEach(p => { p.token = null; p.ready = false; });
  } else if (room.phase === 'FLOP') {
    // Si malus "Fuite précipitée" (eff_5) : saute le tour 3 Turn et passe directement à River
    if (activeEffraction === 'eff_5') {
      room.phase = 'RIVER';
      room.communityCards.push(room.deck.pop(), room.deck.pop()); // 4e et 5e cartes
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
    evaluateOfficialShowdown(room);
  }
}

function evaluateOfficialShowdown(room) {
  const communitySolver = room.communityCards.map(toSolverCard);

  // Résolution poker pour chaque gangster
  const evaluatedPlayers = room.players.map(p => {
    const fullHandStrings = [...p.hand.map(toSolverCard), ...communitySolver];
    const solved = Hand.solve(fullHandStrings);
    return {
      player: p,
      solvedHand: solved,
      finalToken: p.token,
      cards: p.hand,
      descr: translateHandDescr(solved.descr)
    };
  });

  // Tri par ordre de force réelle (du plus faible au plus fort)
  evaluatedPlayers.sort((a, b) => {
    const winners = Hand.winners([a.solvedHand, b.solvedHand]);
    if (winners.length === 2) return 0; // Égalité parfaite (Split officiel p. 12-13)
    return winners[0] === a.solvedHand ? 1 : -1;
  });

  // Calcul des rangs théoriques (en prenant en compte les égalités parfaites)
  let currentRank = 1;
  for (let i = 0; i < evaluatedPlayers.length; i++) {
    if (i > 0) {
      const prev = evaluatedPlayers[i - 1];
      const curr = evaluatedPlayers[i];
      const win = Hand.winners([prev.solvedHand, curr.solvedHand]);
      if (win.length === 2) {
        curr.theoreticalRank = prev.theoreticalRank; // Égalité parfaite !
      } else {
        currentRank = i + 1;
        curr.theoreticalRank = currentRank;
      }
    } else {
      evaluatedPlayers[i].theoreticalRank = 1;
    }
  }

  // RÈGLE OFFICIELLE DE L'ABATTAGE (Pages 8-9 & 12) :
  // "En commençant par le gangster qui a choisi le jeton à 1 étoile, puis dans l'ordre croissant (1, 2, 3...)"
  // Chacun révèle sa main. Si l'un révèle une combinaison plus faible qu'une précédente :
  // -> Le braquage échoue et ON RETOURNE EXACTEMENT 1 CARTE ALARME ROUGE (quel que soit le nombre d'erreurs).
  // Si toutes les mains révélées sont aussi fortes ou plus fortes :
  // -> Le braquage réussit et ON RETOURNE EXACTEMENT 1 CARTE COFFRE DORÉE.

  // Ordre de révélation officiel : ordre croissant des jetons (1, 2, 3...)
  const revealOrder = [...evaluatedPlayers].sort((a, b) => a.finalToken - b.finalToken);

  let hasError = false;
  const anomalies = [];

  for (let i = 1; i < revealOrder.length; i++) {
    const prev = revealOrder[i - 1];
    const curr = revealOrder[i];
    // Si curr a un jeton supérieur mais une main STRICTEMENT plus faible que prev
    if (curr.finalToken > prev.finalToken && curr.theoreticalRank < prev.theoreticalRank) {
      hasError = true;
      anomalies.push({
        player1: prev.player.name,
        token1: prev.finalToken,
        player2: curr.player.name,
        token2: curr.finalToken
      });
    }
  }

  // Application stricte des compteurs officiels
  if (hasError) {
    room.alarmCardsTurned = (room.alarmCardsTurned || 0) + 1;
    // Carte BONUS (Complice) activée pour le braquage suivant
    const randomComplice = COMPLICE_CARDS[Math.floor(Math.random() * COMPLICE_CARDS.length)];
    room.nextCard = randomComplice;
  } else {
    room.vaultCardsTurned = (room.vaultCardsTurned || 0) + 1;
    // Carte MALUS (Effraction) activée pour le braquage suivant
    const randomEffraction = EFFRACTION_CARDS[Math.floor(Math.random() * EFFRACTION_CARDS.length)];
    room.nextCard = randomEffraction;
  }

  // Vérification de fin de partie officielle (3 coffres ou 3 alarmes)
  let gameOverStatus = null;
  if (room.vaultCardsTurned >= 3) {
    gameOverStatus = 'VICTORY';
  } else if (room.alarmCardsTurned >= 3) {
    gameOverStatus = 'DEFEAT';
  }

  room.showdownData = {
    revealOrder: revealOrder.map(ep => ({
      playerId: ep.player.id,
      playerName: ep.player.name,
      hand: ep.cards,
      combination: ep.descr,
      finalToken: ep.finalToken,
      theoreticalRank: ep.theoreticalRank
    })),
    hasError,
    anomalies,
    vaultCardsTurned: room.vaultCardsTurned,
    alarmCardsTurned: room.alarmCardsTurned,
    gameOverStatus,
    appliedCard: room.nextCard
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
    roundNumber: room.roundNumber || 1,
    vaultCardsTurned: room.vaultCardsTurned || 0,
    alarmCardsTurned: room.alarmCardsTurned || 0,
    activeCard: room.activeCard || null,
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
      hand: (room.phase === 'SHOWDOWN' || p.id === playerId) ? p.hand : p.hand.map(() => null)
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

  socket.on('create_room', ({ playerName }) => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const playerId = socket.id;
    rooms[code] = {
      code,
      hostId: playerId,
      phase: 'LOBBY',
      roundNumber: 0,
      vaultCardsTurned: 0,
      alarmCardsTurned: 0,
      activeCard: null,
      nextCard: null,
      players: [{
        id: playerId,
        name: playerName || 'Chef du Gang',
        socketId: socket.id,
        hand: [],
        token: null,
        tokenHistory: { PRE_FLOP: null, FLOP: null, TURN: null, RIVER: null },
        ready: false
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
    if (room.phase !== 'LOBBY') return socket.emit('error_message', 'Braquage déjà en cours.');
    if (room.players.length >= 6) return socket.emit('error_message', 'Gang plein (6 braqueurs max).');

    const playerId = socket.id;
    room.players.push({
      id: playerId,
      name: playerName || `Braqueur ${room.players.length + 1}`,
      socketId: socket.id,
      hand: [],
      token: null,
      tokenHistory: { PRE_FLOP: null, FLOP: null, TURN: null, RIVER: null },
      ready: false
    });
    userSession = { roomCode: code, playerId };
    socket.join(code);
    broadcastRoom(code);
  });

  socket.on('start_game', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId) return;
    if (room.players.length < 2) return socket.emit('error_message', 'Il faut au moins 2 joueurs.');
    room.vaultCardsTurned = 0;
    room.alarmCardsTurned = 0;
    room.roundNumber = 0;
    room.activeCard = null;
    startNewBraquage(room);
    broadcastRoom(room.code);
  });

  socket.on('select_token', ({ tokenValue }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase === 'LOBBY' || room.phase === 'SHOWDOWN') return;

    const player = room.players.find(p => p.id === userSession.playerId);
    if (!player) return;

    // Règle officielle : On peut reprendre un jeton ou reposer le sien au centre
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

    const me = room.players.find(p => p.id === userSession.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!me || !target || me.token === null || target.token === null) return;

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
      return socket.emit('error_message', 'Choisis un jeton pour ce tour avant de valider.');
    }

    player.ready = !player.ready;
    const allReady = room.players.every(p => p.token !== null && p.ready);
    if (allReady) {
      advancePhase(room);
    }
    broadcastRoom(room.code);
  });

  socket.on('next_braquage', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId) return;

    // Si la partie était finie, réinitialiser complètement
    if (room.vaultCardsTurned >= 3 || room.alarmCardsTurned >= 3) {
      room.vaultCardsTurned = 0;
      room.alarmCardsTurned = 0;
      room.roundNumber = 0;
      room.activeCard = null;
      room.nextCard = null;
    } else {
      // Activer la carte bonus/malus pour ce braquage
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
      const player = room.players[pIdx];
      if (player.token !== null && room.availableTokens) {
        room.availableTokens.push(player.token);
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
  console.log(`Serveur The Gang Official Rules lancé sur http://localhost:${PORT}`);
});
