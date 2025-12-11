// 切换标签页
function showTab(tabName) {
    // 隐藏所有标签页
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有导航项的激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 显示选中的标签页
    document.getElementById(tabName).classList.add('active');
    
    // 激活对应的导航项
    event.currentTarget.classList.add('active');
    
    // 滚动到顶部
    window.scrollTo(0, 0);
    
    // 加载对应页面的数据
    if (tabName === 'dashboard') {
        loadDashboard();
    } else if (tabName === 'licenses') {
        loadAllLicenses();
    }
}

// 重写显示统计数据的函数（移动端优化）
function displayStats(data) {
    const total = data.total || 0;
    const active = data.licenses.filter(l => !l.isBanned && new Date(l.expire) > new Date()).length;
    const devices = data.licenses.reduce((sum, l) => sum + l.devicesUsed, 0);
    const banned = data.licenses.filter(l => l.isBanned).length;

    document.getElementById('statsContainer').innerHTML = `
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

// 重写显示最近密钥的函数（移动端优化）
function displayRecentLicenses(data) {
    if (!data.licenses || data.licenses.length === 0) {
        document.getElementById('recentLicenses').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">暂无数据</div></div>';
        return;
    }

    let html = '';
    data.licenses.slice(0, 5).forEach(lic => {
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      new Date(lic.expire) < new Date() ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        
        html += `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${lic.license}</div>
                    ${status}
                </div>
                <div class="list-item-info">👤 ${lic.customer}</div>
                <div class="list-item-info">📱 ${lic.devicesUsed} / ${lic.maxDevices} 台设备</div>
            </div>
        `;
    });
    document.getElementById('recentLicenses').innerHTML = html;
}

// 重写显示所有密钥的函数（移动端优化）
function displayAllLicenses(data) {
    if (!data.licenses || data.licenses.length === 0) {
        document.getElementById('allLicenses').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">暂无数据</div></div>';
        return;
    }

    let html = '';
    data.licenses.forEach(lic => {
        const isExpired = new Date(lic.expire) < new Date();
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      isExpired ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        
        const banBtn = lic.isBanned ? 
            `<button class="btn-small btn-success" onclick="unbanLicenseAction('${lic.license}')">解封</button>` :
            `<button class="btn-small btn-danger" onclick="banLicenseAction('${lic.license}')">封禁</button>`;
        
        html += `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${lic.license}</div>
                    ${status}
                </div>
                <div class="list-item-info">👤 ${lic.customer}</div>
                <div class="list-item-info">📅 ${lic.expire}</div>
                <div class="list-item-info">📱 ${lic.devicesUsed} / ${lic.maxDevices} 台设备</div>
                <div class="list-item-actions">
                    <button class="btn-small" onclick="editLicense('${lic.license}')">编辑</button>
                    ${banBtn}
                    <button class="btn-small btn-danger" onclick="deleteLicense('${lic.license}')">删除</button>
                </div>
            </div>
        `;
    });
    document.getElementById('allLicenses').innerHTML = html;
}

// 重写显示设备的函数（移动端优化）
function displayDevices(data, license) {
    if (!data.devices || data.devices.length === 0) {
        document.getElementById('devicesResult').innerHTML = '<div class="section"><div class="empty-state"><div class="empty-state-icon">📱</div><div class="empty-state-text">该激活码暂无设备使用记录</div></div></div>';
        return;
    }

    let html = '<div class="section"><h2>设备列表</h2>';
    data.devices.forEach(device => {
        const status = device.isBanned ? '<span class="badge badge-danger">已封禁</span>' : '<span class="badge badge-success">正常</span>';
        const action = device.isBanned ?
            `<button class="btn-small btn-success" onclick="unbanDevice('${license}', '${device.machineId}')">解封</button>` :
            `<button class="btn-small btn-danger" onclick="banDevice('${license}', '${device.machineId}')">封禁</button>`;
        
        const ipHistoryBtn = device.ipHistory && device.ipHistory.length > 0 ? 
            `<button class="btn-small" onclick="showIPHistory('${device.machineId}', ${JSON.stringify(device.ipHistory).replace(/"/g, '&quot;')})">IP历史</button>` : '';
        
        html += `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${device.machineIdShort}</div>
                    ${status}
                </div>
                <div class="list-item-info">🕐 首次: ${device.firstSeen}</div>
                <div class="list-item-info">🕐 最近: ${device.lastSeen}</div>
                <div class="list-item-info">🌐 首次IP: ${device.firstIP || '未知'}</div>
                <div class="list-item-info">🌐 最近IP: ${device.lastIP || '未知'}</div>
                <div class="list-item-actions">
                    ${action}
                    ${ipHistoryBtn}
                </div>
            </div>
        `;
    });
    html += '</div>';
    document.getElementById('devicesResult').innerHTML = html;
}

// 重写显示搜索结果的函数（移动端优化）
function displaySearchResults(licenses) {
    if (!licenses || licenses.length === 0) {
        document.getElementById('allLicenses').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">未找到匹配的密钥</div></div>';
        document.getElementById('licensesPagination').innerHTML = '';
        return;
    }

    let html = '';
    licenses.forEach(lic => {
        const status = lic.isBanned ? '<span class="badge badge-danger">已封禁</span>' : 
                      lic.isExpired ? '<span class="badge badge-warning">已过期</span>' :
                      '<span class="badge badge-success">正常</span>';
        
        const banBtn = lic.isBanned ? 
            `<button class="btn-small btn-success" onclick="unbanLicenseAction('${lic.license}')">解封</button>` :
            `<button class="btn-small btn-danger" onclick="banLicenseAction('${lic.license}')">封禁</button>`;
        
        html += `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${lic.license}</div>
                    ${status}
                </div>
                <div class="list-item-info">👤 ${lic.customer}</div>
                <div class="list-item-info">📅 ${lic.expire}</div>
                <div class="list-item-info">📱 ${lic.devicesUsed} / ${lic.maxDevices} 台设备</div>
                <div class="list-item-actions">
                    <button class="btn-small" onclick="editLicense('${lic.license}')">编辑</button>
                    ${banBtn}
                    <button class="btn-small btn-danger" onclick="deleteLicense('${lic.license}')">删除</button>
                </div>
            </div>
        `;
    });
    document.getElementById('allLicenses').innerHTML = html;
    document.getElementById('licensesPagination').innerHTML = `<div class="pagination"><span>共找到 ${licenses.length} 条记录</span></div>`;
}

// 重写显示分页的函数（移动端优化）
function displayLicensesPagination(data) {
    if (data.totalPages <= 1) {
        document.getElementById('licensesPagination').innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';
    if (currentPage > 1) {
        html += `<button onclick="loadAllLicenses(${currentPage - 1})">⬅️ 上一页</button>`;
    }
    html += `<span>第 ${currentPage} / ${data.totalPages} 页</span>`;
    if (currentPage < data.totalPages) {
        html += `<button onclick="loadAllLicenses(${currentPage + 1})">下一页 ➡️</button>`;
    }
    html += '</div>';
    document.getElementById('licensesPagination').innerHTML = html;
}

// 页面加载完成后初始化
window.addEventListener('load', function() {
    loadDashboard();
});
