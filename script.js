
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
let categoriesData = null; // loaded from categories.json - contains all category metadata
let loadedQuestions = {}; // cache for loaded question files {categoryId: questionData}
let miniCards = []; // mini categories built from categoriesData
const CATEGORY_COST = 500;

const assistTools = [
{ id: 'double_points', name: 'Double Points', description: 'Doubles the value of the current question.', icon: '💰' },
{ id: 'search', name: 'محنك شي ان', description: 'Adds 20 seconds to answering time and halves the question points.', icon: '🔍' },
{ id: 'steal_question', name: 'Steal Question', description: 'Allows the team that activates this power-up to take control of the turn temporarily and answer the question — even if it\'s not their turn. If the stealing team answers correctly → they earn the points. If they answer incorrectly → control passes back to the other team as usual. When question ends the turn goes back normally.', icon: '🤏' },
{ id: 'mute_opponent', name: 'Mute Opponent (كتم الفريق الآخر)', description: 'Grants the activating team 90 seconds to answer while disabling the opponent\'s answer buttons.', icon: '🔇' },
{ id: 'change_question', name: 'Change Question', description: 'Replaces the current question with a new one from the same category and same difficulty.', icon: '🔄' },
{ id: 'call_friend', name: 'استشاره محنك', description: 'Call a friend for advice.', icon: '📞' },
{ id: 'add_time', name: 'زنقة محنك', description: 'Adds extra time for the current team to answer (120 seconds instead of 60).', icon: '⏰' },
{ id: 'steal_player', name: 'اعارة', description: 'Steal a player.', icon: '👤' },
{ id: 'share_points', name: 'مشاركة النقاط', description: 'Points are shared between teams if answered correctly.', icon: '🤝' },
{ id: 'cancel_question', name: 'حذف السؤال', description: 'Cancels the current question.', icon: '❌' }
];

let usedQuestions = new Set(); // to track used questions
let doublePointsActive = false;
let searchActive = false;
let stealActive = null;
let muteActive = null;
let sharePointsActive = false;
let addTimeActive = false;

const state = {
  players: [], // two players {id,name,score,selectedTools:[],usedTools:new Set()}
  startingPoints: 1000,
  chosen: [], // up to 6 mini ids
  boardCats: [], // 6 used on board {slot,id,title,group}
  currentPlayerIndex: 0,
  boardDisabled: {}, // key catid_value -> true when answered
  questions: {}, // key catid_value -> {q, answer, image?, choices?}
  // Track individual player scores during category selection
  categorySelectionScores: { 0: 1000, 1: 1000 },
  selectedTools: {0: [], 1: []}
};

/* -------------------------
   Load categories.json and lazy load questions
   ------------------------- */
async function loadCategoriesJson(){
  try {
    const res = await fetch('data/categories.json');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    categoriesData = data.categories;
    buildMiniCardsFromCategories();
  } catch(err){
    alert('فشل تحميل ملف categories.json. تأكد من وجوده في مجلد data/ وتشغيل الملف عبر خادم محلي (مثلاً: `npx http-server` أو `python -m http.server`).\n\nالخطأ: ' + err.message);
    console.error(err);
    // Provide fallback minimal data so page doesn't break
    categoriesData = [
      {id: 1, group: "العلوم", title: "أحياء", icon: "📚", file: "questions_cat_1.json"}
    ];
    buildMiniCardsFromCategories();
  }
}

function buildMiniCardsFromCategories(){
  miniCards = [];
  if(!categoriesData) return;
  categoriesData.forEach((cat, idx) => {
    miniCards.push({
      id: 'm' + cat.id,
      group: cat.group,
      title: cat.title,
      file: cat.file, // store the file to load later
      locked: Math.random() < 0.5, // some locked for demo
      cost: CATEGORY_COST,
      unlockedBy: null
    });
  });
}

/* Lazy load questions for a specific category */
async function loadCategoryQuestions(categoryId){
  // Find the category
  const cat = miniCards.find(m => m.id === categoryId);
  if(!cat || !cat.file) return null;
  
  // Return cached if already loaded
  if(loadedQuestions[categoryId]) return loadedQuestions[categoryId];
  
  try {
    const res = await fetch('data/' + cat.file);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    loadedQuestions[categoryId] = data;
    return data;
  } catch(err){
    console.error(`Failed to load ${cat.file}:`, err);
    // Return minimal fallback
    return {
      "العام": [
        {difficulty: "easy", question: "سؤال تجريبي", answer: "الإجابة"}
      ]
    };
  }
}

/* -------------------------
UI: Setup -> Categories
------------------------- */

function renderToolSelection() {
  const toolsHtml = assistTools.map(t => `<div class="tool-icon" data-tool="${t.id}" title="${t.name}: ${t.description}">${t.icon}</div>`).join('');
  $('#team1Tools').innerHTML = toolsHtml;
  $('#team2Tools').innerHTML = toolsHtml;
  updateToolButtons();
}

function updateToolButtons() {
  $$('.tool-icon').forEach(icon => {
    const team = parseInt(icon.closest('.powerups').id === 'team1Tools' ? 0 : 1);
    const toolId = icon.dataset.tool;
    const selected = state.selectedTools[team];
    icon.classList.toggle('selected', selected.includes(toolId));
  });
  updateStartButton();
}


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
    const sp1 = parseInt($('#startingPoints1').value || '1000', 10);
    const sp2 = parseInt($('#startingPoints2').value || '1000', 10);
    // Ensure categorySelectionScores is initialized
    if (!state.categorySelectionScores) {
      state.categorySelectionScores = { 0: sp1, 1: sp2 };
    }
    const tempPlayers = [
      {id:0, name:p1, score: state.categorySelectionScores[0]},
      {id:1, name:p2, score: state.categorySelectionScores[1]}
    ];
    const playersHtml = tempPlayers.map(p=>`<button data-p="${p.id}" class="buy-player-btn" style="margin:6px;padding:8px;border-radius:8px;color:#ff1493">${p.name} (${p.score})</button>`).join('');
    showModal(`<h3>فتح: ${m.title} — التكلفة ${m.cost}</h3><div>من سيدفع لفتح هذه الفئة؟</div><div style="margin-top:10px">${playersHtml}</div><div style="margin-top:10px"><button id="cancelBuy" style="background:#999;padding:8px;border-radius:8px">إلغاء</button></div>`);

    // Add event listeners after a small delay to ensure DOM is ready
    setTimeout(() => {
    const cancelBtn = document.getElementById('cancelBuy');
    if(cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
      }

      $$('.buy-player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
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
  updateStartButton();
}

function updateStartButton() {
  const chosenOk = state.chosen.length === 6;
  $('#startGameBtn').disabled = !chosenOk;
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
$('#startGameBtn').addEventListener('click', async ()=>{
  if(state.chosen.length !== 6){ alert('اختر 6 مصغرات للبدء.'); return; }
  if(state.selectedTools[0].length !== 3 || state.selectedTools[1].length !== 3){ alert('كل فريق يجب أن يختار 3 أدوات مساعدة.'); return; }
  // Ensure players are set from setup panel inputs and use category selection scores
  const p1 = $('#p1name').value.trim() || 'فريق 1';
  const p2 = $('#p2name').value.trim() || 'فريق 2';
  state.players = [
    {id:0, name:p1, score: state.categorySelectionScores[0], selectedTools: [...state.selectedTools[0]], usedTools: new Set()},
    {id:1, name:p2, score: state.categorySelectionScores[1], selectedTools: [...state.selectedTools[1]], usedTools: new Set()}
  ];
  state.startingPoints = Math.max(state.categorySelectionScores[0], state.categorySelectionScores[1]); // Use the higher score as reference
  state.boardCats = state.chosen.map((id, idx)=>{
    const m = miniCards.find(x=>x.id===id);
    return { slot: idx, id: m.id, title: m.title, group: m.group, file: m.file };
  });
  // Lazy load questions for chosen categories
  state.questions = {};
  const difficultyMap = { 200: 'easy', 400: 'hard', 600: 'extreme' };
  
  // Load all chosen category questions
  for(const cat of state.boardCats){
    const catQuestions = await loadCategoryQuestions(cat.id);
    if(!catQuestions) continue;
    
    // Extract question list from the loaded file structure
    // The file has categoryId, group, title, and questions array
    let qlist = catQuestions.questions || [];
    if(!Array.isArray(qlist)) qlist = [];
    
    // Ensure mapping for 200/400/600 with 2 questions each
    [200,400,600].forEach(val => {
      const difficultyLabel = difficultyMap[val];
      const availableQuestions = qlist.filter(q => q.difficulty === difficultyLabel);

      // Select 2 different questions for this difficulty level
      let selectedQuestions = [];
      if (availableQuestions.length >= 2) {
        const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
        selectedQuestions = shuffled.slice(0, 2);
      } else if (availableQuestions.length === 1) {
        selectedQuestions = [availableQuestions[0], availableQuestions[0]];
      } else {
        selectedQuestions = [null, null];
      }

      // Assign the selected questions
      for (let i = 1; i <= 2; i++) {
        const selectedQuestion = selectedQuestions[i-1];
        state.questions[cat.id + '_' + val + '_' + i] = {
          q: selectedQuestion ? selectedQuestion.question : `سؤال تجريبي عن ${cat.title} (قيمة ${val})`,
          answer: selectedQuestion ? selectedQuestion.answer : 'الإجابة',
          image: selectedQuestion && selectedQuestion.image ? selectedQuestion.image : null,
          choices: selectedQuestion && selectedQuestion.choices ? selectedQuestion.choices : null
        };
        if (selectedQuestion) usedQuestions.add(selectedQuestion.question);
      }
    });
  }

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
      <div style="height:120px;width:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(#ffff00,#ffcc00);border-radius:8px">
        <div style="font-size:22px;font-weight:900;color:#FF1493">${cat.title}</div>
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
let firstTimeout = addTimeActive ? 120000 : 60000;
let finalTimeout = addTimeActive ? 150000 : 90000;

function startTimer(){
if(running) return;
running = true;
timerStart = Date.now() - pausedTime;
oneMinuteAlertShown = false;
timerPhase = 'normal';
currentTeamTimedOut = false;
timerInterval = setInterval(()=> {
const elapsed = Date.now() - timerStart;
$('#timerDisplay').innerText = formatTimer(elapsed);

// Check for first alert (only if not mute)
if (elapsed >= firstTimeout && !oneMinuteAlertShown && timerPhase === 'normal' && !muteActive) {
oneMinuteAlertShown = true;
timerPhase = 'extended';
currentTeamTimedOut = true;
alert('انتهى الوقت! الفريق الآخر لديه 30 ثانية إضافية للإجابة');
// Continue timer for additional 30 seconds
}

// Check for final timeout
if (elapsed >= finalTimeout && timerPhase !== 'final') {
timerPhase = 'final';
pauseTimer();
// Highlight answer button to indicate time is up
const answerBtn = $('#answerBtn');
if(answerBtn && !document.querySelector('.answer-result')) {
answerBtn.style.background = '#ff4444';
answerBtn.style.animation = 'pulse 0.5s infinite';
answerBtn.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.8)';
}
}
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
  oneMinuteAlertShown = false;
  timerPhase = 'normal';
  currentTeamTimedOut = false;
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
    const img = document.createElement('img'); img.src = qobj.image; img.style.maxWidth = '100%'; img.style.maxHeight = '320px'; wrap.appendChild(img);
  }
  if(qobj.audio){
    const audio = document.createElement('audio'); audio.src = qobj.audio; audio.controls = true; audio.style.width = '100%'; wrap.appendChild(audio);
  }
  if(!qobj.image && !qobj.audio){
    wrap.innerHTML = `<div style="width:100%;height:260px;background:linear-gradient(#fff,#f2f2f2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999">وسائط (صورة أو صوت إن وجدت)</div>`;
  }
  // show question page
  $('#questionPage').style.display = 'flex';
  $('#questionPage').setAttribute('aria-hidden','false');
  // render scores and powerups
  renderQuestionPageScores();
  renderQuestionPagePowerups();
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
  // Remove focus from any element inside the question page to avoid aria-hidden warning
  if (document.activeElement && $('#questionPage').contains(document.activeElement)) {
    document.activeElement.blur();
  }
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

   // Disable buttons based on powerups
  if (muteActive !== null) {
     if (muteActive === 0) b2.disabled = true;
     else b1.disabled = true;
   }
   if (stealActive !== null) {
     if (stealActive === 0) b2.disabled = true;
     else b1.disabled = true;
   }

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
    let points = currentQP.value;
    // Half points if search powerup is active
    if (searchActive) {
      points = Math.floor(points / 2);
    }
    const doubled = doublePointsActive ? points * 2 : points;
    if (sharePointsActive) {
      // divide among 2 teams
      state.players.forEach(p => p.score += doubled / 2);
    } else {
      const pl = state.players.find(p=>p.id === playerId);
      if(pl) {
        pl.score += doubled;
      }
    }
    doublePointsActive = false;
    // optional visual feedback
    // alert(`${pl.name} حصل على ${doubled} نقطة`);
  }
  // stop timer
  pauseTimer();
  // remove answer button highlighting if it exists
  const answerBtn = $('#answerBtn');
  if(answerBtn){
    answerBtn.style.background = '';
    answerBtn.style.animation = '';
    answerBtn.style.boxShadow = '';
  }
  // disable question
  state.boardDisabled[key] = true;
  // switch turn automatically to other team (if there are 2 teams)
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  // render updates
  renderBoard();
  renderPlayersRow();
  updateTurnBadge();
  if ($('#questionPage').style.display !== 'none') {
    renderQuestionPageScores();
  }
  // close question page
  // Remove focus from any element inside the question page to avoid aria-hidden warning
  if (document.activeElement && $('#questionPage').contains(document.activeElement)) {
    document.activeElement.blur();
  }
  $('#questionPage').style.display = 'none';
  $('#questionPage').setAttribute('aria-hidden','true');
  // clear current qp
  currentQP = null;
  // reset powerup flags
  searchActive = false;
  stealActive = null;
  muteActive = null;
  sharePointsActive = false;
  addTimeActive = false;
  // check if all answered -> show end summary automatically
  checkAllAnswered();
}

/* -------------------------
Players row / turn switching / +/- controls
------------------------- */
function renderPlayersRow(){
$('#player0Card').innerHTML = generatePlayerHtml(0, false);
$('#player1Card').innerHTML = generatePlayerHtml(1, false);
// Add double_points button if selected
state.players.forEach((p, idx) => {
  if (p.selectedTools.includes('double_points')) {
    const tool = assistTools.find(t => t.id === 'double_points');
    const used = p.usedTools.has('double_points');
    const toolsDiv = document.createElement('div');
    toolsDiv.className = 'tools';
    toolsDiv.innerHTML = `<button class="tool-use-btn" data-tool="double_points" data-team="${idx}" ${used ? 'disabled' : ''}>${tool.name}</button>`;
    $('#player' + idx + 'Card').appendChild(toolsDiv);
  }
});
// Update active class on score-card containers for better visibility
$('#player0Card').classList.toggle('active', state.currentPlayerIndex === 0);
$('#player1Card').classList.toggle('active', state.currentPlayerIndex === 1);


// Add event listeners
$$('.player-chip').forEach(chip => {
chip.addEventListener('click', () => {
const idx = parseInt(chip.dataset.pid);
state.currentPlayerIndex = idx;
updateTurnBadge();
  renderPlayersRow();
});
});

$$('.pm').forEach(b => {
b.addEventListener('click', (ev) => {
ev.stopPropagation();
const pid = parseInt(b.dataset.p,10);
const action = b.dataset.action;
const pl = state.players.find(p=>p.id === pid);
if(!pl) return;
const step = 100;
if(action === 'plus') pl.score += step;
else pl.score = Math.max(0, pl.score - step);
renderPlayersRow();
});
});

$$('.tool-use-btn').forEach(btn => {
 btn.addEventListener('click', () => {
   const toolId = btn.dataset.tool;
 const team = parseInt(btn.dataset.team);
const tool = assistTools.find(t => t.id === toolId);
showModal(`<p>${tool.description}</p><button id="usePowerup" data-tool="${toolId}" data-team="${team}" style="color:#ff1493">استخدم الطاقة</button><button id="closePowerup">إغلاق</button>`);
});
});

}

function renderQuestionPageScores(){
  $('#qpPlayer0Card').innerHTML = generatePlayerHtml(0, false);
  $('#qpPlayer1Card').innerHTML = generatePlayerHtml(1, false);
  // Update active class
  $('#qpPlayer0Card').classList.toggle('active', state.currentPlayerIndex === 0);
  $('#qpPlayer1Card').classList.toggle('active', state.currentPlayerIndex === 1);

  // Add event listeners for question page
  $$('#qpPlayer0Card .player-chip, #qpPlayer1Card .player-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const idx = parseInt(chip.dataset.pid);
      state.currentPlayerIndex = idx;
      updateTurnBadge();
      renderQuestionPageScores();
      renderPlayersRow();
    });
  });

  $$('#qpPlayer0Card .pm, #qpPlayer1Card .pm').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const pid = parseInt(b.dataset.p,10);
      const action = b.dataset.action;
      const pl = state.players.find(p=>p.id === pid);
      if(!pl) return;
      const step = 100;
      if(action === 'plus') pl.score += step;
      else pl.score = Math.max(0, pl.score - step);
      renderQuestionPageScores();
      renderPlayersRow();
    });
  });
}

function renderQuestionPagePowerups(){
// Clear any existing tools in score cards
$$('.score-card .tools').forEach(t => t.remove());

state.players.forEach((p, idx) => {
const toolsHtml = p.selectedTools.filter(tId => tId !== 'double_points').map(tId => {
const tool = assistTools.find(t => t.id === tId);
const used = p.usedTools.has(tId);
const isCurrentTurn = idx === state.currentPlayerIndex;
const disabledAttr = used || ((tId === 'add_time' || tId === 'search') && !isCurrentTurn) ? 'disabled' : '';
const extraClass = (tId === 'add_time' || tId === 'search') && !isCurrentTurn ? ' inactive-turn' : '';
const buttonHtml = `<button class="tool-use-btn${extraClass}" data-tool="${tId}" data-team="${idx}" ${disabledAttr} title="${p.name}: ${tool.description}">${tool.icon} ${tool.name}</button>`;
const extraText = (tId === 'add_time' || tId === 'search') && !isCurrentTurn ? '<br/><small style="color:#666;font-size:10px;">يمكن استخدامه فقط في دورك</small>' : '';
  return buttonHtml + extraText;
  }).join('');

  if (toolsHtml) {
  const toolsDiv = document.createElement('div');
    toolsDiv.className = 'tools';
      toolsDiv.innerHTML = toolsHtml;
    $('#qpPlayer' + idx + 'Card').appendChild(toolsDiv);
    }
});

// Add event listeners
$$('.score-card .tool-use-btn').forEach(btn => {
btn.addEventListener('click', () => {
const toolId = btn.dataset.tool;
const team = parseInt(btn.dataset.team);
  const tool = assistTools.find(t => t.id === toolId);
    showModal(`<p>${tool.description}</p><button id="usePowerup" data-tool="${toolId}" data-team="${team}" style="color:#ff1493">استخدم الطاقة</button><button id="closePowerup">إغلاق</button>`);
    });
  });
}

function generatePlayerHtml(idx, includeTools = true) {
const p = state.players[idx];
let html = `
<div class="player-chip ${state.currentPlayerIndex === idx ? 'active' : ''}" data-pid="${p.id}">
  <div class="player-top"><div style="font-weight:900">${p.name}</div></div>
  <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><div class="score">${p.score}</div></div>
    <div class="score-controls"><button class="pm" data-action="minus" data-p="${p.id}">-</button><button class="pm" data-action="plus" data-p="${p.id}">+</button></div>
  </div>`;

if (includeTools) {
const toolsHtml = p.selectedTools.map(tId => {
const tool = assistTools.find(t => t.id === tId);
  const used = p.usedTools.has(tId);
  return `<button class="tool-use-btn" data-tool="${tId}" data-team="${idx}" ${used ? 'disabled' : ''}>${tool.name}</button>`;
  }).join('');
    html += `<div class="tools">${toolsHtml}</div>`;
  }

  return html;
}

function updateTurnBadge(){
  const p = state.players[state.currentPlayerIndex];
  $('#currentTurnBadge').innerText = p ? 'دور: ' + p.name : 'دور: -';
}

function usePowerup(team, toolId) {
  state.players[team].usedTools.add(toolId);
  renderPlayersRow();
  if ($('#questionPage').style.display !== 'none') {
    renderQuestionPageScores();
    renderQuestionPagePowerups();
  }
  switch(toolId) {
    case 'double_points':
      doublePointsActive = true;
      break;
    case 'search':
      searchActive = true;
      if (running) {
        // Add 20 seconds to timeout thresholds
        firstTimeout += 20000;
        finalTimeout += 20000;
      }
      break;
    case 'steal_question':
      stealActive = team;
      state.currentPlayerIndex = team;
      updateTurnBadge();
      break;
    case 'mute_opponent':
      muteActive = team;
      if (running) {
        // perhaps reset timer to 90s
      }
      break;
    case 'change_question':
      changeQuestion();
      break;
    case 'call_friend':
      // does nothing
      break;
    case 'add_time':
      if (team === state.currentPlayerIndex) {
        addTimeActive = true;
        // Change alert to 2 minutes instead of 1 minute
        firstTimeout = 120000;
        finalTimeout = 150000;
      }
      break;
    case 'steal_player':
      // does nothing
      break;
    case 'share_points':
      sharePointsActive = true;
      break;
    case 'cancel_question':
      // show message and close like backToBoard but disable question
      alert('تم حذف السؤال بواسطة الفريق ' + state.players[team].name);
      // disable question
      const key = currentQP.catId + '_' + currentQP.value + '_' + currentQP.instance;
      state.boardDisabled[key] = true;
    renderBoard();
    // close like backToBoard
    pauseTimer();
    if (document.activeElement && $('#questionPage').contains(document.activeElement)) {
        document.activeElement.blur();
      }
      $('#questionPage').style.display = 'none';
      $('#questionPage').setAttribute('aria-hidden','true');
      // reset powerups
      searchActive = false;
      stealActive = null;
      muteActive = null;
      sharePointsActive = false;
      addTimeActive = false;
      break;
  }
}

// Add event listener for usePowerup button
document.addEventListener('click', (e) => {
  if (e.target.id === 'usePowerup') {
    const toolId = e.target.dataset.tool;
    const team = parseInt(e.target.dataset.team);
    usePowerup(team, toolId);
    closeModal();
  } else if (e.target.id === 'closePowerup') {
    closeModal();
  }
});





async function changeQuestion() {
  const cat = state.boardCats.find(c => c.id === currentQP.catId);
  if(!cat) return;
  
  // Lazy load questions for this category if not already loaded
  const catQuestions = await loadCategoryQuestions(cat.id);
  if(!catQuestions) {
    alert('فشل تحميل الأسئلة لهذه الفئة.');
    return;
  }
  
  // Extract question list from the loaded file structure
  let qlist = catQuestions.questions || [];
  if(!Array.isArray(qlist)) qlist = [];
  
  const difficultyLabel = {200: 'easy', 400: 'hard', 600: 'extreme'}[currentQP.value];
  const available = qlist.filter(q => q.difficulty === difficultyLabel);
  
  if (available.length > 0) {
    const currentQuestion = state.questions[currentQP.catId + '_' + currentQP.value + '_' + currentQP.instance].q;
    const otherQuestions = available.filter(q => q.question !== currentQuestion);
    const newQ = otherQuestions.length > 0 ? otherQuestions[Math.floor(Math.random() * otherQuestions.length)] : available[Math.floor(Math.random() * available.length)];
    if (newQ.question === currentQuestion) {
      alert('لا توجد أسئلة أخرى متاحة في هذه الفئة والصعوبة.');
      return;
    }
    const qobj = state.questions[currentQP.catId + '_' + currentQP.value + '_' + currentQP.instance];
    qobj.q = newQ.question;
    qobj.answer = newQ.answer;
    qobj.image = newQ.image;
    qobj.choices = newQ.choices;
    // update display
    $('#qpQuestionText').innerText = qobj.q;
    const wrap = $('#qpImageWrap'); wrap.innerHTML = '';
    if(qobj.image){
      const img = document.createElement('img'); img.src = qobj.image; img.style.maxWidth = '100%'; img.style.maxHeight = '320px'; wrap.appendChild(img);
    }
    if(qobj.audio){
      const audio = document.createElement('audio'); audio.src = qobj.audio; audio.controls = true; audio.style.width = '100%'; wrap.appendChild(audio);
    }
    if(!qobj.image && !qobj.audio){
      wrap.innerHTML = `<div style="width:100%;height:260px;background:linear-gradient(#fff,#f2f2f2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999">وسائط (صورة أو صوت إن وجدت)</div>`;
    }

  } else {
    alert('لا توجد أسئلة متاحة في هذه الفئة والصعوبة.');
  }
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
showModal(`<h3>نهاية اللعبة — الفائز: ${winner ? winner.name : 'لا يوجد'}</h3><div style="margin-top:8px">${summary}</div><div style="margin-top:12px"><button id="closeEnd" style="padding:8px;border-radius:8px;color:#ff1493">العودة للإعداد</button></div>`);
$('#closeEnd').addEventListener('click', ()=>{
closeModal();
// Reset to setup panel, category panel, and hero section
$('#gamePanel').style.display = 'none';
$('#setupPanel').style.display = 'block';
$('#categoryPanel').style.display = 'block';
$('.hero-section').style.display = 'block';
// Reset category selection scores to inputs
const sp1 = parseInt($('#startingPoints1').value || '1000', 10);
const sp2 = parseInt($('#startingPoints2').value || '1000', 10);
state.categorySelectionScores[0] = sp1;
state.categorySelectionScores[1] = sp2;
// Reset state (optional - could keep scores or reset everything)
// state.players = [];
state.chosen = [];
state.boardCats = [];
state.selectedTools = {0: [], 1: []};
usedQuestions = new Set();
// state.questions = {};
// Clear the chosen section UI
renderChosen();
// Clear highlights on category cards
renderCategories();
// Clear highlights on powerup buttons
updateToolButtons();
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
// Update category selection scores when starting points inputs change
$('#startingPoints1').addEventListener('input', ()=>{
  const sp = parseInt($('#startingPoints1').value || '1000', 10);
  state.categorySelectionScores[0] = sp;
});

$('#startingPoints2').addEventListener('input', ()=>{
  const sp = parseInt($('#startingPoints2').value || '1000', 10);
  state.categorySelectionScores[1] = sp;
});

(async function init(){
  await loadCategoriesJson();
  renderCategories(); // initial render with categories from categories.json
  renderChosen(); // render the chosen categories panel
  renderToolSelection();
  // Initialize category selection scores
  const sp1 = parseInt($('#startingPoints1').value || '1000', 10);
  const sp2 = parseInt($('#startingPoints2').value || '1000', 10);
  state.categorySelectionScores[0] = sp1;
  state.categorySelectionScores[1] = sp2;

  // Tool selection event listeners
  $$('.tool-icon').forEach(icon => {
    icon.addEventListener('click', () => {
      const team = parseInt(icon.closest('.powerups').id === 'team1Tools' ? 0 : 1);
      const toolId = icon.dataset.tool;
      const selected = state.selectedTools[team];
      const idx = selected.indexOf(toolId);
      if (idx !== -1) {
        selected.splice(idx, 1);
      } else if (selected.length < 3) {
        selected.push(toolId);
      }
      updateToolButtons();
    });
  });
  updateStartButton();
})();

