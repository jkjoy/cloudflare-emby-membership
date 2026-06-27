// frontend/assets/app.js — 前端 API 客户端和工具
const API = {
  async request(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || '请求失败');
    return data;
  },
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); },
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch];
  });
}

async function loadSiteConfig() {
  try {
    const data = await API.get('/api/site/config');
    const siteTitle = data.siteTitle || 'Emby 会员中心';
    document.title = document.title.includes('管理后台') ? siteTitle + ' - 管理后台' :
      document.title.includes('登录') ? siteTitle + ' - 登录' : siteTitle;
    document.querySelectorAll('.logo').forEach(function(el) {
      if (el.textContent.includes('管理')) el.innerHTML = siteTitle + ' <span>管理</span>';
      else el.innerHTML = siteTitle;
    });
  } catch (e) {
    console.warn('Failed to load site config', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSiteConfig);
} else {
  loadSiteConfig();
}

// 通用 toast 提示
function showToast(message, type = 'info') {
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// 检查登录状态并更新 UI
async function checkAuth() {
  try {
    const data = await API.get('/api/user/info');
    if (data.ok && data.user) {
      document.body.classList.add('logged-in');
      // VIP 标记
      const vipEl = document.getElementById('vip-status');
      if (vipEl && data.user.activeMembership) {
        vipEl.textContent = `VIP 至 ${data.user.activeMembership.expireDate}`;
        vipEl.className = 'vip-badge active';
      } else if (vipEl) {
        vipEl.textContent = '未开通会员';
        vipEl.className = 'vip-badge inactive';
      }
      return data.user;
    }
  } catch {}
  document.body.classList.remove('logged-in');
  return null;
}