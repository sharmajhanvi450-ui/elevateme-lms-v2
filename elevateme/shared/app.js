// ═══════════════════════════════════════
// Supabase Cloud Sync Integration
// Add this at the TOP of your shared/app.js
// ═══════════════════════════════════════

const SUPABASE_URL = 'https://jlfbmawoyiwzvzklngxr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmJtYXdveWl3enZ6a2xuZ3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDI0OTMsImV4cCI6MjA4OTUxODQ5M30.JuMbxTyAhujTB4RqPiKbn5d4pxqK67EO_CTBj1xwt9o';

let supabaseClient = null;
let currentUserId = null;

async function initSupabase() {
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

async function getCurrentUser() {
    const client = await initSupabase();
    const { data: { user } } = await client.auth.getUser();
    return user;
}

async function syncProgressToCloud(moduleId, completed) {
    const user = await getCurrentUser();
    if (!user) return;
    
    const client = await initSupabase();
    await client
        .from('progress')
        .upsert({
            user_id: user.id,
            module_id: moduleId,
            completed: completed,
            completed_at: completed ? new Date().toISOString() : null
        }, {
            onConflict: 'user_id,module_id'
        });
    
    // Update week progress
    const weekNum = parseInt(moduleId.match(/w(\d+)m/)[1]);
    await updateWeekProgress(user.id, weekNum);
}

async function updateWeekProgress(userId, weekNum) {
    const client = await initSupabase();
    
    // Count total modules for this week (you may want to make this dynamic)
    const totalModules = [5,10,4,4,3,5,6,4,3,3][weekNum - 1] || 5;
    
    // Count completed modules for this week
    const { data: progress } = await client
        .from('progress')
        .select('module_id')
        .eq('user_id', userId)
        .eq('completed', true)
        .like('module_id', `w${weekNum}m%`);
    
    const completedCount = progress?.length || 0;
    const progressPercent = Math.round((completedCount / totalModules) * 100);
    
    await client
        .from('week_progress')
        .upsert({
            user_id: userId,
            week_num: weekNum,
            progress_percent: progressPercent,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id,week_num'
        });
    
    // Update localStorage for backward compatibility
    localStorage.setItem(`em_week${weekNum}_progress`, progressPercent);
}

async function loadAllProgressFromCloud() {
    const user = await getCurrentUser();
    if (!user) return {};
    
    const client = await initSupabase();
    const { data } = await client
        .from('progress')
        .select('*')
        .eq('user_id', user.id);
    
    const progress = {};
    data?.forEach(item => {
        progress[item.module_id] = item.completed;
    });
    
    return progress;
}

// ── OVERRIDE THE ORIGINAL FUNCTIONS ──
// Store original functions if they exist
const originalMarkModuleComplete = window.markModuleComplete;
const originalToggleModule = window.toggleModule;

// Override markModuleComplete
window.markModuleComplete = async function(moduleId) {
    // Call original if it exists
    if (originalMarkModuleComplete) {
        originalMarkModuleComplete(moduleId);
    }
    // Sync to cloud
    await syncProgressToCloud(moduleId, true);
};

// Override toggleModule
window.toggleModule = async function(cb) {
    const moduleId = cb.dataset.module;
    const completed = cb.checked;
    
    // Call original if it exists
    if (originalToggleModule) {
        originalToggleModule(cb);
    }
    // Sync to cloud
    await syncProgressToCloud(moduleId, completed);
};

// Initialize and load cloud progress when page loads
(async function initCloudSync() {
    await initSupabase();
    const user = await getCurrentUser();
    if (user) {
        currentUserId = user.id;
        const cloudProgress = await loadAllProgressFromCloud();
        
        // Merge with localStorage
        let localProgress = JSON.parse(localStorage.getItem('em_completed') || '{}');
        let updated = false;
        
        Object.keys(cloudProgress).forEach(moduleId => {
            if (cloudProgress[moduleId] && !localProgress[moduleId]) {
                localProgress[moduleId] = true;
                updated = true;
            }
        });
        
        if (updated) {
            localStorage.setItem('em_completed', JSON.stringify(localProgress));
            if (typeof updateProgress === 'function') updateProgress();
        }
    }
})();
