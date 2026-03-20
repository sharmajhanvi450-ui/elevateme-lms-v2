/* ═══════════════════════════════════════
   ElevateMe — Shared Logic & Cloud Sync
   Version: 2.0 (Integrated with Supabase)
═══════════════════════════════════════ */

// Ensure shared/supabase.js is loaded before this script in your HTML
let userProgress = {};

/**
 * syncProgressToCloud
 * Updates Supabase when a user checks a module as done
 */
async function syncProgressToCloud(moduleId, completed) {
    const client = await initSupabase();
    const { data: { user } } = await client.auth.getUser();
    
    if (!user) {
        console.error("User not authenticated. Cannot sync.");
        return;
    }
    
    // 1. Update the 'progress' table for the specific module
    const { error: modError } = await client
        .from('progress')
        .upsert({
            user_id: user.id,
            module_id: moduleId,
            completed: completed,
            completed_at: completed ? new Date().toISOString() : null
        }, {
            onConflict: 'user_id,module_id'
        });

    if (modError) console.error("Error syncing module:", modError);
    
    // 2. Identify which week this module belongs to (e.g., "w2m3" -> Week 2)
    const weekMatch = moduleId.match(/w(\d+)m/);
    if (weekMatch) {
        const weekNum = parseInt(weekMatch[1]);
        await updateWeekProgress(user.id, weekNum);
    }
}

/**
 * updateWeekProgress
 * Calculates the % for the week and updates the 'week_progress' table
 */
async function updateWeekProgress(userId, weekNum) {
    const client = await initSupabase();
    
    // Total modules per week as defined in your curriculum
    const totalModulesCount = [5, 10, 4, 4, 3, 5, 6, 4, 3, 3];
    const totalModules = totalModulesCount[weekNum - 1] || 5;
    
    // Count how many modules are actually completed for this week
    const { data: completedModules, error } = await client
        .from('progress')
        .select('module_id')
        .eq('user_id', userId)
        .eq('completed', true)
        .like('module_id', `w${weekNum}m%`);
    
    const completedCount = completedModules?.length || 0;
    const progressPercent = Math.round((completedCount / totalModules) * 100);
    
    // Update the 'week_progress' table
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

    // Update LocalStorage for immediate UI response in other tabs
    localStorage.setItem(`em_week${weekNum}_progress`, progressPercent);
}

/**
 * toggleModule
 * Triggered by checkboxes in the sidebar/content
 */
window.toggleModule = async function(checkboxElement) {
    const moduleId = checkboxElement.dataset.module;
    const isCompleted = checkboxElement.checked;
    
    // Immediate LocalStorage update so UI feels fast
    let localData = JSON.parse(localStorage.getItem('em_completed') || '{}');
    localData[moduleId] = isCompleted;
    localStorage.setItem('em_completed', JSON.stringify(localData));
    
    // Sync to Supabase
    await syncProgressToCloud(moduleId, isCompleted);
    
    // Show toast if the function exists
    if (typeof showToast === 'function') {
        showToast(isCompleted ? "Module completed!" : "Module marked incomplete");
    }
};

/**
 * initApp
 * Runs on every week page load
 */
async function initApp() {
    const auth = await requireAuth();
    if (!auth) return;
    
    // Load existing progress from cloud to sync local state
    const client = await initSupabase();
    const { data: cloudData } = await client
        .from('progress')
        .select('module_id, completed')
        .eq('user_id', auth.user.id);
        
    if (cloudData) {
        let localComp = {};
        cloudData.forEach(item => {
            if (item.completed) localComp[item.module_id] = true;
        });
        localStorage.setItem('em_completed', JSON.stringify(localComp));
        
        // Refresh UI if the week page has an update function
        if (typeof updateProgressUI === 'function') updateProgressUI();
    }
}

// Start app logic
initApp();
