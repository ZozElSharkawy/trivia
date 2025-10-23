
/* -------------------------
   Utility helpers
   ------------------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function showModal(html) { $('#modalContent').innerHTML = html; $('#modalBack').style.display = 'flex'; }
function closeModal() { $('#modalBack').style.display = 'none'; }

/* -------------------------
   Data & state
   ------------------------- */
let questionsData = null; // loaded from questions.json
let miniCards = []; // 24 mini categories built from questionsData
const CATEGORY_COST = 500;

const state = {
  players: [], // two players {id,name,score}
  startingPoints: 1000,
  chosen: [], // up to 6 mini ids
  boardCats: [], // 6 used on board {slot,id,title,group}
  currentPlayerIndex: 0,
  boardDisabled: {}, // key catid_value -> true when answered
  questions: {}, // key catid_value -> {q, answer, image?}
  // Track individual player scores during category selection
  categorySelectionScores: { 0: 1000, 1: 1000 }
};

/* -------------------------
   Load questions.json
   ------------------------- */
async function loadQuestionsJson(){
  try {
    const res = await fetch('questions.json');
    if(!res.ok) throw new Error('HTTP '+res.status);
    questionsData = await res.json();
    buildMiniCardsFromData();
  } catch(err){
    alert('فشل تحميل ملف questions.json. تأكد من وجوده في نفس المجلد وتشغيل ملف عبر خادم محلي (مثلاً: `npx http-server` أو `python -m http.server`).\n\nالخطأ: ' + err.message);
    console.error(err);
    // Provide fallback minimal data so page doesn't break (optional)
    questionsData = {
      "العلوم": {"أحياء":[{"difficulty":200,"question":"سؤال تجريبي","answer":"الإجابة"}]}
    };
    buildMiniCardsFromData();
  }
}

function buildMiniCardsFromData(){
  miniCards = [];
  let idCounter = 1;
  for(const group of Object.keys(questionsData)){
    const subs = questionsData[group];
    for(const sub of Object.keys(subs)){
      miniCards.push({
        id: 'm' + (idCounter++),
        group,
        title: sub,
        locked: Math.random() < 0.5, // some locked for demo - increased to 50% for better testing
        cost: CATEGORY_COST,
        unlockedBy: null
      });
    }
  }
}

/* -------------------------
   UI: Setup -> Categories
   ------------------------- */


// Track current active tab
let currentActiveTab = null;

/* render category tabs and mini cards */
function renderCategories(){
const tabsContainer = $('#categoryTabs');
const cardsContainer = $('#miniCardsContainer');

tabsContainer.innerHTML = '';
cardsContainer.innerHTML = '';

// group miniCards by group
const groups = {};
miniCards.forEach(m => {
if(!groups[m.group]) groups[m.group] = [];
groups[m.group].push(m);
});

// Create "All" tab first (active by default)
const allTab = document.createElement('div');
allTab.className = 'category-tab active';
allTab.textContent = 'الكل';
allTab.dataset.group = 'all';

allTab.addEventListener('click', () => {
// Remove active class from all tabs
  document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
  // Add active class to clicked tab
  allTab.classList.add('active');
  currentActiveTab = 'all';
  renderAllMiniCards(groups);
});

tabsContainer.appendChild(allTab);
currentActiveTab = 'all';
renderAllMiniCards(groups);

// Create tabs for each group
const groupNames = Object.keys(groups);
groupNames.forEach((gname, index) => {
const tab = document.createElement('div');
tab.className = 'category-tab';
tab.textContent = gname;
    tab.dataset.group = gname;

  tab.addEventListener('click', () => {
      // Remove active class from all tabs
      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      // Add active class to clicked tab
      tab.classList.add('active');
      currentActiveTab = gname;
      renderMiniCardsForGroup(gname, groups[gname]);
    });

    tabsContainer.appendChild(tab);
  });
}

/* render mini cards for a specific group */
function renderMiniCardsForGroup(groupName, miniCardsArray){
const cardsContainer = $('#miniCardsContainer');
cardsContainer.innerHTML = '';

miniCardsArray.forEach(m => {
const card = document.createElement('div');
card.className = 'mini-card ' + (m.locked ? 'locked' : '') + (state.chosen.includes(m.id) ? ' selected' : '');
card.dataset.id = m.id;

card.innerHTML = `
<div class="mini-card-image"></div>
<div class="mini-card-content">
<h4 class="mini-card-title">${m.title}</h4>
</div>
${m.locked ? `<div class="lock">قفل ${m.cost}</div>` : ''}
`;

card.addEventListener('click', () => onMiniClick(m.id));
cardsContainer.appendChild(card);
});
}

/* render all mini cards from all groups */
function renderAllMiniCards(groups){
  const cardsContainer = $('#miniCardsContainer');
  cardsContainer.innerHTML = '';

  // Combine all mini cards from all groups
  const allMiniCards = [];
  Object.values(groups).forEach(groupCards => {
    allMiniCards.push(...groupCards);
  });

  allMiniCards.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mini-card ' + (m.locked ? 'locked' : '') + (state.chosen.includes(m.id) ? ' selected' : '');
    card.dataset.id = m.id;

    card.innerHTML = `
      <div class="mini-card-image"></div>
      <div class="mini-card-content">
        <h4 class="mini-card-title">${m.title}</h4>
      </div>
      ${m.locked ? `<div class="lock">قفل ${m.cost}</div>` : ''}
    `;

    card.addEventListener('click', () => onMiniClick(m.id));
    cardsContainer.appendChild(card);
  });
}

/* when clicking a mini-card in selection */
function onMiniClick(id){
  const m = miniCards.find(x => x.id === id);
  if(!m) return;
  if(m.locked){
    // buy flow: ask which player will buy
    // First ensure players are set from setup panel
    const p1 = $('#p1name').value.trim() || 'فريق 1';
    const p2 = $('#p2name').value.trim() || 'فريق 2';
    const sp = parseInt($('#startingPoints').value || '1000', 10);
    // Ensure categorySelectionScores is initialized
    if (!state.categorySelectionScores) {
      state.categorySelectionScores = { 0: sp, 1: sp };
    }
    const tempPlayers = [
      {id:0, name:p1, score: state.categorySelectionScores[0] || sp},
      {id:1, name:p2, score: state.categorySelectionScores[1] || sp}
    ];
    const playersHtml = tempPlayers.map(p=>`<button data-p="${p.id}" class="buy-player-btn" style="margin:6px;padding:8px;border-radius:8px">${p.name} (${p.score})</button>`).join('');
    showModal(`<h3>فتح: ${m.title} — التكلفة ${m.cost}</h3><div>من سيدفع لفتح هذه الفئة؟</div><div style="margin-top:10px">${playersHtml}</div><div style="margin-top:10px"><button id="cancelBuy" style="background:#999;padding:8px;border-radius:8px">إلغاء</button></div>`);

    // Add event listeners after a small delay to ensure DOM is ready
    setTimeout(() => {
    const cancelBtn = document.getElementById('cancelBuy');
    if(cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
      }

      $$('.buy-player-btn').forEach(btn => {
        console.log('Attaching event listener to button:', btn, 'data-p:', btn.dataset.p);
        btn.addEventListener('click', (e) => {
          console.log('Buy button clicked for player:', btn.dataset.p, 'mini:', id);
          e.preventDefault();
          attemptBuyCategory(parseInt(btn.dataset.p,10), id);
        });
      });
    }, 100);
    return;
  }
  // toggle selection (max 6)
  const idx = state.chosen.indexOf(id);
  if(idx !== -1) state.chosen.splice(idx,1);
  else {
    if(state.chosen.length >= 6){ alert('لا يمكنك اختيار أكثر من 6 مصغرات.'); return; }
    state.chosen.push(id);
  }
  renderChosen();
  refreshMiniVisuals();
}

function attemptBuyCategory(playerId, miniId){
  const mini = miniCards.find(m=>m.id === miniId);
  if(!mini) return;

  // Check if we're in category selection phase (state.players is empty)
  if(state.players.length === 0){
    // Category selection phase - deduct from categorySelectionScores
    const currentScore = state.categorySelectionScores[playerId];
    if(currentScore < mini.cost){
      closeModal();
      alert('نقاط غير كافية');
      return;
    }
    state.categorySelectionScores[playerId] -= mini.cost;
    console.log(`Player ${playerId} bought ${mini.title} for ${mini.cost} points. New score: ${state.categorySelectionScores[playerId]}`);
  } else {
    // In-game phase - deduct from actual player scores
    const player = state.players.find(p=>p.id === playerId);
    if(!player || player.score < mini.cost){
      closeModal();
      alert('نقاط غير كافية');
      return;
    }
    player.score -= mini.cost;
  }

  // Unlock the category
  mini.locked = false;
  mini.unlockedBy = playerId;
  if(state.chosen.length < 6 && !state.chosen.includes(miniId)) state.chosen.push(miniId);

  // Show success message
  alert(`تم فتح الفئة ${mini.title} بنجاح!`);

  closeModal();
  renderChosen();
  refreshMiniVisuals();

  // Only render players row if we're in game mode
  if(state.players.length > 0){
    renderPlayersRow();
  }
}

/* chosen side panel */
function renderChosen(){
  $('#chosenCount').innerText = state.chosen.length;
  const list = $('#chosenList');
  list.innerHTML = '';
  state.chosen.forEach(id=>{
    const m = miniCards.find(x=>x.id===id);
    const el = document.createElement('div');
    el.className = 'chosen-mini';
    el.innerHTML = `<div>${m.title}</div><div><button data-id="${id}" class="remove-chosen" style="background:#e74c3c;padding:6px;border-radius:8px">حذف</button></div>`;
    list.appendChild(el);
  });
  $$('.remove-chosen').forEach(b => {
    b.addEventListener('click', ()=> {
      const id = b.dataset.id;
      const idx = state.chosen.indexOf(id);
      if(idx !== -1) state.chosen.splice(idx,1);
      renderChosen();
      refreshMiniVisuals();
    });
  });
  $('#startGameBtn').disabled = state.chosen.length !== 6;
}

/* visual update for mini cards */
function refreshMiniVisuals(){
$$('.mini-card').forEach(el=>{
const id = el.dataset.id;
const m = miniCards.find(x=>x.id===id);
el.classList.toggle('locked', !!m.locked);
el.classList.toggle('selected', state.chosen.includes(id));
});
}



/* -------------------------
   Start game -> Build board
   ------------------------- */
$('#startGameBtn').addEventListener('click', ()=>{
  if(state.chosen.length !== 6){ alert('اختر 6 مصغرات للبدء.'); return; }
  // Ensure players are set from setup panel inputs and use category selection scores
  const p1 = $('#p1name').value.trim() || 'فريق 1';
  const p2 = $('#p2name').value.trim() || 'فريق 2';
  state.players = [
    {id:0, name:p1, score: state.categorySelectionScores[0]},
    {id:1, name:p2, score: state.categorySelectionScores[1]}
  ];
  state.startingPoints = Math.max(state.categorySelectionScores[0], state.categorySelectionScores[1]); // Use the higher score as reference
  state.boardCats = state.chosen.map((id, idx)=>{
    const m = miniCards.find(x=>x.id===id);
    return { slot: idx, id: m.id, title: m.title, group: m.group };
  });
  // fill state.questions from questionsData for chosen cats
  state.questions = {};
  // Map numeric difficulty values to string labels in questions.json
  const difficultyMap = { 200: 'easy', 400: 'hard', 600: 'extreme' };
  state.boardCats.forEach(cat => {
    const qlist = (questionsData[cat.group] && questionsData[cat.group][cat.title]) || [];
    // ensure mapping for 200/400/600 with 2 questions each, ensure different questions for each button
    [200,400,600].forEach(val => {
      const difficultyLabel = difficultyMap[val];
      const availableQuestions = qlist.filter(q => q.difficulty === difficultyLabel);

      // Select 2 different questions for this difficulty level
      let selectedQuestions = [];
      if (availableQuestions.length >= 2) {
        // Shuffle and pick first 2 questions
        const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
        selectedQuestions = shuffled.slice(0, 2);
      } else if (availableQuestions.length === 1) {
        // If only 1 question available, use it for both buttons
        selectedQuestions = [availableQuestions[0], availableQuestions[0]];
      } else {
        // No questions available
        selectedQuestions = [null, null];
      }

      // Assign the selected questions to the 2 buttons
      for (let i = 1; i <= 2; i++) {
        const selectedQuestion = selectedQuestions[i-1];
        state.questions[cat.id + '_' + val + '_' + i] = {
          q: selectedQuestion ? selectedQuestion.question : `سؤال تجريبي عن ${cat.title} (قيمة ${val})`,
          answer: selectedQuestion ? selectedQuestion.answer : 'الإجابة',
          image: selectedQuestion && selectedQuestion.image ? selectedQuestion.image : null
        };
      }
    });
  });

  state.boardDisabled = {};
  // Hide setup, category, and hero panels to show only game panel
  $('#setupPanel').style.display = 'none';
  $('#categoryPanel').style.display = 'none';
  $('.hero-section').style.display = 'none';
  $('#gamePanel').style.display = 'block';
  state.currentPlayerIndex = 0;
  renderBoard();
  renderPlayersRow();
  updateTurnBadge();
});

/* render board area */
function renderBoard(){
  const area = $('#boardArea'); area.innerHTML = '';
  state.boardCats.forEach((cat, idx)=>{
    const block = document.createElement('div');
    block.className = 'category-block';
    block.innerHTML = `
      <div style="height:120px;width:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(#e8f3fb,#d7e9f6);border-radius:8px">
        <div style="font-size:22px;font-weight:900;color:#2b2b2b">${cat.title}</div>
      </div>
      <div class="title-badge">الفئة ${idx+1}</div>
      <div class="values">
      <div class="difficulty-row">
        <button data-cat="${cat.id}" data-val="200" data-instance="1" class="val-btn">200</button>
        <button data-cat="${cat.id}" data-val="200" data-instance="2" class="val-btn">200</button>
        </div>
        <div class="difficulty-row">
          <button data-cat="${cat.id}" data-val="400" data-instance="1" class="val-btn">400</button>
          <button data-cat="${cat.id}" data-val="400" data-instance="2" class="val-btn">400</button>
        </div>
        <div class="difficulty-row">
          <button data-cat="${cat.id}" data-val="600" data-instance="1" class="val-btn">600</button>
          <button data-cat="${cat.id}" data-val="600" data-instance="2" class="val-btn">600</button>
        </div>
      </div>`;
    area.appendChild(block);
  });

  $$('.val-btn').forEach(b=>{
    const key = b.dataset.cat + '_' + b.dataset.val + '_' + b.dataset.instance;
    if(state.boardDisabled[key]) b.classList.add('answered');
    b.addEventListener('click', ()=> {
      if(state.boardDisabled[key]) return;
      openQuestionPage(b.dataset.cat, parseInt(b.dataset.val,10), parseInt(b.dataset.instance,10));
    });
  });
}

/* -------------------------
   Question Page + Timer
   ------------------------- */
let timerInterval = null;
let timerStart = 0;
let pausedTime = 0;
let running = false;
let currentQP = null; // {catId, value}

function formatTimer(ms){
  const s = Math.floor(ms/1000);
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}
function startTimer(){
  if(running) return;
  running = true;
  timerStart = Date.now() - pausedTime;
  timerInterval = setInterval(()=> {
    const elapsed = Date.now() - timerStart;
    $('#timerDisplay').innerText = formatTimer(elapsed);
  }, 200);
}
function pauseTimer(){
  if(!running) return;
  running = false;
  pausedTime = Date.now() - timerStart;
  clearInterval(timerInterval);
}
function resetTimer(){
  pauseTimer();
  pausedTime = 0;
  $('#timerDisplay').innerText = '00:00';
}

function openQuestionPage(catId, value, instance = 1){
  currentQP = { catId, value, instance };
  const key = catId + '_' + value + '_' + instance;
  const qobj = state.questions[key] || { q: `سؤال عن ${catId}`, answer: 'الإجابة', image: null };
  const m = miniCards.find(x=>x.id === catId);
  $('#qpCategory').innerText = (m ? m.group : '') + ' / ' + (m ? m.title : '');
  $('#qpQtextPreview').innerText = `قيمة السؤال: ${value}`;
  $('#qpValue').innerText = value;
  $('#qpQuestionText').innerText = qobj.q || 'نص السؤال';
  const wrap = $('#qpImageWrap'); wrap.innerHTML = '';
  if(qobj.image){
    const img = document.createElement('img'); img.src = qobj.image; wrap.appendChild(img);
  } else {
    wrap.innerHTML = `<div style="width:100%;height:260px;background:linear-gradient(#fff,#f2f2f2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999">صورة (إن وجدت)</div>`;
  }
  // show question page
  $('#questionPage').style.display = 'flex';
  $('#questionPage').setAttribute('aria-hidden','false');
  // ensure answer button present and remove any previous results
  renderAnswerButton();
  // start timer
  resetTimer();
  startTimer();
}

/* timer controls */
$('#pauseTimer').addEventListener('click', ()=>{
  if(running){ pauseTimer(); $('#pauseTimer').innerText = 'تشغيل'; }
  else { startTimer(); $('#pauseTimer').innerText = 'إيقاف'; }
});
$('#resetTimer').addEventListener('click', ()=> {
  resetTimer();
  startTimer();
  $('#pauseTimer').innerText = 'إيقاف';
});
$('#backToBoard').addEventListener('click', ()=> {
  // close question page without answering; question remains enabled
  pauseTimer();
  $('#questionPage').style.display = 'none';
  $('#questionPage').setAttribute('aria-hidden','true');
});

/* render the main "الإجابة" button */
function renderAnswerButton(){
  const answerArea = $('#answerArea');
  answerArea.innerHTML = '';
  // Reset answerArea styling
  answerArea.style.position = 'static';
  answerArea.style.left = 'auto';
  answerArea.style.top = 'auto';
  answerArea.style.transform = 'none';
  answerArea.style.zIndex = 'auto';
  answerArea.style.background = 'transparent';
  answerArea.style.padding = '';
  answerArea.style.borderRadius = '';
  answerArea.style.boxShadow = '';
  const btn = document.createElement('button');
  btn.id = 'answerBtn';
  btn.className = 'answer-action';
  btn.innerText = 'الإجابة';
  btn.addEventListener('click', onAnswerClicked);
  answerArea.appendChild(btn);
}

/* on الإجابة clicked: show the correct answer text first, then three buttons (team1 / team2 / no one) */
function onAnswerClicked(){
  if(!currentQP) return;
  const key = currentQP.catId + '_' + currentQP.value + '_' + currentQP.instance;
  const qobj = state.questions[key] || { answer: 'الإجابة' };
  // stop timer while showing answer selection? We'll keep timer running until selection, but per request timer stops when a team chosen
  // Show answer text then the three buttons
  const answerArea = $('#answerArea');
  answerArea.innerHTML = '';
  answerArea.style.position = 'static';
  answerArea.style.left = 'auto';
  answerArea.style.bottom = 'auto';
  answerArea.style.display = 'block';
  // show answer text
  const answerBox = document.createElement('div');
  answerBox.style.padding = '15px 20px';
  answerBox.style.background = '#e8f4fd';
  answerBox.style.border = '2px solid #2196f3';
  answerBox.style.borderRadius = '12px';
  answerBox.style.fontWeight = '900';
  answerBox.style.fontSize = '18px';
  answerBox.style.color = '#0d47a1';
  answerBox.style.marginBottom = '10px';
  answerBox.innerText = 'الإجابة: ' + (qobj.answer || 'الإجابة');

  // buttons
  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'answer-result';
  buttonsWrap.style.marginTop = '8px';
  const b1 = document.createElement('button'); b1.className = 'who-btn who-team1'; b1.innerText = state.players[0].name;
  const b2 = document.createElement('button'); b2.className = 'who-btn who-team2'; b2.innerText = state.players[1].name;
  const b3 = document.createElement('button'); b3.className = 'who-btn who-none'; b3.innerText = 'لا أحد';
  buttonsWrap.appendChild(b1); buttonsWrap.appendChild(b2); buttonsWrap.appendChild(b3);

  answerArea.appendChild(answerBox);
  answerArea.appendChild(buttonsWrap);

  // Make sure the answer area is visible and prominent
  answerArea.style.position = 'fixed';
  answerArea.style.left = '50%';
  answerArea.style.top = '50%';
  answerArea.style.transform = 'translate(-50%, -50%)';
  answerArea.style.zIndex = '100';
  answerArea.style.background = 'rgba(255, 255, 255, 0.95)';
  answerArea.style.padding = '20px';
  answerArea.style.borderRadius = '15px';
  answerArea.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';

  // handlers
  b1.addEventListener('click', ()=> finalizeAnswer(0));
  b2.addEventListener('click', ()=> finalizeAnswer(1));
  b3.addEventListener('click', ()=> finalizeAnswer(null));
}

/* finalize answer: award points (if any), stop timer, disable question, auto-switch turn to other team, return to board */
function finalizeAnswer(playerId){
  if(!currentQP) return;
  const key = currentQP.catId + '_' + currentQP.value + '_' + currentQP.instance;
  // award points
  if(playerId !== null){
    const pl = state.players.find(p=>p.id === playerId);
    if(pl) pl.score += currentQP.value;
    // optional visual feedback
    // alert(`${pl.name} حصل على ${currentQP.value} نقطة`);
  }
  // stop timer
  pauseTimer();
  // disable question
  state.boardDisabled[key] = true;
  // render updates
  renderBoard();
  renderPlayersRow();
  // close question page
  $('#questionPage').style.display = 'none';
  $('#questionPage').setAttribute('aria-hidden','true');
  // switch turn automatically to other team (if there are 2 teams)
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  updateTurnBadge();
  // clear current qp
  currentQP = null;
  // check if all answered -> show end summary automatically
  checkAllAnswered();
}

/* -------------------------
   Players row / turn switching / +/- controls
   ------------------------- */
function renderPlayersRow(){
  const row = $('#playersRow'); row.innerHTML = '';
  state.players.forEach((p, idx)=>{
    const el = document.createElement('div');
    el.className = 'player-chip ' + (state.currentPlayerIndex === idx ? 'active' : '');
    el.dataset.pid = p.id;
    el.innerHTML = `
      <div class="player-top"><div style="font-weight:900">${p.name}</div></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><div class="score">${p.score}</div></div>
      <div class="score-controls"><button class="pm" data-action="minus" data-p="${p.id}">-</button><button class="pm" data-action="plus" data-p="${p.id}">+</button></div>
    `;
    // clicking chip changes current turn (edit turn)
    el.addEventListener('click', ()=>{
      state.currentPlayerIndex = idx;
      updateTurnBadge();
      renderPlayersRow();
    });
    row.appendChild(el);
  });
  // plus/minus handlers
  $$('.pm').forEach(b=>{
    b.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      const pid = parseInt(b.dataset.p,10);
      const action = b.dataset.action;
      const pl = state.players.find(p=>p.id === pid);
      if(!pl) return;
      const step = 100; // change step; you can modify to 50, 10 or add UI to edit
      if(action === 'plus') pl.score += step;
      else pl.score = Math.max(0, pl.score - step);
      renderPlayersRow();
    });
  });
}

function updateTurnBadge(){
  const p = state.players[state.currentPlayerIndex];
  $('#currentTurnBadge').innerText = p ? 'دور: ' + p.name : 'دور: -';
}

/* -------------------------
   Buy modal from board (unlock other mini categories)
   ------------------------- */
$('#openBuyModal').addEventListener('click', ()=>{
  const locked = miniCards.filter(m=>m.locked);
  if(locked.length === 0){ alert('لا توجد فئات مغلقة حالياً.'); return; }
  const itemsHtml = locked.map(m=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee"><div>${m.group} / ${m.title}</div><div><button class="board-buy" data-id="${m.id}" style="padding:6px;border-radius:8px">فتح (${m.cost})</button></div></div>`).join('');
  showModal(`<h3>فتح فئة جديدة</h3><div>${itemsHtml}</div><div style="margin-top:8px"><button id="closeBuyNow" style="background:#999;padding:8px;border-radius:8px">إغلاق</button></div>`);
  $('#closeBuyNow').addEventListener('click', closeModal);
  $$('.board-buy').forEach(b => b.addEventListener('click', ()=>{
    const id = b.dataset.id;
    const playersHtml = state.players.map(p=>`<button data-p="${p.id}" class="buy-player-btn" style="margin:6px;padding:8px;border-radius:8px">${p.name} (${p.score})</button>`).join('');
    showModal(`<h3>من سيشتري الفئة؟</h3><div>${playersHtml}</div><div style="margin-top:8px"><button id="cancelBuy2" style="background:#999;padding:8px;border-radius:8px">إلغاء</button></div>`);
    $('#cancelBuy2').addEventListener('click', closeModal);
    $$('.buy-player-btn').forEach(btn => btn.addEventListener('click', ()=> attemptBuyCategory(parseInt(btn.dataset.p,10), id)));
  }) );
});

/* Reset to categories from board */
$('#resetToCategories').addEventListener('click', ()=>{
  // allow editing chosen categories again - show setup, category, and hero panels
  $('#gamePanel').style.display = 'none';
  $('#setupPanel').style.display = 'block';
  $('#categoryPanel').style.display = 'block';
  $('.hero-section').style.display = 'block';
});

/* End game */
$('#endGame').addEventListener('click', ()=>{
const sorted = [...state.players].sort((a,b)=>b.score - a.score);
const winner = sorted[0];
const summary = state.players.map(p => `${p.name}: ${p.score}`).join('<br/>');
showModal(`<h3>نهاية اللعبة — الفائز: ${winner ? winner.name : 'لا يوجد'}</h3><div style="margin-top:8px">${summary}</div><div style="margin-top:12px"><button id="closeEnd" style="padding:8px;border-radius:8px">العودة للإعداد</button></div>`);
$('#closeEnd').addEventListener('click', ()=>{
closeModal();
// Reset to setup panel, category panel, and hero section
$('#gamePanel').style.display = 'none';
$('#setupPanel').style.display = 'block';
$('#categoryPanel').style.display = 'block';
$('.hero-section').style.display = 'block';
// Reset category selection scores to default
const sp = parseInt($('#startingPoints').value || '1000', 10);
state.categorySelectionScores[0] = sp;
state.categorySelectionScores[1] = sp;
// Reset state (optional - could keep scores or reset everything)
  // state.players = [];
    // state.chosen = [];
    // state.boardCats = [];
    // state.questions = {};
  });
});

/* check all answered */
function checkAllAnswered(){
  const total = state.boardCats.length * 6; // 2 questions per difficulty × 3 difficulties
  let answered = 0;
  state.boardCats.forEach(cat => {
    [200,400,600].forEach(v => {
      // Check both instances of each difficulty level
      if(state.boardDisabled[cat.id + '_' + v + '_1']) answered++;
      if(state.boardDisabled[cat.id + '_' + v + '_2']) answered++;
    });
  });
  if(answered >= total){
    setTimeout(()=> $('#endGame').click(), 200);
  }
}

/* -------------------------
   Initialization
   ------------------------- */
// Update category selection scores when starting points input changes
$('#startingPoints').addEventListener('input', ()=>{
  const sp = parseInt($('#startingPoints').value || '1000', 10);
  state.categorySelectionScores[0] = sp;
  state.categorySelectionScores[1] = sp;
});

(async function init(){
  await loadQuestionsJson();
  renderCategories(); // initial render (works if questionsData not loaded yet)
  renderChosen(); // render the chosen categories panel
  // Initialize category selection scores
  const sp = parseInt($('#startingPoints').value || '1000', 10);
  state.categorySelectionScores[0] = sp;
  state.categorySelectionScores[1] = sp;
})();
