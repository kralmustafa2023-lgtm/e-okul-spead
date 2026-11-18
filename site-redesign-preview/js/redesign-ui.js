(() => {
  const menuButton = document.getElementById('mobile-nav-toggle');
  const navigation = document.getElementById('main-navigation');

  if (menuButton && navigation) {
    const menuIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const closeIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

    function setMenuOpen(open) {
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
      menuButton.innerHTML = open ? closeIcon : menuIcon;
      navigation.classList.toggle('is-open', open);
    }

    menuButton.addEventListener('click', () => {
      setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    navigation.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setMenuOpen(false));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false);
        menuButton.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900 && menuButton.getAttribute('aria-expanded') === 'true') setMenuOpen(false);
    }, { passive: true });
  }

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input) return;
    button.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Gizle' : 'Göster';
      button.setAttribute('aria-label', reveal ? 'Şifreyi gizle' : 'Şifreyi göster');
      button.setAttribute('aria-pressed', String(reveal));
    });
  });

  const authTabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
  authTabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % authTabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + authTabs.length) % authTabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = authTabs.length - 1;
      const nextTab = authTabs[nextIndex];
      window.switchAuthTab(nextTab.id === 'tab-login' ? 'login' : 'register');
      nextTab.focus();
    });
  });

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const sections = document.querySelectorAll('#istatistikler, #tanitim-rehberi, #ogretmen-yorumlari, #guvenlik');
    if (sections.length) {
      document.body.classList.add('reveal-ready');
      const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('reveal-section', 'is-visible');
          currentObserver.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
      sections.forEach((section) => {
        section.classList.add('reveal-section');
        observer.observe(section);
      });
    }
  }
})();
