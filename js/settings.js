// 设置页：关闭行为、自定义提示音、更新公告
// 版本号（用于更新公告显示）
const APP_VERSION = "V1.1.5";

// 更新公告内容
const UPDATE_ANNOUNCEMENT = `
<div style="margin-bottom:10px"><strong>🎉 正式版 V1.1.5（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>📁 安装与配置路径调整：程序安装到本地 <code>version/V{版本号}/</code> 目录，配置文件（settings.json、arbi_config.json）随程序存放，不再写入 AppData</li>
  <li>🔧 导入按钮改为纯文字「批量导入 ▾」，避免 emoji 不显示</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.1.4（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>👆 仲裁效率改为行内编辑：直接点击任意一条仲裁任务即可修改效率上下限和评级，类似 wf.wiki 操作</li>
  <li>💾 保存后立即生效并持久化，底部仍保留 JSON 批量导入入口</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.1.3（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>🎯 仲裁评级规则修正：改为按期望效率上限判定——≥700 卓越，≥500 推荐，≥300 普通，无数据 未定</li>
  <li>⚙ 新增仲裁效率编辑面板：可手动修改各节点效率上下限、覆盖评级，或粘贴 JSON 批量导入</li>
  <li>💾 配置持久化保存至本地（AppData），重启不丢失，支持一键恢复默认</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.1.2（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>⚡ Warframe Market 价格查询大幅提速：从逐个串行改为并行抓取（全局限流 3 req/sec），遗物 6 件奖励+本体从 20-30 秒降至约 2-5 秒</li>
  <li>🚀 启动加载提速：裂缝约 0.6 秒就绪，世界状态（周期/突击/虚空风暴）秒级返回；数据源超时从 30 秒降至 10 秒</li>
  <li>🔧 仲裁效率评级改为独立后台刷新，不再阻塞世界状态数据加载</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.1.1（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>🌌 虚空裂缝选项卡重构为「普通 / 钢铁 / 九重天」三单级标签，九重天风暴合并展示（数据源无钢铁标记）</li>
  <li>🌍 地球节点昼夜与夜灵平原同步（自 Update 38.5 起已统一），不再出现时间不一致</li>
  <li>🟠 新增火卫二魔胎之阈「混乱 / 秩序」周期显示，与平原周期同步</li>
  <li>💎 遗物搜索优化：支持「前纪 A3」「前纪A3」「前A3」等模糊匹配，输入「A3」列出所有含 A3 的遗物</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.1.0（2026-10-15）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>⚡ 仲裁期望效率数据修正：改用 arbi.guide 权威数据，按地图节点显示每小时精炼精华（VE）期望产量区间（如 ⚡450-550/h）</li>
  <li>🚀 新增自动更新：启动时自动检测 GitHub 最新版本，有新版时提示下载安装，安装后自动重启</li>
  <li>🌌 虚空裂缝分组重构：始源星系 / 九重天（风暴）分开显示，两组均保留 普通/钢铁 筛选</li>
</ul>
<div style="margin:10px 0 6px"><strong>📜 正式版 V1.0.0（2026-10-02）</strong></div>
<ul style="margin:8px 0;padding-left:20px;line-height:2">
  <li>🖥️ 全面转向 WebView2 + C# 桌面应用，移除网页端服务</li>
  <li>🏠 新增「主页」仪表盘：世界环境周期、虚空商人、每日突击、执政官猎杀、当前仲裁一览</li>
  <li>⚡ 虚空裂缝与仲裁队列板块融合至主页，不再单独陈列</li>
  <li>🌐 世界状态数据源切换至 warframestat.us 官方 API，并接入 tenno.tools 备用数据源自动切换，保障数据持续可用</li>
  <li>📊 仲裁任务评级接入 arbi.wf.wiki 排行榜真实数据（按各任务最高纪录评级）</li>
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
