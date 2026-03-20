// ── SUPABASE INTEGRATION ──
let currentUserId = null;
let currentUserRole = null;

async function initSupabaseAndUser() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase not loaded');
        return false;
    }
    
    const client = supabase.createClient(
        'https://jlfbmawoyiwzvzklngxr.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmJtYXdveWl3enZ6a2xuZ3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDI0OTMsImV4cCI6MjA4OTUxODQ5M30.JuMbxTyAhujTB4RqPiKbn5d4pxqK67EO_CTBj1xwt9o'
    );
    
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return false;
    }
    
    currentUserId = user.id;
    
    const { data: profile } = await client
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    
    currentUserRole = profile?.role || 'student';
    
    // Make client globally available
    window.supabaseClient = client;
    
    return true;
}

// Modified saveState function
async function saveStateToCloud() {
    if (!window.supabaseClient || !currentUserId) return;
    
    for (const [moduleId, completed] of Object.entries(completed)) {
        await window.supabaseClient
            .from('progress')
            .upsert({
                user_id: currentUserId,
                module_id: moduleId,
                completed: completed,
                completed_at: completed ? new Date().toISOString() : null
            }, {
                onConflict: 'user_id,module_id'
            });
    }
    
    // Update week progress for all weeks
    for (let week = 1; week <= 10; week++) {
        const modulesForWeek = window.WEEK_MODULES || [];
        const weekModules = modulesForWeek.filter(m => m.id.startsWith(`w${week}m`));
        const total = weekModules.length;
        const done = weekModules.filter(m => completed[m.id]).length;
        const pct = total ? Math.round(done / total * 100) : 0;
        
        await window.supabaseClient
            .from('week_progress')
            .upsert({
                user_id: currentUserId,
                week_num: week,
                progress_percent: pct,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,week_num'
            });
    }
}

// Override saveState to also save to cloud
const originalSaveState = saveState;
window.saveState = async function() {
    originalSaveState();
    await saveStateToCloud();
};

// Load progress from cloud on init
async function loadProgressFromCloud() {
    if (!window.supabaseClient || !currentUserId) return;
    
    const { data, error } = await window.supabaseClient
        .from('progress')
        .select('*')
        .eq('user_id', currentUserId);
    
    if (error) return;
    
    // Merge cloud data into local completed
    data.forEach(item => {
        completed[item.module_id] = item.completed;
    });
    
    saveState(); // This will save to localStorage
    updateProgress();
}

// Initialize when page loads
(async function initAuth() {
    const success = await initSupabaseAndUser();
    if (success) {
        await loadProgressFromCloud();
        // Re-render UI with loaded progress
        if (typeof updateProgress === 'function') updateProgress();
        if (typeof restoreVideos === 'function') restoreVideos();
    }
})();
