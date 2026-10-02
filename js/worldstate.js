// ============================================================
// Warframe 世界状态：主页仪表盘（环境周期/虚空商人/突击/执政官猎杀）
//                  + 虚空裂缝 + 仲裁队列
// 数据来自后端代理接口（C# 后台轮询 warframestat.us 并缓存）
// ============================================================

const FISSURES_API = "/api/fissures";
const ARBITRATIONS_API = "/api/arbitrations";
const WORLDSTATE_API = "/api/worldstate";
const REFRESH_INTERVAL = 30000; // 30秒刷新（后端缓存，零 HTTP 开销）

// 裂缝等级颜色映射
const TIER_COLORS = {
    "Lith":    "#8CCBF5",
    "Meso":    "#F5C84C",
    "Neo":     "#2DC56A",
    "Axi":     "#C3A8F5",
    "Requiem": "#E5484D",
    "Omnia":   "#FF8C42"
};

// 裂缝等级中文映射
const TIER_ZH = {
    "Lith":    "古纪",
    "Meso":    "前纪",
    "Neo":     "中纪",
    "Axi":     "后纪",
    "Requiem": "安魂",
    "Omnia":   "全能"
};

// 裂缝等级排序权重（古→前→中→后→安魂→全能）
const TIER_ORDER = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Omnia"];
function tierOrder(tier){
    const idx = TIER_ORDER.indexOf(tier);
    return idx >= 0 ? idx : 99;
}

// 任务类型排序权重（参照 Warframe 星图官方顺序）
const MISSION_ORDER = [
    "Capture", "Exterminate", "Extermination", "Sabotage", "Rescue", "Spy",
    "Mobile Defense", "Defense", "Survival", "Interception", "Excavation",
    "Hijack", "Hive", "Hive Sabotage", "Orokin Sabotage", "Disruption",
    "Infested Salvage", "Defection", "Alchemy", "Void Flood", "Void Cascade",
    "Void Armageddon", "Mirror Defense", "Volatile", "Assassination",
    "Arena", "Skirmish", "Orphix", "Free Roam", "Conclave", "Ascension",
    "Assault", "Ancient Retribution", "Netracells", "Relay",
    "The Perita Rebellion", "Dark Sector Defense", "Dark Sector Survival",
    "Dark Sector Excavation", "Dark Sector Disruption", "Dark Sector Defection"
];
function missionOrder(mission){
    const idx = MISSION_ORDER.indexOf(mission);
    return idx >= 0 ? idx : 99;
}

// 派系标签颜色
const FACTION_COLORS = {
    "Grineer":  "#E5484D",
    "Corpus":   "#4A90D9",
    "Infested": "#9B59B6",
    "Orokin":   "#F5C84C",
    "Sentient": "#2DC56A",
    "Crossfire":"#888888"
};

// 星球中文映射（参照 Warframe 官方中文）
const PLANET_ZH = {
    "Mercury":      "水星",
    "Venus":        "金星",
    "Earth":        "地球",
    "Mars":         "火星",
    "Jupiter":      "木星",
    "Saturn":       "土星",
    "Uranus":       "天王星",
    "Neptune":      "海王星",
    "Pluto":        "冥王星",
    "Ceres":        "谷神星",
    "Eris":         "阋神星",
    "Europa":       "木卫二",
    "Lua":          "月球",
    "Phobos":       "火卫一",
    "Deimos":       "火卫二",
    "Sedna":        "塞德娜",
    "Void":         "虚空",
    "Kuva Fortress":"赤毒要塞",
    "Zariman":      "扎里曼号",
    "Duviri":       "双衍王境",
    "Veil":         "面纱比邻星"
};

// 任务类型中文映射（参照 Warframe 官方中文）
const MISSION_ZH = {
    "Assassination":            "刺杀",
    "Exterminate":              "歼灭",
    "Extermination":            "歼灭",
    "Capture":                  "捕获",
    "Spy":                      "间谍",
    "Sabotage":                 "破坏",
    "Rescue":                   "救援",
    "Defense":                  "防御",
    "Mobile Defense":           "移动防御",
    "Survival":                 "生存",
    "Interception":             "拦截",
    "Excavation":               "挖掘",
    "Hijack":                   "劫持",
    "Hive":                     "巢穴",
    "Hive Sabotage":            "巢穴破坏",
    "Orokin Sabotage":          "奥罗金破坏",
    "Disruption":               "中断",
    "Infested Salvage":         "感染者救援",
    "Defection":                "叛逃",
    "Alchemy":                  "炼金",
    "Void Flood":               "虚空洪流",
    "Void Cascade":             "虚空瀑布",
    "Void Armageddon":          "虚空决战",
    "Mirror Defense":           "镜像防御",
    "Arena":                    "竞技场",
    "Rush":                     "冲刺",
    "Pursuit":                  "追击",
    "Skirmish":                 "空战",
    "Orphix":                   "奥菲克斯",
    "Free Roam":                "自由漫游",
    "Conclave":                 "武形秘仪",
    "Ascension":                "升阶",
    "Assault":                  "突击",
    "Ancient Retribution":      "远古复仇",
    "Volatile":                 "爆发",
    "Netracells":               "网织细胞",
    "Relay":                    "中继站",
    "The Perita Rebellion":     "佩里塔叛乱",
    "Dark Sector Defense":      "黑暗地带防御",
    "Dark Sector Survival":     "黑暗地带生存",
    "Dark Sector Excavation":   "黑暗地带挖掘",
    "Dark Sector Disruption":   "黑暗地带中断",
    "Dark Sector Defection":    "黑暗地带叛逃"
};

function factionColor(faction){
    return FACTION_COLORS[faction] || "#888";
}
function tierColor(tier){
    return TIER_COLORS[tier] || "#888";
}

// 翻译辅助函数（阵营不翻译，保持英文原名）
function zhTier(t){ return TIER_ZH[t] || t; }
function zhMission(m){
    if(!m) return "-";
    // 精确匹配优先
    if(MISSION_ZH[m]) return MISSION_ZH[m];
    // 处理带 (Archwing) 后缀的
    const archMatch = m.match(/^(.+?)\s*\(Archwing\)$/);
    if(archMatch && MISSION_ZH[archMatch[1]]){
        return MISSION_ZH[archMatch[1]] + "（曲翼）";
    }
    return m;
}

// 翻译节点中的星球名
// 裂缝格式: "Planet/Node"  → "星球/Node"
// 仲裁格式: "Node (Planet)" → "Node（星球）"
function zhNode(node){
    if(!node) return "-";
    // 仲裁格式: "Gaia (Earth)"
    const arbiMatch = node.match(/^(.+?)\s*\(([^)]+)\)$/);
    if(arbiMatch){
        const name = arbiMatch[1].trim();
        const planet = arbiMatch[2].trim();
        return `${name}（${PLANET_ZH[planet] || planet}）`;
    }
    // 裂缝格式: "Phobos/Monolith"
    const fissureMatch = node.match(/^([^/]+)\/(.+)$/);
    if(fissureMatch){
        const planet = fissureMatch[1].trim();
        const name = fissureMatch[2].trim();
        return `${PLANET_ZH[planet] || planet}/${name}`;
    }
    // 纯星球名
    if(PLANET_ZH[node]) return PLANET_ZH[node];
    return node;
}

// 解析时间戳（支持秒级数字 和 ISO 字符串）
function parseTimestamp(val){
    if(val == null || val === "") return NaN;
    const num = Number(val);
    if(!isNaN(num)) return num * 1000;  // 秒 → 毫秒
    const d = new Date(val);            // ISO 字符串
    return isNaN(d.getTime()) ? NaN : d.getTime();
}

// 格式化时间剩余（时:分:秒）
function formatRemaining(expiryStr){
    if(!expiryStr) return "";
    const expiry = parseTimestamp(expiryStr);
    if(isNaN(expiry)) return "时间异常";
    const diff = expiry - Date.now();
    if(diff <= 0) return "已结束";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h}时${m.toString().padStart(2,'0')}分${s.toString().padStart(2,'0')}秒`;
}

// 格式化仲裁开始时间
function formatArbiTime(ts){
    const d = new Date(ts * 1000);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:00`;
}

// 格式化仲裁倒计时（时:分:秒）
function formatArbiCountdown(startTs){
    const diff = Number(startTs) * 1000 - Date.now();  // 秒 → 毫秒
    if(diff <= 0) return "进行中";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h}时${m.toString().padStart(2,'0')}分${s.toString().padStart(2,'0')}秒后`;
}

// ============ 裂缝渲染 ============
let _allFissures = [];      // 全部裂缝数据缓存
let _fissureTab = "normal";  // 当前选中的标签页 normal / steel

function setFissureTab(type){
    _fissureTab = type;
    document.querySelectorAll(".ws-tab").forEach(btn=>{
        btn.classList.toggle("active", btn.dataset.fissureType === type);
    });
    renderFissures(_allFissures);
}

function renderFissures(data){
    _allFissures = data || [];
    const container = document.getElementById("fissuresList");
    if(!container) return;

    // 按标签页过滤：普通 = !isHard，钢铁 = isHard
    const filtered = _allFissures.filter(f =>
        _fissureTab === "steel" ? f.isHard : !f.isHard
    );

    // 排序：等级（古→前→中→后→安魂→全能）→ 任务类型（官方顺序）→ 节点名
    filtered.sort((a, b) => {
        const ta = tierOrder(a.tier), tb = tierOrder(b.tier);
        if(ta !== tb) return ta - tb;
        const ma = missionOrder(a.missionType), mb = missionOrder(b.missionType);
        if(ma !== mb) return ma - mb;
        return (a.node || "").localeCompare(b.node || "");
    });

    if(filtered.length === 0){
        container.innerHTML = `<div class="ws-empty">暂无${_fissureTab === "steel" ? "钢铁" : "普通"}裂缝数据</div>`;
        return;
    }
    const html = filtered.map(f => {
        const tColor = tierColor(f.tier);
        const fColor = factionColor(f.enemy);
        const storm = f.isStorm ? '<span class="ws-tag storm">风暴</span>' : '';
        return `
        <div class="ws-item fissure-item">
            <div class="ws-item-head">
                <span class="ws-tier" style="background:${tColor}">${zhTier(f.tier)}</span>
                <span class="ws-mission">${zhMission(f.missionType)}</span>
                ${storm}
            </div>
            <div class="ws-node">${zhNode(f.node)}</div>
            <div class="ws-meta">
                <span class="ws-faction" style="color:${fColor}">${f.enemy || '-'}</span>
                <span class="ws-timer" data-expiry="${f.expiry}">${formatRemaining(f.expiry)}</span>
            </div>
        </div>`;
    }).join("");
    container.innerHTML = html;
}

// ============ 仲裁评级 ============
// 评级由后端根据 arbi.wf.wiki 排行榜各任务类型最高纪录给出：
// 传奇(S) / 优秀(A系) / 普通(无数据或F)，同时附带该纪录的生息效率 effPct
const LEVEL_LABEL = {common:"普通", excellent:"优秀", legendary:"传奇"};
function arbiLevel(a){
    return a.level || "common";
}

// ============ 仲裁日历状态 ============
let _allArbitrations = [];   // 全部仲裁数据缓存
let _calView = new Date();   // 日历当前显示的月份
let _selectedDate = null;    // 选中的日期（Date 对象，0点）
let _levelFilter = "all";    // 等级筛选

// 将时间戳转为本地日期 key (YYYY-MM-DD)
function dayKey(ts){
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}
// 将 Date 转为日期 key
function dateKey(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}

// 渲染日历（折叠式：翻页条常驻，月视图按需展开）
const WEEK_ZH = ["周日","周一","周二","周三","周四","周五","周六"];
function renderCalendar(){
    const grid = document.getElementById("calGrid");
    const title = document.getElementById("calTitle");
    if(!grid || !title) return;

    // 翻页条当前日期文本
    const cur = document.getElementById("calCurrent");
    if(cur && _selectedDate){
        cur.textContent = `${_selectedDate.getFullYear()}年${_selectedDate.getMonth()+1}月${_selectedDate.getDate()}日 ${WEEK_ZH[_selectedDate.getDay()]}`;
    }

    const year = _calView.getFullYear();
    const month = _calView.getMonth();
    title.textContent = `${year}年${month+1}月`;

    // 当月第一天是星期几
    const firstDay = new Date(year, month, 1).getDay();
    // 当月天数
    const daysInMonth = new Date(year, month+1, 0).getDate();
    // 今天
    const todayKey = dateKey(new Date());

    // 收集有仲裁数据的日期
    const dataDays = new Set(_allArbitrations.map(a => dayKey(a.start)));

    let html = "";
    // 前置空格
    for(let i=0;i<firstDay;i++){
        html += `<div class="cal-cell disabled"></div>`;
    }
    // 日期单元格
    for(let d=1;d<=daysInMonth;d++){
        const date = new Date(year, month, d);
        const key = dateKey(date);
        const hasData = dataDays.has(key);
        const isToday = key === todayKey;
        const isSelected = _selectedDate && dateKey(_selectedDate) === key;
        const classes = ["cal-cell"];
        if(hasData) classes.push("has-data");
        if(isToday) classes.push("today");
        if(isSelected) classes.push("selected");
        html += `<div class="${classes.join(" ")}" data-date="${key}">${d}${hasData ? '<span class="cal-dot"></span>' : ''}</div>`;
    }
    grid.innerHTML = html;

    // 绑定点击：选中日期并自动收起日历
    grid.querySelectorAll(".cal-cell.has-data").forEach(cell=>{
        cell.addEventListener("click", ()=>{
            const parts = cell.dataset.date.split("-");
            _selectedDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
            _calView = new Date(+parts[0], +parts[1]-1, 1);
            setCalendarExpanded(false);
            renderCalendar();
            renderArbitrations(_allArbitrations);
        });
    });
}

// 展开/收起日历
function setCalendarExpanded(expanded){
    const wrap = document.getElementById("calendarWrap");
    if(wrap) wrap.classList.toggle("collapsed", !expanded);
}

// 前后翻一天（翻页条）
function changeDay(delta){
    if(!_selectedDate){
        _selectedDate = new Date();
        _selectedDate.setHours(0,0,0,0);
    }
    _selectedDate = new Date(_selectedDate.getFullYear(), _selectedDate.getMonth(), _selectedDate.getDate() + delta);
    _calView = new Date(_selectedDate.getFullYear(), _selectedDate.getMonth(), 1);
    renderCalendar();
    renderArbitrations(_allArbitrations);
}

function changeMonth(delta){
    _calView = new Date(_calView.getFullYear(), _calView.getMonth()+delta, 1);
    renderCalendar();
}

// ============ 仲裁渲染（按选中日期 + 等级筛选） ============
function renderArbitrations(data){
    _allArbitrations = data || [];
    const container = document.getElementById("arbitrationsList");
    if(!container) return;

    // 默认选中今天
    if(!_selectedDate){
        _selectedDate = new Date();
        _selectedDate.setHours(0,0,0,0);
    }

    renderCalendar();

    const selKey = dateKey(_selectedDate);
    let filtered = _allArbitrations.filter(a => dayKey(a.start) === selKey);

    // 等级筛选
    if(_levelFilter !== "all"){
        filtered = filtered.filter(a => arbiLevel(a) === _levelFilter);
    }

    // 按时间排序
    filtered.sort((a,b) => a.start - b.start);

    // 同步更新主页「当前仲裁」卡片
    renderCurrentArbi();

    if(filtered.length === 0){
        container.innerHTML = `<div class="ws-empty">当日无${_levelFilter === "all" ? "" : LEVEL_LABEL[_levelFilter]+"级"}仲裁任务</div>`;
        return;
    }

    const html = filtered.map(a => {
        const fColor = factionColor(a.faction);
        const lv = arbiLevel(a);
        const current = a.isCurrent ? ' current' : '';
        const eff = a.effPerHour != null
            ? `<span class="ws-tag eff" title="该任务类型最高纪录的生息效率（arbi.wf.wiki）">⚡ ${a.effPerHour}/h</span>`
            : '';
        return `
        <div class="ws-item arbi-item${current}">
            <div class="ws-item-head">
                <span class="ws-arbi-time">${formatArbiTime(a.start)}</span>
                ${a.isCurrent ? '<span class="ws-tag live">LIVE</span>' : ''}
                <span class="lv-tag ${lv}">${LEVEL_LABEL[lv]}</span>
                ${eff}
            </div>
            <div class="ws-node">${zhNode(a.node)}</div>
            <div class="ws-meta">
                <span class="ws-faction" style="color:${fColor}">${a.faction || '-'}</span>
                <span class="ws-mission">${zhMission(a.missionType)}</span>
            </div>
            <div class="ws-countdown" data-start="${a.start}">${formatArbiCountdown(a.start)}</div>
        </div>`;
    }).join("");
    container.innerHTML = html;
}

function setLevelFilter(level){
    _levelFilter = level;
    document.querySelectorAll(".lv-btn").forEach(btn=>{
        btn.classList.toggle("active", btn.dataset.level === level);
    });
    renderArbitrations(_allArbitrations);
}

// ============ 主页仪表盘：世界状态卡片 ============
// 环境周期定义（名称 + 状态中文映射）
const CYCLE_DEF = {
    earthCycle:   { name:"地球",       states:{day:"☀️ 白天", night:"🌑 夜晚"} },
    cetusCycle:   { name:"夜灵平原",   states:{day:"☀️ 白天", night:"🌑 夜晚"} },
    vallisCycle:  { name:"奥布山谷",   states:{warm:"🔥 温暖", cold:"❄️ 寒冷"} },
    cambionCycle: { name:"魔胎之阈",   states:{fass:"🟠 法司", vome:"🔵 沃姆"} },
    zarimanCycle: { name:"扎里曼号",   states:{corpus:"🔵 科普斯", grineer:"🔴 格里尔"} },
    duviriCycle:  { name:"双衍王境",   states:{fear:"😨 恐惧", sorrow:"😢 悲伤", anger:"😡 愤怒", joy:"😊 欢乐", envy:"😒 嫉妒"} },
};

// 渲染环境周期条
function renderEnvStrip(ws){
    const strip = document.getElementById("envStrip");
    if(!strip) return;
    let html = "";
    for(const [key, def] of Object.entries(CYCLE_DEF)){
        const c = ws[key];
        if(!c || !c.expiry) continue;
        const stateZh = def.states[c.state] || c.state || "-";
        html += `<div class="env-chip" title="${def.name}">
            <span class="env-name">${def.name}</span>
            <span class="env-state">${stateZh}</span>
            <span class="ws-timer env-timer" data-expiry="${c.expiry}">${formatRemaining(c.expiry)}</span>
        </div>`;
    }
    strip.innerHTML = html || `<div class="env-chip">暂无环境数据</div>`;
}

// 渲染虚空商人卡片
function renderBaro(vt){
    const el = document.getElementById("baroBody");
    if(!el) return;
    if(!vt){ el.innerHTML = `<div class="ws-empty">暂无数据</div>`; return; }
    const now = Date.now();
    const start = parseTimestamp(vt.activation);
    const end = parseTimestamp(vt.expiry);
    const loc = zhNode(vt.location);
    if(now < start){
        el.innerHTML = `
        <div class="baro-status waiting">尚未到访</div>
        <div class="baro-loc">下次到访：${loc}</div>
        <div class="card-countdown">⏳ 距开始 <span class="ws-timer" data-expiry="${vt.activation}">${formatRemaining(vt.activation)}</span></div>`;
    }else if(now < end){
        el.innerHTML = `
        <div class="baro-status active">● 正在到访</div>
        <div class="baro-loc">${vt.character || "Baro Ki'Teer"} @ ${loc}</div>
        <div class="card-countdown">⏳ 剩余 <span class="ws-timer" data-expiry="${vt.expiry}">${formatRemaining(vt.expiry)}</span></div>`;
    }else{
        el.innerHTML = `<div class="ws-empty">商人已离开，等待下次到访</div>`;
    }
}

// 渲染每日突击卡片
function renderSortie(s){
    const el = document.getElementById("sortieBody");
    if(!el) return;
    if(!s || !s.variants || s.variants.length === 0){
        el.innerHTML = `<div class="ws-empty">暂无数据</div>`; return;
    }
    const rows = s.variants.map((v,i)=>`
        <div class="sortie-row">
            <span class="sortie-idx">${i+1}</span>
            <div class="sortie-info">
                <div class="sortie-main"><span class="sortie-mission">${zhMission(v.missionType)}</span> @ ${zhNode(v.node)}</div>
                <div class="sortie-modifier">${v.modifier || ''}</div>
            </div>
        </div>`).join("");
    el.innerHTML = `
        <div class="sortie-boss">${s.boss || ''}</div>
        ${rows}
        <div class="card-countdown">⏳ <span class="ws-timer" data-expiry="${s.expiry}">${formatRemaining(s.expiry)}</span></div>`;
}

// 执政官名称映射
const ARCHON_ZH = {
    "Archon Amar": "执政官 阿玛尔",
    "Archon Nira": "执政官 尼拉",
    "Archon Boreal": "执政官 博雷亚",
};

// 渲染执政官猎杀卡片
function renderArchon(a){
    const el = document.getElementById("archonBody");
    if(!el) return;
    if(!a || !a.missions || a.missions.length === 0){
        // 执政官猎杀仅主源 warframestat.us 提供，备源暂无此数据，主源恢复后自动显示
        el.innerHTML = `<div class="ws-empty">暂无数据（主数据源恢复后自动显示）</div>`; return;
    }
    const rows = a.missions.map(m=>`
        <div class="sortie-row archon-row">
            <span class="sortie-mission">${zhMission(m.type)}</span>
            <span class="sortie-node">${zhNode(m.node)}</span>
        </div>`).join("");
    el.innerHTML = `
        <div class="sortie-boss">${ARCHON_ZH[a.boss] || a.boss || ''}</div>
        ${rows}
        <div class="card-countdown">⏳ <span class="ws-timer" data-expiry="${a.expiry}">${formatRemaining(a.expiry)}</span></div>`;
}

// 渲染当前仲裁卡片（数据来自仲裁队列缓存）
function renderCurrentArbi(){
    const el = document.getElementById("currentArbiBody");
    if(!el) return;
    const cur = _allArbitrations.find(a=>a.isCurrent);
    if(!cur){
        el.innerHTML = `<div class="ws-empty">暂无进行中的仲裁</div>`;
        return;
    }
    const lv = arbiLevel(cur);
    const eff = cur.effPerHour != null ? `<span class="ws-tag eff">⚡ ${cur.effPerHour}/h</span>` : '';
    el.innerHTML = `
        <div class="ws-node arbi-cur-node">${zhNode(cur.node)}</div>
        <div class="ws-meta">
            <span class="lv-tag ${lv}">${LEVEL_LABEL[lv]}</span>
            ${eff}
        </div>
        <div class="ws-meta">
            <span style="color:${factionColor(cur.faction)}">${cur.faction || '-'}</span>
            <span class="ws-mission">${zhMission(cur.missionType)}</span>
        </div>
        <div class="card-countdown">⏳ 剩余 <span class="ws-timer" data-expiry="${cur.end}">${formatRemaining(cur.end)}</span></div>`;
}

// ============ 数据获取 ============
async function loadFissures(){
    try{
        const resp = await fetch(FISSURES_API);
        const json = await resp.json();
        if(json.ok){
            _currentFissures = json.data;  // 缓存供订阅检查
            renderFissures(json.data);
            // 陈旧数据提示（后台刷新失败时仍显示旧数据）
            const staleEl = document.getElementById("fissuresStaleNotice");
            if(json.stale){
                if(staleEl) staleEl.style.display = "block";
                else {
                    const notice = document.createElement("div");
                    notice.id = "fissuresStaleNotice";
                    notice.style.cssText = "background:#fff8e1;border:2px solid var(--orange);border-radius:10px;padding:8px 14px;margin-bottom:12px;font-weight:800;color:var(--ink);box-shadow:2px 2px 0 var(--ink)";
                    notice.textContent = "⚠️ 裂缝数据刷新中，当前显示的是最近一次成功获取的数据";
                    document.getElementById("fissuresList").parentNode.insertBefore(notice, document.getElementById("fissuresList"));
                }
            } else if(staleEl){
                staleEl.style.display = "none";
            }
        }else{
            document.getElementById("fissuresList").innerHTML = `<div class="ws-empty ws-error">裂缝数据加载失败：${json.error || '未知错误'}</div>`;
        }
    }catch(e){
        // 网络错误时保留旧数据不覆盖，仅在控制台记录
        console.warn("裂缝请求失败，保留旧数据:", e.message);
    }
}

async function loadArbitrations(){
    try{
        const resp = await fetch(ARBITRATIONS_API);
        const json = await resp.json();
        if(json.ok){
            _currentArbitrations = json.data;  // 缓存供订阅检查
            renderArbitrations(json.data);
        }else{
            document.getElementById("arbitrationsList").innerHTML = `<div class="ws-empty ws-error">仲裁数据加载失败：${json.error || '未知错误'}</div>`;
        }
    }catch(e){
        document.getElementById("arbitrationsList").innerHTML = `<div class="ws-empty ws-error">仲裁数据加载失败：${e.message}</div>`;
    }
}

async function loadWorldState(){
    try{
        const resp = await fetch(WORLDSTATE_API);
        const json = await resp.json();
        if(json.ok){
            renderEnvStrip(json);
            renderBaro(json.voidTrader);
            renderSortie(json.sortie);
            renderArchon(json.archonHunt);
        }
    }catch(e){
        // 网络错误时保留旧数据不覆盖，仅在控制台记录
        console.warn("世界状态请求失败，保留旧数据:", e.message);
    }
}

// 每秒更新倒计时
function updateTimers(){
    document.querySelectorAll(".ws-timer[data-expiry]").forEach(el=>{
        el.textContent = formatRemaining(el.dataset.expiry);
    });
    document.querySelectorAll(".ws-countdown[data-start]").forEach(el=>{
        el.textContent = formatArbiCountdown(Number(el.dataset.start));
    });
}

// 切换主导航标签页（wiki 标签通知宿主 WinForms 显示第二 WebView）
function switchMainTab(tab){
    document.querySelectorAll(".main-tab").forEach(btn=>{
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-pane").forEach(pane=>{
        pane.classList.toggle("active", pane.id === `tab-${tab}`);
    });
    // WebView2 宿主通信：显示/隐藏内嵌灰机Wiki
    if(window.chrome && window.chrome.webview){
        window.chrome.webview.postMessage(tab === "wiki" ? "show-wiki" : "hide-wiki");
    }
}

function initWorldState(){
    // 绑定主导航标签页
    document.querySelectorAll(".main-tab").forEach(btn=>{
        btn.addEventListener("click", ()=> switchMainTab(btn.dataset.tab));
    });
    // 绑定裂缝子标签页
    document.querySelectorAll(".ws-tab").forEach(btn=>{
        btn.addEventListener("click", ()=> setFissureTab(btn.dataset.fissureType));
    });
    // 绑定日历翻页（翻页条：前后一天；展开区：前后月份；图标：展开/收起）
    const prevBtn = document.getElementById("calPrev");
    const nextBtn = document.getElementById("calNext");
    if(prevBtn) prevBtn.addEventListener("click", ()=> changeDay(-1));
    if(nextBtn) nextBtn.addEventListener("click", ()=> changeDay(1));
    const mPrev = document.getElementById("calMonthPrev");
    const mNext = document.getElementById("calMonthNext");
    if(mPrev) mPrev.addEventListener("click", ()=> changeMonth(-1));
    if(mNext) mNext.addEventListener("click", ()=> changeMonth(1));
    const toggle = document.getElementById("calToggle");
    if(toggle) toggle.addEventListener("click", ()=>{
        const wrap = document.getElementById("calendarWrap");
        setCalendarExpanded(wrap ? wrap.classList.contains("collapsed") : false);
    });
    // 绑定等级筛选
    document.querySelectorAll(".lv-btn").forEach(btn=>{
        btn.addEventListener("click", ()=> setLevelFilter(btn.dataset.level));
    });

    loadFissures();
    loadArbitrations();
    loadWorldState();
    setInterval(loadFissures, REFRESH_INTERVAL);
    setInterval(loadArbitrations, REFRESH_INTERVAL);
    setInterval(loadWorldState, REFRESH_INTERVAL);
    setInterval(updateTimers, 1000);

    // 初始化订阅功能
    initSubscriptions();
    setInterval(checkSubscriptions, 15000); // 每15秒检查一次订阅
}

// ============================================================
// 订阅提醒功能
// ============================================================
const SUB_STORAGE_KEY = "warframe_subscriptions";
const SUB_ADVANCE_LABELS = { 30: "提前半小时", 10: "提前十分钟", 0: "准时提醒" };
const SUB_NOTIFY_LABELS = { message: "仅消息", sound: "声音+消息" };

let _subscriptions = [];
let _currentFissures = [];   // 当前裂缝数据缓存
let _currentArbitrations = []; // 当前仲裁数据缓存
let _notifiedKeys = new Set(); // 已通知的任务key，避免重复

// 加载订阅
function loadSubscriptions(){
    try{
        const raw = localStorage.getItem(SUB_STORAGE_KEY);
        _subscriptions = raw ? JSON.parse(raw) : [];
    }catch(e){
        _subscriptions = [];
    }
}

// 保存订阅
function saveSubscriptions(){
    localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(_subscriptions));
}

// 初始化订阅功能
function initSubscriptions(){
    loadSubscriptions();
    populateSubDropdowns();
    onSubTypeChange();
    renderSubscriptions();
}

// 填充星球/任务下拉框
function populateSubDropdowns(){
    const planetSel = document.getElementById("subPlanet");
    const missionSel = document.getElementById("subMission");
    if(!planetSel || !missionSel) return;

    // 星球列表
    const planets = Object.keys(PLANET_ZH).sort((a,b) => (PLANET_ZH[a]||a).localeCompare(PLANET_ZH[b]||b, 'zh'));
    planetSel.innerHTML = planets.map(p => `<option value="${p}">${PLANET_ZH[p] || p}</option>`).join("");

    // 任务类型列表
    const missions = Object.keys(MISSION_ZH).sort((a,b) => (MISSION_ZH[a]||a).localeCompare(MISSION_ZH[b]||b, 'zh'));
    missionSel.innerHTML = missions.map(m => `<option value="${m}">${MISSION_ZH[m] || m}</option>`).join("");
}

// 切换任务类型时显示/隐藏提醒时机
function onSubTypeChange(){
    const type = document.querySelector('input[name="subType"]:checked').value;
    const advanceRow = document.getElementById("subAdvanceRow");
    if(advanceRow){
        advanceRow.style.display = type === "arbitration" ? "" : "none";
    }
}

// 添加订阅
function addSubscription(){
    const type = document.querySelector('input[name="subType"]:checked').value;
    const planet = document.getElementById("subPlanet").value;
    const mission = document.getElementById("subMission").value;
    const advance = parseInt(document.querySelector('input[name="subAdvance"]:checked').value);
    const notify = document.querySelector('input[name="subNotify"]:checked').value;

    if(!planet || !mission){
        showToast("提示", "请选择星球和任务类型", false);
        return;
    }

    const sub = {
        id: "sub_" + Date.now() + "_" + Math.random().toString(36).slice(2,6),
        type: type,
        planet: planet,
        missionType: mission,
        advanceMinutes: type === "arbitration" ? advance : 0,
        notifyType: notify,
        createdAt: Date.now()
    };

    _subscriptions.push(sub);
    saveSubscriptions();
    renderSubscriptions();
    showToast("订阅成功", `已订阅：${subLabel(sub)}`, false);
}

// 删除订阅
function deleteSubscription(id){
    _subscriptions = _subscriptions.filter(s => s.id !== id);
    saveSubscriptions();
    renderSubscriptions();
}

// 订阅描述
function subLabel(sub){
    const planetName = PLANET_ZH[sub.planet] || sub.planet;
    const missionName = MISSION_ZH[sub.missionType] || sub.missionType;
    const typeName = sub.type === "fissure" ? "钢铁裂缝" : "仲裁";
    return `${typeName} · ${planetName} ${missionName}`;
}

// 渲染订阅列表
function renderSubscriptions(){
    const list = document.getElementById("subscriptionsList");
    const countEl = document.getElementById("subCount");
    if(!list) return;
    if(countEl) countEl.textContent = _subscriptions.length;

    if(_subscriptions.length === 0){
        list.innerHTML = `<div class="ws-empty">暂无订阅，在上方添加任务订阅</div>`;
        return;
    }

    list.innerHTML = _subscriptions.map(sub => {
        const planetName = PLANET_ZH[sub.planet] || sub.planet;
        const missionName = MISSION_ZH[sub.missionType] || sub.missionType;
        const typeIcon = sub.type === "fissure" ? "🔩" : "🛡️";
        const typeName = sub.type === "fissure" ? "钢铁裂缝" : "仲裁";
        const advance = sub.type === "arbitration" ? SUB_ADVANCE_LABELS[sub.advanceMinutes] : "即时";
        return `<div class="sub-item">
            <div class="sub-item-main">
                <span class="sub-item-type">${typeIcon} ${typeName}</span>
                <span class="sub-item-target">${planetName} · ${missionName}</span>
            </div>
            <div class="sub-item-meta">
                <span class="sub-meta-tag">${advance}</span>
                <span class="sub-meta-tag">${SUB_NOTIFY_LABELS[sub.notifyType]}</span>
            </div>
            <button class="sub-del-btn" onclick="deleteSubscription('${sub.id}')">✕</button>
        </div>`;
    }).join("");
}

// 从节点字符串提取星球
// 裂缝: "Planet/Node" → Planet
// 仲裁: "Node (Planet)" → Planet
function extractPlanet(node){
    if(!node) return "";
    const arbiMatch = node.match(/\(([^)]+)\)/);
    if(arbiMatch) return arbiMatch[1].trim();
    const fissureMatch = node.match(/^([^/]+)\//);
    if(fissureMatch) return fissureMatch[1].trim();
    return node.trim();
}

// 检查订阅匹配（每15秒执行）
function checkSubscriptions(){
    if(_subscriptions.length === 0) return;

    const now = Date.now();

    // 检查裂缝（仅钢铁裂缝）
    _currentFissures.forEach(f => {
        if(!f.isHard) return;  // 只匹配钢铁裂缝
        const planet = extractPlanet(f.node);
        const sub = _subscriptions.find(s =>
            s.type === "fissure" &&
            s.planet === planet &&
            s.missionType === f.missionType
        );
        if(!sub) return;

        const key = `fissure_${f.node}_${f.activation}`;
        if(_notifiedKeys.has(key)) return;

        // 裂缝在有效期内就通知
        const expiry = parseTimestamp(f.expiry);
        if(!isNaN(expiry) && expiry > now){
            _notifiedKeys.add(key);
            const title = "🔩 钢铁裂缝出现";
            const msg = `${PLANET_ZH[planet]||planet} · ${MISSION_ZH[f.missionType]||f.missionType}\n剩余 ${formatRemaining(f.expiry)}`;
            triggerNotification(sub, title, msg);
        }
    });

    // 检查仲裁
    _currentArbitrations.forEach(a => {
        const planet = extractPlanet(a.node);
        const sub = _subscriptions.find(s =>
            s.type === "arbitration" &&
            s.planet === planet &&
            s.missionType === a.missionType
        );
        if(!sub) return;

        const key = `arbi_${a.node}_${a.start}_${sub.advanceMinutes}`;
        if(_notifiedKeys.has(key)) return;

        const startMs = Number(a.start) * 1000;
        const diff = startMs - now;
        const advanceMs = sub.advanceMinutes * 60 * 1000;

        // 在提醒窗口内：提前提醒 = diff <= advanceMs 且 diff > 0；准时 = diff <= 0 且任务刚开始
        const inWindow = sub.advanceMinutes > 0
            ? (diff <= advanceMs && diff > 0)
            : (diff <= 0 && diff > -300000); // 准时：开始后5分钟内都算

        if(inWindow){
            _notifiedKeys.add(key);
            const title = "🛡️ 仲裁任务提醒";
            const timeText = sub.advanceMinutes > 0
                ? `${SUB_ADVANCE_LABELS[sub.advanceMinutes]} · ${formatArbiCountdown(a.start)}`
                : "已开始";
            const msg = `${PLANET_ZH[planet]||planet} · ${MISSION_ZH[a.missionType]||a.missionType}\n${timeText}`;
            triggerNotification(sub, title, msg);
        }
    });
}

// 触发通知
function triggerNotification(sub, title, message){
    const withSound = sub.notifyType === "sound";
    showToast(title, message, withSound);
}

// 显示 Toast 通知
function showToast(title, message, withSound){
    const container = document.getElementById("toastContainer");
    if(!container) return;

    const toast = document.createElement("div");
    toast.className = "toast" + (withSound ? " toast-sound" : "");
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${message.replace(/\n/g, '<br>')}</div>`;
    container.appendChild(toast);

    // 播放入场动画
    requestAnimationFrame(() => toast.classList.add("show"));

    // 播放声音
    if(withSound){
        playNotificationSound();
    }

    // 5秒后自动消失
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// 播放提示音（Web Audio API 合成）
let _audioCtx = null;
function playNotificationSound(){
    try{
        if(!_audioCtx){
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = _audioCtx;
        // 双音提示
        [880, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.16);
        });
    }catch(e){
        // 静默失败
    }
}
