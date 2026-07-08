// Supabase Initialization
const supabaseUrl = 'https://nchyndflukleofvspyix.supabase.co';
const supabaseKey = 'sb_publishable_XZg0Fp-5J5ghgfZ9WHdFtw_yTes0vS-';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// State management
let currentUser = null;
let isInitialSyncDone = false;

// Selected Month (starts at July 2026)
let currentYear = 2026;
let currentMonth = 7; // July

let challengeData = {
    theme: 'modern',
    readers: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `참가자 ${i + 1}`,
        book: '',
        completedDays: [],
        uid: null
    }))
};

// ─── Dark Mode ───────────────────────────────────────────
function loadDarkMode() {
    const isDark = localStorage.getItem('everyday_dark_mode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        updateDarkModeButton(true);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('everyday_dark_mode', isDark);
    updateDarkModeButton(isDark);
}

function updateDarkModeButton(isDark) {
    const btnText = document.getElementById('dark-toggle-text');
    const btnIcon = document.querySelector('#dark-toggle .icon');
    if (btnText && btnIcon) {
        btnText.textContent = isDark ? '라이트모드' : '다크모드';
        btnIcon.textContent = isDark ? '☀️' : '🌙';
    }
}

// ─── Local Storage ───────────────────────────────────────
function loadLocalData() {
    const saved = localStorage.getItem('readingChallenge_monthly');
    if (saved) {
        challengeData = JSON.parse(saved);
        updateUI();
    }
}

function saveLocally() {
    localStorage.setItem('readingChallenge_monthly', JSON.stringify(challengeData));
}

// ─── Month Navigation ────────────────────────────────────
function updateMonthLabel() {
    const label = document.getElementById('current-month-label');
    if (label) {
        label.textContent = `${currentYear}년 ${currentMonth}월`;
    }

    // Disable Prev button if we are at June 2026
    const prevBtn = document.getElementById('prev-month-btn');
    if (prevBtn) {
        if (currentYear === 2026 && currentMonth === 6) {
            prevBtn.disabled = true;
        } else {
            prevBtn.disabled = false;
        }
    }
}

function navigateMonth(direction) {
    currentMonth += direction;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear += 1;
    } else if (currentMonth < 1) {
        currentMonth = 12;
        currentYear -= 1;
    }

    // Ensure we don't go before June 2026
    if (currentYear < 2026 || (currentYear === 2026 && currentMonth < 6)) {
        currentYear = 2026;
        currentMonth = 6;
    }

    updateMonthLabel();
    renderGrids();
    pushToSupabase();
}

// ─── UI Update ───────────────────────────────────────────
function updateUI() {
    // Apply theme
    if (challengeData.theme === 'grape') {
        document.body.classList.add('theme-grape');
        const themeBtnText = document.querySelector('#theme-toggle span:not(.icon)');
        const themeBtnIcon = document.querySelector('#theme-toggle .icon');
        if (themeBtnText && themeBtnIcon) {
            themeBtnText.textContent = '모던 모드';
            themeBtnIcon.textContent = '✨';
        }
    } else {
        document.body.classList.remove('theme-grape');
        const themeBtnText = document.querySelector('#theme-toggle span:not(.icon)');
        const themeBtnIcon = document.querySelector('#theme-toggle .icon');
        if (themeBtnText && themeBtnIcon) {
            themeBtnText.textContent = '포도알 모드';
            themeBtnIcon.textContent = '🍇';
        }
    }

    // Auth area
    const authBtnText = document.getElementById('auth-btn-text');
    const userInfoEl = document.getElementById('user-info');
    const addParticipantBtn = document.getElementById('add-participant-btn');

    if (currentUser) {
        if (authBtnText) authBtnText.textContent = '로그아웃';
        
        // Show user info
        if (userInfoEl) {
            const displayName = currentUser.user_metadata?.full_name || currentUser.email || '';
            userInfoEl.textContent = `👋 ${displayName}`;
            userInfoEl.style.display = 'inline-block';
        }

        // Show/hide add participant button
        const mySlot = challengeData.readers.find(r => r.uid === currentUser.id);
        if (addParticipantBtn) {
            addParticipantBtn.style.display = mySlot ? 'none' : 'inline-flex';
        }

        // Admin button
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            if (displayName.includes('빛나는사람아') || currentUser.email === '빛나는사람아@gmail.com') {
                adminBtn.style.display = 'inline-flex';
            } else {
                adminBtn.style.display = 'none';
            }
        }
    } else {
        if (authBtnText) authBtnText.textContent = '구글 로그인';
        if (userInfoEl) userInfoEl.style.display = 'none';
        if (addParticipantBtn) addParticipantBtn.style.display = 'none';
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = 'none';
    }

    updateMonthLabel();
    renderGrids();
    
    // Refresh stats if open
    const statsModal = document.getElementById('stats-modal');
    if (statsModal && statsModal.classList.contains('show')) {
        updateStatsDashboard();
    }
}

// ─── Supabase Sync ───────────────────────────────────────
async function syncWithSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('challenge_data')
            .select('theme, viewMode, readers')
            .eq('id', 1)
            .single();

        if (error) throw error;

        if (data) {
            challengeData.theme = data.theme || 'modern';
            
            // Sync Year and Month from viewMode
            if (data.viewMode && data.viewMode.includes('-')) {
                const parts = data.viewMode.split('-');
                currentYear = parseInt(parts[0], 10) || 2026;
                currentMonth = parseInt(parts[1], 10) || 6;
            }

            let syncedReaders = Array.isArray(data.readers) ? data.readers : challengeData.readers;
            let updated = false;

            // Ensure readers array contains correct properties
            syncedReaders.forEach(r => {
                if (!r.completedDays) r.completedDays = [];
            });

            while (syncedReaders.length < 20) {
                const nextId = syncedReaders.length + 1;
                syncedReaders.push({ id: nextId, name: `참가자 ${nextId}`, book: '', completedDays: [], uid: null });
                updated = true;
            }
            challengeData.readers = syncedReaders;
            
            isInitialSyncDone = true;
            
            saveLocally();
            updateUI();
            
            if (updated) {
                pushToSupabase();
            }
            console.log('Synced with Supabase');
        }
    } catch (err) {
        console.error('Supabase Sync failed:', err);
    }
}

function subscribeToChanges() {
    supabaseClient
        .channel('custom-all-channel')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'challenge_data', filter: 'id=eq.1' },
            (payload) => {
                console.log('실시간 업데이트 수신:', payload);
                challengeData.theme = payload.new.theme || 'modern';
                
                // Sync Year and Month from viewMode
                if (payload.new.viewMode && payload.new.viewMode.includes('-')) {
                    const parts = payload.new.viewMode.split('-');
                    currentYear = parseInt(parts[0], 10) || 2026;
                    currentMonth = parseInt(parts[1], 10) || 6;
                }

                let syncedReaders = Array.isArray(payload.new.readers) ? payload.new.readers : challengeData.readers;
                syncedReaders.forEach(r => {
                    if (!r.completedDays) r.completedDays = [];
                });
                while (syncedReaders.length < 20) {
                    const nextId = syncedReaders.length + 1;
                    syncedReaders.push({ id: nextId, name: `참가자 ${nextId}`, completedDays: [], uid: null });
                }
                challengeData.readers = syncedReaders;
                saveLocally();
                updateUI();
            }
        )
        .subscribe();
}

async function pushToSupabase() {
    if (!isInitialSyncDone) {
        console.warn('Initial sync from Supabase not completed. Postponing push.');
        return;
    }
    saveLocally();
    const viewModeStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    try {
        const { error } = await supabaseClient
            .from('challenge_data')
            .upsert({
                id: 1,
                theme: challengeData.theme,
                viewMode: viewModeStr,
                readers: challengeData.readers
            });
        if (error) throw error;
        console.log('Data saved to Supabase');
    } catch (err) {
        console.error('Supabase Push failed:', err);
    }
}

// ─── Auth ────────────────────────────────────────────────
async function toggleAuth() {
    if (currentUser) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        updateUI();
    } else {
        try {
            if (window.location.protocol === 'file:') {
                alert("로컬 파일(file://) 환경에서는 구글 로그인을 진행할 수 없습니다.\nVS Code의 Live Server 등을 이용해 http://localhost 환경에서 실행해 주세요!");
                return;
            }
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.href.split('#')[0].split('?')[0]
                }
            });
            if (error) {
                console.error("Login error:", error.message);
                alert("구글 로그인 설정이 올바르지 않습니다.\n에러: " + error.message);
            }
        } catch (err) {
            alert("로그인 중 에러가 발생했습니다: " + err);
        }
    }
}

// ─── Participant Management (모달) ──────────────────────
function showAddParticipantModal() {
    if (!currentUser) {
        alert('로그인 후 참가할 수 있습니다!');
        return;
    }

    const existing = challengeData.readers.find(r => r.uid === currentUser.id);
    if (existing) {
        alert(`이미 "${existing.name}"으로 참가하고 있습니다!`);
        return;
    }

    const modal = document.getElementById('participant-modal');
    const nameInput = document.getElementById('participant-name-input');
    if (modal) {
        const googleName = currentUser.user_metadata?.full_name || '';
        nameInput.value = googleName;
        modal.classList.add('show');
        nameInput.focus();
    }
}

function closeParticipantModal() {
    const modal = document.getElementById('participant-modal');
    if (modal) modal.classList.remove('show');
}

function confirmAddParticipant() {
    const nameInput = document.getElementById('participant-name-input');
    const name = nameInput.value.trim();
    if (!name) {
        alert('이름을 입력해주세요!');
        return;
    }

    const newId = challengeData.readers.length > 0
        ? Math.max(...challengeData.readers.map(r => r.id)) + 1
        : 1;

    challengeData.readers.push({
        id: newId,
        name: name,
        book: '',
        completedDays: [],
        uid: currentUser.id
    });

    pushToSupabase();
    closeParticipantModal();
    updateUI();
}

function claimSlot(readerId) {
    if (!isInitialSyncDone) return;
    if (!currentUser) {
        alert("로그인 후 선택할 수 있습니다!");
        return;
    }
    
    // Check if user already owns a slot
    const hasSlot = challengeData.readers.some(r => r.uid === currentUser.id);
    if (hasSlot) {
        alert("이미 선택하신 슬롯이 있습니다! 한 사람당 하나의 슬롯만 이용할 수 있습니다.");
        return;
    }

    const reader = challengeData.readers.find(r => r.id === readerId);
    if (reader && !reader.uid) {
        const googleName = currentUser.user_metadata?.full_name || reader.name;
        reader.uid = currentUser.id;
        reader.name = googleName;
        pushToSupabase();
        updateUI();
    }
}

// ─── Theme ───────────────────────────────────────────────
function toggleTheme() {
    const isGrape = document.body.classList.toggle('theme-grape');
    challengeData.theme = isGrape ? 'grape' : 'modern';

    const btnText = document.querySelector('#theme-toggle span:not(.icon)');
    const btnIcon = document.querySelector('#theme-toggle .icon');

    if (isGrape) {
        if (btnText) btnText.textContent = '모던 모드';
        if (btnIcon) btnIcon.textContent = '✨';
    } else {
        if (btnText) btnText.textContent = '포도알 모드';
        if (btnIcon) btnIcon.textContent = '🍇';
    }

    pushToSupabase();
    renderGrids();
}

// ─── Name/Book Editing ───────────────────────────────────
function saveNames(readerId) {
    const input = document.getElementById(`name-${readerId}`);
    if (!input) return;
    const reader = challengeData.readers.find(r => r.id === readerId);
    if (!reader) return;

    if (!currentUser) {
        alert("로그인해야 이름을 바꿀 수 있습니다!");
        input.value = reader.name;
        return;
    }

    if (reader.uid === currentUser.id) {
        reader.name = input.value;
        pushToSupabase();
    } else {
        alert("본인의 이름만 수정할 수 있습니다.");
        input.value = reader.name;
    }
}

// Name change helper when claiming slot
function saveBook(readerId) {
    const input = document.getElementById(`book-${readerId}`);
    if (!input) return;
    const reader = challengeData.readers.find(r => r.id === readerId);
    if (!reader) return;

    if (!currentUser) {
        alert("로그인해야 책 이름을 등록할 수 있습니다!");
        input.value = reader.book || '';
        return;
    }

    if (reader.uid === currentUser.id) {
        reader.book = input.value;
        pushToSupabase();
    } else {
        alert("본인의 책 이름만 수정할 수 있습니다.");
        input.value = reader.book || '';
    }
}

// ─── Day Grid Calculations ──────────────────────────────
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function getFormattedDateString(year, month, day) {
    const yyyy = year;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function updateReaderStats(readerId, totalDays, completedCount) {
    const percentage = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;

    const card = document.getElementById(`reader-${readerId}`);
    if (card) {
        card.querySelector('.count').textContent = completedCount;
        card.querySelector('.total-days-label').textContent = `/${totalDays}`;
        card.querySelector('.progress-pct').textContent = `${percentage}%`;
        card.querySelector('.progress-bar-fill').style.width = `${percentage}%`;
    }
}

function renderReaderCard(reader, container) {
    const isMine = currentUser && reader.uid === currentUser.id;
    const hasNoSlotClaimed = currentUser && !challengeData.readers.some(r => r.uid === currentUser.id);
    const isUnowned = !reader.uid;

    const totalDays = getDaysInMonth(currentYear, currentMonth);
    
    // Count completions for the selected month
    let completedCount = 0;
    if (Array.isArray(reader.completedDays)) {
        completedCount = reader.completedDays.filter(dayStr => {
            if (typeof dayStr !== 'string') return false;
            const prefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
            return dayStr.startsWith(prefix);
        }).length;
    }

    const section = document.createElement('section');
    section.className = 'reader-card';
    if (isMine) section.classList.add('my-card');
    section.id = `reader-${reader.id}`;

    section.innerHTML = `
        <div class="reader-header">
            <div class="header-left">
                <div class="name-editable">
                    <input type="text" value="${reader.name}" id="name-${reader.id}" 
                        onblur="saveNames(${reader.id})" 
                        ${!isMine ? 'disabled' : ''}>
                    ${isMine ? '<span class="my-badge">나</span>' : ''}
                    ${hasNoSlotClaimed && isUnowned ? `<button class="claim-btn" onclick="claimSlot(${reader.id})">선택</button>` : ''}
                </div>
                <div class="book-editable">
                    <span class="book-icon">📖</span>
                    <input type="text" value="${reader.book || ''}" id="book-${reader.id}" 
                        placeholder="읽을 원서 입력..." 
                        onblur="saveBook(${reader.id})" 
                        ${!isMine ? 'disabled' : ''}>
                </div>
            </div>
            <div class="progress-info">
                <div class="progress-month" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; margin-bottom: 0.1rem;">${currentYear}년 ${currentMonth}월</div>
                <div class="progress-text"><span class="count">0</span><span class="total-days-label">/30</span></div>
                <div class="progress-pct">0%</div>
            </div>
        </div>
        <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width: 0%"></div>
        </div>
        <div class="days-grid" id="grid-${reader.id}"></div>
    `;
    container.appendChild(section);

    const grid = document.getElementById(`grid-${reader.id}`);
    
    // Today's date info
    const today = new Date();
    const todayStr = getFormattedDateString(today.getFullYear(), today.getMonth() + 1, today.getDate());

    for (let i = 1; i <= totalDays; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        // Display both month and day (e.g. 7/1)
        dayEl.textContent = `${currentMonth}/${i}`;
        dayEl.style.fontSize = '0.65rem';

        const dateStr = getFormattedDateString(currentYear, currentMonth, i);

        if (reader.completedDays && reader.completedDays.includes(dateStr)) {
            dayEl.classList.add('completed');
        }

        if (dateStr === todayStr) {
            dayEl.classList.add('today');
        }

        dayEl.onclick = () => {
            if (!currentUser) {
                alert("로그인 후 체크할 수 있습니다!");
                return;
            }
            if (!isMine) {
                alert("다른 참가자의 포도알은 체크할 수 없습니다.");
                return;
            }
            toggleDay(reader.id, dateStr);
        };

        if (!isMine) {
            dayEl.style.cursor = 'not-allowed';
            dayEl.style.opacity = '0.7';
        }

        grid.appendChild(dayEl);
    }
    updateReaderStats(reader.id, totalDays, completedCount);
}

function renderGrids() {
    const container = document.getElementById('readers-container');
    if (!container) return;
    container.innerHTML = '';

    const myReaders = challengeData.readers.filter(r => currentUser && r.uid === currentUser.id);
    const otherReaders = challengeData.readers.filter(r => !(currentUser && r.uid === currentUser.id));

    [...myReaders, ...otherReaders].forEach(reader => {
        renderReaderCard(reader, container);
    });
}

function toggleDay(readerId, dateStr) {
    const reader = challengeData.readers.find(r => r.id === readerId);
    if (!reader) return;
    if (!reader.completedDays) reader.completedDays = [];

    const index = reader.completedDays.indexOf(dateStr);
    if (index === -1) {
        reader.completedDays.push(dateStr);
    } else {
        reader.completedDays.splice(index, 1);
    }

    pushToSupabase();
    renderGrids();
}

// ─── Statistics Logic ────────────────────────────────────
let statsActiveTab = 'monthly';
let statsChartInstance = null;

function showStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) {
        modal.classList.add('show');
        switchStatsTab(statsActiveTab);
    }
}

function closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function switchStatsTab(tabName) {
    statsActiveTab = tabName;
    
    // Update active tab styling
    document.querySelectorAll('.stats-tab').forEach(btn => btn.classList.remove('active'));
    const activeTabButton = document.getElementById(`tab-${tabName}`);
    if (activeTabButton) activeTabButton.classList.add('active');

    // Populate periods selector
    populateStatsPeriods();
    updateStatsDashboard();
}

function populateStatsPeriods() {
    const select = document.getElementById('stats-period-select');
    if (!select) return;
    select.innerHTML = '';

    if (statsActiveTab === 'monthly') {
        // June 2026 to Dec 2027
        let year = 2026;
        let month = 6;
        while (year < 2028) {
            const val = `${year}-${String(month).padStart(2, '0')}`;
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = `${year}년 ${month}월`;
            
            // Set current viewed month as default
            if (year === currentYear && month === currentMonth) {
                opt.selected = true;
            }
            select.appendChild(opt);
            
            month++;
            if (month > 12) {
                month = 1;
                year++;
            }
        }
    } else if (statsActiveTab === 'quarterly') {
        // Quarters starting from 2026 Q2 (Challenge start)
        const quarters = [
            { year: 2026, q: 2, label: '2026년 2분기 (4~6월)' },
            { year: 2026, q: 3, label: '2026년 3분기 (7~9월)' },
            { year: 2026, q: 4, label: '2026년 4분기 (10~12월)' },
            { year: 2027, q: 1, label: '2027년 1분기 (1~3월)' },
            { year: 2027, q: 2, label: '2027년 2분기 (4~6월)' },
            { year: 2027, q: 3, label: '2027년 3분기 (7~9월)' },
            { year: 2027, q: 4, label: '2027년 4분기 (10~12월)' }
        ];
        
        // Find current quarter to default select
        const currentQ = Math.ceil(currentMonth / 3);
        quarters.forEach(item => {
            const opt = document.createElement('option');
            opt.value = `${item.year}-Q${item.q}`;
            opt.textContent = item.label;
            if (item.year === currentYear && item.q === currentQ) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    } else if (statsActiveTab === 'yearly') {
        const years = [2026, 2027, 2028];
        years.forEach(yr => {
            const opt = document.createElement('option');
            opt.value = `${yr}`;
            opt.textContent = `${yr}년 전체`;
            if (yr === currentYear) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }
}

function onStatsPeriodChange() {
    updateStatsDashboard();
}

function getDaysInQuarter(year, quarter) {
    let days = 0;
    const startMonth = (quarter - 1) * 3 + 1;
    for (let m = startMonth; m < startMonth + 3; m++) {
        days += getDaysInMonth(year, m);
    }
    return days;
}

function getDaysInYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function updateStatsDashboard() {
    const select = document.getElementById('stats-period-select');
    if (!select) return;
    const periodVal = select.value;
    if (!periodVal) return;

    let totalDays = 30;
    let filterFn = (dayStr) => false;

    if (statsActiveTab === 'monthly') {
        const parts = periodVal.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        totalDays = getDaysInMonth(y, m);
        filterFn = (dayStr) => dayStr.startsWith(`${y}-${String(m).padStart(2, '0')}-`);
    } else if (statsActiveTab === 'quarterly') {
        const parts = periodVal.split('-Q');
        const y = parseInt(parts[0], 10);
        const q = parseInt(parts[1], 10);
        totalDays = getDaysInQuarter(y, q);
        
        const startMonth = (q - 1) * 3 + 1;
        const validMonths = [
            `${y}-${String(startMonth).padStart(2, '0')}-`,
            `${y}-${String(startMonth + 1).padStart(2, '0')}-`,
            `${y}-${String(startMonth + 2).padStart(2, '0')}-`
        ];
        filterFn = (dayStr) => validMonths.some(prefix => dayStr.startsWith(prefix));
    } else if (statsActiveTab === 'yearly') {
        const y = parseInt(periodVal, 10);
        totalDays = getDaysInYear(y);
        filterFn = (dayStr) => dayStr.startsWith(`${y}-`);
    }

    // Process data for each reader
    const statsData = challengeData.readers.map(reader => {
        let completedCount = 0;
        if (Array.isArray(reader.completedDays)) {
            completedCount = reader.completedDays.filter(dayStr => {
                if (typeof dayStr !== 'string') return false;
                return filterFn(dayStr);
            }).length;
        }
        const percentage = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;
        return {
            name: reader.name,
            book: reader.book || '-',
            count: completedCount,
            pct: percentage,
            isClaimed: !!reader.uid
        };
    });

    // Leaderboard sorts active users first (claimed slots), then by completions
    const sortedReaders = [...statsData].sort((a, b) => {
        if (a.isClaimed && !b.isClaimed) return -1;
        if (!a.isClaimed && b.isClaimed) return 1;
        return b.count - a.count;
    });

    renderStatsChart(sortedReaders, totalDays);
    renderLeaderboard(sortedReaders, totalDays);
}

function renderStatsChart(readers, totalDays) {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#f8fafc' : '#1e293b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    
    // Fetch theme colors dynamically
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary').trim() || '#6366f1';
    const accentColor = rootStyles.getPropertyValue('--accent').trim() || '#0ea5e9';

    // Only chart readers that have been claimed to avoid cluttering with placeholders
    const activeReaders = readers.filter(r => r.isClaimed);
    const chartReaders = activeReaders.length > 0 ? activeReaders : readers.slice(0, 5);

    statsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartReaders.map(r => r.name),
            datasets: [{
                label: '완료일수',
                data: chartReaders.map(r => r.count),
                backgroundColor: primaryColor,
                borderColor: accentColor,
                borderWidth: 1.5,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const pct = totalDays > 0 ? Math.round((val / totalDays) * 100) : 0;
                            return ` 완료: ${val}일 (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    max: totalDays,
                    grid: { color: gridColor },
                    ticks: { color: textColor, stepSize: Math.ceil(totalDays / 10) }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            }
        }
    });
}

function renderLeaderboard(readers, totalDays) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rankedReaders = readers.filter(r => r.isClaimed);
    const unrankedReaders = readers.filter(r => !r.isClaimed);

    const renderRow = (r, index, isRanked) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${isRanked ? `<strong>${index + 1}</strong>` : '-'}</td>
            <td>${r.name}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.book}</td>
            <td>${r.count}일</td>
            <td><strong style="color: var(--primary);">${r.pct}%</strong></td>
        `;
        tbody.appendChild(tr);
    };

    rankedReaders.forEach((r, idx) => renderRow(r, idx, true));
    unrankedReaders.forEach(r => renderRow(r, 0, false));
}

// ─── Initialize ──────────────────────────────────────────
window.onload = async () => {
    loadDarkMode();
    loadLocalData();

    // Determine current month / year to view (starting at least at June 2026)
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    
    if (todayYear > 2026 || (todayYear === 2026 && todayMonth >= 6)) {
        currentYear = todayYear;
        currentMonth = todayMonth;
    } else {
        currentYear = 2026;
        currentMonth = 6;
    }

    // Auth Listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateUI();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;

    updateUI();
    await syncWithSupabase();
    subscribeToChanges();
};

// ─── Admin Modal ─────────────────────────────────────────
function showAdminModal() {
    renderAdminSlots();
    document.getElementById('admin-modal').classList.add('show');
}

function closeAdminModal() {
    document.getElementById('admin-modal').classList.remove('show');
}

function renderAdminSlots() {
    const container = document.getElementById('admin-slots-container');
    if (!container) return;
    container.innerHTML = '';

    challengeData.readers.forEach((r, index) => {
        const row = document.createElement('div');
        row.className = 'admin-slot-row';
        
        const info = document.createElement('div');
        info.className = 'admin-slot-info';
        
        const isOccupied = r.uid || r.name !== `참가자 ${r.id}`;
        info.innerHTML = `<strong>슬롯 ${r.id}:</strong> ${isOccupied ? r.name : '비어있음'}`;
        
        const actions = document.createElement('div');
        actions.className = 'admin-slot-actions';
        
        if (isOccupied) {
            const delBtn = document.createElement('button');
            delBtn.className = 'admin-btn-delete';
            delBtn.textContent = '삭제';
            delBtn.onclick = () => adminDeleteUser(index);
            actions.appendChild(delBtn);
        } else {
            const addBtn = document.createElement('button');
            addBtn.className = 'admin-btn-add';
            addBtn.textContent = '강제 추가';
            addBtn.onclick = () => adminAddUser(index);
            actions.appendChild(addBtn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

async function adminDeleteUser(index) {
    if (confirm('이 사용자의 모든 기록이 삭제되고 슬롯이 초기화됩니다. 계속하시겠습니까?')) {
        const id = challengeData.readers[index].id;
        challengeData.readers[index] = { id: id, name: `참가자 ${id}`, book: '', completedDays: [], uid: null };
        await pushToSupabase();
        renderAdminSlots();
        updateUI();
    }
}

async function adminAddUser(index) {
    const name = prompt('슬롯을 강제로 할당할 사용자의 이름을 입력하세요:');
    if (name && name.trim() !== '') {
        challengeData.readers[index].name = name.trim();
        // admin added users won't have a UID unless they link it, but can be displayed.
        await pushToSupabase();
        renderAdminSlots();
        updateUI();
    }
}
