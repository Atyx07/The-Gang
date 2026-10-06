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

// Cartes Malus (Effraction)
const EFFRACTION_CARDS = [
  { id: 'eff_1', title: 'Ouverture facile', type: 'malus', desc: 'Pas de jetons blancs au 1er tour. Après la distribution, passez immédiatement au Flop.' },
  { id: 'eff_2', title: 'Capteurs de bruit', type: 'malus', desc: 'Le jeton 1 étoile ne peut plus changer de propriétaire une fois attribué.' },
  { id: 'eff_5', title: 'Fuite précipitée', type: 'malus', desc: 'Pas de jetons orange au 3e tour. Révélez la 4e carte commune et passez directement à la Rivière.' },
  { id: 'eff_10', title: 'Caméras de surveillance', type: 'malus', desc: 'Chaque gangster reçoit 3 cartes personnelles au lieu de 2 !' }
];

// Cartes Bonus (Complice)
const COMPLICE_CARDS = [
  { id: 'comp_10', title: 'Gros bras', type: 'bonus', actionType: 'vote_recipient', desc: 'Un gangster désigné par vote l\'emporte sur toute combinaison de même rang à l\'abattage.' },
  { id: 'comp_1', title: 'Informateur', type: 'bonus', actionType: 'secret_reveal', desc: 'Un joueur désigné montre secrètement 1 de ses cartes à un complice.' },
  { id: 'comp_2', title: 'Conductrice', type: 'bonus', actionType: 'announce_type', desc: 'Un gangster révèle publiquement le type de sa main (ex: "J\'ai une paire") sans donner aucune valeur.' },
  { id: 'comp_3', title: 'Actionnaire', type: 'bonus', actionType: 'auto_faces', desc: 'Chaque gangster annonce publiquement son nombre de têtes (J, Q, K).' },
  { id: 'comp_8', title: 'Génie des chiffres', type: 'bonus', actionType: 'auto_sum', desc: 'Chaque gangster annonce publiquement la somme de ses cartes en main.' }
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

// Fonction dédiée et stricte pour la Conductrice : retourne UNIQUEMENT le type de main générique
function getGenericHandTypeSentence(hand, communityCards) {
  if (!hand || hand.length === 0) return "J'ai carte haute";
  const available = [...hand, ...communityCards].map(toSolverCard);
  try {
    const solved = Hand.solve(available);
    const d = solved.name.toLowerCase(); // 'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
    if (d.includes('royal flush')) return "J'ai une quinte flush royale";
    if (d.includes('straight flush')) return "J'ai une quinte flush";
    if (d.includes('four of a kind')) return "J'ai un carré";
    if (d.includes('full house')) return "J'ai un full";
    if (d.includes('flush')) return "J'ai une couleur";
    if (d.includes('straight')) return "J'ai une quinte";
    if (d.includes('three of a kind')) return "J'ai un brelan";
    if (d.includes('two pair')) return "J'ai une double paire";
    if (d.includes('pair')) return "J'ai une paire";
    return "J'ai carte haute";
  } catch (e) {
    return "J'ai carte haute";
  }
}

const rooms = {};

function startNewBraquage(room) {
  room.deck = createDeck();
  room.communityCards = [];
  room.roundNumber = (room.roundNumber || 0) + 1;
  room.swapRequests = [];
  room.showdownData = null;
  room.bonusActivationVotes = [];
  room.bonusActionState = null;
  room.bonusActivatedThisRound = false;

  if (room.gameMode === 'PRO') {
    if (!room.proPermanentCard) {
      const eligible = EFFRACTION_CARDS.filter(c => c.id !== 'eff_1');
      room.proPermanentCard = eligible[Math.floor(Math.random() * eligible.length)];
    }
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
  });

  const hasOuverture = (room.activeCard && room.activeCard.id === 'eff_1');
  if (hasOuverture) {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
  } else {
    room.phase = 'PRE_FLOP';
  }
}

function advancePhase(room) {
  room.players.forEach(p => {
    p.tokenHistory[room.phase] = p.token;
  });

  const playerCount = room.players.length;
  const hasFuite = (room.activeCard && room.activeCard.id === 'eff_5');

  if (room.phase === 'PRE_FLOP') {
    room.phase = 'FLOP';
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
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

  // Tri du plus faible au plus fort
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

  // ORDRE DE RÉVÉLATION DÉCROISSANT : commence par le joueur ayant le jeton le plus fort (le plus d'étoiles) !
  const revealOrder = [...evaluatedPlayers].sort((a, b) => b.finalToken - a.finalToken);

  let hasError = false;
  const anomalies = [];
  // Lors d'une révélation décroissante (N -> 1) :
  // Chaque joueur révélé ensuite a un jeton inférieur ou égal. Sa main doit donc être PLUS FAIBLE ou ÉGALE à la précédente !
  // Si curr a une main STRICTEMENT PLUS FORTE que prev (curr.theoreticalRank > prev.theoreticalRank), c'est une anomalie !
  for (let i = 1; i < revealOrder.length; i++) {
    const prev = revealOrder[i - 1]; // Jeton plus grand
    const curr = revealOrder[i];     // Jeton plus petit
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
    verdictApplied: false
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
        privateSecret: null
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
      privateSecret: null
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

    const hasCapteurs = (room.activeCard && room.activeCard.id === 'eff_2');
    if (hasCapteurs && player.token === 1) {
      return socket.emit('error_message', 'Capteurs de bruit actifs : le jeton 1 ne peut plus être relâché !');
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

  // VOTE ET UTILISATION DE LA CARTE BONUS (COMPLICE)
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

      if (card.actionType === 'vote_recipient') {
        room.bonusActionState = {
          type: 'VOTE_GROS_BRAS',
          title: 'Désignation de Gros Bras',
          votes: {},
          finished: false
        };
      } else if (card.actionType === 'auto_faces') {
        room.players.forEach(p => {
          const faces = p.hand.filter(c => ['J', 'Q', 'K'].includes(c.value)).length;
          p.publicAnnouncement = `Actionnaire : J\'ai ${faces} tête(s)`;
        });
        room.bonusActionState = { type: 'COMPLETED', message: 'Têtes annoncées par tous les gangsters !' };
      } else if (card.actionType === 'auto_sum') {
        room.players.forEach(p => {
          let sum = 0;
          p.hand.forEach(c => {
            if (['J', 'Q', 'K'].includes(c.value)) sum += 10;
            else if (c.value === 'A') sum += 11;
            else sum += parseInt(c.value, 10);
          });
          p.publicAnnouncement = `Génie des chiffres : Somme = ${sum}`;
        });
        room.bonusActionState = { type: 'COMPLETED', message: 'Sommes des cartes annoncées publiquement !' };
      } else if (card.actionType === 'announce_type') {
        room.bonusActionState = {
          type: 'CHOOSE_PLAYER_CONDUCTRICE',
          title: 'Conductrice : Choisir qui annonce son type de main'
        };
      } else if (card.actionType === 'secret_reveal') {
        room.bonusActionState = {
          type: 'CHOOSE_INFORMATEUR',
          title: 'Informateur : Choisissez qui montre une carte'
        };
      }
    }
    broadcastRoom(room.code);
  });

  // Vote Gros Bras
  socket.on('submit_gros_bras_vote', ({ targetPlayerId }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || !room.bonusActionState || room.bonusActionState.type !== 'VOTE_GROS_BRAS') return;

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
        if (cnt > maxVotes) {
          maxVotes = cnt;
          winners = [pId];
        } else if (cnt === maxVotes) {
          winners.push(pId);
        }
      }

      let finalWinnerId = winners[0];
      if (winners.length > 1) {
        const hostVote = room.bonusActionState.votes[room.hostId];
        if (winners.includes(hostVote)) {
          finalWinnerId = hostVote;
        }
      }

      const winnerPlayer = room.players.find(p => p.id === finalWinnerId);
      if (winnerPlayer) {
        winnerPlayer.hasGrosBras = true;
        winnerPlayer.publicAnnouncement = '💪 Bénéficie de la carte Gros Bras !';
      }

      room.bonusActionState = {
        type: 'COMPLETED',
        message: `${winnerPlayer.name} a été désigné Gros Bras pour ce braquage !`
      };
    }
    broadcastRoom(room.code);
  });

  // Action Conductrice : annonce UNIQUEMENT le type de main (ex: "J'ai une paire")
  socket.on('conductrice_announce', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;
    const p = room.players.find(pl => pl.id === userSession.playerId);
    if (!p) return;
    
    // Appel strict à la fonction sans donner de hauteur de carte
    const sentence = getGenericHandTypeSentence(p.hand, room.communityCards);
    p.publicAnnouncement = `Conductrice : "${sentence}"`;
    room.bonusActionState = { type: 'COMPLETED', message: `${p.name} a annoncé : « ${sentence} »` };
    broadcastRoom(room.code);
  });

  socket.on('informateur_send_card', ({ targetPlayerId, cardIndex }) => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room) return;
    const me = room.players.find(p => p.id === userSession.playerId);
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!me || !target) return;

    const revealedCard = me.hand[cardIndex || 0];
    target.privateSecret = `${me.name} t'a montré secrètement sa carte : ${revealedCard.value} ${revealedCard.suit}`;
    me.publicAnnouncement = `A montré secrètement 1 carte à ${target.name}`;
    room.bonusActionState = { type: 'COMPLETED', message: `${me.name} a secrètement informé ${target.name}.` };
    broadcastRoom(room.code);
  });

  // ==========================================
  // CONTRÔLE PAR L'HÔTE LORS DU SHOWDOWN
  // ==========================================
  socket.on('host_reveal_next', () => {
    if (!userSession) return;
    const room = rooms[userSession.roomCode];
    if (!room || room.hostId !== userSession.playerId || room.phase !== 'SHOWDOWN') return;

    const sd = room.showdownData;
    if (!sd || sd.currentIndex >= sd.revealOrder.length - 1) return;

    sd.currentIndex++;
    const nextItem = sd.revealOrder[sd.currentIndex];
    sd.revealedItems.push(nextItem);

    // Vérifier si cette main est STRICTEMENT plus forte qu'une main révélée plus tôt avec un jeton plus fort
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
        const nextBonus = COMPLICE_CARDS[Math.floor(Math.random() * COMPLICE_CARDS.length)];
        room.nextCard = nextBonus;
      } else {
        room.nextCard = null;
      }
    } else {
      room.vaultCardsTurned = (room.vaultCardsTurned || 0) + 1;
      const nextMalus = EFFRACTION_CARDS[Math.floor(Math.random() * EFFRACTION_CARDS.length)];
      room.nextCard = nextMalus;
    }

    if (room.vaultCardsTurned >= 3) {
      sd.gameOverStatus = 'VICTORY';
    } else if (room.alarmCardsTurned >= room.maxAlarms) {
      sd.gameOverStatus = 'DEFEAT';
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
  console.log(`Serveur The Gang Ultimate v4.1 lancé sur http://localhost:${PORT}`);
});
