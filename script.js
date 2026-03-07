document.addEventListener('DOMContentLoaded', () => {
    const MATCH_DURATIONS = ['00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30', '04:00', '04:30', '05:00'];
    const WEIGHT_CLASSES = {
        Male: ['-60 kg', '-67 kg', '-75 kg', '-84 kg', '+84 kg'],
        Female: ['-50 kg', '-55 kg', '-61 kg', '-68 kg', '+68 kg'],
    };
    const STORAGE_KEY = 'ekfScoreboardLogs';
    const PDF_LINE_LIMIT = 90;
    const PDF_PAGE = { width: 612, height: 792, margin: 50, lineHeight: 14 };

    const els = {
        landingPage: document.getElementById('landing-page'),
        enterSiteBtn: document.getElementById('enter-site-btn'),
        appShell: document.getElementById('main-app-shell'),
        backToLandingBtn: document.getElementById('back-to-landing-btn'),
        setupOverlay: document.getElementById('setup-screen'),
        playerCountSelect: document.getElementById('player-count-select'),
        playerGrid: document.getElementById('player-name-grid'),
        matchDurationSelect: document.getElementById('match-duration-select'),
        genderSelect: document.getElementById('gender-select'),
        weightSelect: document.getElementById('weight-class-select'),
        startTournamentBtn: document.getElementById('start-tournament-btn'),
        historyTriggers: document.querySelectorAll('[data-history-trigger], #history-btn'),
        roundBanner: document.getElementById('round-banner'),
        roundNumber: document.getElementById('round-number'),
        aoNameInput: document.getElementById('ao-name-input'),
        akaNameInput: document.getElementById('aka-name-input'),
        aoScore: document.getElementById('ao-score'),
        akaScore: document.getElementById('aka-score'),
        aoSenshu: document.getElementById('ao-senshu'),
        akaSenshu: document.getElementById('aka-senshu'),
        scoreButtons: document.querySelectorAll('.score-btn'),
        penaltyButtons: document.querySelectorAll('.penalty-btn:not(.timer-adj)'),
        koButtons: document.querySelectorAll('.ko-btn'),
        timerPlusBtn: document.querySelector('.timer-adj.plus'),
        timerMinusBtn: document.querySelector('.timer-adj.minus'),
        startPauseBtn: document.getElementById('start-pause-btn'),
        resetBtn: document.getElementById('reset-timer-btn'),
        timerDisplay: document.getElementById('timer'),
        fullscreenBtn: document.getElementById('fullscreen-btn'),
        swapBtn: document.getElementById('swap-sides-btn'),
        refereeInput: document.getElementById('referee-input'),
        historyModal: document.getElementById('history-modal'),
        historyList: document.getElementById('history-list'),
        historyPreview: document.getElementById('history-preview'),
        historyClose: document.querySelector('[data-close-history]'),
        eraseHistoryBtn: document.getElementById('erase-history-btn'),
        winnerModal: document.getElementById('winner-modal'),
        winnerModalClose: document.getElementById('winner-modal-close'),
        winnerTitle: document.getElementById('winner-title'),
        winnerMessage: document.getElementById('winner-message'),
        winnerNextBtn: document.getElementById('winner-modal-next'),
        decisionModal: document.getElementById('decision-modal'),
        decisionTitle: document.getElementById('decision-title'),
        decisionMessage: document.getElementById('decision-message'),
        decisionConfirmBtn: document.getElementById('decision-confirm-btn'),
        decisionCancelBtn: document.getElementById('decision-cancel-btn'),
        decisionClose: document.getElementById('decision-close'),
        bracketGrid: document.getElementById('bracket-grid'),
        bracketStatus: document.getElementById('bracket-status'),
        aoFlagScore: document.getElementById('ao-flag-score'),
        akaFlagScore: document.getElementById('aka-flag-score'),
    };

    const state = {
        timer: { duration: 120, remaining: 120, ticking: false, intervalId: null },
        scores: { ao: 0, aka: 0 },
        penalties: { ao: [], aka: [] },
        roundCount: 1,
        logBuffer: [],
        matchStartTime: null,
        tournament: { playerCount: 0, players: [], rounds: [], active: { roundIndex: 0, matchIndex: 0 }, division: { gender: 'Male', weightClass: '-60 kg' } },
        playerFlags: {},
        controlsLocked: true,
        pendingDecision: null 
    };

    if (els.enterSiteBtn) els.enterSiteBtn.addEventListener('click', () => { els.landingPage.classList.add('hidden'); els.appShell.classList.remove('hidden'); els.setupOverlay.classList.remove('hidden'); });
    if (els.backToLandingBtn) els.backToLandingBtn.addEventListener('click', () => { els.appShell.classList.add('hidden'); els.landingPage.classList.remove('hidden'); els.setupOverlay.classList.add('hidden'); if (getFullscreenElement()) exitFullscreen(); });

    const secondsFromLabel = (label) => { const [m, s] = label.split(':').map(Number); return (m * 60) + s; };
    const formatClock = (totalSeconds) => { const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0'); const seconds = (totalSeconds % 60).toString().padStart(2, '0'); return `${minutes}:${seconds}`; };
    const showToast = (text) => { els.roundBanner.textContent = text; els.roundBanner.classList.remove('hidden'); requestAnimationFrame(() => els.roundBanner.classList.add('visible')); setTimeout(() => { els.roundBanner.classList.remove('visible'); setTimeout(() => els.roundBanner.classList.add('hidden'), 300); }, 2500); };

    const renderPlayerInputs = () => {
        const count = Number(els.playerCountSelect.value);
        els.playerGrid.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const index = i - 1;
            const wrapper = document.createElement('label');
            wrapper.className = 'player-input';
            wrapper.innerHTML = `Player ${i}<input type="text" data-player-index="${index}" placeholder="Leave empty for default"><div class="player-flag-row"><input type="file" accept="image/*" data-player-flag="${index}"><img class="player-flag-preview" data-player-flag-preview="${index}" alt="Flag preview"></div>`;
            els.playerGrid.appendChild(wrapper);
        }
    };

    const populateMatchDurations = () => {
        const fragment = document.createDocumentFragment();
        MATCH_DURATIONS.forEach((label) => { const opt = document.createElement('option'); opt.value = label; opt.textContent = label; if (label === '02:00') opt.selected = true; fragment.appendChild(opt); });
        els.matchDurationSelect.appendChild(fragment);
    };

    const populateWeightClasses = (gender) => {
        const classes = WEIGHT_CLASSES[gender] || [];
        els.weightSelect.innerHTML = '';
        classes.forEach((label, index) => { const opt = document.createElement('option'); opt.value = label; opt.textContent = label; if (index === 0) opt.selected = true; els.weightSelect.appendChild(opt); });
    };

    const createInitialBracket = (players) => {
        const rounds = [];
        let currentPlayers = players.map((entry, idx) => ({ name: entry.name, seed: idx + 1, flag: entry.flag || null }));
        let roundIndex = 0;
        
        while (currentPlayers.length > 1) {
            const roundMatches = [];
            for (let i = 0; i < currentPlayers.length; i += 2) {
                roundMatches.push({ 
                    id: `R${roundIndex + 1}-M${(i / 2) + 1}`, 
                    players: [currentPlayers[i] || null, currentPlayers[i + 1] || null], 
                    winner: null, 
                    complete: false 
                });
            }
            rounds.push(roundMatches);
            currentPlayers = roundMatches.map(() => ({ name: 'TBD', seed: null, flag: null }));
            roundIndex++;
        }
        state.tournament.rounds = rounds;
    };

    const renderBracket = () => {
        const { rounds } = state.tournament;
        els.bracketGrid.innerHTML = '';
        rounds.forEach((matches, roundIdx) => {
            const column = document.createElement('div');
            column.className = 'round-column';
            const title = document.createElement('h4'); title.textContent = `Round ${roundIdx + 1}`;
            column.appendChild(title);
            matches.forEach((match) => {
                const p1 = match.players[0] || {}; const p2 = match.players[1] || {};
                const p1Flag = p1.flag ? `<img src="${p1.flag}" alt="" class="bracket-flag">` : '';
                const p2Flag = p2.flag ? `<img src="${p2.flag}" alt="" class="bracket-flag">` : '';
                const card = document.createElement('div');
                card.className = `match-card ${match.winner !== null ? 'winner-known' : ''}`;
                card.innerHTML = `<div class="match-title">${match.id}</div><div class="competitor">${p1Flag}<span>${p1.name || 'TBD'}</span><span>${match.winner === 0 ? '✔' : ''}</span></div><div class="competitor">${p2Flag}<span>${p2.name || 'TBD'}</span><span>${match.winner === 1 ? '✔' : ''}</span></div>`;
                column.appendChild(card);
            });
            els.bracketGrid.appendChild(column);
        });
    };

    const lockControls = (locked) => {
        state.controlsLocked = locked;
        [...els.scoreButtons, ...els.penaltyButtons, ...els.koButtons, els.swapBtn, els.aoSenshu, els.akaSenshu].forEach((el) => {
            el.disabled = locked;
            el.classList.toggle('disabled', locked);
        });
    };

    const startTimer = () => {
        if (state.timer.ticking || state.controlsLocked) return;
        state.timer.ticking = true;
        state.matchStartTime = state.matchStartTime || new Date();
        els.startPauseBtn.innerHTML = '&#10074;&#10074;';
        state.timer.intervalId = setInterval(() => {
            if (state.timer.remaining <= 0) {
                stopTimer();
                const winner = state.scores.ao > state.scores.aka ? 'ao' : (state.scores.aka > state.scores.ao ? 'aka' : null);
                if (winner) declareWinner(winner, 'Time elapsed');
                else { lockControls(true); els.winnerTitle.textContent = 'Time up'; els.winnerMessage.textContent = 'Scores tied. Declare a winner.'; els.winnerModal.classList.remove('hidden'); }
                return;
            }
            state.timer.remaining--;
            els.timerDisplay.textContent = formatClock(state.timer.remaining);
        }, 1000);
    };

    const stopTimer = () => { clearInterval(state.timer.intervalId); state.timer.ticking = false; els.startPauseBtn.innerHTML = '&#9658;'; };

    const handlePenalty = (btn) => {
        if (state.controlsLocked) return;
        const team = btn.dataset.team;
        const penalty = btn.dataset.penalty;
        if (penalty === 'K') { promptDrasticAction('KIKEN', team); return; }
        if (penalty === 'S') { promptDrasticAction('SHIKKAKU', team); return; }
        if (penalty === 'H') { promptDrasticAction('HANSOKU', team); return; }
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) state.penalties[team].push(penalty);
        else state.penalties[team] = state.penalties[team].filter(p => p !== penalty);
    };

    const promptDrasticAction = (type, offenderTeam) => {
        state.pendingDecision = { type, offenderTeam };
        els.decisionTitle.textContent = `Apply ${type}`;
        els.decisionMessage.textContent = `Confirm the ${type} ruling for the current player.`;
        els.decisionConfirmBtn.textContent = "OK";
        els.decisionModal.classList.remove('hidden');
    };

    const confirmDrasticAction = () => {
        if (!state.pendingDecision) return;
        const { type, offenderTeam, winnerTeam } = state.pendingDecision;
        els.decisionModal.classList.add('hidden');
        if (type === 'KNOCKOUT') {
            declareWinner(winnerTeam, 'Knockout');
        } else {
            const finalWinner = offenderTeam === 'ao' ? 'aka' : 'ao';
            if (type === 'KIKEN' || type === 'SHIKKAKU') state.scores[finalWinner] = 8;
            declareWinner(finalWinner, type);
        }
        state.pendingDecision = null;
    };

    const declareWinner = (team, reason) => {
        stopTimer(); lockControls(true);
        const winnerName = team === 'ao' ? els.aoNameInput.value : els.akaNameInput.value;
        els.winnerTitle.textContent = `${winnerName} wins!`;
        els.winnerMessage.textContent = `Reason: ${reason}`;
        els.winnerModal.classList.remove('hidden');
        saveMatchLog(team, reason);
        advanceBracket(team);
    };

    const advanceBracket = (winnerTeam) => {
        const { rounds, active } = state.tournament;
        const match = rounds[active.roundIndex][active.matchIndex];
        match.complete = true;
        match.winner = winnerTeam === 'ao' ? 0 : 1;
        const nextRound = rounds[active.roundIndex + 1];
        if (nextRound) {
            const targetMatch = nextRound[Math.floor(active.matchIndex / 2)];
            if (targetMatch) {
                const winnerPlayer = match.players[match.winner];
                targetMatch.players[active.matchIndex % 2] = { ...winnerPlayer };
            }
        }
        renderBracket();
    };

    const prepareMatch = () => {
        state.scores = { ao: 0, aka: 0 }; state.penalties = { ao: [], aka: [] };
        els.aoScore.textContent = 0; els.akaScore.textContent = 0;
        els.penaltyButtons.forEach(b => b.classList.remove('active'));
        els.aoSenshu.classList.remove('active'); els.akaSenshu.classList.remove('active');
        state.timer.remaining = state.timer.duration; els.timerDisplay.textContent = formatClock(state.timer.remaining);
        const match = state.tournament.rounds[state.tournament.active.roundIndex][state.tournament.active.matchIndex];
        
        const playerA = match.players[0] || { name: 'SHIRO', flag: null };
        const playerB = match.players[1] || { name: 'AKA', flag: null };

        els.aoNameInput.value = playerA.name;
        els.akaNameInput.value = playerB.name;

        // FIXED: Restore Flag Display
        const applyFlag = (img, src) => {
            if (!img) return;
            if (src) {
                img.src = src;
                img.style.display = 'block';
            } else {
                img.removeAttribute('src');
                img.style.display = 'none';
            }
        };
        applyFlag(els.aoFlagScore, playerA.flag);
        applyFlag(els.akaFlagScore, playerB.flag);

        lockControls(false); renderBracket();
        state.logBuffer = [];
        state.matchStartTime = null;
    };

    const toggleSenshu = (indicator) => {
        if (state.controlsLocked) return;
        const team = indicator.dataset.team;
        const other = team === 'ao' ? els.akaSenshu : els.aoSenshu;
        const isActive = indicator.classList.contains('active');
        if (!isActive) {
            indicator.classList.add('active');
            other.classList.remove('active');
        } else {
            indicator.classList.remove('active');
        }
    };

    const recordLog = (line) => {
        const stamp = new Date().toLocaleTimeString();
        state.logBuffer.push(`[${stamp}] ${line}`);
    };
    const getStoredLogs = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const persistLogs = (logs) => localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));

    const saveMatchLog = (winnerTeam, reason) => {
        const logs = getStoredLogs();
        const start = state.matchStartTime ? state.matchStartTime.toISOString() : new Date().toISOString();
        const end = new Date().toISOString();
        const winnerName = winnerTeam === 'ao' ? els.aoNameInput.value : els.akaNameInput.value;
        const loserName = winnerTeam === 'ao' ? els.akaNameInput.value : els.aoNameInput.value;
        const header = [
            `Match Start: ${start}`,
            `Match End: ${end}`,
            `Round: ${state.roundCount}`,
            `Winner: ${winnerName}`,
            `Loser: ${loserName}`,
            `Reason: ${reason}`,
            `Referee: ${els.refereeInput.value || 'N/A'}`,
        ];
        const body = header.concat(['--- Events ---', ...state.logBuffer, '--- Scoreboard ---', `SHIRO: ${state.scores.ao}`, `AKA: ${state.scores.aka}`]);
        const content = body.join('\n');
        const filename = `match-${end.replace(/[:T]/g, '-').split('.')[0]}.txt`;
        logs.unshift({ id: Date.now(), filename, content });
        persistLogs(logs);
    };

    const renderHistoryList = (logs) => {
        els.historyList.innerHTML = '';
        if (!logs.length) {
            els.historyPreview.textContent = 'No saved matches yet.';
            return;
        }
        els.historyPreview.textContent = 'Select a log to preview its contents.';
        logs.forEach((log) => {
            const li = document.createElement('li');
            li.dataset.logId = log.id;
            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'history-entry';
            selectBtn.textContent = log.filename;
            selectBtn.addEventListener('click', () => {
                els.historyList.querySelectorAll('li').forEach((item) => item.classList.remove('active'));
                li.classList.add('active');
                els.historyPreview.textContent = log.content;
            });
            const pdfBtn = document.createElement('button');
            pdfBtn.type = 'button';
            pdfBtn.className = 'history-download-btn';
            pdfBtn.textContent = 'Download PDF';
            pdfBtn.addEventListener('click', (evt) => {
                evt.stopPropagation();
                downloadLogAsPdf(log);
            });
            li.appendChild(selectBtn);
            li.appendChild(pdfBtn);
            els.historyList.appendChild(li);
        });
    };

    const openHistoryModal = () => { renderHistoryList(getStoredLogs()); els.historyModal.classList.remove('hidden'); };
    const closeHistoryModal = () => els.historyModal.classList.add('hidden');
    const eraseHistory = () => { if (window.confirm('Erase all saved match history?')) { persistLogs([]); renderHistoryList([]); } };

    const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
    const requestFullscreen = (element) => element.requestFullscreen ? element.requestFullscreen() : (element.webkitRequestFullscreen ? element.webkitRequestFullscreen() : element.mozRequestFullScreen());
    const exitFullscreen = () => document.exitFullscreen ? document.exitFullscreen() : (document.webkitExitFullscreen ? document.webkitExitFullscreen() : document.mozCancelFullScreen());

    populateMatchDurations(); populateWeightClasses('Male'); renderPlayerInputs();
    els.playerCountSelect.addEventListener('change', renderPlayerInputs);
    els.genderSelect.addEventListener('change', () => populateWeightClasses(els.genderSelect.value));
    
    // Setup file handling listener
    els.playerGrid.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.type !== 'file' || !input.dataset.playerFlag) return;
        const index = Number(input.dataset.playerFlag);
        const file = input.files && input.files[0];
        if (!file) {
            delete state.playerFlags[index];
            const preview = els.playerGrid.querySelector(`.player-flag-preview[data-player-flag-preview="${index}"]`);
            if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            state.playerFlags[index] = result;
            const preview = els.playerGrid.querySelector(`.player-flag-preview[data-player-flag-preview="${index}"]`);
            if (preview) { preview.src = result; preview.style.display = 'block'; }
        };
        reader.readAsDataURL(file);
    });

    els.startTournamentBtn.addEventListener('click', () => {
        const inputs = els.playerGrid.querySelectorAll('input[data-player-index]');
        const playerConfigs = Array.from(inputs).map((input, idx) => ({ 
            name: input.value.trim() || (idx % 2 === 0 ? 'SHIRO' : 'AKA'), 
            flag: state.playerFlags[idx] || null 
        }));
        state.tournament.playerCount = playerConfigs.length;
        state.tournament.players = playerConfigs;
        state.tournament.active = { roundIndex: 0, matchIndex: 0 };
        createInitialBracket(playerConfigs);
        state.timer.duration = secondsFromLabel(els.matchDurationSelect.value);
        els.setupOverlay.classList.add('hidden');
        prepareMatch();
    });

    els.scoreButtons.forEach(btn => btn.addEventListener('click', () => {
        const team = btn.dataset.team; const delta = Number(btn.dataset.points);
        state.scores[team] = Math.max(0, state.scores[team] + delta);
        els.aoScore.textContent = state.scores.ao; els.akaScore.textContent = state.scores.aka;
    }));

    els.penaltyButtons.forEach(btn => btn.addEventListener('click', () => handlePenalty(btn)));
    
    // Knockout Logic (Opponent wins)
    els.koButtons.forEach(btn => btn.addEventListener('click', () => {
        const sideClicked = btn.dataset.team;
        const winnerTeam = sideClicked === 'ao' ? 'aka' : 'ao';
        const winnerName = winnerTeam === 'ao' ? els.aoNameInput.value : els.akaNameInput.value;
        state.pendingDecision = { type: 'KNOCKOUT', winnerTeam: winnerTeam };
        els.decisionTitle.textContent = "⚠️ Confirm KNOCKOUT";
        els.decisionMessage.textContent = `Are you sure you want to declare the opponent (${winnerName}) the winner by Knockout?`;
        els.decisionConfirmBtn.textContent = "OK";
        els.decisionCancelBtn.textContent = "Cancel";
        els.decisionModal.classList.remove('hidden');
    }));

    els.timerPlusBtn.addEventListener('click', () => { state.timer.remaining++; els.timerDisplay.textContent = formatClock(state.timer.remaining); });
    els.timerMinusBtn.addEventListener('click', () => { state.timer.remaining = Math.max(0, state.timer.remaining - 1); els.timerDisplay.textContent = formatClock(state.timer.remaining); });
    els.startPauseBtn.addEventListener('click', () => state.timer.ticking ? stopTimer() : startTimer());
    els.resetBtn.addEventListener('click', () => { stopTimer(); prepareMatch(); });
    els.aoSenshu.addEventListener('click', () => toggleSenshu(els.aoSenshu));
    els.akaSenshu.addEventListener('click', () => toggleSenshu(els.akaSenshu));
    els.swapBtn.addEventListener('click', () => {
        [state.scores.ao, state.scores.aka] = [state.scores.aka, state.scores.ao];
        [els.aoNameInput.value, els.akaNameInput.value] = [els.akaNameInput.value, els.aoNameInput.value];
        els.aoScore.textContent = state.scores.ao; els.akaScore.textContent = state.scores.aka;
        const aoS = els.aoSenshu.classList.contains('active'); const akaS = els.akaSenshu.classList.contains('active');
        els.aoSenshu.classList.toggle('active', akaS); els.akaSenshu.classList.toggle('active', aoS);
    });

    els.fullscreenBtn.addEventListener('click', () => getFullscreenElement() ? exitFullscreen() : requestFullscreen(els.appShell));
    els.winnerNextBtn.addEventListener('click', () => {
        els.winnerModal.classList.add('hidden');
        const active = state.tournament.active;
        if (active.matchIndex + 1 < state.tournament.rounds[active.roundIndex].length) {
            active.matchIndex++;
        } else if (active.roundIndex + 1 < state.tournament.rounds.length) {
            active.roundIndex++;
            active.matchIndex = 0;
        } else {
            showToast('Tournament Over');
            return;
        }
        state.roundCount++; els.roundNumber.textContent = state.roundCount; prepareMatch();
    });

    els.decisionConfirmBtn.addEventListener('click', confirmDrasticAction);
    els.decisionCancelBtn.addEventListener('click', () => { els.decisionModal.classList.add('hidden'); state.pendingDecision = null; });
    els.winnerModalClose.addEventListener('click', () => els.winnerModal.classList.add('hidden'));
    els.historyTriggers.forEach(btn => btn.addEventListener('click', openHistoryModal));
    els.historyClose.addEventListener('click', closeHistoryModal);
    els.eraseHistoryBtn.addEventListener('click', eraseHistory);
    
    // ... (rest of your existing code above)

    lockControls(true);

    // --- LANDING PAGE SLIDER LOGIC ---
    function startLandingSlider() {
        const images = document.querySelectorAll('.slider-img');
        let currentIndex = 0;

        // Check if images exist to avoid errors
        if (images.length < 2) return;

        setInterval(() => {
            // 1. Remove active class from current image
            images[currentIndex].classList.remove('active');

            // 2. Move to next index
            currentIndex = (currentIndex + 1) % images.length;

            // 3. Add active class to new image
            images[currentIndex].classList.add('active');
        }, 5000); // 5 seconds
    }

    // Initialize the slider immediately since we are already inside a DOMContentLoaded block
    startLandingSlider();

}); // This closes the main DOMContentLoaded listener at the very top of your file