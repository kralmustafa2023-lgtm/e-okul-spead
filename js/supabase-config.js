/**
 * Supabase İstemci Yapılandırması ve Yardımcı Fonksiyonlar
 * e-Okul Spead v7.0
 */

const SUPABASE_URL = 'https://kfeqmwebswkqqekzkjca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kd_CkW32m0gfXBaQJ2qaxw_58_8XI8M';

// Supabase İstemcisi
let supabaseClient = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error('Supabase kütüphanesi yüklenemedi!');
}

window.db = {
  client: supabaseClient,

  // Aktif kullanıcıyı al
  async getCurrentUser() {
    if (!supabaseClient) return null;
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return null;

    // Profil bilgilerini al (rol ve is_active)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      ...user,
      profile: profile || { role: 'user', is_active: 0 }
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

    // Profil kaydı tetikleyici ile gelmediyse elle ekle/güncelle
    if (data.user) {
      try {
        await supabaseClient.from('profiles').upsert({
          id: data.user.id,
          email: email,
          full_name: fullName || email.split('@')[0],
          role: 'user',
          is_active: 0 // Varsayılan kapalı
        });
      } catch (e) {
        console.warn('Profil upsert hatası:', e);
      }
    }

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
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/panel.html'
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
    
    // Giriş yapılmamışsa ana tanıtım & giriş sayfasına at
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
