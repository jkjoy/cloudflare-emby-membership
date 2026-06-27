// Tab 切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('form-' + tab.dataset.tab).classList.add('active');
        document.querySelectorAll('.error-msg').forEach(e => e.style.display = 'none');
      });
    });

    // 登录
    document.getElementById('login-btn').addEventListener('click', async function() {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      if (!username || !password) {
        errorEl.textContent = '请填写用户名和密码';
        errorEl.style.display = 'block';
        return;
      }
      this.disabled = true;
      this.textContent = '登录中...';
      try {
        await API.post('/api/auth/login', { username, password });
        showToast('登录成功', 'success');
        setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      } finally {
        this.disabled = false;
        this.textContent = '登 录';
      }
    });

    // 注册
    document.getElementById('reg-btn').addEventListener('click', async function() {
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;
      const email = document.getElementById('reg-email').value.trim();
      const errorEl = document.getElementById('reg-error');
      if (!username || !password || !confirm) {
        errorEl.textContent = '请填写所有必填项';
        errorEl.style.display = 'block';
        return;
      }
      if (password !== confirm) {
        errorEl.textContent = '两次密码输入不一致';
        errorEl.style.display = 'block';
        return;
      }
      if (password.length < 6) {
        errorEl.textContent = '密码长度不能少于 6 位';
        errorEl.style.display = 'block';
        return;
      }
      this.disabled = true;
      this.textContent = '注册中...';
      try {
        await API.post('/api/auth/register', { username, password, email: email || undefined });
        showToast('注册成功，请登录', 'success');
        // 切换到登录 tab
        document.querySelectorAll('.tab')[1].classList.remove('active');
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
        document.getElementById('form-login').classList.add('active');
        // 预填用户名
        document.getElementById('login-username').value = username;
        document.getElementById('reg-error').style.display = 'none';
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      } finally {
        this.disabled = false;
        this.textContent = '注 册';
      }
    });

    // 回车提交
    document.getElementById('login-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
    document.getElementById('reg-confirm').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('reg-btn').click();
    });
