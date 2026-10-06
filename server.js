const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Hand = require('pokersolver').Hand;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// Deck standard de 52 cartes
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const val of VALUES) {
      deck.push({ suit, value: val });
    }
  }
  // Shuffle Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Convert card to pokersolver format (e.g., 'Ah', '10s', 'Kd')
function toSolverCard(card) {
  const suitMap = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  let val = card.value;
  if (val === '10') val = 'T';
  return val + suitMap[card.suit];
}

const PHASES = ['LOBBY', 'PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];

// Stockage en mémoire des parties
const rooms = {};

function initGame(room) {
  const deck = createDeck();
  room.deck = deck;
  room.communityCards = [];
  room.burnCards = [];
  room.phase = 'PRE_FLOP';
  room.alarms = 0;
  room.maxAlarms = 3;
  room.vaultSuccess = null;
  room.swapRequests = []; // Demandes d'échange en cours

  const playerCount = room.players.length;
  // Jetons d'estimation numérotés de 1 à N (1 = plus faible, N = plus fort)
  room.availableTokens = Array.from({ length: playerCount }, (_, i) => i + 1);

  // Distribuer 2 cartes fermées par joueur
  room.players.forEach(p => {
    p.hand = [deck.pop(), deck.pop()];
    p.token = null;
    p.ready = false;
  });
}

function advancePhase(room) {
  if (room.phase === 'PRE_FLOP') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
  } else if (room.phase === 'FLOP') {
    room.phase = 'TURN';
    room.communityCards.push(room.deck.pop());
  } else if (room.phase === 'TURN') {
    room.phase = 'RIVER';
    room.communityCards.push(room.deck.pop());
  } else if (room.phase === 'RIVER') {
    room.phase = 'SHOWDOWN';
    evaluateShowdown(room);
  }
  room.players.forEach(p => p.ready = false);
}

function evaluateShowdown(room) {
  const communitySolver = room.communityCards.map(toSolverCard);
  
  // Calculer la main de chaque joueur
  const playerHands = room.players.map(p => {
    const fullHandStrings = [...p.hand.map(toSolverCard), ...communitySolver];
    const solved = Hand.solve(fullHandStrings);
    return {
      player: p,
      solvedHand: solved,
      token: p.token,
      cards: p.hand,
      descr: solved.descr
    };
  });

  // Trier du plus faible au plus fort
  // pokersolver Hand.winners retourne les meilleures mains.
  // Pour trier du plus faible au plus fort, on compare avec Hand.winners
  playerHands.sort((a, b) => {
    const winners = Hand.winners([a.solvedHand, b.solvedHand]);
    if (winners.length === 2) return 0; // Égalité parfaite (Split)
    return winners[0] === a.solvedHand ? 1 : -1; // b plus faible que a si a gagne
  });

  // Assigner les rangs théoriques (1 = plus faible, N = plus fort)
  let currentRank = 1;
  for (let i = 0; i < playerHands.length; i++) {
    if (i > 0) {
      const prev = playerHands[i - 1];
      const curr = playerHands[i];
      const win = Hand.winners([prev.solvedHand, curr.solvedHand]);
      if (win.length === 2) {
        curr.theoreticalRank = prev.theoreticalRank;
      } else {
        currentRank = i + 1;
        curr.theoreticalRank = currentRank;
      }
    } else {
      playerHands[i].theoreticalRank = 1;
    }
  }

  // Vérifier la cohérence de l'ordre des jetons par rapport à la force réelle
  let errors = 0;
  for (let i = 0; i < playerHands.length; i++) {
    for (let j = i + 1; j < playerHands.length; j++) {
      const p1 = playerHands[i]; // Théoriquement plus faible ou égal
      const p2 = playerHands[j]; // Théoriquement plus fort ou égal
      
      if (p1.theoreticalRank < p2.theoreticalRank) {
        if (p1.token > p2.token) {
          errors++;
        }
      }
    }
  }

  room.showdownResults = playerHands.map(ph => ({
    playerId: ph.player.id,
    playerName: ph.player.name,
    hand: ph.cards,
    combination: ph.descr,
    chosenToken: ph.token,
    rank: ph.theoreticalRank
  }));

  room.alarms = errors;
  room.vaultSuccess = errors === 0;
}

function sanitizeRoomState(room, playerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    alarms: room.alarms,
    maxAlarms: room.maxAlarms,
    vaultSuccess: room.vaultSuccess,
    availableTokens: room.availableTokens,
    communityCards: room.communityCards,
    swapRequests: room.swapRequests.filter(s => s.targetId === playerId || s.fromId === playerId),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      token: p.token,
      ready: p.ready,
      isSelf: p.id === playerId,
      // Si showdown, on révèle les mains de tout le monde, sinon uniquement la sienne
      hand: (room.phase === 'SHOWDOWN' || p.id === playerId) ? p.hand : [null, null]
    })),
    showdownResults: room.phase === 'SHOWDOWN' ? room.showdownResults : null
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
      players: [{ id: playerId, name: playerName || 'Braqueur 1', socketId: socket.id, hand: [], token: null, ready: false }],
      deck: [],
      communityCards: [],
      availableTokens: [],
      alarms: 0,
      maxAlarms: 3,
      vaultSuccess: null,
      swapRequests: []
    };
    userSession = { roomCode: code, playerId };
    socket.join(code);
    broadcastRoom(code);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      return socket.emit('error_message', 'Planque introuvable avec ce code.');
    }
    if (room.phase !== 'LOBBY') {
      return socket.emit('error_message', 'Le braquage est déjà en cours dans cette salle.');
    }
    if (room.players.length >= 6) {
      return socket.emit('error_message', 'Le gang est complet (6 joueurs max).');
    }

    const playerId = socket.id;
    room.players.push({
      id: playerId,
      name: playerName || `Braqueur ${room.players.length + 1}`,
      socketId: socket.id,
      hand: [],
      token: null,
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
    if (room.players.length < 2) {
      return socket.emit('error_message', 'Il faut au moins 2 braqueurs pour lancer la partie.');
    }
    initGame(room);
    broadcastRoom(room.code);
  });

  socket.on('select_token', ({ tokenValue }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.phase === 'LOBBY' || room.phase === 'SHOWDOWN') return;

    const player = room.players.find(p => p.id === userSession.playerId);
    if (!player) return;

    // Si le joueur possédait déjà un jeton, il le remet sur la table
    if (player.token !== null) {
      room.availableTokens.push(player.token);
      room.availableTokens.sort((a, b) => a - b);
      player.token = null;
    }

    // Prendre le nouveau jeton s'il est dispo
    const tokenIndex = room.availableTokens.indexOf(tokenValue);
    if (tokenIndex !== -1) {
      room.availableTokens.splice(tokenIndex, 1);
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

    // Supprimer d'éventuelles requêtes existantes entre eux
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
      return socket.emit('error_message', 'Choisis un jeton d\'estimation avant de valider ta position.');
    }

    player.ready = !player.ready;

    // Si tous les joueurs ont un jeton et sont prêts -> phase suivante
    const allReady = room.players.every(p => p.token !== null && p.ready);
    if (allReady) {
      advancePhase(room);
    }

    broadcastRoom(room.code);
  });

  socket.on('new_round', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId) return;
    initGame(room);
    broadcastRoom(room.code);
  });

  socket.on('disconnect', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;

    // Libérer le jeton
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
  console.log(`Serveur The Gang lancé sur http://localhost:${PORT}`);
});
