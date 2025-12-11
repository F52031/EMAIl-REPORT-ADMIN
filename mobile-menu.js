// 移动端菜单切换功能
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 保存原始的 showPage 函数
    const originalShowPage = window.showPage;
    
    // 重写 showPage 函数，添加自动关闭菜单功能
    window.showPage = function(pageName) {
        // 调用原始函数
        if (originalShowPage) {
            originalShowPage(pageName);
        }
        
        // 在移动端自动关闭菜单
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.overlay');
            if (sidebar && overlay) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        }
    };
});
