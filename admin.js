// ────────────────────────────────────────────────────────
// Supabase Initialization
// ────────────────────────────────────────────────────────
const supabaseUrl = 'https://nchyndflukleofvspyix.supabase.co';
const supabaseKey = 'sb_publishable_XZg0Fp-5J5ghgfZ9WHdFtw_yTes0vS-';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let allSeasons = [];        // 모든 기수 데이터 배열
let selectedSeasonId = null; // 슬롯 탭에서 선택된 기수 id

// ────────────────────────────────────────────────────────
// OAuth / Auth
// ────────────────────────────────────────────────────────
const getURL = () => {
    let url = window.location.origin;
    if (url.includes('github.io')) {
        url = url + '/post_reading/admin.html';
    } else {
        url = url + '/admin.html';
    }
    return url;
};

async function toggleAuth() {
    if (currentUser) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        updateAuthUI();
    } else {
        await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: getURL(),
                queryParams: { access_type: 'offline', prompt: 'consent' },
            }
        });
    }
}

function isAdmin(user) {
    if (!user) return false;
    const displayName = user.user_metadata?.full_name || '';
    const userEmail = (user.email || user.user_metadata?.email || '').toLowerCase();
    return (
        userEmail === 'hyejee.vic@gmail.com' ||
        displayName === 'H K' ||
        displayName === 'HK' ||
        displayName.includes('빛나는사람아')
    );
}

function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const adminContent = document.getElementById('admin-content');
    const authBtnText = document.getElementById('admin-auth-btn-text');

    if (currentUser) {
        const displayName = currentUser.user_metadata?.full_name || currentUser.email || '';
        if (isAdmin(currentUser)) {
            authSection.querySelector('p').textContent = `환영합니다, 관리자 ${displayName}님.`;
            authBtnText.textContent = '로그아웃';
            adminContent.style.display = 'block';
            loadAllSeasons();
        } else {
            authSection.querySelector('p').innerHTML = `환영합니다, ${displayName}님.<br><br><span style="color:red; font-weight:bold;">관리자 권한이 없습니다.</span>`;
            authBtnText.textContent = '로그아웃';
            adminContent.style.display = 'none';
        }
    } else {
        authSection.querySelector('p').textContent = '관리자 권한을 확인하기 위해 로그인해주세요.';
        authBtnText.textContent = '구글 로그인';
        adminContent.style.display = 'none';
    }
}

// ────────────────────────────────────────────────────────
// Tab Switching
// ────────────────────────────────────────────────────────
function switchTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', (tabName === 'seasons' && i === 0) || (tabName === 'slots' && i === 1));
    });
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ────────────────────────────────────────────────────────
// Load all seasons from Supabase
// ────────────────────────────────────────────────────────
async function loadAllSeasons() {
    try {
        const { data, error } = await supabaseClient
            .from('challenge_data')
            .select('id, season_number, season_name, start_date, end_date, active, readers')
            .order('season_number', { ascending: false });

        if (error) throw error;

        // If no season columns exist yet (old schema), fallback gracefully
        allSeasons = (data || []).map(row => ({
            id: row.id,
            season_number: row.season_number ?? row.id,
            season_name: row.season_name ?? `${row.id}기`,
            start_date: row.start_date ?? '',
            end_date: row.end_date ?? '',
            active: row.active ?? (row.id === 1),
            readers: row.readers ?? [],
        }));

        renderSeasons();
        populateSlotSeasonSelect();
    } catch (err) {
        console.error('기수 로드 실패:', err);
        document.getElementById('seasons-container').innerHTML =
            '<p style="color:red;">데이터를 불러오는 중 오류가 발생했습니다.</p>';
    }
}

// ────────────────────────────────────────────────────────
// Render season cards
// ────────────────────────────────────────────────────────
function renderSeasons() {
    const container = document.getElementById('seasons-container');
    if (!container) return;

    if (allSeasons.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="emoji">📭</span>
                아직 기수 데이터가 없습니다. 새 기수를 추가해주세요.
            </div>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'seasons-grid';

    allSeasons.forEach(season => {
        const card = document.createElement('div');
        card.className = `season-card${season.active ? ' active-season' : ''}`;

        const badgeClass = season.active ? 'badge-active' : 'badge-past';
        const badgeText = season.active ? '✅ 현재 기수' : '📁 지난 기수';

        const participantCount = (season.readers || []).filter(
            r => r.uid || (r.name && !r.name.startsWith('참가자 '))
        ).length;
        const slotCount = (season.readers || []).length;

        const dateText = (season.start_date || season.end_date)
            ? `${season.start_date || '?'} ~ ${season.end_date || '?'}`
            : '날짜 미설정';

        card.innerHTML = `
            <span class="season-badge ${badgeClass}">${badgeText}</span>
            <h3>${season.season_name || `${season.season_number}기`}</h3>
            <div class="season-meta">
                📅 ${dateText}<br>
                👥 참가자 ${participantCount}명 / ${slotCount}슬롯
            </div>
            <div class="season-card-actions">
                ${!season.active ? `<button class="btn-sm btn-success" onclick="activateSeason(${season.id})">현재 기수로 설정</button>` : ''}
                <button class="btn-sm btn-outline" onclick="goToSlotTab(${season.id})">슬롯 관리</button>
                ${!season.active ? `<button class="btn-sm btn-danger" onclick="deleteSeason(${season.id})">삭제</button>` : ''}
            </div>`;

        grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);
}

// ────────────────────────────────────────────────────────
// Slot season selector
// ────────────────────────────────────────────────────────
function populateSlotSeasonSelect() {
    const select = document.getElementById('slot-season-select');
    if (!select) return;

    const prevValue = selectedSeasonId;
    select.innerHTML = '<option value="">-- 기수를 선택하세요 --</option>';

    allSeasons.forEach(season => {
        const opt = document.createElement('option');
        opt.value = season.id;
        opt.textContent = `${season.season_name || season.season_number + '기'}${season.active ? ' (현재)' : ''}`;
        if (season.id === prevValue) opt.selected = true;
        select.appendChild(opt);
    });

    // Enable/disable create slot button
    document.getElementById('create-slot-btn').disabled = !selectedSeasonId;
}

function goToSlotTab(seasonId) {
    selectedSeasonId = seasonId;
    switchTab('slots');
    populateSlotSeasonSelect();
    const select = document.getElementById('slot-season-select');
    if (select) select.value = seasonId;
    document.getElementById('create-slot-btn').disabled = false;
    renderAdminSlots();
}

function onSlotSeasonChange() {
    const select = document.getElementById('slot-season-select');
    selectedSeasonId = select.value ? parseInt(select.value, 10) : null;
    document.getElementById('create-slot-btn').disabled = !selectedSeasonId;
    renderAdminSlots();
}

// ────────────────────────────────────────────────────────
// Render Slots for selected season
// ────────────────────────────────────────────────────────
function renderAdminSlots() {
    const container = document.getElementById('admin-slots-container');
    if (!container) return;

    if (!selectedSeasonId) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="emoji">👆</span>
                위에서 기수를 선택하면 슬롯 목록이 표시됩니다.
            </div>`;
        return;
    }

    const season = allSeasons.find(s => s.id === selectedSeasonId);
    if (!season) {
        container.innerHTML = '<p style="color:red;">기수를 찾을 수 없습니다.</p>';
        return;
    }

    const readers = season.readers || [];

    if (readers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="emoji">📭</span>
                슬롯이 없습니다. 새 슬롯을 추가해주세요.
            </div>`;
        return;
    }

    container.innerHTML = '';
    readers.forEach((r, index) => {
        const row = document.createElement('div');
        row.className = 'admin-slot-row';

        const info = document.createElement('div');
        info.className = 'admin-slot-info';

        const isOccupied = r.uid || (r.name && !r.name.startsWith('참가자 '));
        info.innerHTML = `<strong>슬롯 ${r.id}:</strong> ${isOccupied ? `<span style="color:var(--primary)">${r.name}</span>` : '<span style="color:var(--text-muted)">비어있음</span>'}`;

        const actions = document.createElement('div');
        actions.className = 'admin-slot-actions';

        if (!isOccupied) {
            const addBtn = document.createElement('button');
            addBtn.className = 'admin-btn-add';
            addBtn.textContent = '할당';
            addBtn.onclick = () => adminAddUser(index);
            actions.appendChild(addBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'admin-btn-delete';
        delBtn.textContent = isOccupied ? '초기화' : '슬롯 삭제';
        delBtn.onclick = () => adminDeleteUser(index);
        actions.appendChild(delBtn);

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

// ────────────────────────────────────────────────────────
// Supabase Push helpers
// ────────────────────────────────────────────────────────
async function pushSeasonReaders(seasonId, readers) {
    try {
        const { error } = await supabaseClient
            .from('challenge_data')
            .update({ readers })
            .eq('id', seasonId);
        if (error) throw error;
        // Update local cache
        const season = allSeasons.find(s => s.id === seasonId);
        if (season) season.readers = readers;
    } catch (err) {
        console.error('슬롯 저장 실패:', err);
        alert('데이터 저장 중 오류가 발생했습니다.');
    }
}

// ────────────────────────────────────────────────────────
// Slot CRUD
// ────────────────────────────────────────────────────────
async function adminCreateSlot() {
    if (!selectedSeasonId) return;
    const season = allSeasons.find(s => s.id === selectedSeasonId);
    if (!season) return;

    const nextId = season.readers.length > 0
        ? Math.max(...season.readers.map(r => r.id)) + 1
        : 1;
    season.readers.push({ id: nextId, name: `참가자 ${nextId}`, book: '', completedDays: [], uid: null });

    await pushSeasonReaders(selectedSeasonId, season.readers);
    renderAdminSlots();
}

async function adminDeleteUser(index) {
    if (!selectedSeasonId) return;
    const season = allSeasons.find(s => s.id === selectedSeasonId);
    if (!season) return;

    const reader = season.readers[index];
    const isOccupied = reader.uid || (reader.name && !reader.name.startsWith('참가자 '));

    if (isOccupied) {
        if (!confirm(`"${reader.name}"의 모든 기록이 초기화됩니다. 계속하시겠습니까?`)) return;
        const id = reader.id;
        season.readers[index] = { id, name: `참가자 ${id}`, book: '', completedDays: [], uid: null };
    } else {
        if (!confirm('이 슬롯을 완전히 삭제하시겠습니까? (복구 불가)')) return;
        season.readers.splice(index, 1);
        // Re-assign IDs sequentially
        season.readers.forEach((r, idx) => {
            r.id = idx + 1;
            if (!r.uid && r.name.startsWith('참가자 ')) {
                r.name = `참가자 ${r.id}`;
            }
        });
    }

    await pushSeasonReaders(selectedSeasonId, season.readers);
    renderAdminSlots();
}

async function adminAddUser(index) {
    if (!selectedSeasonId) return;
    const season = allSeasons.find(s => s.id === selectedSeasonId);
    if (!season) return;

    const name = prompt('슬롯을 강제로 할당할 사용자의 이름을 입력하세요:');
    if (name && name.trim() !== '') {
        season.readers[index].name = name.trim();
        await pushSeasonReaders(selectedSeasonId, season.readers);
        renderAdminSlots();
    }
}

// ────────────────────────────────────────────────────────
// Season CRUD
// ────────────────────────────────────────────────────────
function showNewSeasonModal() {
    // Auto-suggest next season number
    const maxNum = allSeasons.length > 0
        ? Math.max(...allSeasons.map(s => s.season_number || 0))
        : 0;
    document.getElementById('input-season-number').value = maxNum + 1;
    document.getElementById('input-season-name').value = `${maxNum + 1}기`;
    document.getElementById('input-start-month').value = '';
    document.getElementById('input-end-month').value = '';
    document.getElementById('input-slot-count').value = '20';
    document.getElementById('new-season-modal').classList.add('show');
}

function closeNewSeasonModal() {
    document.getElementById('new-season-modal').classList.remove('show');
}

async function createNewSeason() {
    const seasonNumber = parseInt(document.getElementById('input-season-number').value, 10);
    const seasonName = document.getElementById('input-season-name').value.trim();
    const startDate = document.getElementById('input-start-month').value;
    const endDate = document.getElementById('input-end-month').value;
    const slotCount = parseInt(document.getElementById('input-slot-count').value, 10) || 20;
    const inherit = document.getElementById('input-inherit-participants') ? document.getElementById('input-inherit-participants').checked : false;

    if (!seasonNumber || !seasonName) {
        alert('기수 번호와 기수 이름은 필수입니다.');
        return;
    }

    // Build readers array
    let readers = [];
    if (inherit && allSeasons.length > 0) {
        const lastSeason = allSeasons[0]; // ordered descending
        readers = (lastSeason.readers || []).map(r => ({
            id: r.id,
            name: r.name,
            book: '', // reset book
            completedDays: [], // reset records
            uid: r.uid
        }));
        
        // Pad with empty slots if needed
        while(readers.length < slotCount) {
            const nextId = readers.length + 1;
            readers.push({
                id: nextId,
                name: `참가자 ${nextId}`,
                book: '',
                completedDays: [],
                uid: null,
            });
        }
        // Trim if slotCount is smaller
        if (readers.length > slotCount) {
            readers = readers.slice(0, slotCount);
        }
    } else {
        readers = Array.from({ length: slotCount }, (_, i) => ({
            id: i + 1,
            name: `참가자 ${i + 1}`,
            book: '',
            completedDays: [],
            uid: null,
        }));
    }

    try {
        const { data, error } = await supabaseClient
            .from('challenge_data')
            .insert({
                season_number: seasonNumber,
                season_name: seasonName,
                start_date: startDate,
                end_date: endDate,
                active: false,
                theme: 'modern',
                viewMode: startDate || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
                readers,
            })
            .select()
            .single();

        if (error) throw error;

        alert(`✅ "${seasonName}" 기수가 생성되었습니다!`);
        closeNewSeasonModal();
        await loadAllSeasons();
    } catch (err) {
        console.error('기수 생성 실패:', err);
        alert('기수 생성 중 오류가 발생했습니다: ' + err.message);
    }
}

async function activateSeason(seasonId) {
    const season = allSeasons.find(s => s.id === seasonId);
    if (!season) return;

    if (!confirm(`"${season.season_name}"을 현재 활성 기수로 설정하시겠습니까?\n\n메인 페이지가 이 기수 데이터를 표시하게 됩니다.`)) return;

    try {
        // Deactivate all seasons
        const { error: deactivateError } = await supabaseClient
            .from('challenge_data')
            .update({ active: false })
            .neq('id', 0); // update all rows

        if (deactivateError) throw deactivateError;

        // Activate selected season
        const { error: activateError } = await supabaseClient
            .from('challenge_data')
            .update({ active: true })
            .eq('id', seasonId);

        if (activateError) throw activateError;

        alert(`✅ "${season.season_name}"이 현재 기수로 설정되었습니다.`);
        await loadAllSeasons();
    } catch (err) {
        console.error('기수 활성화 실패:', err);
        alert('기수 활성화 중 오류가 발생했습니다: ' + err.message);
    }
}

async function deleteSeason(seasonId) {
    const season = allSeasons.find(s => s.id === seasonId);
    if (!season) return;

    if (season.active) {
        alert('현재 활성 기수는 삭제할 수 없습니다.');
        return;
    }

    if (!confirm(`"${season.season_name}" 기수를 영구 삭제하시겠습니까?\n\n이 기수의 모든 참가자 데이터가 삭제됩니다. (복구 불가)`)) return;

    try {
        const { error } = await supabaseClient
            .from('challenge_data')
            .delete()
            .eq('id', seasonId);

        if (error) throw error;

        alert(`🗑️ "${season.season_name}" 기수가 삭제되었습니다.`);
        if (selectedSeasonId === seasonId) selectedSeasonId = null;
        await loadAllSeasons();
    } catch (err) {
        console.error('기수 삭제 실패:', err);
        alert('기수 삭제 중 오류가 발생했습니다: ' + err.message);
    }
}

// ────────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────────
window.onload = async () => {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();

    // Close modal on backdrop click
    document.getElementById('new-season-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeNewSeasonModal();
    });
};
