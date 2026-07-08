// Supabase Initialization
const supabaseUrl = 'https://nchyndflukleofvspyix.supabase.co';
const supabaseKey = 'sb_publishable_XZg0Fp-5J5ghgfZ9WHdFtw_yTes0vS-';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let challengeData = null;
let currentUser = null;

// OAuth config
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
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            }
        });
    }
}

function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const adminContent = document.getElementById('admin-content');
    const authBtnText = document.getElementById('admin-auth-btn-text');
    
    if (currentUser) {
        const displayName = currentUser.user_metadata?.full_name || currentUser.email || '';
        const userEmail = (currentUser.email || currentUser.user_metadata?.email || '').toLowerCase();
        
        // Check Admin privilege (broad check for all known admin identifiers)
        if (
            userEmail === 'hyejee.vic@gmail.com' || 
            displayName === 'H K' || 
            displayName === 'HK' || 
            displayName.includes('빛나는사람아')
        ) {
            authSection.querySelector('p').textContent = `환영합니다, 관리자 ${displayName}님.`;
            authBtnText.textContent = '로그아웃';
            adminContent.style.display = 'block';
            loadData();
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

async function loadData() {
    try {
        const { data, error } = await supabaseClient
            .from('challenge_data')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        
        challengeData = data;
        renderAdminSlots();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('admin-slots-container').innerHTML = '<p style="color:red;">데이터를 불러오는 중 오류가 발생했습니다.</p>';
    }
}

function renderAdminSlots() {
    const container = document.getElementById('admin-slots-container');
    if (!container || !challengeData || !challengeData.readers) return;
    container.innerHTML = '';

    const readers = challengeData.readers;

    readers.forEach((r, index) => {
        const row = document.createElement('div');
        row.className = 'admin-slot-row';
        
        const info = document.createElement('div');
        info.className = 'admin-slot-info';
        
        const isOccupied = r.uid || r.name !== `참가자 ${r.id}`;
        info.innerHTML = `<strong>슬롯 ${r.id}:</strong> ${isOccupied ? r.name : '비어있음'}`;
        
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
        delBtn.textContent = isOccupied ? '초기화(삭제)' : '슬롯 삭제';
        delBtn.onclick = () => adminDeleteUser(index);
        actions.appendChild(delBtn);

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

async function pushToSupabase() {
    try {
        const { error } = await supabaseClient
            .from('challenge_data')
            .update({ readers: challengeData.readers })
            .eq('id', 1);

        if (error) throw error;
        console.log('Successfully updated Supabase');
    } catch (err) {
        console.error('Failed to update Supabase:', err);
        alert('데이터 저장 중 오류가 발생했습니다.');
    }
}

async function adminDeleteUser(index) {
    if (confirm('이 슬롯을 완전히 삭제하시겠습니까? (복구 불가)')) {
        challengeData.readers.splice(index, 1);
        // Re-assign IDs sequentially to keep things tidy
        challengeData.readers.forEach((r, idx) => {
            r.id = idx + 1;
            if (!r.uid && r.name.startsWith('참가자 ')) {
                r.name = `참가자 ${r.id}`;
            }
        });
        await pushToSupabase();
        renderAdminSlots();
    }
}

async function adminCreateSlot() {
    const nextId = challengeData.readers.length + 1;
    challengeData.readers.push({ 
        id: nextId, 
        name: `참가자 ${nextId}`, 
        book: '', 
        completedDays: [], 
        uid: null 
    });
    await pushToSupabase();
    renderAdminSlots();
}

async function adminAddUser(index) {
    const name = prompt('슬롯을 강제로 할당할 사용자의 이름을 입력하세요:');
    if (name && name.trim() !== '') {
        challengeData.readers[index].name = name.trim();
        await pushToSupabase();
        renderAdminSlots();
    }
}

// Subscribe to real-time changes
function subscribeToChanges() {
    supabaseClient
        .channel('admin-channel')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'challenge_data', filter: 'id=eq.1' },
            (payload) => {
                if (payload.new && payload.new.readers) {
                    challengeData.readers = payload.new.readers;
                    renderAdminSlots();
                }
            }
        )
        .subscribe();
}

window.onload = async () => {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    
    updateAuthUI();
    subscribeToChanges();
};
