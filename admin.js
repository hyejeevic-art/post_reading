// Supabase Initialization
const supabaseUrl = 'https://nchyndflukleofvspyix.supabase.co';
const supabaseKey = 'sb_publishable_XZg0Fp-5J5ghgfZ9WHdFtw_yTes0vS-';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let challengeData = null;

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
    if (confirm('이 사용자의 모든 기록이 삭제되고 슬롯이 초기화됩니다. 계속하시겠습니까?')) {
        const id = challengeData.readers[index].id;
        challengeData.readers[index] = { id: id, name: `참가자 ${id}`, book: '', completedDays: [], uid: null };
        await pushToSupabase();
        renderAdminSlots();
    }
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

window.onload = () => {
    loadData();
    subscribeToChanges();
};
