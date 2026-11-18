/**
 * Firebase İstemci Yapılandırması ve Kimlik Doğrulama / Veri Tabanı Yöneticisi
 * e-Okul Spead v8.0 - Firebase Migration
 */

const firebaseConfig = {
  apiKey: "AIzaSyC5kSjDBvXW3bl5A-3GF6fGgfX_Ve_Yr6s",
  authDomain: "kimyalab-d5009.firebaseapp.com",
  projectId: "kimyalab-d5009",
  storageBucket: "kimyalab-d5009.firebasestorage.app",
  messagingSenderId: "701793426061",
  appId: "1:701793426061:web:043730d107231736df60c4"
};

// Firebase Başlat
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
const firestore = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// Admin e-posta kontrolü
function checkIsAdmin(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower === 'kralmustafa2023@gmail.com' || lower.includes('kralmustafa');
}

window.db = {
  auth: auth,
  firestore: firestore,

  // 1. Aktif Kullanıcıyı ve Profilini Getir
  getCurrentUser() {
    return new Promise((resolve) => {
      if (!auth) {
        resolve(null);
        return;
      }

      // Oturum durumunu dinle
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        unsubscribe();
        if (!user) {
          resolve(null);
          return;
        }

        const isAdmin = checkIsAdmin(user.email);
        let profile = null;

        if (firestore) {
          try {
            const docRef = firestore.collection('profiles').doc(user.uid);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
              profile = docSnap.data();
            } else {
              // Profil yoksa otomatik oluştur
              profile = {
                id: user.uid,
                email: user.email,
                full_name: user.displayName || user.email.split('@')[0],
                role: isAdmin ? 'admin' : 'user',
                is_active: isAdmin ? 1 : 0,
                created_at: new Date().toISOString()
              };
              await docRef.set(profile);
            }
          } catch (err) {
            console.warn('Firestore profil okuma hatası:', err);
            // Hata olsa bile oturumu bozma
            profile = {
              id: user.uid,
              email: user.email,
              full_name: user.displayName || user.email.split('@')[0],
              role: isAdmin ? 'admin' : 'user',
              is_active: isAdmin ? 1 : 0,
              created_at: new Date().toISOString()
            };
          }

          // Admin kullanıcısı ise her zaman aktif ve admin yap
          if (isAdmin && profile && (profile.role !== 'admin' || profile.is_active !== 1)) {
            profile.role = 'admin';
            profile.is_active = 1;
            try {
              await firestore.collection('profiles').doc(user.uid).update({
                role: 'admin',
                is_active: 1
              });
            } catch (e) {}
          }
        } else {
          profile = {
            id: user.uid,
            email: user.email,
            full_name: user.displayName || user.email.split('@')[0],
            role: isAdmin ? 'admin' : 'user',
            is_active: isAdmin ? 1 : 0,
            created_at: new Date().toISOString()
          };
        }

        resolve({
          uid: user.uid,
          id: user.uid,
          email: user.email,
          displayName: user.displayName,
          profile: profile
        });
      });
    });
  },

  // 2. E-posta & Şifre ile Kayıt Ol
  async signUp(email, password, fullName) {
    if (!auth) throw new Error('Firebase hazır değil');
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;

    if (fullName && user.updateProfile) {
      try {
        await user.updateProfile({ displayName: fullName });
      } catch (e) {}
    }

    const isAdmin = checkIsAdmin(email);
    const profile = {
      id: user.uid,
      email: email,
      full_name: fullName || email.split('@')[0],
      role: isAdmin ? 'admin' : 'user',
      is_active: isAdmin ? 1 : 0,
      created_at: new Date().toISOString()
    };

    if (firestore) {
      try {
        await firestore.collection('profiles').doc(user.uid).set(profile);
      } catch (err) {
        console.warn('Firestore kayıt hatası:', err);
      }
    }

    return cred;
  },

  // 3. E-posta & Şifre ile Giriş Yap
  async signIn(email, password) {
    if (!auth) throw new Error('Firebase hazır değil');
    return await auth.signInWithEmailAndPassword(email, password);
  },

  // 4. Google ile Giriş Yap (Popup ile anında, sorunsuz bağlantı)
  async signInWithGoogle() {
    if (!auth) throw new Error('Firebase hazır değil');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      // Modern popup akışı: Sıfır yönlendirme, sıfır kod takas hatası!
      const result = await auth.signInWithPopup(provider);
      return result;
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        // Eğer tarayıcı popup engellerse yönlendirmeli dene
        return await auth.signInWithRedirect(provider);
      }
      throw error;
    }
  },

  // 5. Çıkış Yap
  async signOut() {
    if (!auth) return;
    await auth.signOut();
    window.location.href = 'index.html';
  },

  // 6. Sayfa Güvenlik Guard'ı
  async authGuard(requiredRole = null) {
    const user = await this.getCurrentUser();
    
    // Giriş yapılmamışsa ana tanıtım & giriş sayfasına yönlendir
    if (!user) {
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

    // Erişim kapalıysa bekleme sayfasına yönlendir
    if (isActive !== 1 && role !== 'admin') {
      window.location.href = 'bekleme.html';
      return null;
    }

    return user;
  },

  // 7. Admin Paneli İçin: Tüm Kullanıcıları Getir
  async getAllProfiles() {
    if (!firestore) return [];
    try {
      const snap = await firestore.collection('profiles').get();
      const list = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      // Tarihe göre sırala (en yeni en üstte)
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return list;
    } catch (err) {
      console.error('Kullanıcı listesi getirme hatası:', err);
      return [];
    }
  },

  // 8. Admin Paneli İçin: Kullanıcı Erişimini Aç/Kapat (1 veya 0)
  async updateProfileAccess(userId, newStatus) {
    if (!firestore) throw new Error('Firestore hazır değil');
    await firestore.collection('profiles').doc(userId).update({
      is_active: newStatus
    });
  },

  // 9. Admin Paneli İçin: Kullanıcı Profilini Sil
  async deleteProfile(userId) {
    if (!firestore) throw new Error('Firestore hazır değil');
    await firestore.collection('profiles').doc(userId).delete();
    return true;
  },

  // 10. Şifre Sıfırlama E-postası Gönder
  async resetPassword(email) {
    if (!auth) throw new Error('Firebase hazır değil');
    await auth.sendPasswordResetEmail(email);
    return true;
  },

  // 11. Aktif Kullanıcıya Şifre Belirle / Değiştir
  async setPasswordForCurrentUser(newPassword) {
    if (!auth || !auth.currentUser) throw new Error('Oturum açık değil. Lütfen önce giriş yapın.');
    if (!newPassword || newPassword.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır.');
    await auth.currentUser.updatePassword(newPassword);
    return true;
  }
};
