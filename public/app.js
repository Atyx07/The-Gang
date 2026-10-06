const socket = io();

let currentRoom = null;
let myId = null;

window.toggleDrawer = function(id) {
  const d = document.getElementById(id);
  if (id === 'drawer-rules') d.classList.toggle('-translate-x-full');
  if (id === 'drawer-poker') d.classList.toggle('translate-x-full');
};

// Sélecteurs
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

const vaultCountBadge = document.getElementById('vault-count-badge');
const alarmCountBadge = document.getElementById('alarm-count-badge');
const vaultCardsRow = document.getElementById('vault-cards-row');
const alarmCardsRow = document.getElementById('alarm-cards-row');
const braquageNumber = document.getElementById('braquage-number');
const activeSpecialCardContainer = document.getElementById('active-special-card-container');

const phaseTitle = document.getElementById('phase-title');
const phaseBadge = document.getElementById('phase-badge');
const communityCardsContainer = document.getElementById('community-cards');
const tokensLabel = document.getElementById('tokens-label');
const availableTokensList = document.getElementById('available-tokens-list');
const otherPlayersContainer = document.getElementById('other-players-container');

const selfCardsContainer = document.getElementById('self-cards');
const selfName = document.getElementById('self-name');
const selfHandName = document.getElementById('self-hand-name');
const selfH1 = document.getElementById('self-h-1');
const selfH2 = document.getElementById('self-h-2');
const selfH3 = document.getElementById('self-h-3');
const selfH4 = document.getElementById('self-h-4');
const selfTokenSlot = document.getElementById('self-token-slot');
const btnToggleReady = document.getElementById('btn-toggle-ready');

const swapModal = document.getElementById('swap-modal');
const swapModalText = document.getElementById('swap-modal-text');
const btnAcceptSwap = document.getElementById('btn-accept-swap');
const btnRefuseSwap = document.getElementById('btn-refuse-swap');
let currentSwapOffer = null;

const showdownModal = document.getElementById('showdown-modal');
const showdownIcon = document.getElementById('showdown-icon');
const showdownTitle = document.getElementById('showdown-title');
const showdownSubtitle = document.getElementById('showdown-subtitle');
const showdownCommunityCards = document.getElementById('showdown-community-cards');
const showdownAnomalyBox = document.getElementById('showdown-anomaly-box');
const showdownAnomalyDesc = document.getElementById('showdown-anomaly-desc');
const showdownRevealedList = document.getElementById('showdown-revealed-list');
const showdownVerdictBox = document.getElementById('showdown-verdict-box');
const verdictIcon = document.getElementById('verdict-icon');
const verdictTitle = document.getElementById('verdict-title');
const verdictDesc = document.getElementById('verdict-desc');
const verdictNextCard = document.getElementById('verdict-next-card');
const showdownHostBtn = document.getElementById('showdown-host-btn');
const showdownGuestMsg = document.getElementById('showdown-guest-msg');
const btnNextBraquage = document.getElementById('btn-next-braquage');

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').innerText = msg;
  toast.classList.remove('translate-y-[-100px]', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-[-100px]', 'opacity-0'), 3500);
}

function copyInviteLink() {
  const url = `${window.location.origin}?room=${currentRoom.code}`;
  navigator.clipboard.writeText(url).then(() => showToast('Lien de la planque copié !'));
}

// Couleurs officielles des jetons
function getTokenColorClass(phase) {
  switch (phase) {
    case 'PRE_FLOP': return 'token-white';
    case 'FLOP': return 'token-yellow';
    case 'TURN': return 'token-orange';
    case 'RIVER': return 'token-red';
    default: return 'token-red';
  }
}

function getTokenStars(count) {
  return '★'.repeat(count);
}

// Rendu des Cartes Cibles Officielles (Coffres-forts et Alarmes)
function renderTargetCards(vaultTurned, alarmTurned) {
  // 3 cartes coffre
  vaultCardsRow.innerHTML = [0, 1, 2].map(i => {
    const isOpen = i < vaultTurned;
    return `
      <div class="target-card ${isOpen ? 'vault-open' : 'vault-closed'}" title="${isOpen ? 'Coffre Ouvert' : 'Coffre Verrouillé'}">
        <svg viewBox="0 0 80 80" class="w-12 h-12">
          ${isOpen ? `
            <!-- Coffre ouvert avec lingots dorés -->
            <circle cx="40" cy="40" r="34" fill="#ca8a04" stroke="#fef08a" stroke-width="3"/>
            <polygon points="25,50 35,35 45,50" fill="#fde047"/>
            <polygon points="35,50 45,35 55,50" fill="#fef08a"/>
            <rect x="25" y="50" width="30" height="10" fill="#a16207" rx="2"/>
            <text x="40" y="32" font-size="16" text-anchor="middle" fill="#713f12" font-weight="bold">✦</text>
          ` : `
            <!-- Volant métallique fermé -->
            <circle cx="40" cy="40" r="32" fill="#27272a" stroke="#71717a" stroke-width="4"/>
            <circle cx="40" cy="40" r="14" fill="#18181b" stroke="#a1a1aa" stroke-width="3"/>
            <line x1="40" y1="12" x2="40" y2="68" stroke="#a1a1aa" stroke-width="3"/>
            <line x1="12" y1="40" x2="68" y2="40" stroke="#a1a1aa" stroke-width="3"/>
          `}
        </svg>
        <span class="text-[9px] font-bold uppercase mt-1 ${isOpen ? 'text-amber-950 font-black' : 'text-stone-400'}">
          ${isOpen ? 'OUVERT' : 'FERMÉ'}
        </span>
      </div>
    `;
  }).join('');

  // 3 cartes alarme
  alarmCardsRow.innerHTML = [0, 1, 2].map(i => {
    const isTriggered = i < alarmTurned;
    return `
      <div class="target-card ${isTriggered ? 'alarm-active' : 'alarm-inactive'}" title="${isTriggered ? 'Alarme Déclenchée' : 'Alarme Éteinte'}">
        <svg viewBox="0 0 80 80" class="w-12 h-12">
          ${isTriggered ? `
            <!-- Sirène rouge clignotante -->
            <circle cx="40" cy="40" r="28" fill="#ef4444" stroke="#fca5a5" stroke-width="3"/>
            <path d="M40 18 L40 6 M24 24 L14 14 M56 24 L66 14" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
            <rect x="30" y="46" width="20" height="14" fill="#7f1d1d" rx="2"/>
          ` : `
            <!-- Bouton gris éteint -->
            <circle cx="40" cy="40" r="24" fill="#3f3f46" stroke="#71717a" stroke-width="3"/>
            <rect x="28" y="32" width="24" height="16" rx="4" fill="#18181b"/>
          `}
        </svg>
        <span class="text-[9px] font-bold uppercase mt-1 ${isTriggered ? 'text-white font-black' : 'text-stone-500'}">
          ${isTriggered ? 'ALARME' : 'CALME'}
        </span>
      </div>
    `;
  }).join('');
}

// Dos de carte poker officiel (Roue du coffre)
function renderVaultBack() {
  return `
    <div class="poker-card flex items-center justify-center p-0 overflow-hidden bg-stone-900 border-2 border-stone-600">
      <svg viewBox="0 0 100 140" class="w-full h-full">
        <rect x="2" y="2" width="96" height="136" rx="6" fill="#262626" stroke="#525252" stroke-width="3"/>
        <circle cx="10" cy="10" r="3" fill="#a3a3a3"/>
        <circle cx="90" cy="10" r="3" fill="#a3a3a3"/>
        <circle cx="10" cy="130" r="3" fill="#a3a3a3"/>
        <circle cx="90" cy="130" r="3" fill="#a3a3a3"/>
        <circle cx="50" cy="70" r="34" fill="#1a1a1a" stroke="#737373" stroke-width="4"/>
        <circle cx="50" cy="70" r="24" fill="#262626" stroke="#ca8a04" stroke-width="2" stroke-dasharray="4,3"/>
        <circle cx="50" cy="70" r="12" fill="#141414" stroke="#d4d4d4" stroke-width="3"/>
        <line x1="50" y1="46" x2="50" y2="94" stroke="#ca8a04" stroke-width="3"/>
        <line x1="26" y1="70" x2="74" y2="70" stroke="#ca8a04" stroke-width="3"/>
      </svg>
    </div>
  `;
}

function renderCard(card, hidden = false) {
  if (hidden || !card) return renderVaultBack();
  const isRed = card.suit === '♥' || card.suit === '♦';
  const colorClass = isRed ? 'suit-red' : 'suit-black';
  return `
    <div class="poker-card border border-stone-300 ${colorClass}">
      <div class="text-left text-xs sm:text-sm font-extrabold leading-none">${card.value}</div>
      <div class="text-center text-2xl sm:text-3xl my-auto">${card.suit}</div>
      <div class="text-right text-xs sm:text-sm font-extrabold leading-none">${card.value}</div>
    </div>
  `;
}

function renderToken(tokenVal, phase, onClick = '') {
  const colorClass = getTokenColorClass(phase);
  return `
    <div class="token-chip ${colorClass}" ${onClick ? `onclick="${onClick}"` : ''} title="${tokenVal} étoile(s)">
      <span class="text-base leading-none">${tokenVal}</span>
      <span class="text-[8px] leading-none opacity-80">${getTokenStars(tokenVal)}</span>
    </div>
  `;
}

// Boutons
btnCreate.addEventListener('click', () => {
  socket.emit('create_room', { playerName: inputName.value.trim() });
});

btnJoin.addEventListener('click', () => {
  const code = inputCode.value.trim();
  if (!code) return showToast('Veuillez entrer un code');
  socket.emit('join_room', { roomCode: code, playerName: inputName.value.trim() });
});

btnStartGame.addEventListener('click', () => socket.emit('start_game'));
btnToggleReady.addEventListener('click', () => socket.emit('toggle_ready'));
btnNextBraquage.addEventListener('click', () => socket.emit('next_braquage'));

window.claimToken = function(val) {
  socket.emit('select_token', { tokenValue: val });
};

window.proposeSwapWith = function(targetId) {
  socket.emit('request_swap', { targetPlayerId: targetId });
  showToast('Demande d\'échange envoyée');
};

btnAcceptSwap.addEventListener('click', () => {
  if (currentSwapOffer) {
    socket.emit('respond_swap', { fromId: currentSwapOffer.fromId, accept: true });
    swapModal.classList.add('hidden');
  }
});

btnRefuseSwap.addEventListener('click', () => {
  if (currentSwapOffer) {
    socket.emit('respond_swap', { fromId: currentSwapOffer.fromId, accept: false });
    swapModal.classList.add('hidden');
  }
});

socket.on('connect', () => { myId = socket.id; });
socket.on('error_message', (msg) => showToast(msg));

// ANIMATION DU SHOWDOWN OFFICIEL (Dans l'ordre croissant des jetons rouges)
let showdownTimer = null;

function runOfficialShowdown(showdownData, communityCards, isHost) {
  if (showdownTimer) clearInterval(showdownTimer);

  showdownModal.classList.remove('hidden');
  showdownRevealedList.innerHTML = '';
  showdownAnomalyBox.classList.add('hidden');
  showdownVerdictBox.classList.add('hidden');
  showdownHostBtn.classList.add('hidden');
  showdownGuestMsg.classList.add('hidden');

  showdownCommunityCards.innerHTML = communityCards.map(c => renderCard(c)).join('');

  const list = showdownData.revealOrder; // Ordonné du jeton 1 au jeton N
  let step = 0;

  showdownTimer = setInterval(() => {
    if (step < list.length) {
      const p = list[step];

      // Vérifier si cette main est plus faible qu'une précédente
      for (let prevIdx = 0; prevIdx < step; prevIdx++) {
        const prev = list[prevIdx];
        if (p.theoreticalRank < prev.theoreticalRank) {
          showdownAnomalyBox.classList.remove('hidden');
          showdownAnomalyDesc.innerText = `Anomalie : ${p.playerName} (Jeton ${p.finalToken}) a une main plus faible que ${prev.playerName} (Jeton ${prev.finalToken}) !`;
        }
      }

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2.5 bg-stone-900 border border-stone-800 rounded-xl';
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="token-chip token-red transform scale-75">
            <span class="text-sm">${p.finalToken}</span>
            <span class="text-[7px]">${getTokenStars(p.finalToken)}</span>
          </div>
          <div>
            <p class="font-bold text-stone-200 text-xs">${p.playerName}</p>
            <p class="text-[11px] text-amber-400 font-medium">${p.combination}</p>
          </div>
        </div>
        <div class="flex gap-1 transform scale-75 origin-right">
          ${p.hand.map(c => renderCard(c)).join('')}
        </div>
      `;
      showdownRevealedList.appendChild(row);
      step++;
    } else {
      clearInterval(showdownTimer);

      // VERDICT OFFICIEL
      showdownVerdictBox.classList.remove('hidden');

      if (!showdownData.hasError) {
        showdownIcon.innerText = '💎';
        showdownVerdictBox.className = 'p-4 rounded-2xl border-2 bg-amber-950/70 border-amber-500 text-amber-200 mb-4 text-left';
        verdictIcon.innerText = '🏆';
        verdictTitle.innerText = 'BRAQUAGE RÉUSSI ! COFFRE DÉVERROUILLÉ';
        verdictDesc.innerText = `L'équipe s'est coordonnée sans faute. Une carte Coffre-fort est retournée face dorée (${showdownData.vaultCardsTurned}/3) !`;
      } else {
        showdownIcon.innerText = '🚨';
        showdownVerdictBox.className = 'p-4 rounded-2xl border-2 bg-red-950/70 border-red-500 text-red-200 mb-4 text-left';
        verdictIcon.innerText = '🚨';
        verdictTitle.innerText = 'ALARME DÉCLENCHÉE ! BRAQUAGE ÉCHOUÉ';
        verdictDesc.innerText = `Erreur dans le classement des combinaisons. Une carte Alarme est activée (${showdownData.alarmCardsTurned}/3) !`;
      }

      // Prochaine carte Bonus ou Malus
      if (showdownData.appliedCard) {
        const isMalus = showdownData.appliedCard.type === 'malus';
        verdictNextCard.className = `mt-3 p-3 rounded-xl border flex items-center gap-3 ${isMalus ? 'bg-orange-950/80 border-orange-600 text-orange-200' : 'bg-emerald-950/80 border-emerald-600 text-emerald-200'}`;
        verdictNextCard.innerHTML = `
          <span class="text-2xl">${isMalus ? '⚠️' : '🎁'}</span>
          <div>
            <p class="font-bold text-xs uppercase font-gang">${isMalus ? 'Malus (Effraction)' : 'Bonus (Complice)'} : ${showdownData.appliedCard.title}</p>
            <p class="text-[11px] opacity-90">${showdownData.appliedCard.desc}</p>
          </div>
        `;
      } else {
        verdictNextCard.innerHTML = '';
      }

      // Fin de partie
      if (showdownData.gameOverStatus === 'VICTORY') {
        verdictTitle.innerText = 'VICTOIRE TOTALE DU GANG ! (3 COFFRES OUVERTS)';
        btnNextBraquage.innerText = 'COMMENCER UNE NOUVELLE PARTIE';
      } else if (showdownData.gameOverStatus === 'DEFEAT') {
        verdictTitle.innerText = 'DÉFAITE DU GANG ! (3 ALARMES DÉCLENCHÉES)';
        btnNextBraquage.innerText = 'RECOMMENCER UNE PARTIE';
      } else {
        btnNextBraquage.innerText = 'PASSER AU BRAQUAGE SUIVANT';
      }

      if (isHost) showdownHostBtn.classList.remove('hidden');
      else showdownGuestMsg.classList.remove('hidden');
    }
  }, 1100);
}

socket.on('room_update', (room) => {
  currentRoom = room;

  roomCodeTag.classList.remove('hidden');
  currentRoomCode.innerText = room.code;

  if (room.phase === 'LOBBY') {
    screenAuth.classList.add('hidden');
    screenGame.classList.add('hidden');
    showdownModal.classList.add('hidden');
    screenLobby.classList.remove('hidden');

    lobbyCodeDisplay.innerText = room.code;
    lobbyCount.innerText = room.players.length;
    lobbyPlayersList.innerHTML = room.players.map(p => `
      <li class="flex items-center justify-between p-2.5 bg-stone-950/70 rounded-lg border border-stone-800">
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full ${p.id === room.hostId ? 'bg-amber-400' : 'bg-emerald-500'}"></span>
          ${p.name} ${p.id === room.hostId ? '<span class="text-xs text-amber-500 font-bold ml-1">(Chef)</span>' : ''}
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
    // ÉCRAN DE JEU
    screenAuth.classList.add('hidden');
    screenLobby.classList.add('hidden');
    screenGame.classList.remove('hidden');

    // Mise à jour des cartes Coffre-fort et Alarme
    renderTargetCards(room.vaultCardsTurned, room.alarmCardsTurned);
    vaultCountBadge.innerText = `${room.vaultCardsTurned} / 3`;
    alarmCountBadge.innerText = `${room.alarmCardsTurned} / 3`;
    braquageNumber.innerText = `#${room.roundNumber}`;

    // Carte spéciale active
    if (room.activeCard) {
      activeSpecialCardContainer.classList.remove('hidden');
      const isMalus = room.activeCard.type === 'malus';
      activeSpecialCardContainer.innerHTML = `
        <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1.5 ${isMalus ? 'bg-orange-950/80 text-orange-300 border-orange-600' : 'bg-emerald-950/80 text-emerald-300 border-emerald-600'}">
          ${isMalus ? '⚠️ Malus :' : '🎁 Bonus :'} ${room.activeCard.title}
        </span>
      `;
    } else {
      activeSpecialCardContainer.classList.add('hidden');
    }

    // Phase et badge
    phaseTitle.innerText = `TOUR ${room.phase === 'PRE_FLOP' ? '1 [PRÉ-FLOP]' : room.phase === 'FLOP' ? '2 [FLOP]' : room.phase === 'TURN' ? '3 [TURN]' : '4 [RIVIÈRE]'}`;
    phaseBadge.innerText = room.phase;
    phaseBadge.className = `px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${getTokenColorClass(room.phase)}`;

    // Cartes communes
    const fullComm = [...room.communityCards];
    while (fullComm.length < 5) fullComm.push(null);
    communityCardsContainer.innerHTML = fullComm.map(c => renderCard(c, c === null)).join('');

    // Jetons du tour en cours
    tokensLabel.innerText = `Jetons disponibles pour ce tour (${room.phase})`;
    if (room.availableTokens.length === 0) {
      availableTokensList.innerHTML = '<span class="text-xs text-stone-400 italic">Tous les jetons ont été pris</span>';
    } else {
      availableTokensList.innerHTML = room.availableTokens.map(t => 
        renderToken(t, room.phase, `claimToken(${t})`)
      ).join('');
    }

    // Ma main
    const me = room.players.find(p => p.id === myId);
    if (me) {
      selfName.innerText = me.name;
      selfCardsContainer.innerHTML = me.hand.map(c => renderCard(c)).join('');
      selfHandName.innerText = room.myHandName || 'Calcul...';

      selfH1.innerText = me.tokenHistory.PRE_FLOP !== null ? me.tokenHistory.PRE_FLOP : '-';
      selfH2.innerText = me.tokenHistory.FLOP !== null ? me.tokenHistory.FLOP : '-';
      selfH3.innerText = me.tokenHistory.TURN !== null ? me.tokenHistory.TURN : '-';
      selfH4.innerText = me.tokenHistory.RIVER !== null ? me.tokenHistory.RIVER : '-';

      if (me.token !== null) {
        selfTokenSlot.innerHTML = renderToken(me.token, room.phase, `claimToken(${me.token})`);
      } else {
        selfTokenSlot.innerHTML = '<span class="text-stone-500 text-xs italic">-</span>';
      }

      if (me.ready) {
        btnToggleReady.innerText = 'POSITION VALIDÉE ✓';
        btnToggleReady.className = 'px-5 py-3 rounded-xl font-gang font-black text-xs sm:text-sm tracking-wider border shadow-lg bg-emerald-600 text-emerald-950 border-emerald-400';
      } else {
        btnToggleReady.innerText = 'VALIDER MA POSITION';
        btnToggleReady.className = 'px-5 py-3 rounded-xl font-gang font-black text-xs sm:text-sm tracking-wider border shadow-lg bg-amber-600 text-stone-950 border-amber-400 hover:bg-amber-500';
      }
    }

    // Autres joueurs
    const others = room.players.filter(p => p.id !== myId);
    otherPlayersContainer.innerHTML = others.map(p => `
      <div class="flex flex-col items-center bg-black/55 border ${p.ready ? 'border-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-white/10'} p-2.5 rounded-2xl min-w-[135px]">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="w-2.5 h-2.5 rounded-full ${p.ready ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}"></span>
          <span class="text-xs font-bold text-stone-200">${p.name}</span>
        </div>
        
        <div class="flex gap-1.5 mb-2">
          ${p.hand.map(c => renderCard(c, room.phase !== 'SHOWDOWN' && c === null)).join('')}
        </div>

        <div class="flex items-center gap-1 text-[9px] text-stone-400 bg-black/40 px-2 py-0.5 rounded-md mb-1.5">
          <span class="text-stone-300 font-bold">${p.tokenHistory.PRE_FLOP || '-'}</span>
          <span class="text-stone-600">›</span>
          <span class="text-yellow-400 font-bold">${p.tokenHistory.FLOP || '-'}</span>
          <span class="text-stone-600">›</span>
          <span class="text-orange-400 font-bold">${p.tokenHistory.TURN || '-'}</span>
          <span class="text-stone-600">›</span>
          <span class="text-red-400 font-bold">${p.tokenHistory.RIVER || '-'}</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="token-slot flex items-center justify-center transform scale-80">
            ${p.token !== null ? renderToken(p.token, room.phase) : '<span class="text-[10px] text-stone-500 italic">?</span>'}
          </div>
          ${(me && me.token !== null && p.token !== null && room.phase !== 'SHOWDOWN') ? `
            <button onclick="proposeSwapWith('${p.id}')" title="Proposer un échange" class="text-xs bg-amber-900/60 hover:bg-amber-800 text-amber-300 p-1.5 rounded border border-amber-700/60">
              ⇄
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Demande de Swap
    if (room.swapRequests && room.swapRequests.length > 0) {
      const inc = room.swapRequests.find(s => s.targetId === myId);
      if (inc) {
        currentSwapOffer = inc;
        swapModalText.innerHTML = `<strong>${inc.fromName}</strong> souhaite échanger son jeton <strong>[${inc.fromToken}]</strong> contre le tien <strong>[${inc.targetToken}]</strong>.`;
        swapModal.classList.remove('hidden');
      } else {
        swapModal.classList.add('hidden');
      }
    } else {
      swapModal.classList.add('hidden');
    }

    // Showdown
    if (room.phase === 'SHOWDOWN' && room.showdownData) {
      runOfficialShowdown(room.showdownData, room.communityCards, myId === room.hostId);
    } else {
      showdownModal.classList.add('hidden');
    }
  }
});
