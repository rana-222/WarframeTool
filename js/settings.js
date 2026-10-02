// 设置页：关闭行为、自定义提示音、更新公告
// 版本号（用于更新公告显示）
const APP_VERSION = "V1.0.0";

// 更新公告内容
const UPDATE_ANNOUNCEMENT = `
<div style="margin-bottom:10px"><strong>🎉 正式版 V1.0.0（2026-10-02）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>🖥️ 全面转向 WebView2 + C# 桌面应用，移除网页端服务</li>
  <li>🏠 新增「主页」仪表盘：世界环境周期、虚空商人、每日突击、执政官猎杀、当前仲裁一览</li>
  <li>⚡ 虚空裂缝与仲裁队列板块融合至主页，不再单独陈列</li>
  <li>🌐 世界状态数据源切换至 warframestat.us 官方 API，并接入 tenno.tools 备用数据源自动切换，保障数据持续可用</li>
  <li>📊 仲裁任务评级接入 arbi.wf.wiki 排行榜真实数据（按各任务最高纪录评级），任务卡片直接显示生息效率（如 ⚡598.7/h）</li>
  <li>📅 仲裁日历改为折叠式：常驻「« 当前日期 »」翻页条，点 📅 展开日历选日期，小窗口不再挤压队列</li>
  <li>📖 新增「Wiki 查找」页：应用内直接浏览灰机 Wiki（warframe.huijiwiki.com），支持站内搜索与返回工具</li>
  <li>📜 裂缝/仲裁列表面板固定高度、内部滚动，页面不再冗长；评级筛选支持一行/两行自适应</li>
  <li>🚀 数据加载提速：分层轮询（裂缝快速端点 60 秒 / 世界状态 10 分钟），启动数秒内即可看到裂缝数据</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 测试版历史：</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2;color:var(--muted)">
  <li>测试版 v0.1 — 裂罅计算器、虚空裂缝、仲裁队列</li>
  <li>测试版 v0.2 — 订阅提醒、自定义提示音、系统托盘、设置页</li>
  <li>测试版 v0.3 — 遗物价格计算、物品价格查询（中英双语、中位价、订单一键复制）</li>
  <li>测试版 v0.4 — 裂缝数据稳定性修复（后台轮询 + 缓存回退）</li>
</ul>
`;

let _customSoundDataUrl = null;

function initSettings() {
    // 加载保存的关闭行为
    const behavior = localStorage.getItem('closeBehavior') || 'exit';
    const radio = document.querySelector(`input[name="closeBehavior"][value="${behavior}"]`);
    if (radio) radio.checked = true;

    // 加载自定义提示音
    _customSoundDataUrl = localStorage.getItem('customSound');
    updateSoundStatus();

    // 显示更新公告
    const el = document.getElementById('updateAnnouncement');
    if (el) el.innerHTML = UPDATE_ANNOUNCEMENT;

    // 通知前端后端关闭行为设置
    saveCloseBehavior();
}

function saveCloseBehavior() {
    const radio = document.querySelector('input[name="closeBehavior"]:checked');
    const behavior = radio ? radio.value : 'exit';
    localStorage.setItem('closeBehavior', behavior);
    // 通知 C# 后端
    fetch('/api/settings?closeBehavior=' + behavior).catch(() => {});
}

function handleSoundUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert('音频文件不能超过 5MB');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        _customSoundDataUrl = e.target.result;
        localStorage.setItem('customSound', _customSoundDataUrl);
        updateSoundStatus();
        // 试听
        playCustomSound();
    };
    reader.readAsDataURL(file);
    // 重置 input 允许重复选择同一文件
    event.target.value = '';
}

function updateSoundStatus() {
    const el = document.getElementById('soundStatus');
    if (!el) return;
    el.textContent = _customSoundDataUrl ? '当前：自定义提示音' : '当前：默认提示音';
    el.style.color = _customSoundDataUrl ? 'var(--green-dark)' : 'var(--muted)';
}

function playCustomSound() {
    if (_customSoundDataUrl) {
        try {
            const audio = new Audio(_customSoundDataUrl);
            audio.play();
        } catch (e) {
            playNotificationSound(); // fallback to default
        }
    } else {
        playNotificationSound();
    }
}

function resetSound() {
    _customSoundDataUrl = null;
    localStorage.removeItem('customSound');
    updateSoundStatus();
}

// 重写通知声音播放逻辑（优先使用自定义声音）
const _origPlaySound = window.playNotificationSound;
window.playNotificationSound = function() {
    if (_customSoundDataUrl) {
        try {
            const audio = new Audio(_customSoundDataUrl);
            audio.play();
            return;
        } catch (e) { /* fallback */ }
    }
    if (_origPlaySound) _origPlaySound();
};
