// 配置
let config = {
    apiUrl: 'https://1340181402-3thvnndcwl.ap-guangzhou.tencentscf.com',
    adminKey: 'ADMIN-KEY-2025'
};

// 页面加载
window.onload = () => {
    const saved = localStorage.getItem('adminConfig');
    if (saved) {
        const savedConfig = JSON.parse(saved);
        // 如果保存的是旧地址，使用新地址覆盖
        if (savedConfig.apiUrl && !savedConfig.apiUrl.includes('tencentscf.com')) {
            config.apiUrl = 'https://1340181402-3thvnndcwl.ap-guangzhou.tencentscf.com';
            localStorage.setItem('adminConfig', JSON.stringify(config));
        } else {
            config = savedConfig;
        }
    }
    document.getElementById('apiUrl').value = config.apiUrl;
    document.getElementById('adminKey').value = config.adminKey;
    loadDashboard();
};

// 切换页面
function showPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    document.getElementById(`${pageName}-page`).classList.add('active');
    
    const titles = {
        dashboard: '仪表板',
        licenses: '密钥管理',
        devices: '设备管理',
        settings: '系统设置'
    };
    document.getElementById('pageTitle').textContent = titles[pageName];
    
    if (pageName === 'dashboard') loadDashboard();
    if (pageName === 'licenses') loadAllLicenses();
}

// 显示消息
function showMessage(text, type = 'success') {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `message ${type} show`;
    setTimeout(() => msg.classList.remove('show'), 3000);
}

// API 请求
async function apiRequest(action, data = {}) {
    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, adminKey: config.adminKey, ...data })
        });
        return await response.json();
    } catch (error) {
        showMessage('网络错误：' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

// 生成密钥
function generateLicense() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const parts = [];
    for (let i = 0; i < 4; i++) {
        let part = '';
        for (let j = 0; j < 4; j++) {
            part += chars[Math.floor(Math.random() * chars.length)];
        }
        parts.push(part);
    }
    return 'ZSXQ-' + parts.join('-');
}

function generateNewLicense() {
    document.getElementById('newLicense').value = generateLicense();
}

// 格式化时间
function formatTime(time) {
    if (typeof time === 'string' && (time.includes('-') || time.includes(':'))) return time;
    try {
        const date = new Date(Number(time));
        if (isNaN(date.getTime())) return time;
        return date.toLocaleString('zh-CN');
    } catch (e) {
        return time;
    }
}

// 保存配置
function saveConfig() {
    config.apiUrl = document.getElementById('apiUrl').value.trim();
    config.adminKey = document.getElementById('adminKey').value.trim();
    localStorage.setItem('adminConfig', JSON.stringify(config));
    showMessage('配置已保存', 'success');
}

// 测试连接
async function testConnection() {
    showMessage('正在测试连接...', 'success');
    const result = await apiRequest('list', { page: 1, pageSize: 1 });
    if (result.success) {
        showMessage('连接成功！', 'success');
    } else {
        showMessage('连接失败：' + result.error, 'error');
    }
}

// 加载仪表板
async function loadDashboard() {
    const result = await apiRequest('list', { page: 1, pageSize: 10 });
    if (result.success) {
        displayStats(result.data);
        displayRecentLicenses(result.data);
    }
}

// 显示统计
function displayStats(data) {
    const total = data.total || 0;
    const active = data.licenses.filter(l => !l.isBanned && new Date(l.expire) > new Date()).length;
    const devices = data.licenses.reduce((sum, l) => sum + l.devicesUsed, 0);
    const banned = data.licenses.filter(l => l.isBanned).length;

    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">总密钥数</div>
            <div class="stat-value">${total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">活跃密钥</div>
            <div class="stat-value">${active}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">总设备数</div>
            <div class="stat-value">${devices}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">已封禁</div>
            <div class="stat-value">${banned}</div>
        </div>
    `;
}

// 显示最近密钥
function displayRecentLicenses(data) {
    if (!data.licenses || data.licenses.length === 0) {
        document.getElementById('recentLicenses').innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }

    let html = '<table><thead><tr><th>密钥</th><th>客户</th><th>设备</th><th>状态</th></tr></thead><tbody>';
    data.licenses.slice(0, 5).forEach(lic => {
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      new Date(lic.expire) < new Date() ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        html += `<tr>
            <td><span class="code">${lic.license}</span></td>
            <td>${lic.customer}</td>
            <td>${lic.devicesUsed} / ${lic.maxDevices}</td>
            <td>${status}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('recentLicenses').innerHTML = html;
}

// 注册密钥
async function registerLicense() {
    const license = document.getElementById('newLicense').value;
    const customer = document.getElementById('customer').value;
    const expireDate = document.getElementById('expireDate').value;
    const maxDevices = parseInt(document.getElementById('maxDevices').value);

    if (!license || !customer || !expireDate) {
        showMessage('请填写所有信息', 'error');
        return;
    }

    const result = await apiRequest('register', {
        licenses: [{
            license,
            customer,
            expire: new Date(expireDate + ' 23:59:59').getTime(),
            maxDevices,
            created: Date.now()
        }]
    });

    if (result.success) {
        showMessage('密钥注册成功！', 'success');
        document.getElementById('customer').value = '星球助手';
        document.getElementById('newLicense').value = '';
        loadAllLicenses();
    } else {
        showMessage(result.error || '注册失败', 'error');
    }
}

// 加载所有密钥
let currentPage = 1;
async function loadAllLicenses(page = 1) {
    currentPage = page;
    const result = await apiRequest('list', { page, pageSize: 20 });
    if (result.success) {
        displayAllLicenses(result.data);
        displayLicensesPagination(result.data);
    }
}

// 显示所有密钥
function displayAllLicenses(data) {
    if (!data.licenses || data.licenses.length === 0) {
        document.getElementById('allLicenses').innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }

    let html = '<table><thead><tr><th>密钥</th><th>客户</th><th>过期时间</th><th>设备</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
    data.licenses.forEach(lic => {
        const isExpired = new Date(lic.expire) < new Date();
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      isExpired ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        
        const banBtn = lic.isBanned ? 
            `<button class="btn btn-success btn-sm" onclick="unbanLicenseAction('${lic.license}')">解封</button>` :
            `<button class="btn btn-warning btn-sm" onclick="banLicenseAction('${lic.license}')">封禁</button>`;
        
        html += `<tr>
            <td><span class="code">${lic.license}</span></td>
            <td>${lic.customer}</td>
            <td>${lic.expire}</td>
            <td>${lic.devicesUsed} / ${lic.maxDevices}</td>
            <td>${status}</td>
            <td>${lic.created}</td>
            <td>
                <button class="btn btn-sm" onclick="editLicense('${lic.license}')">编辑</button>
                ${banBtn}
                <button class="btn btn-danger btn-sm" onclick="deleteLicense('${lic.license}')">删除</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('allLicenses').innerHTML = html;
}

// 显示分页
function displayLicensesPagination(data) {
    if (data.totalPages <= 1) {
        document.getElementById('licensesPagination').innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';
    if (currentPage > 1) {
        html += `<button class="btn btn-sm" onclick="loadAllLicenses(${currentPage - 1})">上一页</button>`;
    }
    html += `<span>第 ${currentPage} / ${data.totalPages} 页</span>`;
    if (currentPage < data.totalPages) {
        html += `<button class="btn btn-sm" onclick="loadAllLicenses(${currentPage + 1})">下一页</button>`;
    }
    html += '</div>';
    document.getElementById('licensesPagination').innerHTML = html;
}

// 查询设备
async function queryDevices() {
    const license = document.getElementById('deviceLicense').value.trim();
    if (!license) {
        showMessage('请输入激活码', 'error');
        return;
    }

    const result = await apiRequest('status', { license });
    if (result.success) {
        displayDevices(result.data, license);
        showMessage('查询成功', 'success');
    } else {
        showMessage(result.error || '查询失败', 'error');
    }
}

// 显示设备
function displayDevices(data, license) {
    if (!data.devices || data.devices.length === 0) {
        document.getElementById('devicesResult').innerHTML = '<div class="card"><div class="card-body"><div class="loading">该激活码暂无设备使用记录</div></div></div>';
        return;
    }

    let html = '<div class="card"><div class="card-header"><h3>设备列表</h3></div><table><thead><tr><th>设备 ID</th><th>首次激活</th><th>最后使用</th><th>首次 IP</th><th>最近 IP</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    data.devices.forEach(device => {
        const status = device.isBanned ? '<span class="badge badge-danger">已封禁</span>' : '<span class="badge badge-success">正常</span>';
        const action = device.isBanned ?
            `<button class="btn btn-success btn-sm" onclick="unbanDevice('${license}', '${device.machineId}')">解封</button>` :
            `<button class="btn btn-danger btn-sm" onclick="banDevice('${license}', '${device.machineId}')">封禁</button>`;
        
        // IP 历史记录按钮
        const ipHistoryBtn = device.ipHistory && device.ipHistory.length > 0 ? 
            `<button class="btn btn-sm" onclick="showIPHistory('${device.machineId}', ${JSON.stringify(device.ipHistory).replace(/"/g, '&quot;')})">历史</button>` : '';
        
        html += `<tr>
            <td><span class="code">${device.machineIdShort}</span></td>
            <td>${device.firstSeen}</td>
            <td>${device.lastSeen}</td>
            <td><span class="code">${device.firstIP || '未知'}</span></td>
            <td><span class="code">${device.lastIP || '未知'}</span> ${ipHistoryBtn}</td>
            <td>${status}</td>
            <td>${action}</td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('devicesResult').innerHTML = html;
}

// 显示 IP 历史记录
function showIPHistory(machineId, ipHistory) {
    if (!ipHistory || ipHistory.length === 0) {
        alert('暂无 IP 历史记录');
        return;
    }
    
    let message = `设备 ${machineId.substring(0, 8)}... 的 IP 历史记录：\n\n`;
    ipHistory.forEach((record, index) => {
        const time = formatTime(record.time);
        message += `${index + 1}. ${record.ip} - ${time}\n`;
    });
    
    alert(message);
}

// 封禁设备
async function banDevice(license, machineId) {
    if (!confirm('确定要封禁这个设备吗？')) return;
    const result = await apiRequest('banDevice', { license, machineId });
    if (result.success) {
        showMessage('设备已封禁', 'success');
        queryDevices();
    } else {
        showMessage(result.error || '封禁失败', 'error');
    }
}

// 解封设备
async function unbanDevice(license, machineId) {
    if (!confirm('确定要解封这个设备吗？')) return;
    const result = await apiRequest('unbanDevice', { license, machineId });
    if (result.success) {
        showMessage('设备已解封', 'success');
        queryDevices();
    } else {
        showMessage(result.error || '解封失败', 'error');
    }
}

// 删除密钥
async function deleteLicense(license) {
    if (!confirm(`确定要删除密钥 ${license} 吗？此操作不可恢复！`)) return;
    const result = await apiRequest('deleteLicense', { license });
    if (result.success) {
        showMessage('密钥已删除', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '删除失败', 'error');
    }
}

// 编辑密钥
async function editLicense(license) {
    const licenseData = await getLicenseData(license);
    if (!licenseData) return;
    
    const customer = prompt('客户名称:', licenseData.customer);
    if (!customer) return;
    
    const expireDate = prompt('过期时间 (YYYY-MM-DD):', licenseData.expire.split(' ')[0]);
    if (!expireDate) return;
    
    const maxDevices = prompt('最大设备数:', licenseData.maxDevices);
    if (!maxDevices) return;
    
    const result = await apiRequest('updateLicense', {
        license,
        customer,
        expire: new Date(expireDate + ' 23:59:59').getTime(),
        maxDevices: parseInt(maxDevices)
    });
    
    if (result.success) {
        showMessage('密钥已更新', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '更新失败', 'error');
    }
}

// 获取密钥数据
async function getLicenseData(license) {
    const result = await apiRequest('list', { page: 1, pageSize: 1000 });
    if (result.success) {
        return result.data.licenses.find(l => l.license === license);
    }
    return null;
}

// 封禁密钥
async function banLicenseAction(license) {
    if (!confirm(`确定要封禁密钥 ${license} 吗？`)) return;
    const result = await apiRequest('ban', { license });
    if (result.success) {
        showMessage('密钥已封禁', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '封禁失败', 'error');
    }
}

// 解封密钥
async function unbanLicenseAction(license) {
    if (!confirm(`确定要解封密钥 ${license} 吗？`)) return;
    const result = await apiRequest('unbanLicense', { license });
    if (result.success) {
        showMessage('密钥已解封', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '解封失败', 'error');
    }
}

// 搜索密钥
async function searchLicenses() {
    const keyword = document.getElementById('searchKeyword').value.trim();
    const status = document.getElementById('statusFilter').value;
    
    const result = await apiRequest('searchLicense', { keyword, status });
    if (result.success) {
        displaySearchResults(result.data);
    } else {
        showMessage(result.error || '搜索失败', 'error');
    }
}

// 显示搜索结果
function displaySearchResults(licenses) {
    if (!licenses || licenses.length === 0) {
        document.getElementById('allLicenses').innerHTML = '<div class="loading">未找到匹配的密钥</div>';
        document.getElementById('licensesPagination').innerHTML = '';
        return;
    }

    let html = '<table><thead><tr><th>密钥</th><th>客户</th><th>过期时间</th><th>设备</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    licenses.forEach(lic => {
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      lic.isExpired ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        
        const banBtn = lic.isBanned ? 
            `<button class="btn btn-success btn-sm" onclick="unbanLicenseAction('${lic.license}')">解封</button>` :
            `<button class="btn btn-warning btn-sm" onclick="banLicenseAction('${lic.license}')">封禁</button>`;
        
        html += `<tr>
            <td><span class="code">${lic.license}</span></td>
            <td>${lic.customer}</td>
            <td>${lic.expire}</td>
            <td>${lic.devicesUsed} / ${lic.maxDevices}</td>
            <td>${status}</td>
            <td>
                <button class="btn btn-sm" onclick="editLicense('${lic.license}')">编辑</button>
                ${banBtn}
                <button class="btn btn-danger btn-sm" onclick="deleteLicense('${lic.license}')">删除</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('allLicenses').innerHTML = html;
    document.getElementById('licensesPagination').innerHTML = `<div class="pagination"><span>共找到 ${licenses.length} 条记录</span></div>`;
}

// 导出数据
async function exportAllData() {
    const result = await apiRequest('exportData', {});
    if (result.success) {
        const dataStr = JSON.stringify(result.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `license-backup-${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage('数据已导出', 'success');
    } else {
        showMessage(result.error || '导出失败', 'error');
    }
}

// 显示导入对话框
function showImportDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!confirm('确定要导入数据吗？这将覆盖现有数据！')) return;
                
                const result = await apiRequest('importData', { data });
                if (result.success) {
                    showMessage('数据导入成功', 'success');
                    loadAllLicenses();
                    loadDashboard();
                } else {
                    showMessage(result.error || '导入失败', 'error');
                }
            } catch (error) {
                showMessage('文件格式错误', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// 加载操作日志
async function loadLogs() {
    const result = await apiRequest('getLogs', { limit: 50 });
    if (result.success) {
        displayLogs(result.data);
    }
}

// 显示操作日志
function displayLogs(logs) {
    if (!logs || logs.length === 0) {
        document.getElementById('logsContainer').innerHTML = '<div class="loading">暂无日志</div>';
        return;
    }

    let html = '<table><thead><tr><th>时间</th><th>操作</th><th>密钥</th><th>设备ID</th></tr></thead><tbody>';
    logs.forEach(log => {
        html += `<tr>
            <td>${log.timestamp}</td>
            <td>${log.action}</td>
            <td><span class="code">${log.license || '-'}</span></td>
            <td>${log.machineId ? '<span class="code">' + log.machineId.substring(0, 8) + '...</span>' : '-'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('logsContainer').innerHTML = html;
}
