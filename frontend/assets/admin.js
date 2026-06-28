var currentUser = null;

    async function initAdmin() {
      try {
        currentUser = await checkAuth();
        if (!currentUser) { window.location.href = '/login.html'; return; }
        try {
          await API.get('/api/admin/config');
        } catch {
          showUnauthorized();
          return;
        }
        document.body.classList.add('logged-in');
        loadDashboard();
        loadCards();
        loadUsers();
        loadConfig();
      } catch {
        window.location.href = '/login.html';
      }
    }

    function showUnauthorized() {
      var main = document.getElementById('mainContent');
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.add('hidden');
      main.innerHTML = '<div class="unauthorized-overlay unauthorized-overlay-inline">' +
        '<div class="icon">&#x1F6AB;</div>' +
        '<h2>无权访问</h2>' +
        '<p>您没有管理员权限，无法访问此页面</p>' +
        '<button class="btn" id="unauthorized-back-btn">返回会员中心</button></div>';
      document.getElementById('unauthorized-back-btn').addEventListener('click', function() { window.location.href = '/dashboard.html'; });
    }

    function goFront() {
      window.location.href = '/dashboard.html';
    }

    document.querySelectorAll('.nav-item[data-panel]').forEach(function(item) {
      item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
        item.classList.add('active');
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('panel-' + item.dataset.panel).classList.add('active');
        document.getElementById('sidebar').classList.remove('open');
      });
    });

    document.getElementById('menuToggle').addEventListener('click', function() {
      document.getElementById('sidebar').classList.toggle('open');
    });

    async function loadDashboard() {
      try {
        var overview = await API.get('/api/admin/overview');
        var stats = overview.stats || {};
        document.getElementById('stat-users').textContent = stats.users ?? '-';
        document.getElementById('stat-members').textContent = stats.members ?? '-';
        document.getElementById('stat-cards').textContent = stats.cards ?? '-';
        document.getElementById('stat-used-cards').textContent = stats.usedCards ?? '-';
        var emby = stats.emby || {};
        document.getElementById('stat-emby-movies').textContent = emby.error ? '错误' : (emby.movieCount ?? '-');
        document.getElementById('stat-emby-series').textContent = emby.error ? '错误' : (emby.seriesCount ?? '-');
        document.getElementById('stat-emby-episodes').textContent = emby.error ? '错误' : (emby.episodeCount ?? '-');
      } catch (e) {
        console.error('Failed to load dashboard', e);
      }
    }

    var cardFilterStatus = '';
    var generatedCodes = [];

    async function loadCards() {
      try {
        var params = cardFilterStatus ? '?status=' + cardFilterStatus : '';
        var data = await API.get('/api/admin/card/list' + params);
        var cards = data.cards || data.data || [];
        var tbody = document.getElementById('card-table-body');
        if (cards.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">&#x1F4ED;</div>暂无数据</div></td></tr>';
          return;
        }
        tbody.innerHTML = cards.map(function(c) {
          var statusBadge = c.status === 'active' ? '<span class="badge badge-active">未使用</span>' :
            c.status === 'used' ? '<span class="badge badge-used">已使用</span>' :
            '<span class="badge badge-disabled">已禁用</span>';
          var actionBtn = c.status === 'active' ?
            '<button class="btn btn-sm btn-danger disable-card-btn" data-card-id="' + c.id + '">禁用</button>' : '--';
          return '<tr><td>' + c.id + '</td><td><span class="code-text">' + escapeHTML(c.code) + '</span></td><td>' +
            c.days + ' 天</td><td>' + statusBadge + '</td><td>' + escapeHTML(c.usedBy || c.used_by || '--') + '</td><td>' +
            escapeHTML(c.createdAt || c.created_at || '--') + '</td><td>' + actionBtn + '</td></tr>';
        }).join('');
        document.querySelectorAll('.disable-card-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { disableCard(parseInt(btn.dataset.cardId)); });
        });
      } catch (e) {
        console.error('Failed to load cards', e);
      }
    }

    async function disableCard(id) {
      if (!confirm('确定要禁用此卡密吗？')) return;
      try {
        await API.post('/api/admin/card/disable', { id: id });
        showToast('已禁用', 'success');
        loadCards();
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    document.querySelectorAll('#card-filters .filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#card-filters .filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        cardFilterStatus = btn.dataset.status;
        loadCards();
      });
    });

    document.getElementById('gen-btn').addEventListener('click', async function() {
      var days = parseInt(document.getElementById('gen-days').value);
      var count = parseInt(document.getElementById('gen-count').value);
      if (!days || days < 1) { showToast('请输入有效的天数', 'error'); return; }
      if (!count || count < 1 || count > 100) { showToast('数量范围为 1-100', 'error'); return; }
      this.disabled = true;
      this.textContent = '生成中...';
      try {
        var data = await API.post('/api/admin/card/generate', { days: days, count: count });
        generatedCodes = data.cards || data.data || [];
        document.getElementById('codes-preview').textContent = generatedCodes.map(function(c) { return c.code || c; }).join('\n');
        document.getElementById('gen-result').classList.remove('hidden');
        showToast('成功生成 ' + generatedCodes.length + ' 个卡密', 'success');
        loadCards();
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '生成卡密';
      }
    });

    document.getElementById('copy-all-btn').addEventListener('click', function() {
      var text = generatedCodes.map(function(c) { return c.code || c; }).join('\n');
      navigator.clipboard.writeText(text).then(function() {
        showToast('已复制全部卡密', 'success');
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制全部卡密', 'success');
      });
    });

    async function loadUsers() {
      try {
        var data = await API.get('/api/admin/user/list');
        var users = data.users || data.data || [];
        var tbody = document.getElementById('user-table-body');
        if (users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">&#x1F4ED;</div>暂无数据</div></td></tr>';
          return;
        }
        tbody.innerHTML = users.map(function(u) {
          var memberBadge = (u.isMember || u.activeMembership)
            ? '<span class="badge badge-vip">&#x2705; 会员</span>'
            : '<span class="badge badge-novip">&#x274C; 非会员</span>';
          return '<tr class="user-row" data-user-id="' + u.id + '">' +
            '<td>' + u.id + '</td><td>' + escapeHTML(u.username) + '</td><td>' + escapeHTML(u.email || '--') + '</td>' +
            '<td>' + escapeHTML(u.embyBind || u.emby_username || u.emby_user_id || '未绑定') + '</td><td>' + memberBadge + '</td>' +
            '<td>' + escapeHTML(u.created_at || '--') + '</td></tr>' +
            '<tr class="detail-row" data-user-id="' + u.id + '"><td colspan="6"><div class="detail-inner">' +
            '<div id="user-detail-' + u.id + '"><div class="small-muted">加载中...</div></div>' +
            '<div class="detail-actions">' +
            '<input type="number" id="grant-days-' + u.id + '" class="grant-input" placeholder="天数" min="1">' +
            '<button class="btn btn-sm btn-success grant-days-btn" data-user-id="' + u.id + '">手动加天</button></div></div></td></tr>';
        }).join('');
        document.querySelectorAll('.user-row').forEach(function(row) {
          row.addEventListener('click', function() { toggleUserDetail(parseInt(row.dataset.userId), row); });
        });
        document.querySelectorAll('.grant-days-btn').forEach(function(btn) {
          btn.addEventListener('click', function(event) { event.stopPropagation(); grantDays(parseInt(btn.dataset.userId)); });
        });
      } catch (e) {
        console.error('Failed to load users', e);
      }
    }

    var openUserId = null;

    async function toggleUserDetail(userId, row) {
      var detailRow = document.querySelector('tr.detail-row[data-user-id="' + userId + '"]');
      if (!detailRow) return;
      if (openUserId === userId) {
        detailRow.classList.remove('open');
        openUserId = null;
        return;
      }
      document.querySelectorAll('.detail-row.open').forEach(function(r) { r.classList.remove('open'); });
      detailRow.classList.add('open');
      openUserId = userId;
      try {
        var data = await API.get('/api/admin/user/detail?id=' + userId);
        var user = data.user || data;
        var history = user.membershipHistory || user.history || [];
        var detailEl = document.getElementById('user-detail-' + userId);
        if (history.length === 0) {
          detailEl.innerHTML = '<div class="small-muted">暂无会员记录</div>';
        } else {
          var html = '<table class="mini-table mini-table-full"><thead><tr><th>日期</th><th>天数</th><th>来源</th><th>到期日</th></tr></thead><tbody>';
          history.slice(0, 10).forEach(function(h) {
            html += '<tr><td>' + escapeHTML(h.createdAt || h.date || '--') + '</td><td>' + escapeHTML(h.days || h.addedDays || '--') + ' 天</td><td>' + escapeHTML(h.source || h.reason || '--') + '</td><td>' + escapeHTML(h.expireDate || '--') + '</td></tr>';
          });
          html += '</tbody></table>';
          detailEl.innerHTML = html;
        }
      } catch (e) {
        document.getElementById('user-detail-' + userId).innerHTML = '<div class="error-small">加载失败: ' + escapeHTML(e.message) + '</div>';
      }
    }

    async function grantDays(userId) {
      var days = parseInt(document.getElementById('grant-days-' + userId).value);
      if (!days || days < 1) { showToast('请输入有效天数', 'error'); return; }
      try {
        await API.post('/api/admin/user/grant', { userId: userId, days: days });
        showToast('已为用户增加 ' + days + ' 天会员', 'success');
        document.getElementById('grant-days-' + userId).value = '';
        loadUsers();
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    async function loadConfig() {
      try {
        var data = await API.get('/api/admin/config');
        var cfg = data.config || data.data || {};
        if (cfg.emby_base_url || cfg.embyUrl) document.getElementById('cfg-emby-url').value = cfg.emby_base_url || cfg.embyUrl;
        if (cfg.emby_api_key || cfg.apiKey) document.getElementById('cfg-api-key').value = cfg.emby_api_key || cfg.apiKey;
        if (cfg.emby_server_lines) document.getElementById('cfg-server-lines').value = cfg.emby_server_lines;
        if (cfg.siteTitle) document.getElementById('cfg-site-title').value = cfg.siteTitle;
        if (cfg.siteBaseUrl) document.getElementById('cfg-site-base-url').value = cfg.siteBaseUrl;
        if (cfg.points_checkin_min) document.getElementById('cfg-checkin-min').value = cfg.points_checkin_min;
        if (cfg.points_checkin_max) document.getElementById('cfg-checkin-max').value = cfg.points_checkin_max;
        if (cfg.points_exchange_cost) document.getElementById('cfg-exchange-cost').value = cfg.points_exchange_cost;
        if (cfg.points_exchange_days) document.getElementById('cfg-exchange-days').value = cfg.points_exchange_days;
        if (cfg.points_invite_register) document.getElementById('cfg-invite-register').value = cfg.points_invite_register;
        if (cfg.points_invite_member) document.getElementById('cfg-invite-member').value = cfg.points_invite_member;
      } catch (e) {
        console.error('Failed to load config', e);
      }
    }

    document.getElementById('cfg-test-btn').addEventListener('click', async function() {
      var url = document.getElementById('cfg-emby-url').value.trim();
      var key = document.getElementById('cfg-api-key').value.trim();
      var lines = document.getElementById('cfg-server-lines').value.trim();
      if (!url || !key) { showToast('请填写 Emby 地址和 API Key', 'error'); return; }
      this.disabled = true;
      this.textContent = '测试中...';
      var resultEl = document.getElementById('cfg-test-result');
      resultEl.textContent = '';
      try {
        await API.post('/api/admin/config', { emby_base_url: url, emby_api_key: key, emby_server_lines: lines });
        resultEl.innerHTML = '<span class="success-text">&#x2705; 配置已保存（后端将自行验证连接）</span>';
        showToast('配置已保存', 'success');
      } catch (e) {
        resultEl.innerHTML = '<span class="error-text">&#x274C; 保存失败: ' + escapeHTML(e.message) + '</span>';
      } finally {
        this.disabled = false;
        this.textContent = '测试连接';
      }
    });

    document.getElementById('cfg-save-btn').addEventListener('click', async function() {
      var url = document.getElementById('cfg-emby-url').value.trim();
      var key = document.getElementById('cfg-api-key').value.trim();
      var lines = document.getElementById('cfg-server-lines').value.trim();
      this.disabled = true;
      this.textContent = '保存中...';
      try {
        await API.post('/api/admin/config', { emby_base_url: url, emby_api_key: key, emby_server_lines: lines });
        showToast('配置已保存', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '保存配置';
      }
    });

    document.getElementById('cfg-title-btn').addEventListener('click', async function() {
      var title = document.getElementById('cfg-site-title').value.trim();
      var siteBaseUrl = document.getElementById('cfg-site-base-url').value.trim();
      this.disabled = true;
      this.textContent = '保存中...';
      try {
        await API.post('/api/admin/config', { siteTitle: title, siteBaseUrl: siteBaseUrl });
        showToast('网站设置已更新', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '保存网站设置';
      }
    });

    document.getElementById('cfg-points-btn').addEventListener('click', async function() {
      var payload = {
        points_checkin_min: document.getElementById('cfg-checkin-min').value.trim(),
        points_checkin_max: document.getElementById('cfg-checkin-max').value.trim(),
        points_exchange_cost: document.getElementById('cfg-exchange-cost').value.trim(),
        points_exchange_days: document.getElementById('cfg-exchange-days').value.trim(),
        points_invite_register: document.getElementById('cfg-invite-register').value.trim(),
        points_invite_member: document.getElementById('cfg-invite-member').value.trim(),
      };
      this.disabled = true;
      this.textContent = '保存中...';
      try {
        await API.post('/api/admin/config', payload);
        showToast('积分设置已保存', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '保存积分设置';
      }
    });

    document.getElementById('go-front-btn').addEventListener('click', goFront);

    initAdmin();
