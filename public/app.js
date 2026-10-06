const socket = io();

let currentRoom = null;
let myId = null;

// Audio FX simples synthétisés (Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, duration) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

// Sélecteurs DOM
const screenAuth = document.getElementById('screen-auth');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');

const inputName = document.getElementById('player-name-input');
const inputCode = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create-room');
const btnJoin = document.getElementById('btn-join-room');

const lobbyPlayersList = document.getElementById('lobby-players-list');
const lobbyCount = document.getElementById('lobby-count');
const lobbyCodeDisplay = document.getElementById('lobby-code-display');
const lobbyHostControls = document.getElementById('lobby-host-controls');
const lobbyGuestWaiting = document.getElementById('lobby-guest-waiting');
const btnStartGame = document.getElementById('btn-start-game');

const roomCodeTag = document.getElementById('room-code-tag');
const currentRoomCode = document.getElementById('current-room-code');

const gamePhaseBadge = document.getElementById('game-phase-badge');
const alarmsContainer = document.getElementById('alarms-container');
const otherPlayersContainer = document.getElementById('other-players-container');
const communityCardsContainer = document.getElementById('community-cards');
const availableTokensList = document.getElementById('available-tokens-list');
const selfCardsContainer = document.getElementById('self-cards');
const selfTokenSlot = document.getElementById('self-token-slot');
const btnToggleReady = document.getElementById('btn-toggle-ready');
const selfName = document.getElementById('self-name');

const swapModal = document.getElementById('swap-modal');
const swapModalText = document.getElementById('swap-modal-text');
const btnAcceptSwap = document.getElementById('btn-accept-swap');
const btnRefuseSwap = document.getElementById('btn-refuse-swap');
let currentSwapOffer = null;

const showdownModal = document.getElementById('showdown-modal');
const showdownTitle = document.getElementById('showdown-title');
const showdownSubtitle = document.getElementById('showdown-subtitle');
const showdownIcon = document.getElementById('showdown-icon');
const showdownList = document.getElementById('showdown-list');
const showdownHostBtn = document.getElementById('showdown-host-btn');
const showdownGuestMsg = document.getElementById('showdown-guest-msg');
const btnNewRound = document.getElementById('btn-new-round');

// Vérifier les paramètres d'URL (ex: ?room=ABCD)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  inputCode.value = urlParams.get('room').toUpperCase();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').innerText = msg;
  toast.classList.remove('translate-y-[-100px]', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-[-100px]', 'opacity-0');
  }, 3500);
}

function copyInviteLink() {
  const url = `${window.location.origin}?room=${currentRoom.code}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Lien de la planque copié dans le presse-papier !');
  });
}

// Rendu d'une carte HTML
function renderCard(card, hidden = false) {
  if (hidden || !card) {
    return `<div class="poker-card card-back flex items-center justify-center">
              <span class="text-amber-300 font-western text-2xl font-bold opacity-70">G</span>
            </div>`;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  const colorClass = isRed ? 'suit-red' : 'suit-black';
  return `
    <div class="poker-card card-front ${colorClass}">
      <div class="text-left text-sm leading-none">${card.value}</div>
      <div class="text-center text-3xl my-auto">${card.suit}</div>
      <div class="text-right text-sm leading-none">${card.value}</div>
    </div>
  `;
}

// Rendu d'un jeton d'estimation
function renderToken(tokenValue, onClickStr = '') {
  return `<div class="rank-token" ${onClickStr ? `onclick="${onClickStr}"` : ''}>${tokenValue}</div>`;
}

// Actions utilisateur
btnCreate.addEventListener('click', () => {
  const name = inputName.value.trim();
  socket.emit('create_room', { playerName: name });
});

btnJoin.addEventListener('click', () => {
  const name = inputName.value.trim();
  const code = inputCode.value.trim();
  if (!code) return showToast('Veuillez renseigner le code de la planque');
  socket.emit('join_room', { roomCode: code, playerName: name });
});

btnStartGame.addEventListener('click', () => {
  socket.emit('start_game');
});

btnToggleReady.addEventListener('click', () => {
  playTone(520, 0.15);
  socket.emit('toggle_ready');
});

btnNewRound.addEventListener('click', () => {
  socket.emit('new_round');
});

window.claimToken = function(val) {
  playTone(440, 0.1);
  socket.emit('select_token', { tokenValue: val });
};

window.proposeSwapWith = function(targetId) {
  socket.emit('request_swap', { targetPlayerId: targetId });
  showToast('Proposition d\'échange de jeton envoyée !');
};

btnAcceptSwap.addEventListener('click', () => {
  if (currentSwapOffer) {
    socket.emit('respond_swap', { fromId: currentSwapOffer.fromId, accept: true });
    swapModal.classList.add('hidden');
    currentSwapOffer = null;
  }
});

btnRefuseSwap.addEventListener('click', () => {
  if (currentSwapOffer) {
    socket.emit('respond_swap', { fromId: currentSwapOffer.fromId, accept: false });
    swapModal.classList.add('hidden');
    currentSwapOffer = null;
  }
});

// Écouteurs Socket.IO
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('error_message', (msg) => {
  showToast(msg);
});

socket.on('room_update', (room) => {
  currentRoom = room;

  // Mise à jour de l'entête
  roomCodeTag.classList.remove('hidden');
  currentRoomCode.innerText = room.code;

  if (room.phase === 'LOBBY') {
    screenAuth.classList.add('hidden');
    screenGame.classList.add('hidden');
    screenLobby.classList.remove('hidden');

    lobbyCodeDisplay.innerText = room.code;
    lobbyCount.innerText = room.players.length;
    lobbyPlayersList.innerHTML = room.players.map(p => `
      <li class="flex items-center justify-between p-2.5 bg-stone-950/60 rounded-lg border border-stone-800">
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full ${p.id === room.hostId ? 'bg-amber-400' : 'bg-emerald-500'}"></span>
          ${p.name} ${p.id === room.hostId ? '<span class="text-xs text-amber-500 font-bold ml-1">(Cerveau)</span>' : ''}
        </span>
        ${p.id === myId ? '<span class="text-xs bg-stone-800 px-2 py-0.5 rounded text-stone-400">Toi</span>' : ''}
      </li>
    `).join('');

    if (myId === room.hostId) {
      lobbyHostControls.classList.remove('hidden');
      lobbyGuestWaiting.classList.add('hidden');
    } else {
      lobbyHostControls.classList.add('hidden');
      lobbyGuestWaiting.classList.remove('hidden');
    }
  } else {
    // EN JEU
    screenAuth.classList.add('hidden');
    screenLobby.classList.add('hidden');
    screenGame.classList.remove('hidden');

    gamePhaseBadge.innerText = room.phase;

    // Alarmes
    alarmsContainer.innerHTML = Array.from({ length: room.maxAlarms }).map((_, i) => {
      const isTriggered = i < room.alarms;
      return `<span class="w-4 h-4 rounded-full ${isTriggered ? 'bg-red-600 shadow-[0_0_8px_#ef4444]' : 'bg-stone-700'} border border-stone-600"></span>`;
    }).join('');

    // Cartes Communes
    const fullCommunity = [...room.communityCards];
    while (fullCommunity.length < 5) fullCommunity.push(null);
    communityCardsContainer.innerHTML = fullCommunity.map(c => renderCard(c, c === null)).join('');

    // Jetons Disponibles
    if (room.availableTokens.length === 0) {
      availableTokensList.innerHTML = '<span class="text-xs text-stone-500 italic">Tous les jetons sont attribués</span>';
    } else {
      availableTokensList.innerHTML = room.availableTokens.map(t => renderToken(t, `claimToken(${t})`)).join('');
    }

    // Mes Cartes & Mon Jeton
    const me = room.players.find(p => p.id === myId);
    if (me) {
      selfName.innerText = me.name;
      selfCardsContainer.innerHTML = me.hand.map(c => renderCard(c)).join('');

      if (me.token !== null) {
        selfTokenSlot.innerHTML = renderToken(me.token, `claimToken(${me.token})`);
      } else {
        selfTokenSlot.innerHTML = '<span class="text-stone-500 text-xs italic">Aucun</span>';
      }

      if (me.ready) {
        btnToggleReady.innerText = 'POSITION VALIDÉE (ATTENTE...)';
        btnToggleReady.className = 'px-6 py-3.5 rounded-xl font-gang font-black text-sm transition tracking-wider border shadow-lg bg-emerald-600 text-emerald-950 border-emerald-400';
      } else {
        btnToggleReady.innerText = 'VALIDER MA POSITION';
        btnToggleReady.className = 'px-6 py-3.5 rounded-xl font-gang font-black text-sm transition tracking-wider border shadow-lg bg-amber-600 text-stone-950 border-amber-400 hover:bg-amber-500';
      }
    }

    // Autres Joueurs
    const others = room.players.filter(p => p.id !== myId);
    otherPlayersContainer.innerHTML = others.map(p => `
      <div class="flex flex-col items-center bg-black/40 border ${p.ready ? 'border-emerald-500/80' : 'border-white/10'} p-3 rounded-2xl min-w-[130px] transition-all">
        <div class="flex items-center gap-1.5 mb-1.5">
          <span class="w-2.5 h-2.5 rounded-full ${p.ready ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}"></span>
          <span class="text-xs font-bold text-stone-200">${p.name}</span>
        </div>
        
        <div class="flex gap-1.5 mb-2">
          ${p.hand.map(c => renderCard(c, room.phase !== 'SHOWDOWN' && c === null)).join('')}
        </div>

        <div class="flex items-center gap-2">
          <div class="rank-token-slot flex items-center justify-center transform scale-90">
            ${p.token !== null ? renderToken(p.token) : '<span class="text-[10px] text-stone-500 italic">?</span>'}
          </div>
          ${(me && me.token !== null && p.token !== null && room.phase !== 'SHOWDOWN') ? `
            <button onclick="proposeSwapWith('${p.id}')" title="Proposer un échange" class="text-xs bg-amber-900/60 hover:bg-amber-800 text-amber-300 p-1.5 rounded border border-amber-700/60">
              ⇄
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Gestion des requêtes de SWAP reçues
    if (room.swapRequests && room.swapRequests.length > 0) {
      const incoming = room.swapRequests.find(s => s.targetId === myId);
      if (incoming) {
        currentSwapOffer = incoming;
        swapModalText.innerHTML = `<strong>${incoming.fromName}</strong> souhaite échanger son jeton <strong>[${incoming.fromToken}]</strong> contre ton jeton <strong>[${incoming.targetToken}]</strong>.`;
        swapModal.classList.remove('hidden');
      } else {
        swapModal.classList.add('hidden');
      }
    } else {
      swapModal.classList.add('hidden');
    }

    // MODALE SHOWDOWN (RÉVÉLATION FINALE)
    if (room.phase === 'SHOWDOWN' && room.showdownResults) {
      showdownModal.classList.remove('hidden');
      if (room.vaultSuccess) {
        showdownIcon.innerText = '💎';
        showdownTitle.innerText = 'CASSE RÉUSSI ! COFFRE OUVERT';
        showdownTitle.className = 'text-3xl font-gang font-black text-emerald-400 mb-2';
        showdownSubtitle.innerText = 'Aucune inversion ! Le gang a parfaitement évalué la hiérarchie des mains.';
      } else {
        showdownIcon.innerText = '🚨';
        showdownTitle.innerText = 'ALARME DÉCLENCHÉE !';
        showdownTitle.className = 'text-3xl font-gang font-black text-red-500 mb-2';
        showdownSubtitle.innerText = `L'estimation n'était pas fidèle à la réalité des combinaisons (${room.alarms} anomalie(s)).`;
      }

      showdownList.innerHTML = room.showdownResults.map(res => `
        <div class="flex items-center justify-between p-3 bg-stone-950/80 rounded-xl border border-stone-800">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-full bg-amber-950 border border-amber-600 text-amber-300 font-bold flex items-center justify-center text-xs">
              #${res.rank}
            </span>
            <div>
              <p class="font-bold text-stone-200 text-sm">${res.playerName}</p>
              <p class="text-xs text-amber-400/90 font-medium">${res.combination}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex gap-1 transform scale-75 origin-right">
              ${res.hand.map(c => renderCard(c)).join('')}
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[10px] text-stone-400 uppercase font-bold">Jeton</span>
              <span class="rank-token transform scale-75">${res.chosenToken}</span>
            </div>
          </div>
        </div>
      `).join('');

      if (myId === room.hostId) {
        showdownHostBtn.classList.remove('hidden');
        showdownGuestMsg.classList.add('hidden');
      } else {
        showdownHostBtn.classList.add('hidden');
        showdownGuestMsg.classList.remove('hidden');
      }
    } else {
      showdownModal.classList.add('hidden');
    }
  }
});
