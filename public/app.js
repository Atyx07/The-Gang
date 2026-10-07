const socket = io();

let currentRoom = null;
let myId = null;
let selectedGameMode = 'CLASSIC';

const MODE_DESCRIPTIONS = {
  CLASSIC: 'Partie standard officielle. Pas de cartes spéciales au 1er braquage. 3 coffres pour gagner, 3 alarmes pour perdre.',
  PRO: '1 carte Effraction permanente dès le 1er braquage et pour toute la partie ! 2 cartes actives par braquage à partir du braquage 2.',
  GANGSTER: 'Difficulté maximale : seulement 2 alarmes autorisées ! Aucune carte Complice (Bonus), 2 cartes Effraction (Malus) actives en continu.'
};

window.selectGameMode = function(mode) {
  selectedGameMode = mode;
  document.querySelectorAll('.mode-select-btn').forEach(b => {
    b.className = 'mode-select-btn py-2 text-xs font-bold rounded-lg border border-stone-700 bg-stone-900 text-stone-400';
  });
  const activeBtn = document.getElementById(`btn-mode-${mode.toLowerCase()}`);
  if (activeBtn) {
    activeBtn.className = 'mode-select-btn py-2 text-xs font-bold rounded-lg border border-amber-500 bg-amber-950 text-amber-300';
  }
  document.getElementById('mode-desc-box').innerText = MODE_DESCRIPTIONS[mode];
};
window.selectGameMode('CLASSIC');

window.toggleDrawer = function(id) {
  const d = document.getElementById(id);
  if (id === 'drawer-rules') d.classList.toggle('-translate-x-full');
  if (id === 'drawer-poker') d.classList.toggle('translate-x-full');
};

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

const badgeModeDisplay = document.getElementById('badge-mode-display');
const roomCodeTag = document.getElementById('room-code-tag');
const currentRoomCode = document.getElementById('current-room-code');

const vaultCountBadge = document.getElementById('vault-count-badge');
const alarmCountBadge = document.getElementById('alarm-count-badge');
const vaultCardsRow = document.getElementById('vault-cards-row');
const alarmCardsRow = document.getElementById('alarm-cards-row');
const braquageNumber = document.getElementById('braquage-number');
const activeSpecialCardContainer = document.getElementById('active-special-card-container');
const generalNotificationBanner = document.getElementById('general-notification-banner');

const bonusActionPanel = document.getElementById('bonus-action-panel');
const bonusPanelTitle = document.getElementById('bonus-panel-title');
const bonusPanelDesc = document.getElementById('bonus-panel-desc');
const bonusPanelInteractiveActions = document.getElementById('bonus-panel-interactive-actions');

const phaseTitle = document.getElementById('phase-title');
const phaseBadge = document.getElementById('phase-badge');
const communityCardsContainer = document.getElementById('community-cards');
const tokensLabel = document.getElementById('tokens-label');
const availableTokensList = document.getElementById('available-tokens-list');
const otherPlayersContainer = document.getElementById('other-players-container');

const selfCardsContainer = document.getElementById('self-cards');
const selfName = document.getElementById('self-name');
const selfGrosBrasBadge = document.getElementById('self-grosbras-badge');
const selfHandName = document.getElementById('self-hand-name');
const selfSecretDisplay = document.getElementById('self-secret-display');
const selfHistoryContainer = document.getElementById('self-history-container');
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
const showdownSpecialChallengeBox = document.getElementById('showdown-special-challenge-box');
const challengeTitle = document.getElementById('challenge-title');
const challengeDesc = document.getElementById('challenge-desc');
const challengeActions = document.getElementById('challenge-actions');
const showdownAnomalyBox = document.getElementById('showdown-anomaly-box');
const showdownAnomalyDesc = document.getElementById('showdown-anomaly-desc');
const showdownRevealedList = document.getElementById('showdown-revealed-list');
const showdownHostStepControls = document.getElementById('showdown-host-step-controls');
const btnHostRevealNext = document.getElementById('btn-host-reveal-next');
const showdownHostVerdictControls = document.getElementById('showdown-host-verdict-controls');
const btnHostApplyVerdict = document.getElementById('btn-host-apply-verdict');
const showdownGuestStepWaiting = document.getElementById('showdown-guest-step-waiting');
const showdownVerdictBox = document.getElementById('showdown-verdict-box');
const verdictIcon = document.getElementById('verdict-icon');
const verdictTitle = document.getElementById('verdict-title');
const verdictDesc = document.getElementById('verdict-desc');
const verdictNextCard = document.getElementById('verdict-next-card');
const showdownNextBraquageBtn = document.getElementById('showdown-next-braquage-btn');
const btnNextBraquage = document.getElementById('btn-next-braquage');

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').innerText = msg;
  toast.classList.remove('translate-y-[-100px]', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-[-100px]', 'opacity-0'), 3500);
}

function copyInviteLink() {
  const url = `${window.location.origin}?room=${currentRoom.code}`;
  navigator.clipboard.writeText(url).then(() => showToast('Lien copié dans le presse-papier !'));
}

function getTokenColorClass(phase, tokenVal) {
  // Capteurs de bruit (eff_2) : aux 3 1ers tours, le jeton 1 est sombre
  if (currentRoom && currentRoom.activeCard && currentRoom.activeCard.id === 'eff_2' && tokenVal === 1 && ['PRE_FLOP', 'FLOP', 'TURN'].includes(phase)) {
    return 'token-dark';
  }
  switch (phase) {
    case 'PRE_FLOP': return 'token-white';
    case 'FLOP': return 'token-yellow';
    case 'TURN': return 'token-orange';
    case 'RIVER': return 'token-red';
    default: return 'token-red';
  }
}

function renderTargetCards(vaultTurned, alarmTurned, maxAlarms) {
  vaultCardsRow.innerHTML = [0, 1, 2].map(i => {
    const isOpen = i < vaultTurned;
    return `
      <div class="target-card ${isOpen ? 'vault-open' : 'vault-closed'}" title="${isOpen ? 'Coffre Ouvert' : 'Coffre Verrouillé'}">
        <svg viewBox="0 0 80 80" class="w-10 h-10">
          ${isOpen ? `
            <circle cx="40" cy="40" r="34" fill="#ca8a04" stroke="#fef08a" stroke-width="3"/>
            <polygon points="25,50 35,35 45,50" fill="#fde047"/>
            <polygon points="35,50 45,35 55,50" fill="#fef08a"/>
            <rect x="25" y="50" width="30" height="10" fill="#a16207" rx="2"/>
            <text x="40" y="32" font-size="16" text-anchor="middle" fill="#713f12" font-weight="bold">✦</text>
          ` : `
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

  alarmCardsRow.innerHTML = Array.from({ length: maxAlarms }).map((_, i) => {
    const isTriggered = i < alarmTurned;
    return `
      <div class="target-card ${isTriggered ? 'alarm-active' : 'alarm-inactive'}" title="${isTriggered ? 'Alarme Déclenchée' : 'Alarme Éteinte'}">
        <svg viewBox="0 0 80 80" class="w-10 h-10">
          ${isTriggered ? `
            <circle cx="40" cy="40" r="28" fill="#ef4444" stroke="#fca5a5" stroke-width="3"/>
            <path d="M40 18 L40 6 M24 24 L14 14 M56 24 L66 14" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
            <rect x="30" y="46" width="20" height="14" fill="#7f1d1d" rx="2"/>
          ` : `
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
  if (card.isColorlessJack) {
    return `
      <div class="poker-card card-valet-colorless">
        <div class="text-left text-xs font-extrabold">J</div>
        <div class="text-center text-xl font-bold my-auto">VALET</div>
        <div class="text-right text-xs font-extrabold">J</div>
      </div>
    `;
  }
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
  const colorClass = getTokenColorClass(phase, tokenVal);
  return `
    <div class="token-chip ${colorClass}" ${onClick ? `onclick="${onClick}"` : ''}>
      <span class="text-base leading-none">${tokenVal}</span>
      <span class="text-[8px] leading-none opacity-80">${'★'.repeat(tokenVal)}</span>
    </div>
  `;
}

btnCreate.addEventListener('click', () => {
  socket.emit('create_room', { playerName: inputName.value.trim(), gameMode: selectedGameMode });
});

btnJoin.addEventListener('click', () => {
  const code = inputCode.value.trim();
  if (!code) return showToast('Veuillez entrer un code');
  socket.emit('join_room', { roomCode: code, playerName: inputName.value.trim() });
});

btnStartGame.addEventListener('click', () => socket.emit('start_game'));
btnToggleReady.addEventListener('click', () => socket.emit('toggle_ready'));

btnHostRevealNext.addEventListener('click', () => socket.emit('host_reveal_next'));
btnHostApplyVerdict.addEventListener('click', () => socket.emit('host_apply_verdict'));
btnNextBraquage.addEventListener('click', () => socket.emit('next_braquage'));

window.claimToken = function(val) {
  socket.emit('select_token', { tokenValue: val });
};

window.proposeSwapWith = function(targetId) {
  socket.emit('request_swap', { targetPlayerId: targetId });
  showToast('Proposition d\'échange envoyée !');
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

window.voteBonusActivation = function() {
  socket.emit('vote_bonus_activation');
  showToast('Vote d\'activation enregistré !');
};

window.voteRoleFor = function(targetId) {
  socket.emit('submit_role_vote', { targetPlayerId: targetId });
  showToast('Vote envoyé !');
};

window.discardHackeuseCard = function(idx) {
  socket.emit('hackeuse_discard_card', { cardIndex: idx });
};

window.discardValetCard = function(idx) {
  socket.emit('valet_discard_card', { cardIndex: idx });
};

window.triggerConductrice = function() {
  socket.emit('conductrice_announce');
};

window.sendInformateur = function(targetId) {
  socket.emit('informateur_send', { targetPlayerId: targetId, cardIndex: 0 });
};

window.cerveauAsk = function(targetId) {
  const rank = document.getElementById('select-cerveau-rank').value;
  socket.emit('cerveau_ask', { targetPlayerId: targetId, askedRank: rank });
};

window.chooseCoordinateurCard = function(idx) {
  socket.emit('coordinateur_choose_card', { cardIndex: idx });
};

window.validateArnaqueuse = function() {
  socket.emit('arnaqueuse_validate');
};

window.submitScanVote = function(rank) {
  socket.emit('submit_scan_vote', { guessedRank: rank });
  showToast('Vote de Scan rétinien envoyé !');
};

window.submitEmpreinteVote = function(combo) {
  socket.emit('submit_empreinte_vote', { guessedCombo: combo });
  showToast('Vote de combinaison envoyé !');
};

socket.on('connect', () => { myId = socket.id; });
socket.on('error_message', (msg) => showToast(msg));

socket.on('room_update', (room) => {
  currentRoom = room;

  badgeModeDisplay.innerText = room.gameMode;
  roomCodeTag.classList.remove('hidden');
  currentRoomCode.innerText = room.code;

  if (room.generalNotification) {
    generalNotificationBanner.classList.remove('hidden');
    generalNotificationBanner.innerText = room.generalNotification;
  } else {
    generalNotificationBanner.classList.add('hidden');
  }

  if (room.phase === 'LOBBY') {
    screenAuth.classList.add('hidden');
    screenGame.classList.add('hidden');
    showdownModal.classList.add('hidden');
    screenLobby.classList.remove('hidden');

    lobbyCodeDisplay.innerText = room.code;
    lobbyCount.innerText = room.players.length;
    lobbyPlayersList.innerHTML = room.players.map(p => `
      <li class="flex items-center justify-between p-2 bg-stone-950/70 rounded-lg border border-stone-800">
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full ${p.id === room.hostId ? 'bg-amber-400' : 'bg-emerald-500'}"></span>
          ${p.name} ${p.id === room.hostId ? '<span class="text-xs text-amber-500 font-bold ml-1">(Chef)</span>' : ''}
        </span>
        ${p.id === myId ? '<span class="text-[10px] bg-stone-800 px-2 py-0.5 rounded text-stone-400">Toi</span>' : ''}
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
    screenAuth.classList.add('hidden');
    screenLobby.classList.add('hidden');
    screenGame.classList.remove('hidden');

    renderTargetCards(room.vaultCardsTurned, room.alarmCardsTurned, room.maxAlarms);
    vaultCountBadge.innerText = `${room.vaultCardsTurned} / 3`;
    alarmCountBadge.innerText = `${room.alarmCardsTurned} / ${room.maxAlarms}`;
    braquageNumber.innerText = `#${room.roundNumber}`;

    // Carte Spéciale active
    if (room.activeCard) {
      activeSpecialCardContainer.classList.remove('hidden');
      const isMalus = room.activeCard.type === 'malus';
      const hasVoted = room.bonusActivationVotes.includes(myId);

      activeSpecialCardContainer.innerHTML = `
        <div class="p-2 rounded-xl border text-[11px] flex flex-col items-center gap-1.5 ${isMalus ? 'bg-orange-950/80 border-orange-600 text-orange-200' : 'bg-emerald-950/80 border-emerald-600 text-emerald-200'}">
          <div class="flex items-center gap-1.5 font-bold">
            <span>${isMalus ? '⚠️ Malus :' : '🎁 Bonus :'}</span>
            <span class="font-gang uppercase">${room.activeCard.title}</span>
          </div>
          <p class="text-[10px] opacity-90 text-center">${room.activeCard.desc}</p>
          
          ${!isMalus && !room.activeCard.isAuto && !room.bonusActivatedThisRound && room.phase !== 'SHOWDOWN' ? `
            <div class="mt-1 flex items-center gap-2">
              <button onclick="voteBonusActivation()" class="px-3 py-1 rounded-lg font-bold text-[10px] border transition ${hasVoted ? 'bg-emerald-700 text-white border-emerald-400' : 'bg-stone-800 text-stone-300 hover:bg-emerald-900 border-stone-600'}">
                ${hasVoted ? 'UTILISATION VOTÉE ✓' : 'UTILISER LE BONUS'}
              </button>
              <span class="text-[10px] font-mono text-stone-400">(${room.bonusActivationVotes.length}/${room.players.length})</span>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      activeSpecialCardContainer.classList.add('hidden');
    }

    // Gestion du panneau d'actions interactives
    const me = room.players.find(p => p.id === myId);

    if (room.phase === 'COORDINATEUR_PHASE' && me) {
      bonusActionPanel.classList.remove('hidden');
      bonusPanelTitle.innerText = 'COORDINATEUR : CHOISISSEZ UNE CARTE';
      bonusPanelDesc.innerText = 'Sélectionnez la carte de votre main que vous donnez à votre voisin de gauche :';
      bonusPanelInteractiveActions.innerHTML = me.coordinateurDone
        ? '<span class="text-emerald-300 font-bold">Carte choisie ! En attente des autres...</span>'
        : me.hand.map((c, i) => `
            <button onclick="chooseCoordinateurCard(${i})" class="px-2.5 py-1.5 bg-amber-700 hover:bg-amber-600 font-bold rounded-lg text-xs">
              Donner ${c.value} ${c.suit}
            </button>
          `).join('');
    } else if (room.phase === 'ARNAQUEUSE_PHASE' && me) {
      bonusActionPanel.classList.remove('hidden');
      bonusPanelTitle.innerText = 'ARNAQUEUSE : VALIDATION DES CARTES';
      bonusPanelDesc.innerText = 'Regardez vos 2 cartes actuelles puis validez pour les remélanger entre tous les joueurs.';
      bonusPanelInteractiveActions.innerHTML = me.arnaqueuseValidated
        ? '<span class="text-emerald-300 font-bold">Validé ! En attente des autres...</span>'
        : `<button onclick="validateArnaqueuse()" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-lg text-xs">J'ai mémorisé mes cartes, valider</button>`;
    } else if (room.bonusActionState) {
      bonusActionPanel.classList.remove('hidden');
      const st = room.bonusActionState;

      if (st.type === 'VOTE_ROLE') {
        bonusPanelTitle.innerText = `VOTE : ÉLECTION DE ${st.role.toUpperCase()}`;
        bonusPanelDesc.innerText = `Votez pour désigner quel gangster reçoit le rôle (${st.role}). Majorité l'emporte.`;
        const hasVoted = !!st.votes[myId];
        bonusPanelInteractiveActions.innerHTML = hasVoted
          ? '<span class="text-emerald-300 font-bold">Vote enregistré ! En attente...</span>'
          : room.players.map(p => `
              <button onclick="voteRoleFor('${p.id}')" class="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px]">${p.name}</button>
            `).join('');
      } else if (st.type === 'HACKEUSE_DISCARD' && me) {
        bonusPanelTitle.innerText = 'HACKEUSE : DÉFAUSSEZ 1 CARTE';
        if (st.hackerId === myId) {
          bonusPanelDesc.innerText = 'Vous avez pioché 1 carte. Choisissez laquelle défausser parmi vos 3 cartes :';
          bonusPanelInteractiveActions.innerHTML = me.hand.map((c, i) => `
            <button onclick="discardHackeuseCard(${i})" class="px-2.5 py-1 bg-red-900 hover:bg-red-800 text-white font-bold rounded-lg text-xs">Défausser ${c.value} ${c.suit}</button>
          `).join('');
        } else {
          bonusPanelDesc.innerText = 'La hackeuse choisit sa carte à défausser...';
          bonusPanelInteractiveActions.innerHTML = '';
        }
      } else if (st.type === 'VALET_DISCARD' && me) {
        bonusPanelTitle.innerText = 'VALET INCOLORE : CHOISISSEZ UNE CARTE À REMPLACER';
        if (st.valetPlayerId === myId) {
          bonusPanelDesc.innerText = 'Choisissez la carte personnelle à remplacer par le Valet incolore :';
          bonusPanelInteractiveActions.innerHTML = me.hand.map((c, i) => `
            <button onclick="discardValetCard(${i})" class="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-lg text-xs">Remplacer ${c.value} ${c.suit}</button>
          `).join('');
        } else {
          bonusPanelDesc.innerText = 'Le joueur désigné remplace sa carte par le Valet incolore...';
          bonusPanelInteractiveActions.innerHTML = '';
        }
      } else if (st.type === 'INFORMATEUR_CHOOSE_SHOW') {
        bonusPanelTitle.innerText = 'INFORMATEUR : MONTREZ 1 CARTE';
        bonusPanelDesc.innerText = 'Choisissez à qui vous montrez secrètement votre 1ère carte :';
        const others = room.players.filter(p => p.id !== myId);
        bonusPanelInteractiveActions.innerHTML = others.map(p => `
          <button onclick="sendInformateur('${p.id}')" class="px-2.5 py-1 bg-cyan-800 hover:bg-cyan-700 text-white font-bold rounded-lg text-[10px]">Montrer à ${p.name}</button>
        `).join('');
      } else if (st.type === 'CONDUCTRICE_READY') {
        bonusPanelTitle.innerText = 'CONDUCTRICE : ANNONCE DU TYPE DE MAIN';
        bonusPanelDesc.innerText = 'Cliquez pour annoncer publiquement votre type de main (ex: "J\'ai une paire").';
        bonusPanelInteractiveActions.innerHTML = `
          <button onclick="triggerConductrice()" class="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-lg text-xs">Annoncer ma main</button>
        `;
      } else if (st.type === 'CERVEAU_ASK') {
        bonusPanelTitle.innerText = 'CERVEAU DE LA BANDE : QUESTION PUBLIQUE';
        bonusPanelDesc.innerText = 'Choisissez à quel gangster vous posez la question et quel rang demander :';
        const others = room.players.filter(p => p.id !== myId);
        bonusPanelInteractiveActions.innerHTML = `
          <select id="select-cerveau-rank" class="bg-stone-900 border border-stone-700 text-xs text-amber-300 p-1 rounded">
            ${['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(v => `<option value="${v}">${v}</option>`).join('')}
          </select>
          ${others.map(p => `
            <button onclick="cerveauAsk('${p.id}')" class="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px]">Demander à ${p.name}</button>
          `).join('')}
        `;
      } else if (st.type === 'COMPLETED') {
        bonusPanelTitle.innerText = 'ACTION EFFECTUÉE';
        bonusPanelDesc.innerText = st.message;
        bonusPanelInteractiveActions.innerHTML = '<span class="text-emerald-400 font-bold">✓ Actif</span>';
      }
    } else {
      bonusActionPanel.classList.add('hidden');
    }

    // Phase et Cartes communes
    phaseTitle.innerText = `TOUR ${room.phase === 'PRE_FLOP' ? '1 [PRÉ-FLOP]' : room.phase === 'FLOP' ? '2 [FLOP]' : room.phase === 'TURN' ? '3 [TURN]' : '4 [RIVIÈRE]'}`;
    phaseBadge.innerText = room.phase;
    phaseBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${getTokenColorClass(room.phase, null)}`;

    const fullComm = [...room.communityCards];
    while (fullComm.length < 5) fullComm.push(null);
    communityCardsContainer.innerHTML = fullComm.map(c => renderCard(c, c === null)).join('');

    // Jetons disponibles
    tokensLabel.innerText = `Jetons disponibles (${room.phase})`;
    if (room.availableTokens.length === 0) {
      availableTokensList.innerHTML = '<span class="text-xs text-stone-400 italic">Tous les jetons ont été pris</span>';
    } else {
      availableTokensList.innerHTML = room.availableTokens.map(t => 
        renderToken(t, room.phase, `claimToken(${t})`)
      ).join('');
    }

    // Malus Panne d'électricité (eff_8) : masque l'historique
    const isPanneElectricite = (room.activeCard && room.activeCard.id === 'eff_8');
    if (isPanneElectricite) {
      selfHistoryContainer.classList.add('hidden');
    } else {
      selfHistoryContainer.classList.remove('hidden');
    }

    // Mon Joueur
    if (me) {
      selfName.innerText = me.name;
      selfCardsContainer.innerHTML = me.hand.map(c => renderCard(c)).join('');
      selfHandName.innerText = room.myHandName || 'Calcul...';

      if (me.hasGrosBras) selfGrosBrasBadge.classList.remove('hidden');
      else selfGrosBrasBadge.classList.add('hidden');

      if (me.privateSecret) {
        selfSecretDisplay.classList.remove('hidden');
        selfSecretDisplay.innerText = me.privateSecret;
      } else {
        selfSecretDisplay.classList.add('hidden');
      }

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
        btnToggleReady.className = 'px-4 py-2.5 rounded-xl font-gang font-black text-xs tracking-wider border shadow-lg bg-emerald-600 text-emerald-950 border-emerald-400';
      } else {
        btnToggleReady.innerText = 'VALIDER MA POSITION';
        btnToggleReady.className = 'px-4 py-2.5 rounded-xl font-gang font-black text-xs tracking-wider border shadow-lg bg-amber-600 text-stone-950 border-amber-400 hover:bg-amber-500';
      }
    }

    // Autres joueurs
    const others = room.players.filter(p => p.id !== myId);
    otherPlayersContainer.innerHTML = others.map(p => `
      <div class="flex flex-col items-center bg-black/60 border ${p.ready ? 'border-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'border-white/10'} p-2 rounded-2xl min-w-[130px]">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="w-2 h-2 rounded-full ${p.ready ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}"></span>
          <span class="text-xs font-bold text-stone-200">${p.name}</span>
          ${p.hasGrosBras ? '<span class="text-[9px] bg-emerald-900 text-emerald-300 px-1 rounded font-bold">💪</span>' : ''}
        </div>

        ${p.publicAnnouncement ? `
          <div class="text-[9px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/60 mb-1 max-w-[125px] truncate" title="${p.publicAnnouncement}">
            📢 ${p.publicAnnouncement}
          </div>
        ` : ''}
        
        <div class="flex gap-1 mb-1.5">
          ${p.hand.map(c => renderCard(c, c === null)).join('')}
        </div>

        ${!isPanneElectricite ? `
          <div class="flex items-center gap-1 text-[9px] text-stone-400 bg-black/40 px-2 py-0.5 rounded-md mb-1">
            <span class="text-stone-300 font-bold">${p.tokenHistory.PRE_FLOP || '-'}</span>
            <span class="text-stone-600">›</span>
            <span class="text-yellow-400 font-bold">${p.tokenHistory.FLOP || '-'}</span>
            <span class="text-stone-600">›</span>
            <span class="text-orange-400 font-bold">${p.tokenHistory.TURN || '-'}</span>
            <span class="text-stone-600">›</span>
            <span class="text-red-400 font-bold">${p.tokenHistory.RIVER || '-'}</span>
          </div>
        ` : ''}

        <div class="flex items-center gap-2">
          <div class="token-slot flex items-center justify-center transform scale-75">
            ${p.token !== null ? renderToken(p.token, room.phase) : '<span class="text-[10px] text-stone-500 italic">?</span>'}
          </div>
          ${(me && me.token !== null && p.token !== null && room.phase !== 'SHOWDOWN' && !(room.activeCard && room.activeCard.id === 'eff_6')) ? `
            <button onclick="proposeSwapWith('${p.id}')" title="Proposer un échange" class="text-xs bg-amber-900/60 hover:bg-amber-800 text-amber-300 p-1.5 rounded border border-amber-700/60">
              ⇄
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Modal demande d'échange reçue
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

    // SHOWDOWN
    if (room.phase === 'SHOWDOWN' && room.showdownData) {
      showdownModal.classList.remove('hidden');
      const sd = room.showdownData;
      const isHost = (myId === room.hostId);

      showdownCommunityCards.innerHTML = room.communityCards.map(c => renderCard(c)).join('');

      // Scan rétinien ou Lecteur d'empreintes avant révélation du 1er joueur
      if (sd.currentIndex === -1 && sd.requiresScanRetinien && !sd.scanPassed && !sd.hasError) {
        showdownSpecialChallengeBox.classList.remove('hidden');
        challengeTitle.innerText = 'SCAN RÉTINIEN ACTIF';
        const targetP = sd.revealOrder[0];
        challengeDesc.innerText = `Devinez le rang (2 à As) d'une des cartes de ${targetP.playerName} (jeton le plus fort) :`;
        if (myId === targetP.playerId) {
          challengeActions.innerHTML = '<span class="text-amber-400 italic">Vous ne pouvez pas participer au vote.</span>';
        } else {
          challengeActions.innerHTML = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(r => `
            <button onclick="submitScanVote('${r}')" class="px-2 py-1 bg-cyan-800 hover:bg-cyan-700 rounded text-xs font-bold">${r}</button>
          `).join('');
        }
      } else if (sd.currentIndex === -1 && sd.requiresLecteurEmpreintes && !sd.empreintePassed && !sd.hasError) {
        showdownSpecialChallengeBox.classList.remove('hidden');
        challengeTitle.innerText = 'LECTEUR D\'EMPREINTES DIGITALES ACTIF';
        const targetP = sd.revealOrder[0];
        challengeDesc.innerText = `Devinez la combinaison exacte de ${targetP.playerName} :`;
        if (myId === targetP.playerId) {
          challengeActions.innerHTML = '<span class="text-amber-400 italic">Vous ne pouvez pas participer au vote.</span>';
        } else {
          challengeActions.innerHTML = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush', 'Quinte flush royale'].map(c => `
            <button onclick="submitEmpreinteVote('${c}')" class="px-2 py-1 bg-cyan-800 hover:bg-cyan-700 rounded text-[10px] font-bold">${c}</button>
          `).join('');
        }
      } else {
        showdownSpecialChallengeBox.classList.add('hidden');
      }

      if (sd.currentAnomalyFound) {
        showdownAnomalyBox.classList.remove('hidden');
      } else {
        showdownAnomalyBox.classList.add('hidden');
      }

      showdownRevealedList.innerHTML = sd.revealedItems.map(p => `
        <div class="flex items-center justify-between p-2 bg-stone-900 border border-stone-800 rounded-xl">
          <div class="flex items-center gap-2.5">
            <div class="token-chip token-red transform scale-75">
              <span class="text-sm">${p.finalToken}</span>
              <span class="text-[7px]">${'★'.repeat(p.finalToken)}</span>
            </div>
            <div>
              <p class="font-bold text-stone-200 text-xs flex items-center gap-1">
                ${p.playerName}
                ${p.hasGrosBras ? '<span class="text-[9px] bg-emerald-900 text-emerald-300 px-1 rounded font-bold">💪 Gros Bras</span>' : ''}
              </p>
              <p class="text-[11px] text-amber-400 font-medium">${p.combination}</p>
            </div>
          </div>
          <div class="flex gap-1 transform scale-75 origin-right">
            ${p.hand.map(c => renderCard(c)).join('')}
          </div>
        </div>
      `).join('');

      const totalToReveal = sd.revealOrder.length;
      const currentRevCount = sd.revealedItems.length;

      if (isHost) {
        showdownGuestStepWaiting.classList.add('hidden');
        if (currentRevCount < totalToReveal) {
          showdownHostStepControls.classList.remove('hidden');
          showdownHostVerdictControls.classList.add('hidden');
          const nextP = sd.revealOrder[currentRevCount];
          btnHostRevealNext.innerText = `RÉVÉLER ${nextP.playerName.toUpperCase()} (JETON ${nextP.finalToken} ★) ➔`;
        } else if (!sd.verdictApplied) {
          showdownHostStepControls.classList.add('hidden');
          showdownHostVerdictControls.classList.remove('hidden');
        } else {
          showdownHostStepControls.classList.add('hidden');
          showdownHostVerdictControls.classList.add('hidden');
        }
      } else {
        showdownHostStepControls.classList.add('hidden');
        showdownHostVerdictControls.classList.add('hidden');
        if (!sd.verdictApplied) {
          showdownGuestStepWaiting.classList.remove('hidden');
        } else {
          showdownGuestStepWaiting.classList.add('hidden');
        }
      }

      if (sd.verdictApplied) {
        showdownVerdictBox.classList.remove('hidden');

        if (!sd.hasError) {
          showdownIcon.innerText = '💎';
          showdownVerdictBox.className = 'p-3.5 rounded-2xl border-2 bg-amber-950/80 border-amber-500 text-amber-200 mb-3 text-left';
          verdictIcon.innerText = '🏆';
          verdictTitle.innerText = 'BRAQUAGE RÉUSSI ! COFFRE DÉVERROUILLÉ';
          verdictDesc.innerText = `Coordination parfaite. Une carte Coffre-fort est retournée face dorée (${room.vaultCardsTurned}/3) !`;
        } else {
          showdownIcon.innerText = '🚨';
          showdownVerdictBox.className = 'p-3.5 rounded-2xl border-2 bg-red-950/80 border-red-500 text-red-200 mb-3 text-left';
          verdictIcon.innerText = '🚨';
          verdictTitle.innerText = 'ALARME DÉCLENCHÉE ! BRAQUAGE ÉCHOUÉ';
          verdictDesc.innerText = `Erreur dans la hiérarchie. Une carte Alarme est retournée face rouge (${room.alarmCardsTurned}/${room.maxAlarms}) !`;
        }

        if (room.nextCard) {
          const isMalus = room.nextCard.type === 'malus';
          verdictNextCard.className = `mt-2.5 p-3 rounded-xl border flex items-center gap-3 ${isMalus ? 'bg-orange-950/90 border-orange-500 text-orange-200' : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'}`;
          verdictNextCard.innerHTML = `
            <span class="text-2xl">${isMalus ? '⚠️' : '🎁'}</span>
            <div>
              <p class="font-bold text-xs uppercase font-gang tracking-wider">${isMalus ? 'Malus pour le prochain braquage :' : 'Bonus pour le prochain braquage :'} ${room.nextCard.title}</p>
              <p class="text-[11px] opacity-90 mt-0.5">${room.nextCard.desc}</p>
            </div>
          `;
        } else {
          verdictNextCard.innerHTML = '<span class="text-[11px] text-stone-400 italic">Aucune carte spéciale supplémentaire pour la suite.</span>';
        }

        if (isHost) {
          showdownNextBraquageBtn.classList.remove('hidden');
          if (sd.gameOverStatus === 'VICTORY') {
            verdictTitle.innerText = 'VICTOIRE DU GANG ! LES 3 COFFRES SONT OUVERTS !';
            btnNextBraquage.innerText = 'RELANCER UNE NOUVELLE PARTIE';
          } else if (sd.gameOverStatus === 'DEFEAT') {
            verdictTitle.innerText = 'DÉFAITE DU GANG ! SEUIL D\'ALARMES ATTEINT !';
            btnNextBraquage.innerText = 'RECOMMENCER LA PARTIE';
          } else {
            btnNextBraquage.innerText = 'PASSER AU BRAQUAGE SUIVANT';
          }
        }
      } else {
        showdownVerdictBox.classList.add('hidden');
        showdownNextBraquageBtn.classList.add('hidden');
      }
    } else {
      showdownModal.classList.add('hidden');
    }
  }
});
