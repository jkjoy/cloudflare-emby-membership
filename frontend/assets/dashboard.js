var currentUser = null;
    var latestServerLines = [];

    async function init() {
      try {
        currentUser = await checkAuth();
        if (!currentUser) {
          window.location.href = '/login';
          return;
        }
        // 管理员也可以停留在前台会员中心；需要进后台时手动点击按钮
        if (document.getElementById('admin-btn')) {
          document.getElementById('admin-btn').classList.toggle('hidden', currentUser.role !== 'admin');
        }
        await loadMemberStatus();
      } catch (e) {
        window.location.href = '/login';
      }
    }

    async function loadMemberStatus() {
      try {
        var data = await API.get('/api/member/status');
        var statusEl = document.getElementById('status-label');
        var expireEl = document.getElementById('expire-label');
        var daysEl = document.getElementById('days-label');
        var vipEl = document.getElementById('vip-status');
        var iconEl = document.getElementById('vip-icon');
        latestServerLines = data.serverLines || [];

        if (data.ok && data.isActive && data.activeMembership) {
          var m = data.activeMembership;
          statusEl.textContent = '✅ 已开通';
          statusEl.className = 'value active';
          expireEl.textContent = m.expireDate || '--';
          iconEl.textContent = '🌟';
          var expire = new Date(m.expireDate);
          var now = new Date();
          var diff = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));
          daysEl.textContent = diff > 0 ? diff + ' 天' : '已过期';
          daysEl.className = diff > 0 ? 'value active' : 'value inactive';
          if (vipEl) {
            vipEl.textContent = 'VIP 至 ' + m.expireDate;
            vipEl.className = 'vip-badge active';
          }
          // 有会员 -> 判断是否已激活 Emby
          if (currentUser && currentUser.emby_user_id) {
            showEmbyInfo(currentUser, { serverLines: latestServerLines });
          } else {
            showActivateForm();
          }
        } else {
          statusEl.textContent = '❌ 未开通';
          statusEl.className = 'value inactive';
          expireEl.textContent = '--';
          daysEl.textContent = '--';
          iconEl.textContent = '💎';
          if (vipEl) {
            vipEl.textContent = '未开通会员';
            vipEl.className = 'vip-badge inactive';
          }
          // 没会员：显示兑换区，隐藏其他
          showRedeemOnly();
        }

        // 加载历史
        var history = data.history || [];
        var tbody = document.getElementById('history-body');
        if (history.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="icon">📭</div>暂无使用记录</div></td></tr>';
        } else {
          tbody.innerHTML = history.slice(0, 20).map(function(h) {
            return '<tr><td>' + escapeHTML(h.created_at || '--') + '</td><td>' + h.days_added + ' 天</td><td>' + escapeHTML(h.source || '--') + '</td><td>' + escapeHTML(h.expire_date || '--') + '</td></tr>';
          }).join('');
        }
      } catch (e) {
        console.error('loadMemberStatus error', e);
      }
    }

    function showRedeemOnly() {
      document.getElementById('activate-section').classList.add('hidden');
      document.getElementById('emby-info-section').classList.add('hidden');
      document.getElementById('redeem-section').classList.remove('hidden');
    }

    function showActivateForm() {
      document.getElementById('activate-section').classList.remove('hidden');
      document.getElementById('emby-info-section').classList.add('hidden');
      document.getElementById('redeem-section').classList.add('hidden');
    }

    function renderServerLines(lines) {
      if (!lines || !lines.length) return '<div class="info-row"><span class="info-label">服务器线路</span><span class="info-value">联系管理员获取</span></div>';
      return lines.map(function(line) {
        return '<div class="info-row"><span class="info-label">' + escapeHTML(line.name || '线路') + '</span><span class="info-value">' + escapeHTML(line.url || '--') + '</span></div>';
      }).join('');
    }

    function showEmbyInfo(user, loginInfo) {
      document.getElementById('activate-section').classList.add('hidden');
      document.getElementById('emby-info-section').classList.remove('hidden');
      document.getElementById('redeem-section').classList.add('hidden');
      var username = (loginInfo && loginInfo.username) || user.emby_username || '--';
      var passwordHtml = loginInfo && loginInfo.password
        ? '<div class="info-row"><span class="info-label">登录密码</span><span class="info-value">' + escapeHTML(loginInfo.password) + '</span></div>'
        : '<div class="info-row"><span class="info-label">登录密码</span><span class="info-value">已激活后不再显示，请使用激活时保存的密码</span></div>';
      var tip = loginInfo && loginInfo.password
        ? '<div class="password-tip">⚠️ 密码仅本次显示，请立即复制保存。</div>'
        : '';
      document.getElementById('emby-info-content').innerHTML =
        '<div class="info-row"><span class="info-label">用户名</span><span class="info-value">' + escapeHTML(username) + '</span></div>' +
        passwordHtml +
        '<div class="server-lines-title">服务器线路</div>' +
        renderServerLines(loginInfo && loginInfo.serverLines) +
        '<div class="info-row"><span class="info-label">状态</span><span class="info-value success-inline">已激活 ✅</span></div>' +
        '<div class="reset-action"><button class="btn btn-outline" id="reset-emby-password-btn">重置 Emby 密码</button><div id="reset-emby-password-result" class="result-space"></div></div>' + tip;
      bindResetEmbyPassword();
    }

    function bindResetEmbyPassword() {
      var btn = document.getElementById('reset-emby-password-btn');
      if (!btn) return;
      btn.addEventListener('click', async function() {
        if (!confirm('确定要重置 Emby 密码吗？新密码只会显示一次，请及时保存。')) return;
        var resultEl = document.getElementById('reset-emby-password-result');
        resultEl.innerHTML = '';
        this.disabled = true;
        this.textContent = '重置中...';
        try {
          var data = await API.post('/api/emby/reset-password', {});
          resultEl.innerHTML = '<div class="result-success">✅ 新 Emby 密码：<span class="info-value">' + escapeHTML(data.data.password) + '</span><br><span class="warn-inline">仅本次显示，请立即复制保存。</span></div>';
          showToast('Emby 密码已重置', 'success');
        } catch (e) {
          resultEl.innerHTML = '<div class="result-error">❌ ' + escapeHTML(e.message) + '</div>';
        } finally {
          this.disabled = false;
          this.textContent = '重置 Emby 密码';
        }
      });
    }

    // 兑换卡密
    document.getElementById('redeem-btn').addEventListener('click', async function() {
      var code = document.getElementById('code-input').value.trim();
      if (!code) { showToast('请输入卡密', 'error'); return; }
      this.disabled = true;
      this.textContent = '兑换中...';
      try {
        var data = await API.post('/api/card/redeem', { code: code });
        showToast(data.message || '兑换成功', 'success');
        document.getElementById('code-input').value = '';
        // 刷新状态
        currentUser = await checkAuth();
        await loadMemberStatus();
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '兑 换';
      }
    });

    // 回车兑换
    document.getElementById('code-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('redeem-btn').click();
    });

    document.getElementById('admin-btn').addEventListener('click', function() {
      window.location.href = '/admin';
    });

    document.getElementById('change-password-btn').addEventListener('click', async function() {
      var oldPassword = document.getElementById('old-password').value;
      var newPassword = document.getElementById('new-password').value;
      var resultEl = document.getElementById('change-password-result');
      resultEl.innerHTML = '';
      if (!oldPassword || !newPassword || newPassword.length < 6) {
        resultEl.innerHTML = '<div class="result-error">请填写旧密码，新密码至少 6 位</div>';
        return;
      }
      this.disabled = true;
      this.textContent = '修改中...';
      try {
        var data = await API.post('/api/user/change-password', { oldPassword: oldPassword, newPassword: newPassword });
        resultEl.innerHTML = '<div class="result-success">✅ ' + escapeHTML(data.message || '密码修改成功') + '</div>';
        document.getElementById('old-password').value = '';
        document.getElementById('new-password').value = '';
        showToast('密码修改成功', 'success');
      } catch (e) {
        resultEl.innerHTML = '<div class="result-error">❌ ' + escapeHTML(e.message) + '</div>';
      } finally {
        this.disabled = false;
        this.textContent = '修改密码';
      }
    });

    // 激活 Emby 账号
    document.getElementById('activate-btn').addEventListener('click', async function() {
      var resultEl = document.getElementById('activate-result');
      resultEl.innerHTML = '';
      this.disabled = true;
      this.textContent = '激活中...';
      try {
        var data = await API.post('/api/emby/create-account', {});
        resultEl.innerHTML = '<div class="activation-success">✅ ' + escapeHTML(data.message) + '</div>';
        showToast('账号激活成功！请保存登录信息', 'success');
        currentUser = await checkAuth();
        showEmbyInfo(currentUser || {}, data.data || {});
      } catch (e) {
        resultEl.innerHTML = '<div class="result-error">❌ ' + escapeHTML(e.message) + '</div>';
      } finally {
        this.disabled = false;
        this.textContent = '激活账号';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', logout);

    // 退出登录
    async function logout() {
      try { await API.post('/api/auth/logout'); } catch {}
      window.location.href = '/login';
    }

    init();
