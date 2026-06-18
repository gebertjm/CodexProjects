(function applySiteConfig() {
  const config = window.DailyTTRPGConfig || {};
  const supportEmail = config.supportEmail || 'dailyttrpg@gmail.com';
  const currentYear = new Date().getFullYear();

  document.querySelectorAll('.config-email').forEach((node) => {
    node.textContent = supportEmail;
    node.setAttribute('href', `mailto:${supportEmail}`);
  });

  document.querySelectorAll('#copyright-year').forEach((node) => {
    node.textContent = String(currentYear);
  });
})();
