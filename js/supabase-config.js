/**
 * Supabase İstemci Yapılandırması ve Yardımcı Fonksiyonlar
 * e-Okul Spead v7.2 - Kesin Çözüm: OAuth / PKCE Senkronizasyonu
 */

const SUPABASE_URL = 'https://kfeqmwebswkqqekzkjca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kd_CkW32m0gfXBaQJ2qaxw_58_8XI8M';

let supabaseClient = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });
} else {
  console.error('Supabase kütüphanesi yüklenemedi!');
}

window.db = {
  client: supabaseClient,

  // 1. Oturumu (Session) her türlü OAuth parametresini bekleyerek al
  async getSession() {
    if (!supabaseClient) return null;

    // A) URL'de Google PKCE 'code' parametresi var mı?
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      try {
        console.log('Google OAuth code parametresi bulundu, token ile takas ediliyor...');
        const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (!error && data?.session) {
          // Temiz URL'e geç (?code=... kısmını temizle)
          window.history.replaceState({}, document.title, window.location.pathname);
          return data.session;
        }
      } catch (e) {
        console.warn('Code exchange hatası:', e);
      }
    }

    // B) Mevcut kayıtlı session'ı kontrol et
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) return session;

    // C) Eğer URL'de token/hash varsa veya takas devam ediyorsa onAuthStateChange ile bekle
    const hasAuthParams = window.location.hash.includes('access_token') || 
                          window.location.search.includes('code=');

    if (hasAuthParams) {
      console.log('OAuth oturumu kuruluyor, bekleniyor...');
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve(null);
        }, 4000);

        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, s) => {
          if (s) {
            clearTimeout(timer);
            subscription.unsubscribe();
            window.history.replaceState({}, document.title, window.location.pathname);
            resolve(s);
          }
        });
      });
    }

    return null;
  },

  // 2. Aktif kullanıcı ve profil bilgilerini al
  async getCurrentUser() {
    if (!supabaseClient) return null;

    const session = await this.getSession();
    if (!session || !session.user) return null;

    const user = session.user;
    const isAdminEmail = user.email && (
      user.email.toLowerCase().includes('kralmustafa') || 
      user.email === 'kralmustafa2023@gmail.com'
    );

    // Profil tablosundan veriyi çek
    let profile = null;
    try {
      const { data } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
    } catch (err) {
      console.warn('Profil çekilemedi:', err);
    }

    // Profil henüz yoksa otomatik oluştur
    if (!profile) {
      const role = isAdminEmail ? 'admin' : 'user';
      const isActive = isAdminEmail ? 1 : 0;
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];

      try {
        const { data: newProfile } = await supabaseClient
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: fullName,
            role: role,
            is_active: isActive
          })
          .select()
          .maybeSingle();

        profile = newProfile || { role, is_active: isActive, full_name: fullName };
      } catch (e) {
        profile = { role, is_active: isActive, full_name: fullName };
      }
    } else if (isAdminEmail && (profile.role !== 'admin' || profile.is_active !== 1)) {
      // Admin e-postası ise her zaman aktif ve admin yap
      profile.role = 'admin';
      profile.is_active = 1;
      try {
        await supabaseClient.from('profiles').update({ role: 'admin', is_active: 1 }).eq('id', user.id);
      } catch(e) {}
    }

    return {
      ...user,
      profile: profile || { role: isAdminEmail ? 'admin' : 'user', is_active: isAdminEmail ? 1 : 0 }
    };
  },

  // 3. E-posta & Şifre ile Kayıt Ol
  async signUp(email, password, fullName) {
    if (!supabaseClient) throw new Error('Supabase hazır değil');
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) throw error;
    return data;
  },

  // 4. E-posta & Şifre ile Giriş
  async signIn(email, password) {
    if (!supabaseClient) throw new Error('Supabase hazır değil');
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  // 5. Google ile Giriş
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

  // 6. Çıkış Yap
  async signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  },

  // 7. Sayfa Yetki Koruyucu (authGuard)
  async authGuard(requiredRole = null) {
    const user = await this.getCurrentUser();
    
    // Oturum yoksa login/tanıtım sayfasına yönlendir
    if (!user) {
      // Eğer URL'de hala işlenmekte olan OAuth kodu varsa yönlendirme yapma
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token')) {
        return null;
      }
      window.location.href = 'index.html';
      return null;
    }

    const isActive = user.profile ? user.profile.is_active : 0;
    const role = user.profile ? user.profile.role : 'user';

    // Admin sayfası kontrolü
    if (requiredRole === 'admin' && role !== 'admin') {
      window.location.href = 'panel.html';
      return null;
    }

    // Erişim izni kapalıysa bekleme sayfasına yönlendir
    if (isActive !== 1 && role !== 'admin') {
      window.location.href = 'bekleme.html';
      return null;
    }

    return user;
  }
};
