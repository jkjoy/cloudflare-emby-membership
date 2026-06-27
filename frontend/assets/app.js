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