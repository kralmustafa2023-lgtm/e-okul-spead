/**
 * Supabase İstemci Yapılandırması ve Yardımcı Fonksiyonlar
 * e-Okul Spead v7.1 - OAuth ve Session Düzeltmeleri
 */

const SUPABASE_URL = 'https://kfeqmwebswkqqekzkjca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kd_CkW32m0gfXBaQJ2qaxw_58_8XI8M';

// Supabase İstemcisi
let supabaseClient = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  console.error('Supabase kütüphanesi yüklenemedi!');
}

window.db = {
  client: supabaseClient,

  // Aktif kullanıcıyı al (OAuth hash/token bekleme garantili)
  async getCurrentUser() {
    if (!supabaseClient) return null;

    // 1. Önce aktif oturumu kontrol et
    let { data: { session } } = await supabaseClient.auth.getSession();

    // Eğer URL'de token varsa ama session henüz oturmadıysa kısa bir süre bekle
    if (!session && (window.location.hash.includes('access_token') || window.location.search.includes('code='))) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 300));
        const res = await supabaseClient.auth.getSession();
        if (res.data && res.data.session) {
          session = res.data.session;
          break;
        }
      }
    }

    if (!session || !session.user) return null;
    const user = session.user;

    // 2. Profil bilgilerini çek
    let { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // Eğer sen giriş yaptıysan otomatik admin ve aktif ol
    const isAdminEmail = user.email === 'kralmustafa2023@gmail.com';

    // Profil yoksa otomatik oluştur
    if (!profile) {
      const defaultRole = isAdminEmail ? 'admin' : 'user';
      const defaultActive = isAdminEmail ? 1 : 0;
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];

      try {
        const { data: newProfile } = await supabaseClient
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: fullName,
            role: defaultRole,
            is_active: defaultActive
          })
          .select()
          .maybeSingle();

        profile = newProfile || { role: defaultRole, is_active: defaultActive, full_name: fullName };
      } catch (e) {
        console.warn('Profil otomatik oluşturma hatası:', e);
        profile = { role: defaultRole, is_active: defaultActive, full_name: fullName };
      }
    } else if (isAdminEmail && (profile.role !== 'admin' || profile.is_active !== 1)) {
      // Eğer kendi mailinse ve admin değilse anında güncelle
      profile.role = 'admin';
      profile.is_active = 1;
      await supabaseClient.from('profiles').update({ role: 'admin', is_active: 1 }).eq('id', user.id);
    }

    return {
      ...user,
      profile: profile || { role: isAdminEmail ? 'admin' : 'user', is_active: isAdminEmail ? 1 : 0 }
    };
  },

  // E-posta & Şifre ile Kayıt Ol
  async signUp(email, password, fullName) {
    if (!supabaseClient) throw new Error('Supabase hazır değil');
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) throw error;
    return data;
  },

  // E-posta & Şifre ile Giriş
  async signIn(email, password) {
    if (!supabaseClient) throw new Error('Supabase hazır değil');
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  // Google ile Giriş
  async signInWithGoogle() {
    if (!supabaseClient) throw new Error('Supabase hazır değil');
    const redirectUrl = window.location.origin + '/panel.html';
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) throw error;
    return data;
  },

  // Çıkış Yap
  async signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  },

  // Yetki Kontrolü (Sayfa Koruyucu)
  async authGuard(requiredRole = null) {
    const user = await this.getCurrentUser();
    
    // Giriş yapılmamışsa ana tanıtım & giriş sayfasına yönlendir
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }

    const isActive = user.profile ? user.profile.is_active : 0;
    const role = user.profile ? user.profile.role : 'user';

    // Eğer admin yetkisi isteniyorsa
    if (requiredRole === 'admin' && role !== 'admin') {
      window.location.href = 'panel.html';
      return null;
    }

    // Kullanıcının erişimi kapalıysa ve admin değilse bekleme sayfasına at
    if (isActive !== 1 && role !== 'admin') {
      window.location.href = 'bekleme.html';
      return null;
    }

    return user;
  }
};
