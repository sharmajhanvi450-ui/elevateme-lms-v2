/* ═══════════════════════════════════════
   ElevateMe — Central Supabase Config
   Update your keys here ONCE for the whole site.
═══════════════════════════════════════ */

const SUPABASE_URL = 'https://jlfbmawoyiwzvzklngxr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmJtYXdveWl3enZ6a2xuZ3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDI0OTMsImV4cCI6MjA4OTUxODQ5M30.JuMbxTyAhujTB4RqPiKbn5d4pxqK67EO_CTBj1xwt9o';

let supabaseClient = null;

/**
 * Initialize or return the existing Supabase client
 */
async function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase library not loaded. Check your <script> tags.');
        return null;
    }
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

/**
 * Common Auth: Check if user is logged in
 */
async function requireAuth() {
    const client = await initSupabase();
    const { data: { user }, error } = await client.auth.getUser();
    
    if (error || !user) {
        window.location.href = '/login.html';
        return null;
    }

    const { data: profile } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    return { user, profile };
}

/**
 * Common Auth: Logout
 */
async function handleLogout() {
    const client = await initSupabase();
    await client.auth.signOut();
    localStorage.clear();
    window.location.href = '/login.html';
}

// Make globally available
window.initSupabase = initSupabase;
window.requireAuth = requireAuth;
window.handleLogout = handleLogout;
