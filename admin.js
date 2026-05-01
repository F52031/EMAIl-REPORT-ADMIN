// 配置
let config = {
    apiUrl: 'https://1340181402-3thvnndcwl.ap-guangzhou.tencentscf.com',
    adminKey: 'ADMIN-KEY-2025'
};

// 管理密码（可以修改为你想要的密码）
const ADMIN_PASSWORD = 'Qq112233';

// ==================== 全局用户数据缓存 ====================
// 用于跨页面统一 IP/设备ID/用户名 的映射
let globalUserData = {
    loaded: false,
    ipToInfo: new Map(),      // IP -> { machineId, userName, status }
    machineIdToInfo: new Map(), // machineId -> { ips: [], userName, status }
    lastLoadTime: 0
};

// 加载全局用户数据（登录后调用一次）
async function loadGlobalUserData() {
    console.log('Loading global user data...');

    const [pendingResult, approvedResult, licensesResult] = await Promise.all([
        apiRequest('listPendingIPs', {}),
        apiRequest('listApprovedIPs', {}),
        apiRequest('list', { page: 1, pageSize: 500 })
    ]);

    globalUserData.ipToInfo.clear();
    globalUserData.machineIdToInfo.clear();

    // 处理待审核 IP
    if (pendingResult.success && pendingResult.data) {
        pendingResult.data.forEach(item => {
            const info = {
                machineId: item.machineIdFull || '',
                userName: item.note || '',
                status: 'pending'
            };
            globalUserData.ipToInfo.set(item.ip, info);

            if (item.machineIdFull) {
                const existing = globalUserData.machineIdToInfo.get(item.machineIdFull);
                if (!existing) {
                    globalUserData.machineIdToInfo.set(item.machineIdFull, {
                        ips: [item.ip],
                        userName: item.note || '',
                        status: 'pending'
                    });
                } else {
                    if (!existing.ips.includes(item.ip)) existing.ips.push(item.ip);
                    if (!existing.userName && item.note) existing.userName = item.note;
                }
            }
        });
    }

    // 处理已通过 IP
    if (approvedResult.success && approvedResult.data) {
        approvedResult.data.forEach(item => {
            if (typeof item === 'object') {
                const info = {
                    machineId: item.machineId || '',
                    userName: item.note || '',
                    status: 'approved'
                };
                globalUserData.ipToInfo.set(item.ip, info);

                if (item.machineId) {
                    const existing = globalUserData.machineIdToInfo.get(item.machineId);
                    if (!existing) {
                        globalUserData.machineIdToInfo.set(item.machineId, {
                            ips: [item.ip],
                            userName: item.note || '',
                            status: 'approved'
                        });
                    } else {
                        if (!existing.ips.includes(item.ip)) existing.ips.push(item.ip);
                        if (!existing.userName && item.note) existing.userName = item.note;
                        existing.status = 'approved'; // 升级状态
                    }
                }
            }
        });
    }

    // 从密钥数据补充用户名
    if (licensesResult.success && licensesResult.data && licensesResult.data.licenses) {
        licensesResult.data.licenses.forEach(lic => {
            if (lic.allowedIPs && lic.allowedIPs.length > 0) {
                lic.allowedIPs.forEach(ip => {
                    const existing = globalUserData.ipToInfo.get(ip);
                    if (existing && !existing.userName) {
                        existing.userName = lic.customer;
                    } else if (!existing) {
                        globalUserData.ipToInfo.set(ip, {
                            machineId: '',
                            userName: lic.customer,
                            status: 'licensed'
                        });
                    }
                });
            }
        });
    }

    globalUserData.loaded = true;
    globalUserData.lastLoadTime = Date.now();
    console.log(`Global user data loaded: ${globalUserData.ipToInfo.size} IPs, ${globalUserData.machineIdToInfo.size} devices`);
}

// 根据 IP 获取用户名
function getUserNameByIP(ip) {
    const info = globalUserData.ipToInfo.get(ip);
    return info ? info.userName : '';
}

// 根据 IP 获取设备 ID
function getMachineIdByIP(ip) {
    const info = globalUserData.ipToInfo.get(ip);
    return info ? info.machineId : '';
}

// 根据设备 ID 获取用户名
function getUserNameByMachineId(machineId) {
    const info = globalUserData.machineIdToInfo.get(machineId);
    return info ? info.userName : '';
}

// 根据设备 ID 获取 IP 列表
function getIPsByMachineId(machineId) {
    const info = globalUserData.machineIdToInfo.get(machineId);
    return info ? info.ips : [];
}

// 检查登录状态
function checkLogin() {
    return sessionStorage.getItem('adminLoggedIn') === 'true';
}

// 登录
function doLogin() {
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem('adminLoggedIn', 'true');
        document.getElementById('loginOverlay').classList.add('hidden');
        errorEl.textContent = '';
        initApp();
    } else {
        errorEl.textContent = '密码错误，请重试';
        document.getElementById('loginPassword').value = '';
    }
}

// 退出登录
function logout() {
    sessionStorage.removeItem('adminLoggedIn');
    location.reload();
}

// 初始化应用
async function initApp() {
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

    // 加载全局用户数据
    await loadGlobalUserData();

    // 根据 URL hash 恢复页面状态
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const validPages = ['dashboard', 'licenses', 'devices', 'ipManage', 'deviceOverview', 'review', 'logs', 'settings', 'debug'];
    const pageName = validPages.includes(hash) ? hash : 'dashboard';
    showPageByName(pageName);
}

// 页面加载
window.onload = () => {
    if (checkLogin()) {
        document.getElementById('loginOverlay').classList.add('hidden');
        initApp();
    }
};

// 监听浏览器前进后退
window.onhashchange = () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const validPages = ['dashboard', 'licenses', 'devices', 'ipManage', 'deviceOverview', 'review', 'logs', 'settings', 'debug'];
    if (validPages.includes(hash)) {
        showPageByName(hash);
    }
};

// 内部切换页面（不触发 hashchange）
function showPageByName(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

    // 激活对应的导航项
    const navItem = document.querySelector(`.nav-item[href="#${pageName}"]`) ||
        document.querySelector(`.nav-item[onclick*="'${pageName}'"]`);
    if (navItem) navItem.classList.add('active');

    document.getElementById(pageName).classList.add('active');

    const titles = {
        dashboard: '仪表板',
        licenses: '密钥管理',
        devices: '封禁管理',
        ipManage: 'IP 管理',
        deviceOverview: '设备总览',
        review: '激活审核',
        logs: '操作日志',
        settings: '系统设置',
        debug: '密钥调试'
    };
    document.getElementById('pageTitle').textContent = titles[pageName];

    // 加载页面数据
    if (pageName === 'dashboard') loadDashboard();
    if (pageName === 'licenses') loadAllLicenses();
    if (pageName === 'ipManage') loadAllIPs();
    if (pageName === 'deviceOverview') loadAllDevices();
    if (pageName === 'review') { loadPendingIPs(); loadApprovedIPs(); loadRejectedIPs(); }
    if (pageName === 'logs') loadLogs();
}

// 切换页面（用户点击导航时调用）
function showPage(pageName) {
    // 更新 URL hash（会触发 hashchange，但我们直接处理）
    window.location.hash = pageName;
    showPageByName(pageName);
}

// 刷新当前页面
function loadCurrentPage() {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageName = activePage.id;
        if (pageName === 'dashboard') loadDashboard();
        if (pageName === 'licenses') loadAllLicenses();
        if (pageName === 'logs') loadLogs();
    }
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

// 生成密钥 (正式密钥使用 EMAIL- 前缀)
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
    return 'EMAIL-' + parts.join('-');
}

function generateNewLicense() {
    document.getElementById('newLicense').value = generateLicense();
}

// 批量生成密钥（存储在全局变量中）
window.batchGeneratedLicenses = [];

function generateBatchLicenses() {
    const count = parseInt(document.getElementById('batchCount').value) || 10;
    
    if (count < 1 || count > 100) {
        showMessage('生成数量必须在 1-100 之间', 'error');
        return;
    }

    // 生成密钥
    window.batchGeneratedLicenses = [];
    for (let i = 0; i < count; i++) {
        window.batchGeneratedLicenses.push(generateLicense());
    }

    // 显示结果
    displayBatchLicenses();
    showMessage(`成功生成 ${count} 个密钥`, 'success');
}

// 一键生成并注册（新功能）
async function generateAndRegisterBatchLicenses() {
    const count = parseInt(document.getElementById('batchCount').value) || 10;
    const customer = document.getElementById('batchCustomer').value;
    const expireDate = document.getElementById('batchExpireDate').value;
    const maxDevices = parseInt(document.getElementById('batchMaxDevices').value);

    if (count < 1 || count > 100) {
        showMessage('生成数量必须在 1-100 之间', 'error');
        return;
    }

    if (!customer || !expireDate) {
        showMessage('请填写客户名称和过期时间', 'error');
        return;
    }

    if (!confirm(`确定要生成并注册 ${count} 个密钥吗？\n客户：${customer}\n设备数：${maxDevices} 台`)) {
        return;
    }

    showMessage('正在生成并注册密钥...', 'success');

    // 1. 生成密钥
    window.batchGeneratedLicenses = [];
    for (let i = 0; i < count; i++) {
        window.batchGeneratedLicenses.push(generateLicense());
    }

    // 2. 注册密钥
    const licenses = window.batchGeneratedLicenses.map(license => ({
        license,
        customer,
        expire: new Date(expireDate + ' 23:59:59').getTime(),
        maxDevices,
        created: Date.now()
    }));

    const result = await apiRequest('register', { licenses });

    if (result.success) {
        showMessage(`成功生成并注册 ${licenses.length} 个密钥！`, 'success');
        
        // 显示结果
        displayBatchLicensesWithSuccess();
        
        // 刷新密钥列表
        loadAllLicenses();
    } else {
        showMessage(result.error || '批量注册失败', 'error');
    }
}

function displayBatchLicensesWithSuccess() {
    if (window.batchGeneratedLicenses.length === 0) {
        return;
    }

    const customer = document.getElementById('batchCustomer').value || '批量客户';
    const expireDate = document.getElementById('batchExpireDate').value;
    const maxDevices = document.getElementById('batchMaxDevices').value;

    let html = `<div style="background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4 style="color: #155724; margin: 0;">✅ 成功生成并注册 ${window.batchGeneratedLicenses.length} 个密钥</h4>
            <div style="font-size: 12px; color: #155724;">
                客户: ${customer} | 过期: ${expireDate} | 设备数: ${maxDevices}
            </div>
        </div>
        <div style="max-height: 400px; overflow-y: auto; background: white; padding: 15px; border-radius: 6px;">`;

    window.batchGeneratedLicenses.forEach((license, index) => {
        html += `<div style="margin: 5px 0; padding: 8px; background: #f8f9fa; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-family: monospace; color: #155724; font-weight: 600;">${index + 1}. ${license}</span>
            <button class="btn btn-sm" onclick="copyToClipboard('${license}')" style="background: #28a745; color: white;">📋</button>
        </div>`;
    });

    html += `</div>
        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404;"><strong>💡 提示：</strong></p>
            <ul style="margin: 10px 0; color: #856404;">
                <li>密钥已成功注册到系统，可立即使用</li>
                <li>点击"导出为TXT"保存密钥文件</li>
                <li>点击"复制全部"复制所有密钥</li>
            </ul>
        </div>
    </div>`;

    document.getElementById('batchLicensesResult').innerHTML = html;
}

function displayBatchLicenses() {
    if (window.batchGeneratedLicenses.length === 0) {
        document.getElementById('batchLicensesResult').innerHTML = '';
        return;
    }

    const customer = document.getElementById('batchCustomer').value || '批量客户';
    const expireDate = document.getElementById('batchExpireDate').value;
    const maxDevices = document.getElementById('batchMaxDevices').value;

    let html = `<div style="background: white; padding: 20px; border-radius: 8px; border: 2px solid #0ea5e9;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4 style="color: #0369a1; margin: 0;">已生成 ${window.batchGeneratedLicenses.length} 个密钥</h4>
            <div style="font-size: 12px; color: #6c757d;">
                客户: ${customer} | 过期: ${expireDate} | 设备数: ${maxDevices}
            </div>
        </div>
        <div style="max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 15px; border-radius: 6px;">`;

    window.batchGeneratedLicenses.forEach((license, index) => {
        html += `<div style="margin: 5px 0; padding: 8px; background: white; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-family: monospace; color: #0369a1; font-weight: 600;">${index + 1}. ${license}</span>
            <button class="btn btn-sm" onclick="copyToClipboard('${license}')" style="background: #0ea5e9; color: white;">📋</button>
        </div>`;
    });

    html += `</div></div>`;
    document.getElementById('batchLicensesResult').innerHTML = html;
}

// 批量注册密钥
async function registerBatchLicenses() {
    if (!window.batchGeneratedLicenses || window.batchGeneratedLicenses.length === 0) {
        showMessage('请先生成密钥', 'error');
        return;
    }

    const customer = document.getElementById('batchCustomer').value;
    const expireDate = document.getElementById('batchExpireDate').value;
    const maxDevices = parseInt(document.getElementById('batchMaxDevices').value);

    if (!customer || !expireDate) {
        showMessage('请填写客户名称和过期时间', 'error');
        return;
    }

    if (!confirm(`确定要注册 ${window.batchGeneratedLicenses.length} 个密钥吗？`)) {
        return;
    }

    showMessage('正在批量注册密钥...', 'success');

    const licenses = window.batchGeneratedLicenses.map(license => ({
        license,
        customer,
        expire: new Date(expireDate + ' 23:59:59').getTime(),
        maxDevices,
        created: Date.now()
    }));

    const result = await apiRequest('register', { licenses });

    if (result.success) {
        showMessage(`成功注册 ${licenses.length} 个密钥！`, 'success');
        loadAllLicenses();
        
        // 更新显示状态
        let html = `<div style="background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745; margin-top: 15px;">
            <h4 style="color: #155724; margin-bottom: 10px;">✅ 批量注册成功！</h4>
            <p style="color: #155724; margin: 0;">已成功注册 ${licenses.length} 个密钥到系统</p>
        </div>`;
        document.getElementById('batchLicensesResult').innerHTML += html;
    } else {
        showMessage(result.error || '批量注册失败', 'error');
    }
}

// 复制所有批量生成的密钥
function copyBatchLicenses() {
    if (!window.batchGeneratedLicenses || window.batchGeneratedLicenses.length === 0) {
        showMessage('没有可复制的密钥', 'error');
        return;
    }

    const text = window.batchGeneratedLicenses.join('\n');
    copyToClipboard(text);
}

// 导出批量密钥到TXT文件
function exportBatchLicenses() {
    if (!window.batchGeneratedLicenses || window.batchGeneratedLicenses.length === 0) {
        showMessage('没有可导出的密钥', 'error');
        return;
    }

    const customer = document.getElementById('batchCustomer').value || '批量客户';
    const expireDate = document.getElementById('batchExpireDate').value;
    const maxDevices = document.getElementById('batchMaxDevices').value;

    let content = `邮件批量发送助手 - 正式密钥\n`;
    content += `${'='.repeat(60)}\n\n`;
    content += `生成时间：${new Date().toLocaleString('zh-CN')}\n`;
    content += `客户名称：${customer}\n`;
    content += `过期时间：${expireDate}\n`;
    content += `最大设备数：${maxDevices} 台\n`;
    content += `密钥数量：${window.batchGeneratedLicenses.length}\n`;
    content += `\n${'='.repeat(60)}\n\n`;

    window.batchGeneratedLicenses.forEach((key, index) => {
        content += `${(index + 1).toString().padStart(3, '0')}. ${key}\n`;
    });

    content += `\n${'='.repeat(60)}\n`;
    content += `\n密钥说明：\n`;
    content += `1. 每个密钥独立使用，互不影响\n`;
    content += `2. 正式密钥激活后永久有效，无任务次数限制\n`;
    content += `3. 每个密钥最多可绑定 ${maxDevices} 台设备\n`;
    content += `4. 密钥过期时间：${expireDate}\n`;
    content += `5. 如需技术支持，请联系管理员\n`;
    content += `\n联系方式：微信号 YOLO_SepFive\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `正式密钥_${customer}_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    showMessage('密钥已导出到文件', 'success');
}

// 生成临时密钥（使用服务端全局计数器）
async function generateTempLicenses() {
    const count = parseInt(document.getElementById('tempLicenseCount').value) || 1;

    if (count < 1 || count > 50) {
        showMessage('生成数量必须在 1-50 之间', 'error');
        return;
    }

    // 从服务端获取全局计数器编号
    showMessage('正在获取密钥编号...', 'success');
    const numberResult = await apiRequest('getNextTempLicenseNumber', { count });

    if (!numberResult.success) {
        showMessage('获取编号失败: ' + (numberResult.error || '未知错误'), 'error');
        return;
    }

    const numbers = numberResult.data.numbers;
    const licenses = [];

    // 生成简洁的递增密钥：EMAIL-0001
    for (let i = 0; i < count; i++) {
        const paddedNum = numbers[i].toString().padStart(4, '0');
        const uniqueKey = `EMAIL-${paddedNum}`;
        licenses.push(uniqueKey);
    }

    // 注册到服务端（确保密钥有效性）
    showMessage('正在注册密钥到服务端...', 'success');
    const registerResult = await apiRequest('registerTempLicenses', { licenses });

    if (!registerResult.success) {
        showMessage('密钥注册失败: ' + (registerResult.error || '未知错误'), 'error');
        return;
    }

    // 显示结果
    let html = `<div class="card" style="background: #f0f9ff; border: 2px solid #0ea5e9;">
        <div class="card-header" style="background: #0ea5e9; color: white;">
            <h4>✅ 已生成并注册 ${count} 个试用密钥（3次任务，3小时）</h4>
        </div>
        <div class="card-body">
            <p style="color: #0369a1; font-weight: bold;">请复制以下密钥发送给用户：</p>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">`;

    licenses.forEach((key, index) => {
        html += `<div style="margin: 8px 0; padding: 10px; background: #f8fafc; border-left: 4px solid #0ea5e9; display: flex; justify-content: space-between; align-items: center;">
            <span class="code" style="font-size: 16px; color: #0369a1;">${key}</span>
            <button class="btn btn-sm" onclick="copyToClipboard('${key}')" style="background: #0ea5e9; color: white;">📋 复制</button>
        </div>`;
    });

    html += `</div>
            <div style="margin-top: 15px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e;"><strong>⚠️ 重要提示：</strong></p>
                <ul style="margin: 10px 0; color: #92400e;">
                    <li>试用密钥<strong>绑定单一设备</strong>，换设备需要新密钥</li>
                    <li>每个密钥可使用 <strong>3 次任务</strong>，有效期 <strong>3 小时</strong></li>
                    <li>用户使用后会出现在"激活审核"页面，审核通过后可永久使用</li>
                </ul>
            </div>
            <div style="margin-top: 15px;">
                <button class="btn btn-primary" onclick="copyAllTempLicenses()">📋 复制全部密钥</button>
                <button class="btn" onclick="exportTempLicensesToFile()">💾 导出为文本文件</button>
            </div>
        </div>
    </div>`;

    document.getElementById('tempLicensesResult').innerHTML = html;

    // 保存到临时变量供复制使用
    window.generatedTempLicenses = licenses;

    showMessage(`成功生成并注册 ${count} 个临时密钥`, 'success');
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showMessage('已复制到剪贴板', 'success');
    }).catch(() => {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showMessage('已复制到剪贴板', 'success');
    });
}

// 复制所有临时密钥
function copyAllTempLicenses() {
    if (!window.generatedTempLicenses || window.generatedTempLicenses.length === 0) {
        showMessage('没有可复制的密钥', 'error');
        return;
    }

    const text = window.generatedTempLicenses.join('\n');
    copyToClipboard(text);
}

// 导出临时密钥到文件
function exportTempLicensesToFile() {
    if (!window.generatedTempLicenses || window.generatedTempLicenses.length === 0) {
        showMessage('没有可导出的密钥', 'error');
        return;
    }

    let content = `知识星球助手 - 试用密钥\n`;
    content += `生成时间：${new Date().toLocaleString('zh-CN')}\n`;
    content += `密钥类型：3次任务，3小时有效期\n`;
    content += `密钥数量：${window.generatedTempLicenses.length}\n`;
    content += `\n${'='.repeat(50)}\n\n`;

    window.generatedTempLicenses.forEach((key, index) => {
        content += `${index + 1}. ${key}\n`;
    });

    content += `\n${'='.repeat(50)}\n`;
    content += `\n使用说明：\n`;
    content += `1. 每个密钥独立使用，互不影响\n`;
    content += `2. 每个密钥最多使用 3 次任务，有效期 3 小时\n`;
    content += `3. 用完次数或过期后自动失效\n`;
    content += `4. 使用后会出现在管理员审核列表，审核通过后可永久使用\n`;
    content += `5. 如需长期使用，请联系管理员获取正式授权\n`;
    content += `\n联系方式：微信号 YOLO_SepFive\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `临时密钥_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    showMessage('密钥已导出到文件', 'success');
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

// 注册单个密钥（自动生成）
async function registerSingleLicense() {
    const customer = document.getElementById('customer').value || '星球助手';
    const expireDate = document.getElementById('expireDate').value;
    const maxDevices = parseInt(document.getElementById('maxDevices').value);

    if (!expireDate) {
        showMessage('请选择过期时间', 'error');
        return;
    }

    // 自动生成密钥
    const license = generateLicense();

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
        showMessage(`✅ 密钥已注册并复制到剪贴板`, 'success');
        
        // 复制密钥到剪贴板
        copyToClipboard(license);
        
        // 显示生成结果
        displaySingleLicenseResult(license, customer, expireDate, maxDevices);
        
        // 清空表单
        document.getElementById('customer').value = '';
        
        // 刷新列表
        loadAllLicenses();
    } else {
        showMessage(result.error || '注册失败', 'error');
    }
}

// 显示单个密钥生成结果
function displaySingleLicenseResult(license, customer, expireDate, maxDevices) {
    const now = new Date().toLocaleString('zh-CN');
    
    let html = `<div style="background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745; animation: fadeIn 0.3s;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4 style="color: #155724; margin: 0;">✅ 密钥注册成功</h4>
            <span style="font-size: 12px; color: #155724;">${now}</span>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
            <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; font-size: 14px;">
                <div style="color: #6c757d; font-weight: 600;">密钥：</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-family: monospace; color: #155724; font-weight: 600; font-size: 16px;">${license}</span>
                    <button class="btn btn-sm" onclick="copyToClipboard('${license}')" style="background: #28a745; color: white;">📋 复制</button>
                </div>
                
                <div style="color: #6c757d; font-weight: 600;">客户名称：</div>
                <div style="color: #2c3e50;">${customer}</div>
                
                <div style="color: #6c757d; font-weight: 600;">过期时间：</div>
                <div style="color: #2c3e50;">${expireDate}</div>
                
                <div style="color: #6c757d; font-weight: 600;">最大设备数：</div>
                <div style="color: #2c3e50;">${maxDevices} 台</div>
            </div>
        </div>
        
        <div style="padding: 12px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; font-size: 13px;">
                <strong>💡 提示：</strong> 密钥已自动复制到剪贴板，可直接粘贴发送给用户
            </p>
        </div>
    </div>`;
    
    document.getElementById('singleLicenseResult').innerHTML = html;
}

// 注册密钥（旧函数，保留兼容性）
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
        showMessage('密钥注册成功！客户首次激活时会自动绑定 IP', 'success');
        document.getElementById('newLicense').value = '';
        document.getElementById('customer').value = '';
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

    let html = '<table><thead><tr><th>密钥</th><th>客户</th><th>过期时间</th><th>设备</th><th>状态</th><th>IP绑定</th><th>操作</th></tr></thead><tbody>';
    data.licenses.forEach(lic => {
        const isExpired = new Date(lic.expire) < new Date();
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' :
            isExpired ? '<span class="badge badge-warning">已过期</span>' :
                '<span class="badge badge-success">正常</span>';

        // IP 绑定状态
        const ipStatus = lic.ipBindingEnabled ?
            `<span class="badge badge-info" title="${(lic.allowedIPs || []).join(', ')}">🔒 ${(lic.allowedIPs || []).length} IP</span>` :
            '<span class="badge badge-secondary">未启用</span>';

        const banBtn = lic.isBanned ?
            `<button class="btn btn-success btn-sm" onclick="unbanLicenseAction('${lic.license}')">解封</button>` :
            `<button class="btn btn-warning btn-sm" onclick="banLicenseAction('${lic.license}')">封禁</button>`;

        html += `<tr>
            <td><span class="code">${lic.license}</span></td>
            <td>${lic.customer}</td>
            <td>${lic.expire}</td>
            <td>${lic.devicesUsed} / ${lic.maxDevices}</td>
            <td>${status}</td>
            <td>${ipStatus}</td>
            <td>
                <button class="btn btn-sm" onclick="editLicense('${lic.license}')">编辑</button>
                <button class="btn btn-sm" onclick="manageIPBindingFromList('${lic.license}')">🔒</button>
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

    let html = '<div class="card"><div class="card-header"><h3>设备列表</h3><button class="btn btn-sm" onclick="manageIPBinding(\'' + license + '\')">🔒 IP 绑定</button></div><table><thead><tr><th>设备 ID</th><th>首次激活</th><th>最后使用</th><th>首次 IP</th><th>最近 IP</th><th>状态</th><th>操作</th></tr></thead><tbody>';
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
let currentLogsPage = 1;
const logsPageSize = 50;
let currentLogSearchKeyword = ''; // 当前搜索关键词

async function loadLogs(page = 1, keyword = '') {
    currentLogsPage = page;
    currentLogSearchKeyword = keyword;

    const logsResult = await apiRequest('getLogs', { 
        page: page, 
        pageSize: logsPageSize,
        keyword: keyword // 传递搜索关键词
    });

    if (logsResult.success) {
        displayLogs(logsResult.data, logsResult.total || 0);
    }
}

// 搜索日志
function searchLogs() {
    const keyword = document.getElementById('logSearchKeyword').value.trim();
    loadLogs(1, keyword);
}

// 清除搜索
function clearLogSearch() {
    document.getElementById('logSearchKeyword').value = '';
    loadLogs(1, '');
}

// 显示操作日志
function displayLogs(logs, total) {
    if (!logs || logs.length === 0) {
        const keyword = currentLogSearchKeyword;
        const message = keyword ? `未找到包含 "${keyword}" 的日志` : '暂无日志';
        document.getElementById('logsContainer').innerHTML = `<div class="loading">${message}</div>`;
        document.getElementById('logsPagination').innerHTML = '';
        return;
    }

    let html = '<table><thead><tr><th>时间</th><th>操作</th><th>用户名</th><th>密钥</th><th>设备ID</th><th>IP</th></tr></thead><tbody>';

    logs.forEach(log => {
        // 设备 ID 显示前 8 位，鼠标悬停显示完整
        const machineIdDisplay = log.machineId ? log.machineId.substring(0, 8) + '...' : '-';
        const machineIdTitle = log.machineId || '';

        // 用户名优先级：日志中的note > IP 备注/用户名 > 设备 ID 用户名 > 默认
        let userName = log.note || getUserNameByIP(log.ip) || getUserNameByMachineId(log.machineId) || '-';
        if (userName !== '-') {
            userName = `<strong>${userName}</strong>`;
        }

        // 高亮搜索关键词
        const keyword = currentLogSearchKeyword;
        let licenseDisplay = log.license || '-';
        let ipDisplay = log.ip || '-';
        let userNameDisplay = userName;
        
        if (keyword) {
            const regex = new RegExp(`(${keyword})`, 'gi');
            licenseDisplay = licenseDisplay.replace(regex, '<mark>$1</mark>');
            ipDisplay = ipDisplay.replace(regex, '<mark>$1</mark>');
            if (userName !== '-') {
                userNameDisplay = userName.replace(regex, '<mark>$1</mark>');
            }
        }

        html += `<tr>
            <td>${log.timestamp}</td>
            <td>${log.action}</td>
            <td>${userNameDisplay}</td>
            <td><span class="code">${licenseDisplay}</span></td>
            <td>${log.machineId ? '<span class="code" title="' + machineIdTitle + '">' + machineIdDisplay + '</span>' : '-'}</td>
            <td><span class="code">${ipDisplay}</span></td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('logsContainer').innerHTML = html;

    // 显示分页
    displayLogsPagination(total);
}

// 显示日志分页
function displayLogsPagination(total) {
    const totalPages = Math.ceil(total / logsPageSize);

    if (totalPages <= 1) {
        document.getElementById('logsPagination').innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';

    // 上一页按钮
    if (currentLogsPage > 1) {
        html += `<button class="btn btn-sm" onclick="loadLogs(${currentLogsPage - 1}, '${currentLogSearchKeyword}')">上一页</button>`;
    }

    // 页码信息
    const searchInfo = currentLogSearchKeyword ? ` (搜索: "${currentLogSearchKeyword}")` : '';
    html += `<span>第 ${currentLogsPage} / ${totalPages} 页 (共 ${total} 条记录)${searchInfo}</span>`;

    // 下一页按钮
    if (currentLogsPage < totalPages) {
        html += `<button class="btn btn-sm" onclick="loadLogs(${currentLogsPage + 1}, '${currentLogSearchKeyword}')">下一页</button>`;
    }

    html += '</div>';
    document.getElementById('logsPagination').innerHTML = html;
}

// ==================== IP 绑定功能 ====================

// 管理 IP 绑定
async function manageIPBinding(license) {
    const result = await apiRequest('getIPBinding', { license });
    if (!result.success) {
        showMessage(result.error || '查询失败', 'error');
        return;
    }

    const data = result.data;
    const enabled = data.enabled || false;
    const allowedIPs = data.allowedIPs || [];

    // 构建对话框内容
    let message = `密钥: ${license}\n\n`;
    message += `当前状态: ${enabled ? '✅ 已启用（自动绑定）' : '❌ 未启用（等待首次激活）'}\n`;
    message += `允许的 IP (${allowedIPs.length}/2): ${allowedIPs.length > 0 ? allowedIPs.join(', ') : '无'}\n\n`;

    if (data.devices && data.devices.length > 0) {
        message += '设备 IP 历史:\n';
        data.devices.forEach((device, index) => {
            message += `${index + 1}. ${device.machineId}\n`;
            message += `   首次: ${device.firstIP || '未知'}\n`;
            message += `   最近: ${device.lastIP || '未知'}\n`;
        });
        message += '\n';
    }

    message += '请选择操作:\n';
    message += '1. 添加 IP 地址\n';
    message += '2. 删除 IP 地址\n';
    message += '3. 禁用 IP 绑定\n';
    message += '4. 取消';

    const choice = prompt(message, '4');

    if (choice === '1') {
        await addIPToWhitelist(license, allowedIPs);
    } else if (choice === '2') {
        await removeIPFromWhitelist(license, allowedIPs);
    } else if (choice === '3') {
        await disableIPBinding(license);
    }
}

// 从白名单删除 IP
async function removeIPFromWhitelist(license, currentIPs) {
    if (currentIPs.length === 0) {
        alert('当前没有绑定的 IP');
        return;
    }

    let message = '请选择要删除的 IP:\n\n';
    currentIPs.forEach((ip, index) => {
        message += `${index + 1}. ${ip}\n`;
    });

    const choice = prompt(message, '');
    if (!choice) return;

    const index = parseInt(choice) - 1;
    if (index < 0 || index >= currentIPs.length) {
        alert('无效的选择');
        return;
    }

    const ipToRemove = currentIPs[index];
    if (!confirm(`确定要删除 IP: ${ipToRemove} 吗？`)) return;

    const updatedIPs = currentIPs.filter((_, i) => i !== index);

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: updatedIPs.length > 0,
        allowedIPs: updatedIPs
    });

    if (result.success) {
        showMessage(`已删除 IP: ${ipToRemove}`, 'success');
        queryDevices();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 添加 IP 到白名单
async function addIPToWhitelist(license, currentIPs) {
    // 检查 IP 数量限制
    if (currentIPs.length >= 2) {
        alert('每个密钥最多只能绑定 2 个 IP 地址\n\n如需添加新 IP，请先删除现有 IP');
        return;
    }

    const newIP = prompt('请输入要添加的 IP 地址:', '');
    if (!newIP || !newIP.trim()) return;

    const ip = newIP.trim();
    if (currentIPs.includes(ip)) {
        alert('该 IP 已在白名单中');
        return;
    }

    const updatedIPs = [...currentIPs, ip];

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: true,
        allowedIPs: updatedIPs
    });

    if (result.success) {
        showMessage(`已添加 IP: ${ip}`, 'success');
        queryDevices();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 启用 IP 绑定
async function enableIPBinding(license, currentIPs) {
    if (currentIPs.length === 0) {
        alert('请先设置 IP 白名单');
        await setIPWhitelist(license, false);
        return;
    }

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: true,
        allowedIPs: currentIPs
    });

    if (result.success) {
        showMessage('IP 绑定已启用', 'success');
        queryDevices();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 禁用 IP 绑定
async function disableIPBinding(license) {
    if (!confirm('确定要禁用 IP 绑定吗？')) return;

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: false
    });

    if (result.success) {
        showMessage('IP 绑定已禁用', 'success');
        queryDevices();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 设置 IP 白名单
async function setIPWhitelist(license, currentEnabled) {
    const ipsText = prompt('请输入允许的 IP 地址（每行一个）:\n\n例如:\n192.168.1.100\n10.0.0.50', '');
    if (ipsText === null) return;

    const allowedIPs = ipsText.split('\n')
        .map(ip => ip.trim())
        .filter(ip => ip.length > 0);

    if (allowedIPs.length === 0) {
        alert('请至少输入一个 IP 地址');
        return;
    }

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: currentEnabled,
        allowedIPs
    });

    if (result.success) {
        showMessage('IP 白名单已更新', 'success');
        queryDevices();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 从密钥列表管理 IP 绑定
async function manageIPBindingFromList(license) {
    const result = await apiRequest('getIPBinding', { license });
    if (!result.success) {
        showMessage(result.error || '查询失败', 'error');
        return;
    }

    const data = result.data;
    const enabled = data.enabled || false;
    const allowedIPs = data.allowedIPs || [];

    // 构建对话框内容
    let message = `密钥: ${license}\n\n`;
    message += `当前状态: ${enabled ? '✅ 已启用（自动绑定）' : '❌ 未启用（等待首次激活）'}\n`;
    message += `允许的 IP (${allowedIPs.length}/2): ${allowedIPs.length > 0 ? allowedIPs.join(', ') : '无'}\n\n`;

    if (data.devices && data.devices.length > 0) {
        message += '设备 IP 历史:\n';
        data.devices.forEach((device, index) => {
            message += `${index + 1}. ${device.machineId}\n`;
            message += `   首次: ${device.firstIP || '未知'}\n`;
            message += `   最近: ${device.lastIP || '未知'}\n`;
        });
        message += '\n';
    }

    message += '请选择操作:\n';
    message += '1. 添加 IP 地址\n';
    message += '2. 删除 IP 地址\n';
    message += '3. 禁用 IP 绑定\n';
    message += '4. 取消';

    const choice = prompt(message, '4');

    if (choice === '1') {
        await addIPToWhitelistFromList(license, allowedIPs);
    } else if (choice === '2') {
        await removeIPFromWhitelistFromList(license, allowedIPs);
    } else if (choice === '3') {
        await disableIPBindingFromList(license);
    }
}

// 从列表删除 IP
async function removeIPFromWhitelistFromList(license, currentIPs) {
    if (currentIPs.length === 0) {
        alert('当前没有绑定的 IP');
        return;
    }

    let message = '请选择要删除的 IP:\n\n';
    currentIPs.forEach((ip, index) => {
        message += `${index + 1}. ${ip}\n`;
    });

    const choice = prompt(message, '');
    if (!choice) return;

    const index = parseInt(choice) - 1;
    if (index < 0 || index >= currentIPs.length) {
        alert('无效的选择');
        return;
    }

    const ipToRemove = currentIPs[index];
    if (!confirm(`确定要删除 IP: ${ipToRemove} 吗？`)) return;

    const updatedIPs = currentIPs.filter((_, i) => i !== index);

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: updatedIPs.length > 0,
        allowedIPs: updatedIPs
    });

    if (result.success) {
        showMessage(`已删除 IP: ${ipToRemove}`, 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 从列表添加 IP 到白名单
async function addIPToWhitelistFromList(license, currentIPs) {
    // 检查 IP 数量限制
    if (currentIPs.length >= 2) {
        alert('每个密钥最多只能绑定 2 个 IP 地址\n\n如需添加新 IP，请先删除现有 IP');
        return;
    }

    const newIP = prompt('请输入要添加的 IP 地址:', '');
    if (!newIP || !newIP.trim()) return;

    const ip = newIP.trim();
    if (currentIPs.includes(ip)) {
        alert('该 IP 已在白名单中');
        return;
    }

    const updatedIPs = [...currentIPs, ip];

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: true,
        allowedIPs: updatedIPs
    });

    if (result.success) {
        showMessage(`已添加 IP: ${ip}`, 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 从列表启用 IP 绑定
async function enableIPBindingFromList(license, currentIPs) {
    if (currentIPs.length === 0) {
        alert('请先设置 IP 白名单');
        await setIPWhitelistFromList(license, false);
        return;
    }

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: true,
        allowedIPs: currentIPs
    });

    if (result.success) {
        showMessage('IP 绑定已启用', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 从列表禁用 IP 绑定
async function disableIPBindingFromList(license) {
    if (!confirm('确定要禁用 IP 绑定吗？')) return;

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: false
    });

    if (result.success) {
        showMessage('IP 绑定已禁用', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 从列表设置 IP 白名单
async function setIPWhitelistFromList(license, currentEnabled) {
    const ipsText = prompt('请输入允许的 IP 地址（每行一个）:\n\n例如:\n192.168.1.100\n10.0.0.50', '');
    if (ipsText === null) return;

    const allowedIPs = ipsText.split('\n')
        .map(ip => ip.trim())
        .filter(ip => ip.length > 0);

    if (allowedIPs.length === 0) {
        alert('请至少输入一个 IP 地址');
        return;
    }

    const result = await apiRequest('updateIPBinding', {
        license,
        enabled: currentEnabled,
        allowedIPs
    });

    if (result.success) {
        showMessage('IP 白名单已更新', 'success');
        loadAllLicenses();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}


// ==================== 激活审核功能 ====================

// 加载待审核 IP 列表
async function loadPendingIPs() {
    const result = await apiRequest('listPendingIPs', {});
    console.log('loadPendingIPs result:', result); // 调试信息
    if (result.success) {
        displayPendingIPs(result.data);
    } else {
        const errorMsg = result.error || '未知错误';
        console.error('加载待审核IP失败:', errorMsg); // 调试信息
        document.getElementById('pendingIPsContainer').innerHTML = `<div class="loading">加载失败: ${errorMsg}</div>`;
    }
}

// 显示待审核 IP
function displayPendingIPs(list) {
    if (!list || list.length === 0) {
        document.getElementById('pendingIPsContainer').innerHTML = '<div class="loading">暂无待审核的激活请求</div>';
        return;
    }

    let html = '<table><thead><tr><th>IP 地址</th><th>密钥</th><th>设备 ID</th><th>激活时间</th><th>最后活跃</th><th>任务次数</th><th>剩余时间</th><th>类型</th><th>订单号</th><th>操作</th></tr></thead><tbody>';
    list.forEach(item => {
        const taskCount = item.taskCount || 0;
        const maxTasks = item.maxTasks || 10;
        const taskInfo = `${taskCount} / ${maxTasks}`;
        const taskBadge = taskCount >= maxTasks ? 'badge-danger' : 'badge-info';
        const deviceIdShort = item.machineIdFull ? item.machineIdFull.substring(0, 8) + '...' : '-';
        const licenseType = item.licenseType || '临时密钥';
        const contactInfo = item.contact_info || '-';
        html += `<tr>
            <td><span class="code">${item.ip}</span></td>
            <td><span class="code">${item.license || '-'}</span></td>
            <td><span class="code" title="${item.machineIdFull || ''}">${deviceIdShort}</span></td>
            <td>${item.createdAt}</td>
            <td>${item.lastSeen || '-'}</td>
            <td><span class="badge ${taskBadge}">${taskInfo}</span></td>
            <td><span class="badge badge-warning">${item.remaining}</span></td>
            <td><span class="badge badge-secondary">${licenseType}</span></td>
            <td><span class="code" title="${contactInfo}">${contactInfo}</span></td>
            <td>
                <button class="btn btn-success btn-sm" onclick="approveIPAction('${item.ip}')">✅ 通过</button>
                <button class="btn btn-danger btn-sm" onclick="rejectIPAction('${item.ip}')">❌ 拒绝</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('pendingIPsContainer').innerHTML = html;
}

// 审核通过
async function approveIPAction(ip) {
    if (!confirm(`确定要通过 IP: ${ip} 的激活申请吗？\n\n通过后该 IP 可永久使用插件。`)) return;

    const result = await apiRequest('approveIP', { ip });
    if (result.success) {
        showMessage(`IP ${ip} 已通过审核`, 'success');
        loadPendingIPs();
        loadApprovedIPs();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 批量审核通过所有待审核IP
async function approveAllIPsAction() {
    if (!confirm(`确定要批量通过所有待审核的IP吗？\n\n通过后这些 IP 和设备ID 可永久使用插件。`)) return;

    showMessage('正在批量审核...', 'success');
    const result = await apiRequest('approveAllIPs', {});
    if (result.success) {
        showMessage(`已批量通过 ${result.data.count} 个IP`, 'success');
        loadPendingIPs();
        loadApprovedIPs();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 拒绝激活
async function rejectIPAction(ip) {
    if (!confirm(`确定要拒绝 IP: ${ip} 的激活申请吗？`)) return;

    const result = await apiRequest('rejectIP', { ip });
    if (result.success) {
        showMessage(`IP ${ip} 已拒绝`, 'success');
        loadPendingIPs();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 加载已通过 IP 列表
async function loadApprovedIPs() {
    const result = await apiRequest('listApprovedIPs', {});
    console.log('loadApprovedIPs result:', result); // 调试信息
    if (result.success) {
        console.log('Approved IPs data:', result.data); // 调试信息
        displayApprovedIPs(result.data);
    } else {
        document.getElementById('approvedIPsContainer').innerHTML = '<div class="loading">加载失败</div>';
    }
}

// 显示已通过 IP
function displayApprovedIPs(list) {
    if (!list || list.length === 0) {
        document.getElementById('approvedIPsContainer').innerHTML = '<div class="loading">暂无已通过的 IP</div>';
        return;
    }

    console.log('displayApprovedIPs - 开始渲染，数据条数:', list.length);
    console.log('displayApprovedIPs - 第一条数据:', list[0]);
    console.log('displayApprovedIPs - 第一条数据类型:', typeof list[0]);

    let html = '<table><thead><tr><th>IP 地址</th><th>设备 ID</th><th>通过时间</th><th>最近操作</th><th>操作</th></tr></thead><tbody>';
    list.forEach((item, index) => {
        // 兼容旧格式（字符串）和新格式（对象）
        const ip = typeof item === 'string' ? item : (item.ip || '');
        const machineId = typeof item === 'object' ? (item.machineId || '') : '';
        const approvedAt = typeof item === 'object' ? (item.approvedAt || '-') : '-';
        const lastSeen = typeof item === 'object' ? (item.lastSeen || '-') : '-';

        if (index === 0) {
            console.log('displayApprovedIPs - 解析后的数据:', { ip, machineId, approvedAt, lastSeen });
        }

        // 设备 ID 显示：如果有值则显示前8位，否则显示 -
        const machineIdDisplay = machineId ? machineId.substring(0, 8) + '...' : '-';

        html += `<tr>
            <td><span class="code">${ip}</span></td>
            <td><span class="code" title="${machineId}">${machineIdDisplay}</span></td>
            <td>${approvedAt}</td>
            <td>${lastSeen}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="removeApprovedIPAction('${ip}')">🗑️ 移除</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    html += `<div class="hint" style="margin-top: 10px;">共 ${list.length} 个已授权 IP</div>`;
    document.getElementById('approvedIPsContainer').innerHTML = html;
}

// 移除已通过 IP
async function removeApprovedIPAction(ip) {
    if (!confirm(`确定要移除 IP: ${ip} 吗？\n\n移除后该 IP 将无法使用插件。`)) return;

    const result = await apiRequest('removeApprovedIP', { ip });
    if (result.success) {
        showMessage(`IP ${ip} 已移除`, 'success');
        loadApprovedIPs();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}


// 加载被拒绝 IP 列表
async function loadRejectedIPs() {
    const result = await apiRequest('listRejectedIPs', {});
    if (result.success) {
        displayRejectedIPs(result.data);
    } else {
        document.getElementById('rejectedIPsContainer').innerHTML = '<div class="loading">加载失败</div>';
    }
}

// 显示被拒绝 IP
function displayRejectedIPs(list) {
    if (!list || list.length === 0) {
        document.getElementById('rejectedIPsContainer').innerHTML = '<div class="loading">暂无被拒绝的 IP</div>';
        return;
    }

    let html = '<table><thead><tr><th>IP 地址</th><th>操作</th></tr></thead><tbody>';
    list.forEach(ip => {
        html += `<tr>
            <td><span class="code">${ip}</span></td>
            <td>
                <button class="btn btn-success btn-sm" onclick="unrejectIPAction('${ip}')">🔄 恢复</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    html += `<div class="hint" style="margin-top: 10px;">共 ${list.length} 个被拒绝 IP</div>`;
    document.getElementById('rejectedIPsContainer').innerHTML = html;
}

// 恢复被拒绝的 IP
async function unrejectIPAction(ip) {
    if (!confirm(`确定要恢复 IP: ${ip} 吗？\n\n恢复后该 IP 可以重新申请激活。`)) return;

    const result = await apiRequest('unrejectIP', { ip });
    if (result.success) {
        showMessage(`IP ${ip} 已恢复`, 'success');
        loadRejectedIPs();
    } else {
        showMessage(result.error || '操作失败', 'error');
    }
}

// 手动封禁 IP
async function manualBanIP() {
    const input = document.getElementById('banIPInput');
    const ip = input.value.trim();

    if (!ip) {
        showMessage('请输入要封禁的 IP 地址', 'error');
        return;
    }

    // 简单验证 IP 格式
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        showMessage('请输入有效的 IP 地址格式（如 192.168.1.1）', 'error');
        return;
    }

    if (!confirm(`确定要封禁 IP: ${ip} 吗？\n\n封禁后该 IP 无法使用插件。`)) return;

    const result = await apiRequest('rejectIP', { ip });
    if (result.success) {
        showMessage(`IP ${ip} 已封禁`, 'success');
        input.value = ''; // 清空输入框
        loadRejectedIPs();
    } else {
        showMessage(result.error || '封禁失败', 'error');
    }
}

// ========== 密钥调试功能 ==========

// 当前测试使用的随机数据
let debugCurrentTestIP = '';
let debugCurrentTestDevice = '';

// 生成随机 IP
function debugGenerateRandomIP() {
    return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

// 生成随机设备ID（64位十六进制）
function debugGenerateRandomDeviceId() {
    let result = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < 64; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

// 重新生成测试数据
function debugRegenerateTestData() {
    debugCurrentTestIP = debugGenerateRandomIP();
    debugCurrentTestDevice = debugGenerateRandomDeviceId();
    debugUpdateTestInfo();
    showMessage('已生成新的随机测试数据', 'success');
}

// 更新显示的测试信息
function debugUpdateTestInfo() {
    document.getElementById('debugTestInfo').style.display = 'block';
    document.getElementById('debugCurrentIP').textContent = debugCurrentTestIP;
    document.getElementById('debugCurrentDevice').textContent = debugCurrentTestDevice.substring(0, 16) + '...';
}

// 初始化调试数据（页面加载时）
function initDebugData() {
    if (!debugCurrentTestIP) {
        debugCurrentTestIP = debugGenerateRandomIP();
        debugCurrentTestDevice = debugGenerateRandomDeviceId();
    }
}

// 获取调试配置
function getDebugConfig() {
    return {
        apiUrl: document.getElementById('debugApiUrl')?.value || config.apiUrl,
        adminKey: document.getElementById('debugAdminKey')?.value || config.adminKey
    };
}

// 调试 API 请求（管理员）
async function debugApiRequest(action, data = {}) {
    const debugConfig = getDebugConfig();
    try {
        const response = await fetch(debugConfig.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, adminKey: debugConfig.adminKey, ...data })
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 模拟客户端请求（带随机IP和设备ID）
async function debugClientRequest(action, data = {}) {
    const debugConfig = getDebugConfig();

    const requestData = {
        action,
        ...data,
        machineId: debugCurrentTestDevice,
        testIP: debugCurrentTestIP
    };

    try {
        const response = await fetch(debugConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Test-IP': debugCurrentTestIP
            },
            body: JSON.stringify(requestData)
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 设置结果框样式
function setDebugResultStyle(resultEl, success) {
    if (success) {
        resultEl.style.background = '#d4edda';
        resultEl.style.color = '#155724';
    } else {
        resultEl.style.background = '#f8d7da';
        resultEl.style.color = '#721c24';
    }
}

// 测试激活
async function debugTestValidate() {
    initDebugData();
    debugUpdateTestInfo();

    const license = document.getElementById('debugTestLicense').value.trim();
    if (!license) {
        showMessage('请输入测试密钥', 'error');
        return;
    }

    const result = document.getElementById('debugTestResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试激活...\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...`;

    const response = await debugClientRequest('validate', { license });

    setDebugResultStyle(result, response.success);
    result.textContent = `【激活测试结果】\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...\n\n${JSON.stringify(response, null, 2)}`;
}

// 测试开始任务
async function debugTestStartTask() {
    initDebugData();
    debugUpdateTestInfo();

    const license = document.getElementById('debugTestLicense').value.trim();
    if (!license) {
        showMessage('请输入测试密钥', 'error');
        return;
    }

    const result = document.getElementById('debugTestResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试开始任务...\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...`;

    const response = await debugClientRequest('startTask', { license });

    setDebugResultStyle(result, response.success);
    result.textContent = `【开始任务测试结果】\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...\n\n${JSON.stringify(response, null, 2)}`;
}

// 同时测试激活和开始任务
async function debugTestBoth() {
    initDebugData();
    debugUpdateTestInfo();

    const license = document.getElementById('debugTestLicense').value.trim();
    if (!license) {
        showMessage('请输入测试密钥', 'error');
        return;
    }

    const result = document.getElementById('debugTestResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在同时测试激活和开始任务...\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...`;

    const validateResponse = await debugClientRequest('validate', { license });
    const startTaskResponse = await debugClientRequest('startTask', { license });

    const hasError = !validateResponse.success || !startTaskResponse.success;
    setDebugResultStyle(result, !hasError);
    result.textContent = `【同时测试结果】\n\n密钥: ${license}\nIP: ${debugCurrentTestIP}\n设备ID: ${debugCurrentTestDevice.substring(0, 16)}...\n\n=== 激活结果 ===\n${JSON.stringify(validateResponse, null, 2)}\n\n=== 开始任务结果 ===\n${JSON.stringify(startTaskResponse, null, 2)}`;
}

// 加载存量数据到下拉框
async function debugLoadExistingData() {
    const ipSelect = document.getElementById('debugExistingIP');
    const deviceSelect = document.getElementById('debugExistingDevice');

    ipSelect.innerHTML = '<option value="">加载中...</option>';
    deviceSelect.innerHTML = '<option value="">加载中...</option>';

    // 加载待审核列表
    const pendingResponse = await debugApiRequest('listPendingIPs');
    // 加载已通过列表
    const approvedResponse = await debugApiRequest('listApprovedIPs');

    // 填充IP下拉框
    let ipOptions = '<option value="">-- 选择存量IP --</option>';

    if (pendingResponse.success && pendingResponse.data) {
        pendingResponse.data.forEach(item => {
            ipOptions += `<option value="${item.ip}">[待审核] ${item.ip}</option>`;
        });
    }

    if (approvedResponse.success && approvedResponse.data) {
        approvedResponse.data.forEach(item => {
            ipOptions += `<option value="${item.ip}">[已通过] ${item.ip}</option>`;
        });
    }

    ipSelect.innerHTML = ipOptions;

    // 填充设备ID下拉框
    let deviceOptions = '<option value="">-- 选择存量设备ID --</option>';
    const addedDevices = new Set();

    if (pendingResponse.success && pendingResponse.data) {
        pendingResponse.data.forEach(item => {
            if (item.machineIdFull && !addedDevices.has(item.machineIdFull)) {
                deviceOptions += `<option value="${item.machineIdFull}">[待审核] ${item.machineIdFull.substring(0, 16)}... (${item.ip})</option>`;
                addedDevices.add(item.machineIdFull);
            }
        });
    }

    if (approvedResponse.success && approvedResponse.data) {
        approvedResponse.data.forEach(item => {
            if (item.machineId && !addedDevices.has(item.machineId)) {
                deviceOptions += `<option value="${item.machineId}">[已通过] ${item.machineId.substring(0, 16)}... (${item.ip})</option>`;
                addedDevices.add(item.machineId);
            }
        });
    }

    deviceSelect.innerHTML = deviceOptions;

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d4edda';
    result.style.color = '#155724';
    result.textContent = `✅ 已加载存量数据\n\n待审核IP: ${pendingResponse.data?.length || 0} 个\n已通过IP: ${approvedResponse.data?.length || 0} 个`;
}

// 使用自定义数据测试
async function debugTestWithCustomData(ip, device, license, action = 'validate') {
    const debugConfig = getDebugConfig();

    try {
        const response = await fetch(debugConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Test-IP': ip
            },
            body: JSON.stringify({
                action: action,
                license: license,
                machineId: device,
                testIP: ip
            })
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 测试存量IP（激活）
async function debugTestExistingIP() {
    const ip = document.getElementById('debugExistingIP').value;
    const license = document.getElementById('debugExistingTestLicense').value.trim() || 'EMAIL-TEST';

    if (!ip) {
        showMessage('请先选择一个存量IP', 'error');
        return;
    }

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试存量IP（激活）...\n\nIP: ${ip}\n密钥: ${license}\n设备ID: 随机生成`;

    const testDevice = debugGenerateRandomDeviceId();
    const response = await debugTestWithCustomData(ip, testDevice, license, 'validate');

    setDebugResultStyle(result, response.success);
    result.textContent = `【存量IP激活测试结果】\n\nIP: ${ip}\n密钥: ${license}\n设备ID: ${testDevice.substring(0, 16)}... (随机)\n\n预期: 如果IP在白名单中，应该直接通过\n\n${JSON.stringify(response, null, 2)}`;
}

// 测试存量IP（开始任务）
async function debugTestExistingIPStartTask() {
    const ip = document.getElementById('debugExistingIP').value;
    const license = document.getElementById('debugExistingTestLicense').value.trim() || 'EMAIL-TEST';

    if (!ip) {
        showMessage('请先选择一个存量IP', 'error');
        return;
    }

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试存量IP（开始任务）...\n\nIP: ${ip}\n密钥: ${license}\n设备ID: 随机生成`;

    const testDevice = debugGenerateRandomDeviceId();
    const response = await debugTestWithCustomData(ip, testDevice, license, 'startTask');

    setDebugResultStyle(result, response.success);
    result.textContent = `【存量IP开始任务测试结果】\n\nIP: ${ip}\n密钥: ${license}\n设备ID: ${testDevice.substring(0, 16)}... (随机)\n\n预期: 如果IP在白名单中，应该直接通过\n\n${JSON.stringify(response, null, 2)}`;
}

// 测试存量设备（激活）
async function debugTestExistingDevice() {
    const device = document.getElementById('debugExistingDevice').value;
    const license = document.getElementById('debugExistingTestLicense').value.trim() || 'EMAIL-TEST';

    if (!device) {
        showMessage('请先选择一个存量设备ID', 'error');
        return;
    }

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试存量设备ID（激活）...\n\n设备ID: ${device.substring(0, 16)}...\n密钥: ${license}\nIP: 随机生成`;

    const testIP = debugGenerateRandomIP();
    const response = await debugTestWithCustomData(testIP, device, license, 'validate');

    setDebugResultStyle(result, response.success);
    result.textContent = `【存量设备ID激活测试结果】\n\nIP: ${testIP} (随机)\n密钥: ${license}\n设备ID: ${device.substring(0, 16)}...\n\n预期: 如果设备ID有激活记录，应该直接通过\n\n${JSON.stringify(response, null, 2)}`;
}

// 测试存量设备（开始任务）
async function debugTestExistingDeviceStartTask() {
    const device = document.getElementById('debugExistingDevice').value;
    const license = document.getElementById('debugExistingTestLicense').value.trim() || 'EMAIL-TEST';

    if (!device) {
        showMessage('请先选择一个存量设备ID', 'error');
        return;
    }

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = `正在测试存量设备ID（开始任务）...\n\n设备ID: ${device.substring(0, 16)}...\n密钥: ${license}\nIP: 随机生成`;

    const testIP = debugGenerateRandomIP();
    const response = await debugTestWithCustomData(testIP, device, license, 'startTask');

    setDebugResultStyle(result, response.success);
    result.textContent = `【存量设备ID开始任务测试结果】\n\nIP: ${testIP} (随机)\n密钥: ${license}\n设备ID: ${device.substring(0, 16)}...\n\n预期: 如果设备ID有激活记录，应该直接通过\n\n${JSON.stringify(response, null, 2)}`;
}

// 综合测试
async function debugTestExistingBoth() {
    const ip = document.getElementById('debugExistingIP').value;
    const device = document.getElementById('debugExistingDevice').value;
    const license = document.getElementById('debugExistingTestLicense').value.trim() || 'EMAIL-TEST';

    if (!ip && !device) {
        showMessage('请至少选择一个存量IP或设备ID', 'error');
        return;
    }

    const result = document.getElementById('debugExistingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = '正在综合测试...';

    let text = `【存量用户综合测试】\n\n密钥: ${license}\n\n`;

    // 测试1: 存量IP + 随机设备
    if (ip) {
        const testDevice1 = debugGenerateRandomDeviceId();
        text += `=== 测试1: 存量IP + 随机设备 ===\nIP: ${ip}\n设备: ${testDevice1.substring(0, 16)}... (随机)\n\n`;

        const validateResp = await debugTestWithCustomData(ip, testDevice1, license, 'validate');
        text += `激活结果: ${validateResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(validateResp, null, 2)}\n\n`;

        const startTaskResp = await debugTestWithCustomData(ip, testDevice1, license, 'startTask');
        text += `开始任务结果: ${startTaskResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(startTaskResp, null, 2)}\n\n`;
    }

    // 测试2: 随机IP + 存量设备
    if (device) {
        const testIP2 = debugGenerateRandomIP();
        text += `=== 测试2: 随机IP + 存量设备 ===\nIP: ${testIP2} (随机)\n设备: ${device.substring(0, 16)}...\n\n`;

        const validateResp = await debugTestWithCustomData(testIP2, device, license, 'validate');
        text += `激活结果: ${validateResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(validateResp, null, 2)}\n\n`;

        const startTaskResp = await debugTestWithCustomData(testIP2, device, license, 'startTask');
        text += `开始任务结果: ${startTaskResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(startTaskResp, null, 2)}\n\n`;
    }

    // 测试3: 存量IP + 存量设备
    if (ip && device) {
        text += `=== 测试3: 存量IP + 存量设备 ===\nIP: ${ip}\n设备: ${device.substring(0, 16)}...\n\n`;

        const validateResp = await debugTestWithCustomData(ip, device, license, 'validate');
        text += `激活结果: ${validateResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(validateResp, null, 2)}\n\n`;

        const startTaskResp = await debugTestWithCustomData(ip, device, license, 'startTask');
        text += `开始任务结果: ${startTaskResp.success ? '✅ 通过' : '❌ 失败'}\n${JSON.stringify(startTaskResp, null, 2)}\n\n`;
    }

    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = text;
}

// 查看待审核列表
async function debugListPendingIPs() {
    const result = document.getElementById('debugPendingResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = '正在加载...';

    const response = await debugApiRequest('listPendingIPs');

    if (response.success && response.data) {
        let text = `找到 ${response.data.length} 条记录：\n\n`;
        response.data.forEach((item, index) => {
            text += `${index + 1}. IP: ${item.ip}\n`;
            text += `   设备ID: ${item.machineIdFull ? item.machineIdFull.substring(0, 16) + '...' : '-'}\n`;
            text += `   激活时间: ${item.createdAt}\n`;
            text += `   最后活跃: ${item.lastSeen}\n`;
            text += `   任务次数: ${item.taskCount}\n`;
            text += `   剩余时间: ${item.remaining}\n\n`;
        });
        result.style.background = '#d4edda';
        result.style.color = '#155724';
        result.textContent = text;
    } else {
        result.style.background = '#f8d7da';
        result.style.color = '#721c24';
        result.textContent = JSON.stringify(response, null, 2);
    }
}

// 分析待审核问题
async function debugAnalyzePendingIPs() {
    const result = document.getElementById('debugAnalysisResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = '正在分析...';

    const response = await debugApiRequest('listPendingIPs');

    if (response.success && response.data) {
        const records = response.data;
        let text = `📊 问题分析报告\n\n`;
        text += `总记录数: ${records.length}\n\n`;

        // 按 IP 分组
        const byIP = {};
        records.forEach(r => {
            if (!byIP[r.ip]) byIP[r.ip] = [];
            byIP[r.ip].push(r);
        });

        text += `不同 IP 数量: ${Object.keys(byIP).length}\n`;
        Object.keys(byIP).forEach(ip => {
            text += `  - ${ip}: ${byIP[ip].length} 条记录\n`;
        });
        text += `\n`;

        // 按设备ID分组
        const byDevice = {};
        records.forEach(r => {
            const deviceShort = r.machineIdFull ? r.machineIdFull.substring(0, 16) : 'unknown';
            if (!byDevice[deviceShort]) byDevice[deviceShort] = [];
            byDevice[deviceShort].push(r);
        });

        text += `不同设备ID（前16位）数量: ${Object.keys(byDevice).length}\n`;
        Object.keys(byDevice).forEach(device => {
            text += `  - ${device}...: ${byDevice[device].length} 条记录\n`;
        });

        result.style.background = '#d1ecf1';
        result.style.color = '#0c5460';
        result.textContent = text;
    } else {
        result.style.background = '#f8d7da';
        result.style.color = '#721c24';
        result.textContent = JSON.stringify(response, null, 2);
    }
}

// 查看日志（调试页面）
async function debugGetLogs() {
    const result = document.getElementById('debugLogsResult');
    result.style.display = 'block';
    result.style.background = '#d1ecf1';
    result.style.color = '#0c5460';
    result.textContent = '正在加载...';

    const response = await debugApiRequest('getLogs', { page: 1, pageSize: 50 });

    if (response.success && response.data) {
        let text = `最近 ${response.data.length} 条日志：\n\n`;
        response.data.forEach((log, index) => {
            text += `${index + 1}. ${log.timestamp} - ${log.action}\n`;
            text += `   用户: ${log.customer || '-'}\n`;
            text += `   密钥: ${log.license || '-'}\n`;
            text += `   设备: ${log.machineId ? log.machineId.substring(0, 16) + '...' : '-'}\n`;
            text += `   IP: ${log.ip || '-'}\n`;
            text += `   结果: ${log.success === true ? '✅成功' : log.success === false ? '❌失败' : '-'}\n\n`;
        });
        result.style.background = '#d4edda';
        result.style.color = '#155724';
        result.textContent = text;
    } else {
        result.style.background = '#f8d7da';
        result.style.color = '#721c24';
        result.textContent = JSON.stringify(response, null, 2);
    }
}

// ==================== IP 管理功能 ====================

// 缓存所有 IP 数据
let allIPsCache = [];

// 加载所有 IP
async function loadAllIPs() {
    document.getElementById('allIPsContainer').innerHTML = '<div class="loading">正在加载...</div>';

    // 并行加载三个列表
    const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        apiRequest('listPendingIPs', {}),
        apiRequest('listApprovedIPs', {}),
        apiRequest('listRejectedIPs', {})
    ]);

    allIPsCache = [];

    // 处理待审核 IP
    if (pendingResult.success && pendingResult.data) {
        pendingResult.data.forEach(item => {
            allIPsCache.push({
                ip: item.ip,
                status: 'pending',
                statusText: '待审核',
                machineId: item.machineIdFull || '',
                createdAt: item.createdAt || '-',
                lastSeen: item.lastSeen || '-',
                taskCount: item.taskCount || 0,
                maxTasks: item.maxTasks || 10,
                remaining: item.remaining || '-',
                licenseType: item.licenseType || '临时密钥',
                note: item.note || ''
            });
        });
    }

    // 处理已通过 IP
    if (approvedResult.success && approvedResult.data) {
        approvedResult.data.forEach(item => {
            const ip = typeof item === 'string' ? item : (item.ip || '');
            const machineId = typeof item === 'object' ? (item.machineId || '') : '';
            const approvedAt = typeof item === 'object' ? (item.approvedAt || '-') : '-';
            const lastSeen = typeof item === 'object' ? (item.lastSeen || '-') : '-';

            allIPsCache.push({
                ip: ip,
                status: 'approved',
                statusText: '已通过',
                machineId: machineId,
                createdAt: approvedAt,
                lastSeen: lastSeen,
                taskCount: '-',
                maxTasks: '-',
                remaining: '永久',
                licenseType: '正式授权',
                note: typeof item === 'object' ? (item.note || '') : ''
            });
        });
    }

    // 处理已拒绝 IP
    if (rejectedResult.success && rejectedResult.data) {
        rejectedResult.data.forEach(ip => {
            allIPsCache.push({
                ip: ip,
                status: 'rejected',
                statusText: '已拒绝',
                machineId: '-',
                createdAt: '-',
                lastSeen: '-',
                taskCount: '-',
                maxTasks: '-',
                remaining: '-',
                licenseType: '-',
                note: ''
            });
        });
    }

    // 按激活时间排序（最新优先）
    allIPsCache.sort((a, b) => {
        // 处理 '-' 或空值
        if (a.createdAt === '-' || !a.createdAt) return 1;
        if (b.createdAt === '-' || !b.createdAt) return -1;
        // 尝试解析日期
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA; // 降序
    });

    displayIPStats();
    displayAllIPsList(allIPsCache);
}

// 显示 IP 统计
function displayIPStats() {
    const pending = allIPsCache.filter(i => i.status === 'pending').length;
    const approved = allIPsCache.filter(i => i.status === 'approved').length;
    const rejected = allIPsCache.filter(i => i.status === 'rejected').length;

    document.getElementById('ipStatsGrid').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">待审核</div>
            <div class="stat-value" style="color: #ffc107;">${pending}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">已通过</div>
            <div class="stat-value" style="color: #28a745;">${approved}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">已拒绝</div>
            <div class="stat-value" style="color: #dc3545;">${rejected}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">总计</div>
            <div class="stat-value">${allIPsCache.length}</div>
        </div>
    `;
}

// 显示 IP 列表
function displayAllIPsList(list) {
    if (!list || list.length === 0) {
        document.getElementById('allIPsContainer').innerHTML = '<div class="loading">暂无 IP 数据</div>';
        return;
    }

    let html = '<table><thead><tr><th>IP 地址</th><th>备注</th><th>状态</th><th>设备 ID</th><th>激活时间</th><th>最后活跃</th><th>任务次数</th><th>操作</th></tr></thead><tbody>';

    list.forEach(item => {
        const statusBadge = item.status === 'approved' ? 'badge-success' :
            item.status === 'pending' ? 'badge-warning' : 'badge-danger';
        const machineIdDisplay = item.machineId && item.machineId !== '-' ?
            item.machineId.substring(0, 8) + '...' : '-';
        const noteDisplay = item.note ? `<strong>${item.note}</strong>` : '<span style="color:#999">-</span>';

        let actions = `<button class="btn btn-sm" onclick="editIPNote('${item.ip}', '${(item.note || '').replace(/'/g, "\\'")}')">✏️</button> `;
        if (item.status === 'pending') {
            actions += `
                <button class="btn btn-success btn-sm" onclick="approveIPAction('${item.ip}')">✅</button>
                <button class="btn btn-danger btn-sm" onclick="rejectIPAction('${item.ip}')">❌</button>
            `;
        } else if (item.status === 'approved') {
            actions += `<button class="btn btn-danger btn-sm" onclick="removeApprovedIPAction('${item.ip}')">🗑️</button>`;
        } else if (item.status === 'rejected') {
            actions += `<button class="btn btn-success btn-sm" onclick="unrejectIPAction('${item.ip}')">🔄</button>`;
        }

        html += `<tr>
            <td><span class="code">${item.ip}</span></td>
            <td>${noteDisplay}</td>
            <td><span class="badge ${statusBadge}">${item.statusText}</span></td>
            <td><span class="code" title="${item.machineId}">${machineIdDisplay}</span></td>
            <td>${item.createdAt}</td>
            <td>${item.lastSeen}</td>
            <td>${item.taskCount !== '-' ? item.taskCount + ' / ' + item.maxTasks : '-'}</td>
            <td>${actions}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    html += `<div class="hint" style="margin-top: 10px;">共 ${list.length} 个 IP 地址</div>`;
    document.getElementById('allIPsContainer').innerHTML = html;
}

// 搜索 IP
function searchIPs() {
    const keyword = document.getElementById('ipSearchKeyword').value.trim().toLowerCase();

    if (!keyword) {
        displayAllIPsList(allIPsCache);
        return;
    }

    const filtered = allIPsCache.filter(item =>
        item.ip.toLowerCase().includes(keyword) ||
        (item.machineId && item.machineId.toLowerCase().includes(keyword)) ||
        (item.note && item.note.toLowerCase().includes(keyword))
    );

    displayAllIPsList(filtered);
}

// 编辑 IP 备注
async function editIPNote(ip, currentNote) {
    const note = prompt('为该 IP 设置备注名称（如用户名）:', currentNote);
    if (note === null) return; // 取消

    const result = await apiRequest('updateIPNote', { ip, note });
    if (result.success) {
        showMessage('备注已更新', 'success');
        // 更新本地 IP 缓存
        const item = allIPsCache.find(i => i.ip === ip);
        if (item) item.note = note;
        // 更新全局用户数据缓存
        const globalInfo = globalUserData.ipToInfo.get(ip);
        if (globalInfo) globalInfo.userName = note;
        displayAllIPsList(allIPsCache);
    } else {
        showMessage(result.error || '更新失败', 'error');
    }
}

// ==================== 设备总览功能 ====================

// 缓存所有设备数据
let allDevicesCache = [];

// 加载所有设备
async function loadAllDevices() {
    document.getElementById('allDevicesContainer').innerHTML = '<div class="loading">正在加载...</div>';

    // 并行加载待审核和已通过列表来提取设备信息
    const [pendingResult, approvedResult, licensesResult] = await Promise.all([
        apiRequest('listPendingIPs', {}),
        apiRequest('listApprovedIPs', {}),
        apiRequest('list', { page: 1, pageSize: 1000 })
    ]);

    const deviceMap = new Map(); // 用 machineId 去重

    // 从待审核列表提取设备
    if (pendingResult.success && pendingResult.data) {
        pendingResult.data.forEach(item => {
            if (item.machineIdFull) {
                const existing = deviceMap.get(item.machineIdFull);
                if (!existing) {
                    deviceMap.set(item.machineIdFull, {
                        machineId: item.machineIdFull,
                        status: 'pending',
                        statusText: '待审核',
                        ips: [item.ip],
                        licenses: [],
                        firstSeen: item.createdAt || '-',
                        lastSeen: item.lastSeen || '-',
                        isBanned: false
                    });
                } else {
                    if (!existing.ips.includes(item.ip)) {
                        existing.ips.push(item.ip);
                    }
                }
            }
        });
    }

    // 从已通过列表提取设备
    if (approvedResult.success && approvedResult.data) {
        approvedResult.data.forEach(item => {
            if (typeof item === 'object' && item.machineId) {
                const existing = deviceMap.get(item.machineId);
                if (!existing) {
                    deviceMap.set(item.machineId, {
                        machineId: item.machineId,
                        status: 'approved',
                        statusText: '已授权',
                        ips: [item.ip],
                        licenses: [],
                        firstSeen: item.approvedAt || '-',
                        lastSeen: item.lastSeen || '-',
                        isBanned: false
                    });
                } else {
                    existing.status = 'approved';
                    existing.statusText = '已授权';
                    if (item.ip && !existing.ips.includes(item.ip)) {
                        existing.ips.push(item.ip);
                    }
                }
            }
        });
    }

    // 从密钥的设备列表中提取设备（需要查询每个密钥的设备）
    if (licensesResult.success && licensesResult.data && licensesResult.data.licenses) {
        for (const lic of licensesResult.data.licenses) {
            // 尝试获取设备信息
            const statusResult = await apiRequest('status', { license: lic.license });
            if (statusResult.success && statusResult.data && statusResult.data.devices) {
                statusResult.data.devices.forEach(device => {
                    const existing = deviceMap.get(device.machineId);
                    if (!existing) {
                        deviceMap.set(device.machineId, {
                            machineId: device.machineId,
                            status: device.isBanned ? 'banned' : 'active',
                            statusText: device.isBanned ? '已封禁' : '正常',
                            ips: device.lastIP ? [device.lastIP] : [],
                            licenses: [lic.license],
                            firstSeen: device.firstSeen || '-',
                            lastSeen: device.lastSeen || '-',
                            isBanned: device.isBanned || false,
                            totalTasks: device.totalTasks || 0
                        });
                    } else {
                        if (device.totalTasks) {
                            existing.totalTasks = (existing.totalTasks || 0) + device.totalTasks;
                        }
                        if (!existing.licenses.includes(lic.license)) {
                            existing.licenses.push(lic.license);
                        }
                        if (device.lastIP && !existing.ips.includes(device.lastIP)) {
                            existing.ips.push(device.lastIP);
                        }
                        if (device.isBanned) {
                            existing.status = 'banned';
                            existing.statusText = '已封禁';
                            existing.isBanned = true;
                        }
                    }
                });
            }
        }
    }

    allDevicesCache = Array.from(deviceMap.values());
    displayDeviceStats();
    displayAllDevicesList(allDevicesCache);
}

// 显示设备统计
function displayDeviceStats() {
    const active = allDevicesCache.filter(d => d.status === 'active' || d.status === 'approved').length;
    const pending = allDevicesCache.filter(d => d.status === 'pending').length;
    const banned = allDevicesCache.filter(d => d.status === 'banned').length;

    document.getElementById('deviceStatsGrid').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">正常/已授权</div>
            <div class="stat-value" style="color: #28a745;">${active}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">待审核</div>
            <div class="stat-value" style="color: #ffc107;">${pending}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">已封禁</div>
            <div class="stat-value" style="color: #dc3545;">${banned}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">总设备数</div>
            <div class="stat-value">${allDevicesCache.length}</div>
        </div>
    `;
}

// 显示设备列表
function displayAllDevicesList(list) {
    if (!list || list.length === 0) {
        document.getElementById('allDevicesContainer').innerHTML = '<div class="loading">暂无设备数据</div>';
        return;
    }

    let html = '<table><thead><tr><th>设备 ID</th><th>状态</th><th>关联 IP</th><th>关联密钥</th><th>任务数</th><th>首次使用</th><th>最后使用</th><th>操作</th></tr></thead><tbody>';

    list.forEach(item => {
        const statusBadge = item.status === 'approved' || item.status === 'active' ? 'badge-success' :
            item.status === 'pending' ? 'badge-warning' : 'badge-danger';
        const machineIdDisplay = item.machineId.substring(0, 12) + '...';
        const ipsDisplay = item.ips.length > 0 ? item.ips.slice(0, 2).join(', ') + (item.ips.length > 2 ? ` (+${item.ips.length - 2})` : '') : '-';
        const licensesDisplay = item.licenses.length > 0 ? item.licenses[0].substring(0, 15) + (item.licenses.length > 1 ? ` (+${item.licenses.length - 1})` : '') : '-';

        let actions = '';
        if (item.licenses.length > 0) {
            // 有关联密钥的设备可以封禁/解封
            if (item.isBanned) {
                actions = `<button class="btn btn-success btn-sm" onclick="unbanDeviceGlobal('${item.licenses[0]}', '${item.machineId}')">🔓 解封</button>`;
            } else {
                actions = `<button class="btn btn-danger btn-sm" onclick="banDeviceGlobal('${item.licenses[0]}', '${item.machineId}')">🔒 封禁</button>`;
            }
        } else {
            actions = '<span class="hint">-</span>';
        }

        html += `<tr>
            <td><span class="code" title="${item.machineId}">${machineIdDisplay}</span></td>
            <td><span class="badge ${statusBadge}">${item.statusText}</span></td>
            <td><span class="code" title="${item.ips.join(', ')}">${ipsDisplay}</span></td>
            <td><span class="code" title="${item.licenses.join(', ')}">${licensesDisplay}</span></td>
            <td><span class="badge badge-info">${item.totalTasks || 0}</span></td>
            <td>${item.firstSeen}</td>
            <td>${item.lastSeen}</td>
            <td>${actions}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    html += `<div class="hint" style="margin-top: 10px;">共 ${list.length} 个设备</div>`;
    document.getElementById('allDevicesContainer').innerHTML = html;
}

// 搜索设备
function searchDevicesGlobal() {
    const keyword = document.getElementById('deviceSearchKeyword').value.trim().toLowerCase();

    if (!keyword) {
        displayAllDevicesList(allDevicesCache);
        return;
    }

    const filtered = allDevicesCache.filter(item =>
        item.machineId.toLowerCase().includes(keyword) ||
        item.ips.some(ip => ip.toLowerCase().includes(keyword)) ||
        item.licenses.some(lic => lic.toLowerCase().includes(keyword))
    );

    displayAllDevicesList(filtered);
}

// 全局封禁设备
async function banDeviceGlobal(license, machineId) {
    if (!confirm(`确定要封禁设备 ${machineId.substring(0, 12)}... 吗？`)) return;
    const result = await apiRequest('banDevice', { license, machineId });
    if (result.success) {
        showMessage('设备已封禁', 'success');
        loadAllDevices();
    } else {
        showMessage(result.error || '封禁失败', 'error');
    }
}

// 全局解封设备
async function unbanDeviceGlobal(license, machineId) {
    if (!confirm(`确定要解封设备 ${machineId.substring(0, 12)}... 吗？`)) return;
    const result = await apiRequest('unbanDevice', { license, machineId });
    if (result.success) {
        showMessage('设备已解封', 'success');
        loadAllDevices();
    } else {
        showMessage(result.error || '解封失败', 'error');
    }
}

// ==================== 版本管理功能 ====================

// 检查当前版本
async function checkCurrentVersion() {
    const display = document.getElementById('currentVersionDisplay');
    display.innerHTML = '加载中...';

    // 使用 debugClientRequest (无需 adminKey) 或者 apiRequest (需 adminKey)
    // getLatestVersion 是公开接口，但我们在后台用 apiRequest 也行
    const result = await apiRequest('getLatestVersion', {});

    if (result.success && result.data) {
        const info = result.data;
        if (!info.version || info.version === '1.0.0') {
            display.innerHTML = '暂无发布记录';
        } else {
            const dateStr = info.publishedAt ? new Date(info.publishedAt).toLocaleString() : '-';
            display.innerHTML = `
                <strong>${info.version}</strong><br>
                <small style="color: #666">发布时间: ${dateStr}</small><br>
                <div style="margin-top: 5px; font-size: 13px;">${info.updateNotes || '无更新说明'}</div>
                <div style="margin-top: 5px;"><a href="${info.downloadUrl}" target="_blank">下载链接</a></div>
            `;

            // 自动填充下一次版本号 (简单逻辑: 补丁号+1)
            const parts = info.version.split('.');
            if (parts.length === 3) {
                parts[2] = parseInt(parts[2]) + 1;
                document.getElementById('newVersionInput').value = parts.join('.');
            }
        }
    } else {
        display.innerHTML = '<span style="color: red">加载失败</span>';
    }
}

// 发布新版本
async function publishNewVersion() {
    const version = document.getElementById('newVersionInput').value.trim();
    const downloadUrl = document.getElementById('newDownloadUrlInput').value.trim();
    const updateNotes = document.getElementById('newUpdateNotesInput').value.trim();

    if (!version) {
        showMessage('请输入版本号', 'error');
        return;
    }
    if (!downloadUrl) {
        showMessage('请输入下载链接', 'error');
        return;
    }

    if (!confirm(`确定要发布版本 ${version} 吗？\n\n发布后，所有使用旧版插件的用户都会收到更新提示。`)) {
        return;
    }

    const result = await apiRequest('setLatestVersion', {
        version,
        downloadUrl,
        updateNotes
    });

    if (result.success) {
        showMessage(`版本 ${version} 发布成功！`, 'success');
        checkCurrentVersion();
        loadVersionHistory(); // 刷新历史

        // 清空输入
        document.getElementById('newUpdateNotesInput').value = '';
    } else {
        showMessage(result.error || '发布失败', 'error');
    }
}

// 加载历史版本
async function loadVersionHistory() {
    const container = document.getElementById('versionHistoryContainer');
    container.innerHTML = '加载中...';

    const result = await apiRequest('listVersions', {});

    if (result.success) {
        const list = result.data || [];
        if (list.length === 0) {
            container.innerHTML = '<div style="color: #999; padding: 10px;">暂无历史版本</div>';
            return;
        }

        let html = '<table class="table"><thead><tr><th>版本</th><th>发布时间</th><th>更新说明</th><th>下载链接</th></tr></thead><tbody>';

        list.forEach(item => {
            const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '-';
            const notes = item.updateNotes ? item.updateNotes.replace(/\n/g, '<br>') : '-';
            html += `<tr>
                <td><strong>${item.version}</strong></td>
                <td>${dateStr}</td>
                <td style="max-width: 300px; font-size: 13px;">${notes}</td>
                <td><a href="${item.downloadUrl}" target="_blank">下载</a></td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div style="color: red;">加载失败</div>';
    }
}

// ==================== 临时密钥配置管理 ====================

// 加载临时密钥配置
async function loadAutoDeliveryConfig() {
    const result = await apiRequest('getAutoDeliveryConfig', {});
    
    if (result.success && result.data) {
        const config = result.data;
        document.getElementById('autoDeliveryLicenseName').value = config.license || 'AUTOEMAIL8888';
        document.getElementById('autoDeliveryValidHours').value = config.validHours || 12;
        document.getElementById('autoDeliveryMaxTasks').value = config.maxTasks || 10;
        document.getElementById('autoDeliveryMaxActivations').value = config.maxActivations || 3;
        showMessage('配置已加载', 'success');
    } else {
        showMessage('加载配置失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 保存临时密钥配置
async function saveAutoDeliveryConfig() {
    const license = document.getElementById('autoDeliveryLicenseName').value.trim();
    const validHours = parseInt(document.getElementById('autoDeliveryValidHours').value);
    const maxTasks = parseInt(document.getElementById('autoDeliveryMaxTasks').value);
    const maxActivations = parseInt(document.getElementById('autoDeliveryMaxActivations').value);
    
    // 验证
    if (!license) {
        showMessage('密钥名称不能为空', 'error');
        return;
    }
    if (validHours < 1 || validHours > 168) {
        showMessage('有效期必须在 1-168 小时之间', 'error');
        return;
    }
    if (maxTasks < 1 || maxTasks > 1000) {
        showMessage('最大任务数必须在 1-1000 之间', 'error');
        return;
    }
    if (maxActivations < 1 || maxActivations > 100) {
        showMessage('最大激活次数必须在 1-100 之间', 'error');
        return;
    }
    
    if (!confirm(`确定要保存临时密钥配置吗？\n\n密钥: ${license}\n有效期: ${validHours} 小时\n最大任务数: ${maxTasks} 次\n最大激活次数: ${maxActivations} 次\n\n修改后立即生效！`)) {
        return;
    }
    
    const result = await apiRequest('setAutoDeliveryConfig', {
        license,
        validHours,
        maxTasks,
        maxActivations
    });
    
    if (result.success) {
        showMessage('✅ 临时密钥配置已保存', 'success');
    } else {
        showMessage('保存失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 恢复默认配置
function resetAutoDeliveryConfig() {
    if (!confirm('确定要恢复默认配置吗？')) return;
    
    document.getElementById('autoDeliveryLicenseName').value = 'AUTOEMAIL8888';
    document.getElementById('autoDeliveryValidHours').value = 12;
    document.getElementById('autoDeliveryMaxTasks').value = 10;
    document.getElementById('autoDeliveryMaxActivations').value = 3;
    
    showMessage('已恢复默认配置，请点击保存按钮应用', 'success');
}

// 页面切换监听 (可选，用于自动加载数据)
const originalShowPage = window.showPage;
window.showPage = function (pageId) {
    if (originalShowPage) originalShowPage(pageId);

    if (pageId === 'settings') {
        checkCurrentVersion();
        loadVersionHistory();
        // 临时密钥配置已移到密钥管理页面，这里不再加载
    }
};


// ==================== 密钥管理页面的临时密钥配置 ====================

// 加载临时密钥配置（密钥管理页面）
async function loadTempLicenseConfigInLicensePage() {
    const result = await apiRequest('getAutoDeliveryConfig', {});
    
    if (result.success && result.data) {
        const config = result.data;
        
        // 填充配置表单
        document.getElementById('tempLicenseName').value = config.license || 'AUTOEMAIL8888';
        document.getElementById('tempValidHours').value = config.validHours || 12;
        document.getElementById('tempMaxTasks').value = config.maxTasks || 10;
        document.getElementById('tempMaxActivations').value = config.maxActivations || 3;
        
        showMessage('配置已加载', 'success');
    } else {
        showMessage('加载配置失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 保存临时密钥配置（密钥管理页面）
async function saveTempLicenseConfigInLicensePage() {
    const license = document.getElementById('tempLicenseName').value.trim();
    const validHours = parseInt(document.getElementById('tempValidHours').value);
    const maxTasks = parseInt(document.getElementById('tempMaxTasks').value);
    const maxActivations = parseInt(document.getElementById('tempMaxActivations').value);
    
    // 验证
    if (!license) {
        showMessage('密钥名称不能为空', 'error');
        return;
    }
    if (validHours < 1 || validHours > 168) {
        showMessage('有效期必须在 1-168 小时之间', 'error');
        return;
    }
    if (maxTasks < 1 || maxTasks > 1000) {
        showMessage('最大任务数必须在 1-1000 之间', 'error');
        return;
    }
    if (maxActivations < 1 || maxActivations > 100) {
        showMessage('最大激活次数必须在 1-100 之间', 'error');
        return;
    }
    
    if (!confirm(`确定要保存临时密钥配置吗？\n\n密钥: ${license}\n有效期: ${validHours} 小时\n最大任务数: ${maxTasks} 次\n最大激活次数: ${maxActivations} 次\n\n⚠️ 修改后旧密钥立即失效！`)) {
        return;
    }
    
    const result = await apiRequest('setAutoDeliveryConfig', {
        license,
        validHours,
        maxTasks,
        maxActivations
    });
    
    if (result.success) {
        showMessage('✅ 临时密钥配置已保存，旧密钥已失效', 'success');
        // 重新加载配置
        loadTempLicenseConfigInLicensePage();
    } else {
        showMessage('保存失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 恢复默认配置（密钥管理页面）
function resetTempLicenseConfigInLicensePage() {
    if (!confirm('确定要恢复默认配置吗？')) return;
    
    document.getElementById('tempLicenseName').value = 'AUTOEMAIL8888';
    document.getElementById('tempValidHours').value = 12;
    document.getElementById('tempMaxTasks').value = 10;
    document.getElementById('tempMaxActivations').value = 3;
    
    showMessage('已恢复默认配置，请点击保存按钮应用', 'success');
}

// 复制临时密钥名称
function copyTempLicenseName() {
    const license = document.getElementById('tempLicenseName').value.trim();
    if (!license) {
        showMessage('密钥名称为空', 'error');
        return;
    }
    copyToClipboard(license);
}

// 修改页面切换逻辑，加载密钥管理页面时自动加载配置
const originalShowPageByName = window.showPageByName || showPageByName;
window.showPageByName = function(pageName) {
    if (originalShowPageByName) originalShowPageByName(pageName);
    
    if (pageName === 'licenses') {
        loadTempLicenseConfigInLicensePage(); // 加载临时密钥配置
    }
};


// ==================== 封禁管理页面 ====================

// 封禁 IP
async function banIPAction() {
    const ip = document.getElementById('banIPInput').value.trim();
    if (!ip) {
        showMessage('请输入 IP 地址', 'error');
        return;
    }
    
    if (!confirm(`确定要封禁 IP: ${ip} 吗？\n\n封禁后该 IP 无法使用插件`)) {
        return;
    }
    
    const result = await apiRequest('rejectIP', { ip });
    
    if (result.success) {
        showMessage('✅ IP 已封禁', 'success');
        document.getElementById('banIPInput').value = '';
        loadBannedIPs();
    } else {
        showMessage('封禁失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 加载已封禁的 IP 列表
async function loadBannedIPs() {
    const result = await apiRequest('listRejectedIPs', {});
    
    if (result.success && result.data) {
        const ips = result.data;
        
        if (ips.length === 0) {
            document.getElementById('bannedIPsList').innerHTML = '<p style="color: #6c757d;">暂无封禁的 IP</p>';
            return;
        }
        
        let html = '<table><thead><tr><th>IP 地址</th><th>操作</th></tr></thead><tbody>';
        ips.forEach(ip => {
            html += `<tr>
                <td><span class="code">${ip}</span></td>
                <td><button class="btn btn-success btn-sm" onclick="unbanIPAction('${ip}')">✅ 解封</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('bannedIPsList').innerHTML = html;
    }
}

// 解封 IP
async function unbanIPAction(ip) {
    if (!confirm(`确定要解封 IP: ${ip} 吗？`)) return;
    
    const result = await apiRequest('unrejectIP', { ip });
    
    if (result.success) {
        showMessage('✅ IP 已解封', 'success');
        loadBannedIPs();
    } else {
        showMessage('解封失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 封禁密钥（新版本）
async function banLicenseAction() {
    const license = document.getElementById('banLicenseInput').value.trim();
    if (!license) {
        showMessage('请输入密钥', 'error');
        return;
    }
    
    if (!confirm(`确定要封禁密钥: ${license} 吗？\n\n封禁后该密钥无法激活`)) {
        return;
    }
    
    const result = await apiRequest('ban', { license });
    
    if (result.success) {
        showMessage('✅ 密钥已封禁', 'success');
        document.getElementById('banLicenseInput').value = '';
        loadBannedLicenses();
    } else {
        showMessage('封禁失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 加载已封禁的密钥列表
async function loadBannedLicenses() {
    const result = await apiRequest('list', { page: 1, pageSize: 1000 });
    
    if (result.success && result.data && result.data.licenses) {
        const bannedLicenses = result.data.licenses.filter(lic => lic.isBanned);
        
        if (bannedLicenses.length === 0) {
            document.getElementById('bannedLicensesList').innerHTML = '<p style="color: #6c757d;">暂无封禁的密钥</p>';
            return;
        }
        
        let html = '<table><thead><tr><th>密钥</th><th>客户</th><th>操作</th></tr></thead><tbody>';
        bannedLicenses.forEach(lic => {
            html += `<tr>
                <td><span class="code">${lic.license}</span></td>
                <td>${lic.customer}</td>
                <td><button class="btn btn-success btn-sm" onclick="unbanLicenseAction('${lic.license}')">✅ 解封</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('bannedLicensesList').innerHTML = html;
    }
}

// 解封密钥
async function unbanLicenseAction(license) {
    if (!confirm(`确定要解封密钥: ${license} 吗？`)) return;
    
    const result = await apiRequest('unbanLicense', { license });
    
    if (result.success) {
        showMessage('✅ 密钥已解封', 'success');
        loadBannedLicenses();
    } else {
        showMessage('解封失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 封禁设备
async function banDeviceAction() {
    const license = document.getElementById('banDeviceLicense').value.trim();
    const machineId = document.getElementById('banDeviceId').value.trim();
    
    if (!license || !machineId) {
        showMessage('请输入密钥和设备 ID', 'error');
        return;
    }
    
    if (!confirm(`确定要封禁设备吗？\n\n密钥: ${license}\n设备 ID: ${machineId.substring(0, 12)}...`)) {
        return;
    }
    
    const result = await apiRequest('banDevice', { license, machineId });
    
    if (result.success) {
        showMessage('✅ 设备已封禁', 'success');
        document.getElementById('banDeviceLicense').value = '';
        document.getElementById('banDeviceId').value = '';
        // 如果有查询结果，刷新查询
        const queryLicense = document.getElementById('queryDeviceLicense').value.trim();
        if (queryLicense) {
            queryDevicesForBan();
        }
    } else {
        showMessage('封禁失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 查询设备（用于封禁）
async function queryDevicesForBan() {
    const license = document.getElementById('queryDeviceLicense').value.trim();
    if (!license) {
        showMessage('请输入密钥', 'error');
        return;
    }
    
    const result = await apiRequest('status', { license });
    
    if (result.success && result.data) {
        displayDevicesForBan(result.data, license);
    } else {
        showMessage('查询失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 显示设备列表（用于封禁）
function displayDevicesForBan(data, license) {
    if (!data.devices || data.devices.length === 0) {
        document.getElementById('devicesForBanResult').innerHTML = '<p style="color: #6c757d;">该密钥暂无设备使用记录</p>';
        return;
    }
    
    let html = '<table><thead><tr><th>设备 ID</th><th>首次激活</th><th>最后使用</th><th>最近 IP</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    data.devices.forEach(device => {
        const status = device.isBanned ? 
            '<span class="badge badge-danger">已封禁</span>' : 
            '<span class="badge badge-success">正常</span>';
        
        const action = device.isBanned ?
            `<button class="btn btn-success btn-sm" onclick="unbanDeviceAction('${license}', '${device.machineId}')">✅ 解封</button>` :
            `<button class="btn btn-danger btn-sm" onclick="quickBanDevice('${license}', '${device.machineId}')">🚫 封禁</button>`;
        
        html += `<tr>
            <td><span class="code" title="${device.machineId}">${device.machineIdShort}</span></td>
            <td>${device.firstSeen}</td>
            <td>${device.lastSeen}</td>
            <td><span class="code">${device.lastIP || '未知'}</span></td>
            <td>${status}</td>
            <td>${action}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('devicesForBanResult').innerHTML = html;
}

// 快速封禁设备（从列表中）
async function quickBanDevice(license, machineId) {
    if (!confirm(`确定要封禁设备 ${machineId.substring(0, 12)}... 吗？`)) return;
    
    const result = await apiRequest('banDevice', { license, machineId });
    
    if (result.success) {
        showMessage('✅ 设备已封禁', 'success');
        queryDevicesForBan();
    } else {
        showMessage('封禁失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 解封设备
async function unbanDeviceAction(license, machineId) {
    if (!confirm(`确定要解封设备 ${machineId.substring(0, 12)}... 吗？`)) return;
    
    const result = await apiRequest('unbanDevice', { license, machineId });
    
    if (result.success) {
        showMessage('✅ 设备已解封', 'success');
        queryDevicesForBan();
    } else {
        showMessage('解封失败: ' + (result.error || '未知错误'), 'error');
    }
}

// 页面加载时初始化封禁管理
const originalShowPageByName2 = window.showPageByName;
window.showPageByName = function(pageName) {
    if (originalShowPageByName2) originalShowPageByName2(pageName);
    
    if (pageName === 'devices') {
        loadBannedIPs();
        loadBannedLicenses();
    }
};
