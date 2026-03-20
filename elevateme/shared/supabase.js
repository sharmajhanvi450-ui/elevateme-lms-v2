/* ═══════════════════════════════════════
   ElevateMe — Supabase Configuration
═══════════════════════════════════════ */

// Replace these with your actual Supabase values
const SUPABASE_URL = 'https://jlfbmawoyiwzvzklngxr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmJtYXdveWl3enZ6a2xuZ3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDI0OTMsImV4cCI6MjA4OTUxODQ5M30.JuMbxTyAhujTB4RqPiKbn5d4pxqK67EO_CTBj1xwt9o';

// Initialize Supabase client
let supabaseClient = null;

async function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase library not loaded');
        return null;
    }
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// ── AUTHENTICATION FUNCTIONS ──

async function getCurrentUser() {
    const client = await initSupabase();
    if (!client) return null;
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return user;
}

async function getUserProfile() {
    const client = await initSupabase();
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (error) return null;
    return data;
}

async function signIn(email, password) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) return { error: error.message };
    
    // Update last_active
    await client
        .from('profiles')
        .update({ last_active: new Date().toISOString() })
        .eq('id', data.user.id);
    
    return { data, error: null };
}

async function signOut() {
    const client = await initSupabase();
    if (!client) return;
    await client.auth.signOut();
    localStorage.clear();
    window.location.href = '/login.html';
}

async function sendPasswordReset(email) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
    });
    
    return { error };
}

async function updatePassword(newPassword) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    const { error } = await client.auth.updateUser({
        password: newPassword
    });
    
    return { error };
}

// ── PROGRESS FUNCTIONS ──

async function loadUserProgress(userId) {
    const client = await initSupabase();
    if (!client) return {};
    
    const { data, error } = await client
        .from('progress')
        .select('*')
        .eq('user_id', userId);
    
    if (error) return {};
    
    const progress = {};
    data.forEach(item => {
        progress[item.module_id] = item.completed;
    });
    return progress;
}

async function saveModuleProgress(moduleId, completed, userId) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    const { data, error } = await client
        .from('progress')
        .upsert({
            user_id: userId,
            module_id: moduleId,
            completed: completed,
            completed_at: completed ? new Date().toISOString() : null
        }, {
            onConflict: 'user_id,module_id'
        });
    
    return { data, error };
}

async function loadWeekProgress(userId, weekNum) {
    const client = await initSupabase();
    if (!client) return 0;
    
    const { data, error } = await client
        .from('week_progress')
        .select('progress_percent')
        .eq('user_id', userId)
        .eq('week_num', weekNum)
        .single();
    
    if (error) return 0;
    return data?.progress_percent || 0;
}

// ── ADMIN FUNCTIONS ──

async function getAllStudents() {
    const client = await initSupabase();
    if (!client) return [];
    
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });
    
    if (error) return [];
    
    // Add progress summary for each student
    const studentsWithProgress = await Promise.all(data.map(async (student) => {
        const { data: weekData } = await client
            .from('week_progress')
            .select('week_num, progress_percent')
            .eq('user_id', student.id);
        
        const totalProgress = weekData?.reduce((sum, w) => sum + w.progress_percent, 0) / 10 || 0;
        
        return {
            ...student,
            total_progress: Math.round(totalProgress),
            weeks_completed: weekData?.filter(w => w.progress_percent === 100).length || 0
        };
    }));
    
    return studentsWithProgress;
}

async function createStudentAccount(email, fullName, temporaryPassword) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    // Create auth user
    const { data: authData, error: authError } = await client.auth.admin.createUser({
        email: email,
        password: temporaryPassword,
        email_confirm: true
    });
    
    if (authError) return { error: authError.message };
    
    // Create profile
    const { error: profileError } = await client
        .from('profiles')
        .insert({
            id: authData.user.id,
            email: email,
            full_name: fullName,
            role: 'student'
        });
    
    if (profileError) return { error: profileError.message };
    
    return { data: authData, error: null };
}

async function resetStudentPassword(email, newPassword) {
    const client = await initSupabase();
    if (!client) return { error: 'Supabase not initialized' };
    
    // First get user by email
    const { data: users, error: userError } = await client
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
    
    if (userError) return { error: 'User not found' };
    
    // Update password via admin API
    const { error } = await client.auth.admin.updateUserById(users.id, {
        password: newPassword
    });
    
    return { error };
}

// ── CHECK AUTH ON PAGE LOAD ──
async function requireAuth() {
    const user = await getCurrentUser();
    const profile = await getUserProfile();
    
    if (!user) {
        window.location.href = '/login.html';
        return null;
    }
    
    return { user, profile };
}

async function requireAdmin() {
    const auth = await requireAuth();
    if (!auth) return null;
    
    if (auth.profile.role !== 'admin' && auth.profile.role !== 'coach') {
        window.location.href = '/';
        return null;
    }
    
    return auth;
}